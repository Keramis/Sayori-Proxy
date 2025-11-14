import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import cors from "cors";
import { storage } from "./storage";
import {
  insertProviderSchema,
  insertApiKeySchema,
  insertModelSchema,
  insertUserTokenSchema,
} from "@shared/schema";
import { rateLimit } from 'express-rate-limit';
import { checkStringValidity, getClientIP } from '../tools/utils';
import { countChatTokens, countTextTokens, getEncodingForModel } from "./tokenizer";

/* DEFINING RATE LIMIT FUNCITONS UP IN HERE */
const adminLoginRateLimit = rateLimit({
  windowMs: 60 * 1_000, //1min
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests!",
  handler: (req, res, next, options) => {
    console.error(`Rate limit triggered for IP ${getClientIP(req)} on route: ${req.originalUrl}`);
    res.status(options.statusCode).send(options.message);
  },
});
const adminApiRateLimit = rateLimit({
  windowMs: 60 * 1_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests!",
  handler: (req, res, next, options) => {
    console.error(`Rate limit triggered for IP ${getClientIP(req)} on route: ${req.originalUrl}`);
    res.status(options.statusCode).send(options.message);
  },
});
const subKeyRateLimit = rateLimit({
  windowMs: 5 * 1_000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests!",
  handler: (req, res, next, options) => {
    console.error(`Rate limit triggered for IP ${getClientIP(req)} on route: ${req.originalUrl}`);
    res.status(options.statusCode).send(options.message);
  },
});
const subkeyRenameRateLimit = rateLimit({
  windowMs: 10 * 1_000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests!",
  handler: (req, res, next, options) => {
    console.error(`Rate limit triggered for IP ${getClientIP(req)} on route: ${req.originalUrl}`);
    res.status(options.statusCode).send(options.message);
  },
})
const chatCompletionsRateLimit = rateLimit({
  windowMs: 1 * 1_000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests!",
  handler: (req, res, next, options) => {
    console.error(`Rate limit triggerd for IP ${getClientIP(req)} on route: ${req.originalUrl}`);
    res.status(options.statusCode).send(options.message);
  }
})


// Middleware for admin authentication
function adminAuth(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const base64Credentials = authHeader.split(" ")[1];
  const credentials = Buffer.from(base64Credentials, "base64").toString("ascii");
  const [username, password] = credentials.split(":");

  storage.getAdminCredentials().then((creds) => {
    console.log(`[AUTH] Attempting login - Username: ${username}, Expected: ${creds.username}`);
    console.log(`[AUTH] Password match: ${password === creds.password}`);
    
    if (username === creds.username && password === creds.password) {
      next();
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });
}

// Middleware for user token authentication
async function userTokenAuth(req: Request, res: Response, next: Function) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  const userToken = await storage.getUserToken(token);
  if (!userToken) {
    return res.status(401).json({ error: "Invalid token" });
  }

  // Check rate limits
  const todayUsage = await storage.getTodayUsageCount(userToken.id);
  const minuteUsage = await storage.getMinuteUsageCount(userToken.id);

  if (todayUsage >= userToken.maxRPD) {
    return res.status(429).json({ error: "Daily request limit exceeded" });
  }

  if (minuteUsage >= userToken.maxRPM) {
    return res.status(429).json({ error: "Rate limit exceeded" });
  }

  (req as any).userToken = userToken;
  next();
}

