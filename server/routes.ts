import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import cors from "cors";
import { storage } from "./storage";
import {
  insertProviderSchema,
  insertApiKeySchema,
  insertModelSchema,
  insertUserTokenSchema,
} from "@shared/schema";

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
  app.post("/api/admin/login", async (req, res) => {
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

    // Calculate model usage
    const modelUsage: Record<string, number> = {};
    usageRecords.forEach((record) => {
      modelUsage[record.modelId] = (modelUsage[record.modelId] || 0) + 1;
    });

    const lastUsed = usageRecords.length > 0
      ? Math.max(...usageRecords.map((r) => r.timestamp))
      : 0;

    res.json({
      name: userToken.name,
      lastUsed,
      requestsToday: todayUsage,
      maxRPD: userToken.maxRPD,
      remainingRPD: userToken.maxRPD - todayUsage,
      modelUsage: Object.entries(modelUsage).map(([model, count]) => ({
        name: model,
        count,
      })),
    });
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

      // Normalize base URL - remove trailing slash and /v1 if present
      let baseUrl = provider.baseUrl.replace(/\/$/, '');
      
      // Construct the models endpoint URL
      // If baseUrl already contains /v1, use it as-is, otherwise append /v1
      const modelsUrl = baseUrl.includes('/v1') 
        ? `${baseUrl}/models`
        : `${baseUrl}/v1/models`;

      console.log(`Fetching models from: ${modelsUrl}`);

      // Fetch models from provider
      const response = await fetch(modelsUrl, {
        headers: {
          Authorization: `Bearer ${apiKey.key}`,
        },
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

      // Delete existing models for this provider
      await storage.deleteModelsByProvider(provider.id);

      // Create new models
      const models = await Promise.all(
        sortedModelIds.map((modelId: string) =>
          storage.createModel({
            providerId: provider.id,
            modelId,
            enabled: true,
            requestCost: 1,
          })
        )
      );

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
      const models = await storage.getModels(req.params.id);
      await Promise.all(
        models.map((model) => storage.updateModel(model.id, { enabled: true }))
      );
      res.json({ success: true, count: models.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/providers/:id/models/disable-all", adminAuth, async (req, res) => {
    try {
      const models = await storage.getModels(req.params.id);
      await Promise.all(
        models.map((model) => storage.updateModel(model.id, { enabled: false }))
      );
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
      const models = await storage.getModels(req.params.id);
      await Promise.all(
        models.map((model) => storage.updateModel(model.id, { requestCost: parseInt(requestCost) }))
      );
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

  app.delete("/api/admin/tokens/:id", adminAuth, async (req, res) => {
    const success = await storage.deleteUserToken(req.params.id);
    res.json({ success });
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

  // Chat completions proxy
  app.post("/v1/chat/completions", flexibleAuth, async (req, res) => {
    try {
      const userToken = (req as any).userToken;
      const { model, temperature, max_tokens, top_p, ...otherParams } = req.body;
      const requestBody = { temperature, max_tokens, top_p, ...otherParams };

      // Validate model parameter
      if (!model || typeof model !== 'string') {
        return res.status(400).json({ error: "Missing or invalid 'model' parameter" });
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
        return res.status(404).json({ error: `Model '${model}' not found` });
      }

      if (!targetModel.enabled) {
        return res.status(400).json({ error: `Model '${model}' is disabled` });
      }

      if (!provider.enabled) {
        return res.status(400).json({ error: "Provider is disabled" });
      }

      // Check provider access control
      if (userToken.allowedProviders && userToken.allowedProviders.length > 0) {
        if (!userToken.allowedProviders.includes(provider.id)) {
          return res.status(403).json({ 
            error: `You don't have access to ${targetModel.modelId} from ${provider.name}` 
          });
        }
      }

      // Calculate request cost and check quota availability
      const messagesPayload = JSON.stringify(requestBody.messages || []);
      const cacheKey = `${userToken.id}:${messagesPayload}`;
      const now = Date.now();
      
      // Clean old cache entries
      for (const [key, value] of payloadCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          payloadCache.delete(key);
        }
      }

      let isCachedRequest = false;
      const cachedEntry = payloadCache.get(cacheKey);
      if (cachedEntry && cachedEntry.payload === messagesPayload) {
        isCachedRequest = true;
      }

      const originalCost = targetModel.requestCost || 1;
      let requestCost = originalCost;
      if (isCachedRequest && !provider.disableCacheDiscount) {
        requestCost = Math.round((originalCost / 10) * 100) / 100;
      }

      // Check if user has enough remaining quota
      const todayUsage = await storage.getTodayUsageCount(userToken.id);
      const remainingQuota = userToken.maxRPD - todayUsage;

      if (remainingQuota < requestCost) {
        return res.status(429).json({ 
          error: "Daily quota is insufficient",
          details: {
            required: requestCost,
            remaining: remainingQuota,
            maxRPD: userToken.maxRPD,
            used: todayUsage
          }
        });
      }

      const apiKey = await storage.getNextApiKey(provider.id);
      if (!apiKey) {
        return res.status(500).json({ error: "No API keys available for this provider" });
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
      
      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ model: targetModel.modelId, ...requestBody }),
      });

      // Check if streaming is requested
      const isStreaming = requestBody.stream === true;

      if (isStreaming) {
        // For streaming responses, pipe the stream directly to the client
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        if (!response.body) {
          await storage.decrementActiveRequests();
          return res.status(500).json({ error: "No response body from provider" });
        }

        // Track tokens for streaming (will be approximate or from final chunk)
        let totalTokens = 0;

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
                    if (parsed.usage?.total_tokens) {
                      totalTokens = parsed.usage.total_tokens;
                    }
                  }
                }
              } catch (e) {
                // Ignore parsing errors for token extraction
              }
            }
            
            res.write(value);
          }
        } catch (streamError: any) {
          console.error('Streaming error:', streamError);
        } finally {
          // Track usage for streaming with pre-calculated cost
          // Create a single usage record with the actual cost (including fractional)
          await storage.createUsageRecord({
            userTokenId: userToken.id,
            modelId: targetModel.modelId,
            providerId: provider.id,
            tokens: totalTokens,
            cost: requestCost,
          });

          await storage.decrementActiveRequests();
          res.end();
        }
      } else {
        // For non-streaming responses, return JSON as before
        const data = await response.json();

        // Track usage with pre-calculated cost
        const tokens = data.usage?.total_tokens || 0;
        
        // Create a single usage record with the actual cost (including fractional)
        await storage.createUsageRecord({
          userTokenId: userToken.id,
          modelId: targetModel.modelId,
          providerId: provider.id,
          tokens,
          cost: requestCost,
        });

        await storage.decrementActiveRequests();

        res.json(data);
      }
    } catch (error: any) {
      await storage.decrementActiveRequests();
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);

  // WebSocket for real-time stats
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/stats" });

  wss.on("connection", (ws: WebSocket) => {
    const interval = setInterval(async () => {
      const stats = await storage.getStats();
      ws.send(JSON.stringify(stats));
    }, 1000);

    ws.on("close", () => {
      clearInterval(interval);
    });
  });

  return httpServer;
}