// Flexible authentication middleware based on AUTH_MODE
async function flexibleAuth(req: Request, res: Response, next: Function) {
  const authMode = await storage.getAuthMode();

  if (authMode === "no_auth") {
    // No authentication required
    (req as any).userToken = { id: "anonymous", name: "Anonymous", maxRPD: 999999, maxRPM: 999999 };
    return next();
  }

  if (authMode === "general_password") {
    // General password authentication
    const token = req.headers.authorization?.replace("Bearer ", "");
    const generalPassword = await storage.getGeneralPassword();

    if (!token || token !== generalPassword) {
      return res.status(401).json({ error: "Invalid password" });
    }

    // Use a special token for general password users
    (req as any).userToken = { id: "general", name: "General User", maxRPD: 999999, maxRPM: 999999 };
    return next();
  }

  // Default to user token authentication
  return userTokenAuth(req, res, next);
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Enable CORS
  app.use(cors({
    origin: "*",
    credentials: true,
  }));

  // Public routes
  

  // Admin login
  app.post("/api/admin/login", adminLoginRateLimit, async (req, res) => {
    const { username, password } = req.body;
    const creds = await storage.getAdminCredentials();

    console.log(`[LOGIN] Attempt - Username: ${username}, Expected: ${creds.username}`);
    console.log(`[LOGIN] Password match: ${password === creds.password}`);

    if (username === creds.username && password === creds.password) {
      const credentials = Buffer.from(`${username}:${password}`).toString("base64");
      res.json({ success: true, token: `Basic ${credentials}` });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  app.use('/api/admin', adminApiRateLimit);

  // Get stats (public)
  app.get("/api/stats", async (req, res) => {
    const stats = await storage.getStats();
    res.json(stats);
  });

  // Get all providers with models (public, only enabled)
  app.get("/api/providers/public", async (req, res) => {
    const providers = await storage.getProviders();
    const enabledProviders = providers.filter((p) => p.enabled);
    
    const providersWithModels = await Promise.all(
      enabledProviders.map(async (provider) => {
        const models = await storage.getModels(provider.id);
        const enabledModels = models.filter((m) => m.enabled);
        return {
          ...provider,
          models: enabledModels,
        };
      })
    );

    // Only return providers that have at least one enabled model
    res.json(providersWithModels.filter((p) => p.models.length > 0));
  });

  // User token stats
  app.post("/api/token/stats", async (req, res) => {
    const { token } = req.body;
    const userToken = await storage.getUserToken(token);

    if (!userToken) {
      return res.status(404).json({ error: "Token not found" });
    }

    const usageRecords = await storage.getUsageRecords(userToken.id);
    const todayUsage = await storage.getTodayUsageCount(userToken.id);

    // Calculate model usage with display names
    const modelUsage: Record<string, number> = {};
    
    // Get all models to create a mapping from model UUID to display name
    const allModels = await storage.getModels();
    const modelMap = allModels.reduce((acc, model) => {
      acc[model.id] = model.modelId; // Map UUID to display name - WARNING! THIS IS A ONE TIME RUN FFS
      return acc;
    }, {} as Record<string, string>);
    
    usageRecords.forEach((record) => {
      const displayName = modelMap[record.modelId] || record.modelId; // Fallback to UUID if not found
      modelUsage[displayName] = (modelUsage[displayName] || 0) + 1;
    });

    const lastUsed = usageRecords.length > 0
      ? Math.max(...usageRecords.map((r) => r.timestamp))
      : 0;

    res.json({
      name: userToken.name,
      lastUsed,
      requestsToday: todayUsage,
      maxRPD: userToken.maxRPD,
      remainingRPD: Number((userToken.maxRPD - todayUsage).toFixed(2)),
      disabled: userToken.disabled || false,
      expiresAt: userToken.expiresAt,
      modelUsage: Object.entries(modelUsage).map(([model, count]) => ({
        name: model,
        count,
      })),
    });
  });

  // User token update name
  app.patch("/api/token/update-name", subkeyRenameRateLimit, async (req, res) => {
    const { token, name } = req.body;

    if (!token || !name) {
      return res.status(400).json({ error: "Token and name are required" });
    }

    const nameValidation = checkStringValidity(name);
    if (!nameValidation.valid) {
      return res.status(400).json({error: nameValidation.error});
    }

    if (name.length > 50) {
      return res.status(400).json({error: "Name cannot be greater than 50 characters"});
    }

    const userToken = await storage.getUserToken(token);
    if (!userToken) {
      return res.status(404).json({ error: "Token not found" });
    }

    try {
      const updatedToken = await storage.updateUserToken(userToken.id, { name });
      if (updatedToken)
        res.json({ success: true, name: updatedToken.name });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // User manage - comprehensive token details (requires token authentication)
  app.post("/api/user/manage", async (req, res) => {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    const userToken = await storage.getUserToken(token);
    if (!userToken) {
      return res.status(404).json({ error: "Token not found" });
    }

    try {
      // Get all usage records for this token
      const usageRecords = await storage.getUsageRecords(userToken.id);

      // Get today's usage
      const todayUsage = await storage.getTodayUsageCount(userToken.id);

      // Calculate remaining quota
      const remainingRPD = Number((userToken.maxRPD - todayUsage).toFixed(2));

      // Get last used timestamp
      const lastUsed = usageRecords.length > 0
        ? Math.max(...usageRecords.map((r) => r.timestamp))
        : 0;

      // Calculate model usage breakdown with display names
      const modelUsage: Record<string, { count: number; totalTokens: number; totalCost: number }> = {};
      
      // Get all models to create a mapping from model UUID to display name
      const allModels = await storage.getModels();
      const modelMap = allModels.reduce((acc, model) => {
        acc[model.id] = model.modelId; // Map UUID to display name
        return acc;
      }, {} as Record<string, string>);
      
      usageRecords.forEach((record) => {
        const displayName = modelMap[record.modelId] || record.modelId; // Fallback to UUID if not found
        if (!modelUsage[displayName]) {
          modelUsage[displayName] = { count: 0, totalTokens: 0, totalCost: 0 };
        }
        modelUsage[displayName].count++;
        modelUsage[displayName].totalTokens += record.tokens || 0;
        modelUsage[displayName].totalCost += record.cost || 1;
      });

      // Calculate provider usage breakdown
      const providerUsage: Record<string, { count: number; totalTokens: number; totalCost: number }> = {};
      usageRecords.forEach((record) => {
        if (!providerUsage[record.providerId]) {
          providerUsage[record.providerId] = { count: 0, totalTokens: 0, totalCost: 0 };
        }
        providerUsage[record.providerId].count++;
        providerUsage[record.providerId].totalTokens += record.tokens || 0;
        providerUsage[record.providerId].totalCost += record.cost || 1;
      });

      // Get provider names
      const providers = await storage.getProviders();
      const providerMap = providers.reduce((acc, p) => {
        acc[p.id] = p.name;
        return acc;
      }, {} as Record<string, string>);

      // Calculate daily usage trend (last 7 days)
      const now = new Date();
      const dailyTrend: { date: string; usage: number; requests: number }[] = [];

      for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setUTCDate(date.getUTCDate() - i);
        const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
        const dayEnd = dayStart + 86400000; // 24 hours in ms

        const dayRecords = usageRecords.filter(
          (r) => r.timestamp >= dayStart && r.timestamp < dayEnd
        );

        const dayUsage = dayRecords.reduce((sum, r) => sum + (r.cost || 1), 0);

        dailyTrend.push({
          date: date.toISOString().split('T')[0],
          usage: Number(dayUsage.toFixed(2)),
          requests: dayRecords.length,
        });
      }

      // Recent usage history (last 50 requests)
      const recentHistory = usageRecords
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 50)
        .map((record) => ({
          id: record.id,
          timestamp: record.timestamp,
          modelId: modelMap[record.modelId] || record.modelId, // Use display name instead of UUID u dumbass, but fallback in case my map stupidity fails
          providerId: record.providerId,
          providerName: providerMap[record.providerId] || "Unknown",
          tokens: record.tokens,
          inputTokens: record.inputTokens || 0,
          outputTokens: record.outputTokens || 0,
          cost: record.cost || 1,
        }));

      // Total lifetime statistics
      const lifetimeStats = {
        totalRequests: usageRecords.length,
        totalTokens: usageRecords.reduce((sum, r) => sum + (r.tokens || 0), 0),
        totalInputTokens: usageRecords.reduce((sum, r) => sum + (r.inputTokens || 0), 0),
        totalOutputTokens: usageRecords.reduce((sum, r) => sum + (r.outputTokens || 0), 0),
        totalCost: Number(usageRecords.reduce((sum, r) => sum + (r.cost || 1), 0).toFixed(2)),
      };

      // Get allowed providers
      const allowedProviders = userToken.allowedProviders || [];
      const allowedProviderNames = allowedProviders
        .map(id => providerMap[id])
        .filter(Boolean);

      // Get sub-keys for this token
      const subKeys = await storage.getSubKeys(userToken.id);
      const subKeysWithUsage = await Promise.all(
        subKeys.map(async (subKey) => {
          const subKeyUsage = await storage.getTodayUsageCount(subKey.id);
          const subKeyProviderIds = subKey.allowedProviders || [];
          const subKeyProviderNames = subKeyProviderIds.map(id => providerMap[id] || id);

          return {
            id: subKey.id,
            name: subKey.name,
            token: subKey.token,
            keyType: subKey.keyType,
            maxRPD: subKey.maxRPD,
            maxRPM: subKey.maxRPM,
            usedRPD: subKeyUsage,
            remainingRPD: Number((subKey.maxRPD - subKeyUsage).toFixed(2)),
            createdAt: subKey.createdAt,
            expiresAt: subKey.expiresAt,
            disabled: subKey.disabled || false,
            allowedProviders: subKeyProviderNames, // Array of names for display
            allowedProviderIds: subKeyProviderIds, // Array of IDs for logic
          };
        })
      );

      // Get allocated quota info
      const allocatedQuota = await storage.getTotalAllocatedQuota(userToken.id);

      res.json({
        // Token details
        token: {
          id: userToken.id,
          name: userToken.name,
          value: token,
          createdAt: userToken.createdAt,
          maxRPD: userToken.maxRPD,
          maxRPM: userToken.maxRPM,
          keyType: userToken.keyType,
          parentTokenId: userToken.parentTokenId,
          allowedProviders: allowedProviderNames,
          allowedProviderIds: userToken.allowedProviders || [],
        },
        // Current usage
        usage: {
          requestsToday: todayUsage,
          remainingRPD: remainingRPD,
          lastUsed: lastUsed,
        },
        // Statistics
        stats: lifetimeStats,
        // Breakdown
        modelUsage: Object.entries(modelUsage)
          .map(([displayName, data]) => ({
            modelId: displayName, // Use display name instead of UUID
            ...data,
          }))
          .sort((a, b) => b.count - a.count),
        providerUsage: Object.entries(providerUsage)
          .map(([providerId, data]) => ({
            providerId,
            providerName: providerMap[providerId] || "Unknown",
            ...data,
          }))
          .sort((a, b) => b.count - a.count),
        // Trends
        dailyTrend,
        // Recent history
        recentHistory,
        // Sub-keys
        subKeys: subKeysWithUsage,
        allocatedQuota,
        availableQuota: {
          rpd: Number((userToken.maxRPD - allocatedQuota.rpd).toFixed(2)),
          rpm: Number((userToken.maxRPM - allocatedQuota.rpm).toFixed(2)),
        },
      });
    } catch (error: any) {
      console.error("Error fetching user manage data:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create sub-key
  app.post("/api/user/sub-keys", subKeyRateLimit, async (req, res) => {
    const { token, name, maxRPD, maxRPM, allowedProviders, expiresAt } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Parent token is required" });
    }

    // validate name
    if (!name || (!(checkStringValidity(name).valid)) || name.length > 50) {
      return res.status(400).json({error: "Name has to be valid and below 50 characters!"});
    }

    const parentToken = await storage.getUserToken(token);
    if (!parentToken) {
      return res.status(404).json({ error: "Parent token not found" });
    }

    // Validate quota
    const numericRPD = typeof maxRPD === 'string' ? parseFloat(maxRPD) : maxRPD;
    const numericRPM = typeof maxRPM === 'string' ? parseFloat(maxRPM) : maxRPM;

    const validation = await storage.canCreateSubKey(parentToken.id, numericRPD, numericRPM);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.reason });
    }

    // Validate expiration date (must be in the future)
    if (expiresAt && expiresAt <= Date.now()) {
      return res.status(400).json({ error: "Expiration date must be in the future" });
    }

    try {
      const subKey = await storage.createUserToken({
        name,
        maxRPD: numericRPD,
        maxRPM: numericRPM,
        allowedProviders,
        parentTokenId: parentToken.id,
        keyType: "sub",
        expiresAt,
      });

      res.json(subKey);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete sub-key (with cascade)
  app.delete("/api/user/sub-keys/:id", async (req, res) => {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Parent token is required" });
    }

    const parentToken = await storage.getUserToken(token);
    if (!parentToken) {
      return res.status(404).json({ error: "Parent token not found" });
    }

    const subKey = await storage.getUserTokenById(req.params.id);
    if (!subKey) {
      return res.status(404).json({ error: "Sub-key not found" });
    }

    // Verify ownership
    if (subKey.parentTokenId !== parentToken.id) {
      return res.status(403).json({ error: "You don't own this sub-key" });
    }

    try {
      // Cascade delete sub-keys
      const deletedCount = await storage.cascadeDeleteSubKeys(subKey.id);
      // Delete the sub-key itself
      await storage.deleteUserToken(subKey.id);

      res.json({ success: true, deletedCount: deletedCount + 1 });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Disable sub-key (with cascade)
  app.post("/api/user/sub-keys/:id/disable", async (req, res) => {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Parent token is required" });
    }

    const parentToken = await storage.getUserToken(token);
    if (!parentToken) {
      return res.status(404).json({ error: "Parent token not found" });
    }

    const subKey = await storage.getUserTokenById(req.params.id);
    if (!subKey) {
      return res.status(404).json({ error: "Sub-key not found" });
    }

    // Verify ownership
    if (subKey.parentTokenId !== parentToken.id) {
      return res.status(403).json({ error: "You don't own this sub-key" });
    }

    try {
      // Disable the sub-key
      await storage.updateUserToken(subKey.id, { disabled: true });
      // Cascade disable all children
      const disabledCount = await storage.cascadeDisableSubKeys(subKey.id);

      res.json({ success: true, disabledCount: disabledCount + 1 });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Enable sub-key (with cascade, but skip expired ones)
  app.post("/api/user/sub-keys/:id/enable", async (req, res) => {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Parent token is required" });
    }

    const parentToken = await storage.getUserToken(token);
    if (!parentToken) {
      return res.status(404).json({ error: "Parent token not found" });
    }

    const subKey = await storage.getUserTokenById(req.params.id);
    if (!subKey) {
      return res.status(404).json({ error: "Sub-key not found" });
    }

    // Verify ownership
    if (subKey.parentTokenId !== parentToken.id) {
      return res.status(403).json({ error: "You don't own this sub-key" });
    }

    // Check if the sub-key is expired
    if (subKey.expiresAt && subKey.expiresAt <= Date.now()) {
      return res.status(400).json({ error: "Cannot enable expired sub-key. Please update expiration date first." });
    }

    try {
      // Enable the sub-key
      await storage.updateUserToken(subKey.id, { disabled: false });
      // Cascade enable all non-expired children
      const enabledCount = await storage.cascadeEnableSubKeys(subKey.id);

      res.json({ success: true, enabledCount: enabledCount + 1 });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Admin routes (protected)
  
  // Providers
  app.get("/api/admin/providers", adminAuth, async (req, res) => {
    const providers = await storage.getProviders();
    const providersWithCounts = await Promise.all(
      providers.map(async (provider) => {
        const keys = await storage.getApiKeys(provider.id);
        const models = await storage.getModels(provider.id);
        return {
          ...provider,
          keysCount: keys.length,
          modelsCount: models.length,
        };
      })
    );
    res.json(providersWithCounts);
  });

  app.post("/api/admin/providers", adminAuth, async (req, res) => {
    try {
      const data = insertProviderSchema.parse(req.body);
      
      // Check for duplicate provider name
      const existingProviders = await storage.getProviders();
      if (existingProviders.some(p => p.name.toLowerCase() === data.name.toLowerCase())) {
        return res.status(400).json({ error: "A provider with this name already exists" });
      }
      
      const provider = await storage.createProvider(data);
      res.json(provider);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/admin/providers/:id", adminAuth, async (req, res) => {
    try {
      // Check for duplicate provider name if name is being updated
      if (req.body.name) {
        const existingProviders = await storage.getProviders();
        if (existingProviders.some(p => p.id !== req.params.id && p.name.toLowerCase() === req.body.name.toLowerCase())) {
          return res.status(400).json({ error: "A provider with this name already exists" });
        }
      }
      
      const provider = await storage.updateProvider(req.params.id, req.body);
      if (!provider) {
        return res.status(404).json({ error: "Provider not found" });
      }
      res.json(provider);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/admin/providers/:id", adminAuth, async (req, res) => {
    const success = await storage.deleteProvider(req.params.id);
    res.json({ success });
  });

  // API Keys
  app.get("/api/admin/providers/:id/keys", adminAuth, async (req, res) => {
    const keys = await storage.getApiKeys(req.params.id);
    res.json(keys);
  });

  app.post("/api/admin/providers/:id/keys", adminAuth, async (req, res) => {
    try {
      const data = insertApiKeySchema.parse({
        ...req.body,
        providerId: req.params.id,
      });
      const key = await storage.createApiKey(data);
      res.json(key);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/admin/keys/:id", adminAuth, async (req, res) => {
    const success = await storage.deleteApiKey(req.params.id);
    res.json({ success });
  });

  app.patch("/api/admin/keys/:id", adminAuth, async (req, res) => {
    const { key } = req.body;
    if (!key) {
      return res.status(400).json({ error: "Key is required" });
    }
    const apiKey = await storage.updateApiKey(req.params.id, key);
    if (!apiKey) {
      return res.status(404).json({ error: "API key not found" });
    }
    res.json(apiKey);
  });

  // Models
  app.get("/api/admin/providers/:id/models", adminAuth, async (req, res) => {
    const models = await storage.getModels(req.params.id);
    res.json(models);
  });

  app.post("/api/admin/providers/:id/check-models", adminAuth, async (req, res) => {
    try {
      const provider = await storage.getProvider(req.params.id);
      if (!provider) {
        return res.status(404).json({ error: "Provider not found" });
      }

      const apiKey = await storage.getNextApiKey(provider.id);
      if (!apiKey) {
        return res.status(400).json({ error: "No API keys configured" });
      }

      // Normalize base URL - remove trailing slash
      const baseUrl = provider.baseUrl.replace(/\/$/, '');
      
      // Construct the models endpoint URL
      const modelsUrl = `${baseUrl}/models`;

      console.log(`Fetching models from: ${modelsUrl}`);

      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey.key}`,
        ...(provider.customHeaders || {}),
      };

      console.log("[MODEL CHECK] Request Headers:", headers);

      // Fetch models from provider
      const response = await fetch(modelsUrl, {
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Model fetch failed: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Received data:', JSON.stringify(data).substring(0, 200));
      
      // Handle different response formats
      let modelIds: string[] = [];
      if (data.data && Array.isArray(data.data)) {
        modelIds = data.data.map((m: any) => m.id).filter(Boolean);
      } else if (Array.isArray(data)) {
        modelIds = data.map((m: any) => m.id).filter(Boolean);
      } else {
        throw new Error('Unexpected response format from provider');
      }

      if (modelIds.length === 0) {
        throw new Error('No models found in provider response');
      }

      // Sort model IDs alphabetically
      const sortedModelIds = modelIds.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

      // Replace all models for the provider in a single operation
      const models = await storage.replaceProviderModels(provider.id, sortedModelIds);

      res.json({ models, count: models.length });
    } catch (error: any) {
      console.error('Check models error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/admin/models/:id", adminAuth, async (req, res) => {
    const model = await storage.updateModel(req.params.id, req.body);
    if (!model) {
      return res.status(404).json({ error: "Model not found" });
    }
    res.json(model);
  });

  app.delete("/api/admin/models/:id", adminAuth, async (req, res) => {
    const success = await storage.deleteModel(req.params.id);
    res.json({ success });
  });

  // Bulk model operations
  app.post("/api/admin/providers/:id/models/enable-all", adminAuth, async (req, res) => {
    try {
      const models = await storage.enableAllModelsByProvider(req.params.id);
      res.json({ success: true, count: models.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/providers/:id/models/disable-all", adminAuth, async (req, res) => {
    try {
      const models = await storage.disableAllModelsByProvider(req.params.id);
      res.json({ success: true, count: models.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/providers/:id/models/update-cost-all", adminAuth, async (req, res) => {
    try {
      const { requestCost } = req.body;
      if (!requestCost || requestCost < 1) {
        return res.status(400).json({ error: "Invalid request cost" });
      }
      const models = await storage.updateCostAllModelsByProvider(req.params.id, parseInt(requestCost));
      res.json({ success: true, count: models.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // User Tokens
  app.get("/api/admin/tokens", adminAuth, async (req, res) => {
    const tokens = await storage.getUserTokens();
    const tokensWithUsage = await Promise.all(
      tokens.map(async (token) => {
        const todayUsage = await storage.getTodayUsageCount(token.id);
        return {
          ...token,
          usedRPD: todayUsage,
        };
      })
    );
    res.json(tokensWithUsage);
  });

  app.post("/api/admin/tokens", adminAuth, async (req, res) => {
    try {
      const data = insertUserTokenSchema.parse(req.body);
      const token = await storage.createUserToken(data);
      res.json(token);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/admin/tokens/:id", adminAuth, async (req, res) => {
    try {
      const token = await storage.updateUserToken(req.params.id, req.body);
      if (!token) {
        return res.status(404).json({ error: "Token not found" });
      }
      res.json(token);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/admin/tokens/:id", adminAuth, async (req, res) => {
    const success = await storage.deleteUserToken(req.params.id);
    res.json({ success });
  });

  app.get("/api/debug/ip", (req, res) => {
    res.json({
      cfConnectingIP: req.get('cf-connecting-ip'),
      forwardedFor: req.get('x-forwarded-for'),
      realIP: req.get('x-real-ip'),
      clientIP: req.get('x-client-ip'),
      reqIP: req.ip,
      detectedIP: getClientIP(req),
      userAgent: req.get('user-agent'),
      cloudflare: {
        ray: req.get('cf-ray'),
        country: req.get('cf-ipcountry'),
        colo: req.get('cf-colo')
      }
    });
  });


  // OpenAI-compatible endpoints

  // Get models
  app.get("/v1/models", async (req, res) => {
    const providers = await storage.getProviders();
    const enabledProviders = providers.filter((p) => p.enabled);
    
    const allModels = await Promise.all(
      enabledProviders.map(async (provider) => {
        const models = await storage.getModels(provider.id);
        return models
          .filter((m) => m.enabled)
          .map((m) => ({
            id: `${m.modelId} (${provider.name})`,
            object: "model",
            created: provider.createdAt,
            owned_by: provider.name,
          }));
      })
    );

    res.json({
      object: "list",
      data: allModels.flat(),
    });
  });

  // Payload cache for request deduplication
  const payloadCache = new Map<string, { timestamp: number; payload: string }>();
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

  // (Deprecated) Heuristic helpers removed in favor of tokenizer-based counting:
  //  - estimateTokens()
  //  - countInputTokens()
  // Use countChatTokens() and countTextTokens() from tokenizer.ts instead.

  // Chat completions proxy
  app.post("/v1/chat/completions", chatCompletionsRateLimit, flexibleAuth, async (req, res) => {
    let responseSent = false;
    
    const safeSendError = (statusCode: number, error: string) => {
      console.log(`[DEBUG] safeSendError called: statusCode=${statusCode}, error="${error}", headersSent=${res.headersSent}, responseSent=${responseSent}`);
      if (!res.headersSent && !responseSent) {
        responseSent = true;
        console.log(`[DEBUG] Sending error response: ${statusCode} - ${error}`);
        res.status(statusCode).json({ error });
      } else {
        console.error(`[ERROR] Cannot send error response - headers already sent: ${error}`);
        console.error(`[ERROR] headersSent: ${res.headersSent}, responseSent: ${responseSent}`);
      }
    };
    
    try {
      const userToken = (req as any).userToken;
      const { model, temperature, max_tokens, top_p, ...otherParams } = req.body;
      const requestBody = { temperature, max_tokens, top_p, ...otherParams };

      // Generate unique request ID
      const requestId = randomUUID().split('-')[0];
      // Defer input token counting until model/provider resolved (need modelId for encoding)
      let inputTokens = 0;

      // Validate model parameter
      if (!model || typeof model !== 'string') {
        return safeSendError(400, "Missing or invalid 'model' parameter");
      }

      // Find the model and provider
      const allModels = await storage.getModels();
      const providers = await storage.getProviders();
      
      // Try to match model in different formats
      let targetModel: any = null;
      let provider: any = null;
      
      // Format 1: modelId (Provider Name)
      const providerMatch = model.match(/^(.+?)\s+\((.+?)\)$/);
      if (providerMatch) {
        const [, modelId, providerName] = providerMatch;
        const foundProvider = providers.find((p) => p.name === providerName);
        if (foundProvider) {
          provider = foundProvider;
          targetModel = allModels.find((m) => m.modelId === modelId && m.providerId === provider.id);
        }
      }
      
      // Format 2: Just modelId (search regardless of enabled status)
      if (!targetModel) {
        targetModel = allModels.find((m) => m.modelId === model);
        if (targetModel) {
          provider = await storage.getProvider(targetModel.providerId);
        }
      }

      if (!targetModel || !provider) {
        return safeSendError(404, `Model '${model}' not found`);
      }

      if (!targetModel.enabled) {
        return safeSendError(400, `Model '${model}' is disabled`);
      }

      // Perform accurate input token counting now that we have targetModel
      try {
        inputTokens = countChatTokens(requestBody.messages || [], targetModel.modelId, { useCache: true });
      } catch (tokErr: any) {
        console.warn(`[${requestId}] Input token counting failed: ${tokErr?.message}`);
        if (process.env.STRICT_TOKEN_COUNT === "1") {
          return safeSendError(500, "Tokenization failed (STRICT_TOKEN_COUNT=1)");
        }
        try {
          inputTokens = countChatTokens(requestBody.messages || [], "cl100k_base", { useCache: true });
          console.warn(`[${requestId}] Input token counting fallback to cl100k_base succeeded.`);
        } catch (fallbackErr: any) {
          return safeSendError(500, "Tokenization failed (fallback cl100k_base also failed)");
        }
      }
      console.log(`[TOKENS][INPUT] requestId=${requestId} model=${targetModel.modelId} encoding=${getEncodingForModel(targetModel.modelId)} input=${inputTokens}`);

      if (!provider.enabled) {
        return safeSendError(400, "Provider is disabled");
      }

      // Additional validation: Ensure the model and provider still exist in database
      // this prevents race conditions where records are deleted between lookup and usage
      try {
        const modelExists = await storage.getModels(provider.id).then(models =>
          models.some(m => m.id === targetModel.id)
        );
        const providerExists = await storage.getProvider(provider.id);
        
        if (!modelExists) {
          return safeSendError(404, `Model '${model}' no longer exists`);
        }
        
        if (!providerExists) {
          return safeSendError(404, `Provider for model '${model}' no longer exists`);
        }
      } catch (validationError: any) {
        console.error(`[${requestId}] Validation error:`, validationError.message);
        return safeSendError(500, "Failed to validate model and provider");
      }

      // Check provider access control
      if (userToken.allowedProviders && userToken.allowedProviders.length > 0) {
        if (!userToken.allowedProviders.includes(provider.id)) {
          return safeSendError(403, `You don't have access to ${targetModel.modelId} from ${provider.name}`);
        }
      }

      // Log incoming request
      console.log(`[${requestId}] Request incoming from ${userToken.name}. In: ${inputTokens} tokens.`);

      // For sub-keys, validate the entire ancestor chain
      if (userToken.keyType === "sub") {
        const chainValidation = await storage.validateAncestorChain(userToken.id);
        if (!chainValidation.valid) {
          return safeSendError(429, chainValidation.reason || "Token validation failed");
        }
      }

      // Calculate request cost and check quota availability
      const messagesPayload = JSON.stringify(requestBody.messages || []);
      const cacheKey = `${userToken.id}:${messagesPayload}`;
      const now = Date.now();
      
      // Clean old cache entries
      payloadCache.forEach((value, key) => {
        if (now - value.timestamp > CACHE_TTL) {
          payloadCache.delete(key);
        }
      });

      let isCachedRequest = false;
      const cachedEntry = payloadCache.get(cacheKey);
      if (cachedEntry && cachedEntry.payload === messagesPayload) {
        isCachedRequest = true;
      }

      const originalCost = targetModel.requestCost || 1;
      let requestCost = originalCost;
      if (isCachedRequest && !provider.disableCacheDiscount) {
        // Apply 10x discount (divide by 10) with proper rounding to 2 decimal places
        requestCost = Number((originalCost / 10).toFixed(2));
      }

      // Check if entire ancestor chain has enough quota for this request
      // For sub-keys, validate all ancestors; for master keys, just validate self
      if (userToken.keyType === "sub") {
        const quotaValidation = await storage.validateAncestorChainQuota(userToken.id, requestCost);
        if (!quotaValidation.valid) {
          return safeSendError(429, JSON.stringify({
            error: quotaValidation.reason,
            details: {
              required: requestCost,
              insufficientToken: quotaValidation.insufficientToken,
            }
          }));
        }
      } else {
        // For master keys, check only this token
        const todayUsage = await storage.getTodayUsageCount(userToken.id);
        const remainingQuota = Number((userToken.maxRPD - todayUsage).toFixed(2));

        if (remainingQuota < requestCost) {
          return safeSendError(429, JSON.stringify({
            error: "Daily quota is insufficient",
            details: {
              required: requestCost,
              remaining: remainingQuota,
              maxRPD: userToken.maxRPD,
              used: todayUsage
            }
          }));
        }
      }

      const apiKey = await storage.getNextApiKey(provider.id);
      if (!apiKey) {
        return safeSendError(500, "No API keys available for this provider");
      }

      // Update cache and log
      if (isCachedRequest) {
        if (provider.disableCacheDiscount) {
          console.log(`[CACHE HIT] Message Body Payload is the same as cached. Cache discount disabled for this provider. Total: ${originalCost} : ${requestCost}`);
        } else {
          console.log(`[CACHE HIT] Message Body Payload is the same as cached. Applying x10^-1 deduction. Total: ${originalCost} : ${requestCost}`);
        }
      } else {
        payloadCache.set(cacheKey, { timestamp: now, payload: messagesPayload });
        console.log(`[NEW REQUEST] Caching new message payload for user ${userToken.id}`);
      }

      // Track request
      await storage.incrementActiveRequests();
      await storage.updateApiKeyUsage(apiKey.id);

      // Proxy request to provider with all parameters (temperature, max_tokens, top_p, etc.)
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.key}`,
        ...(provider.customHeaders || {}),
      };
      
      console.log("[PROXY] Request Headers:", headers);

      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ model: targetModel.modelId, ...requestBody }),
      });

      // Check if streaming is requested
      const isStreaming = requestBody.stream === true;
      console.log(`[DEBUG] Streaming requested: ${isStreaming}`);
      // Added explicit tiktoken lifecycle logging
      console.log(`[Tiktoken Token Count] (${isStreaming ? 'Streaming' : 'Non Streaming'}) Request called. Input: ${inputTokens}`);
      
      if (isStreaming) {
        console.log(`[DEBUG] Setting up streaming response`);
        // For streaming responses, pipe the stream directly to the client
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        if (!response.body) {
          await storage.decrementActiveRequests();
          return safeSendError(500, "No response body from provider");
        }

        // Track tokens for streaming (will be approximate or from final chunk)
        let totalTokens = 0;
        let streamedContent = ""; // Collect streamed content for estimation
        let streamOutputTokens = 0; // Track output tokens from usage data
        let streamInputTokens = 0; // Track input tokens from usage data
        
        // FIX: Track tool calls to handle them properly
        let hasToolCalls = false;
        let toolCallChunks: string[] = [];

        // Pipe the streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });

            // Try to extract token usage from SSE chunks if available
            if (chunk.includes('"usage"')) {
              try {
                const lines = chunk.split('\n');
                for (const line of lines) {
                  if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                    const jsonStr = line.slice(6);
                    const parsed = JSON.parse(jsonStr);
                    if (parsed.usage) {
                      // Extract all token fields if available
                      if (parsed.usage.total_tokens) {
                        totalTokens = parsed.usage.total_tokens;
                      }
                      if (parsed.usage.completion_tokens || parsed.usage.output_tokens) {
                        streamOutputTokens = parsed.usage.completion_tokens || parsed.usage.output_tokens;
                      }
                      if (parsed.usage.prompt_tokens || parsed.usage.input_tokens) {
                        streamInputTokens = parsed.usage.prompt_tokens || parsed.usage.input_tokens;
                      }
                    }
                  }
                }
              } catch (e) {
                // Ignore parsing errors for token extraction
              }
            }

            // Extract content and tool calls
            try {
              const lines = chunk.split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                  const jsonStr = line.slice(6);
                  const parsed = JSON.parse(jsonStr);
                  
                  // FIX: Detect and handle tool calls
                  if (parsed.choices && parsed.choices[0]?.delta?.tool_calls) {
                    hasToolCalls = true;
                    console.log(`[DEBUG] Tool call detected in stream:`, JSON.stringify(parsed.choices[0].delta.tool_calls));
                    toolCallChunks.push(jsonStr);
                  }
                  
                  if (parsed.choices && parsed.choices[0]?.delta?.content) {
                    streamedContent += parsed.choices[0].delta.content;
                  }
                }
              }
            } catch (e) {
              // Ignore parsing errors for content extraction
            }

            // FIX: Always forward the chunk to maintain streaming
            res.write(value);
          }
          
          // FIX: For tool calls, ensure proper stream termination
          if (hasToolCalls) {
            console.log(`[DEBUG] Tool calls detected, ensuring proper stream termination`);
            // Send a final [DONE] message if not already present
            const doneMessage = 'data: [DONE]\n\n';
            if (!res.headersSent) {
              res.write(doneMessage);
            }
          }
        } catch (streamError: any) {
          console.error('Streaming error:', streamError);
        } finally {
          // Calculate output tokens
          let outputTokens = 0;
          let actualInputTokens = inputTokens;

          // If provider returned token usage in the stream, use it
          if (streamOutputTokens > 0 || streamInputTokens > 0 || totalTokens > 0) {
            outputTokens = streamOutputTokens;
            actualInputTokens = streamInputTokens || inputTokens;

            if (outputTokens === 0 && totalTokens > 0) {
              outputTokens = totalTokens > actualInputTokens ? totalTokens - actualInputTokens : 0;
            }

            if (totalTokens === 0 && outputTokens > 0) {
              totalTokens = actualInputTokens + outputTokens;
            }
          } else {
            console.log(`[${requestId}] Provider didn't return token usage in stream, estimating from content`);

            if (streamedContent) {
              try {
                outputTokens = countTextTokens(streamedContent, targetModel.modelId);
              } catch (tokErr: any) {
                console.warn(`[${requestId}] Output token counting failed during stream finalization: ${tokErr?.message}`);
                try {
                  outputTokens = countTextTokens(streamedContent, "cl100k_base");
                  console.warn(`[${requestId}] Output token counting fallback to cl100k_base succeeded.`);
                } catch (fallbackErr: any) {
                  console.warn(`[${requestId}] Output token counting fallback to cl100k_base failed: ${fallbackErr?.message}. Defaulting outputTokens=0.`);
                  outputTokens = 0;
                }
              }
              totalTokens = actualInputTokens + outputTokens;
              
              console.log(`[${requestId}] Estimated tokens - Input: ${actualInputTokens}, Output: ${outputTokens}, Total: ${totalTokens}`);
            } else {
              totalTokens = actualInputTokens;
              console.log(`[${requestId}] Could not estimate output tokens, recording input tokens only: ${actualInputTokens}`);
            }
          }

          // Standardized streaming token log
          console.log(`[TOKENS][STREAM] requestId=${requestId} model=${targetModel.modelId} encoding=${getEncodingForModel(targetModel.modelId)} input=${actualInputTokens} output=${outputTokens} total=${totalTokens} cached=${isCachedRequest}`);
          // Added completion lifecycle log for streaming requests
          console.log(`[Tiktoken Token Count] (Streaming) Request completed. Input: ${actualInputTokens} output: ${outputTokens} total: ${totalTokens}`);
          
          // Track usage (leaf-only for sub-keys, single for master)
          if (userToken.parentTokenId) {
            console.log(`[DEBUG] Creating leaf-only usage record for chain (streaming)`);
            try {
              await storage.createUsageRecordForChainLeafTokens(userToken.id, {
                modelId: targetModel.id,
                providerId: provider.id,
                tokens: totalTokens,
                inputTokens: actualInputTokens,
                outputTokens: outputTokens,
                cost: requestCost,
              });
              console.log(`[DEBUG] Leaf-only usage record chain created successfully`);
            } catch (usageError: any) {
              console.error(`[ERROR] Failed to create leaf-only usage record chain:`, usageError.message);
            }
          } else {
            try {
              await storage.createUsageRecord({
                userTokenId: userToken.id,
                modelId: targetModel.id,
                providerId: provider.id,
                tokens: totalTokens,
                inputTokens: actualInputTokens,
                outputTokens: outputTokens,
                cost: requestCost,
              });
            } catch (usageError: any) {
              console.error(`[${requestId}] Failed to create usage record:`, usageError.message);
            }
          }

          console.log(`[${requestId}] Request from ${userToken.name} finished. Output: ${outputTokens} tokens, Total: ${totalTokens} tokens.`);

          await storage.decrementActiveRequests();
          console.log(`[DEBUG] Ending streaming response, headersSent: ${res.headersSent}, hasToolCalls: ${hasToolCalls}`);
          
          // CRITICAL FIX: ALWAYS call res.end() for streaming responses to prevent hanging
          // Even if headers are sent, we must properly terminate the connection
          try {
            console.log(`[DEBUG] Sending res.end() to terminate streaming response`);
            res.end();
          } catch (e: any) {
            console.log(`[DEBUG] Stream already ended, ignoring error:`, e.message);
          }
        }
      } else {
        // For non-streaming responses, return JSON as before
        const data = await response.json();

        // Track usage with pre-calculated cost
        let tokens = 0;
        let outputTokens = 0;
        let actualInputTokens = inputTokens;

        if (data.usage) {
          outputTokens = data.usage.completion_tokens || data.usage.output_tokens || 0;
          actualInputTokens = data.usage.prompt_tokens || data.usage.input_tokens || inputTokens;
          tokens = data.usage.total_tokens || (actualInputTokens + outputTokens);
          if (outputTokens === 0 && tokens > 0) {
            outputTokens = tokens > actualInputTokens ? tokens - actualInputTokens : 0;
          }
        }

        if (tokens === 0 && outputTokens === 0) {
          console.log(`[${requestId}] Provider didn't return token usage, estimating from response content`);
          if (data.choices && data.choices[0]?.message?.content) {
            try {
              outputTokens = countTextTokens(data.choices[0].message.content, targetModel.modelId);
            } catch (tokErr: any) {
              console.warn(`[${requestId}] Output token counting failed: ${tokErr?.message}`);
              if (process.env.STRICT_TOKEN_COUNT === "1") {
                return safeSendError(500, "Output tokenization failed (STRICT_TOKEN_COUNT=1)");
              }
              try {
                outputTokens = countTextTokens(data.choices[0].message.content, "cl100k_base");
                console.warn(`[${requestId}] Output token counting fallback to cl100k_base succeeded.`);
              } catch (fallbackErr: any) {
                console.warn(`[${requestId}] Output token counting fallback to cl100k_base failed: ${fallbackErr?.message}. Defaulting outputTokens=0.`);
                outputTokens = 0;
              }
            }
          }
          tokens = actualInputTokens + outputTokens;
          console.log(`[${requestId}] Estimated tokens - Input: ${actualInputTokens}, Output: ${outputTokens}, Total: ${tokens}`);
        }

        // Standardized non-streaming token log
        console.log(`[TOKENS][FINAL] requestId=${requestId} model=${targetModel.modelId} encoding=${getEncodingForModel(targetModel.modelId)} input=${actualInputTokens} output=${outputTokens} total=${tokens} cached=${isCachedRequest}`);
        // Added completion lifecycle log for non-streaming requests
        console.log(`[Tiktoken Token Count] (Non Streaming) Request completed. Input: ${actualInputTokens} output: ${outputTokens} total: ${tokens}`);
        
        if (userToken.keyType === "sub") {
          console.log(`[DEBUG] Creating leaf-only usage record chain (non-streaming)`);
          try {
            await storage.createUsageRecordForChainLeafTokens(userToken.id, {
              modelId: targetModel.id,
              providerId: provider.id,
              tokens,
              inputTokens: actualInputTokens,
              outputTokens: outputTokens,
              cost: requestCost,
            });
            console.log(`[DEBUG] Leaf-only usage record chain created successfully (non-streaming)`);
          } catch (usageError: any) {
            console.error(`[ERROR] Failed to create leaf-only usage record chain (non-streaming):`, usageError.message);
          }
        } else {
          try {
            await storage.createUsageRecord({
              userTokenId: userToken.id,
              modelId: targetModel.id,
              providerId: provider.id,
              tokens,
              inputTokens: actualInputTokens,
              outputTokens: outputTokens,
              cost: requestCost,
            });
          } catch (usageError: any) {
            console.error(`[${requestId}] Failed to create usage record:`, usageError.message);
          }
        }

        console.log(`[${requestId}] Request from ${userToken.name} finished. Output: ${outputTokens} tokens, Total: ${tokens} tokens.`);

        await storage.decrementActiveRequests();

        if (!res.headersSent) {
          res.json(data);
        }
      }
    } catch (error: any) {
      console.error(`[ERROR] Request failed:`, error.message);
      console.error(`[ERROR] Error stack:`, error.stack);
      await storage.decrementActiveRequests();
      safeSendError(500, error.message);
    }
  });

  const httpServer = createServer(app);

  // WebSocket for real-time stats
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/stats" });
  const REFRESH_INTERVAL = 3000;

  wss.on("connection", (ws: WebSocket) => {
    const interval = setInterval(async () => {
      const stats = await storage.getStats();
      ws.send(JSON.stringify(stats));
    }, REFRESH_INTERVAL);

    ws.on("close", () => {
      clearInterval(interval);
    });
  });

  return httpServer;
}
