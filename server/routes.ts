import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import cors from "cors";
import { storage } from "./storage";
import { providerAuthStorage } from "./provider-auth-storage";
import {
  insertProviderSchema,
  insertApiKeySchema,
  insertModelSchema,
  insertUserTokenSchema,
} from "@shared/schema";
import { rateLimit } from 'express-rate-limit';
import { checkStringValidity, countInputTokens, estimateTokens, getClientIP, detectIPVersion } from '../tools/utils';
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  fetchUserInfo,
  refreshAccessToken,
  fetchUserGuilds
} from './discord-oauth';
import {
  createSessionToken,
  getSessionFromRequest,
  setSessionCookie,
  clearSessionCookie,
  SESSION_COOKIE_NAME
} from './jwe-session';

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
// Legacy provider login rate limit removed
const subKeyRateLimit = rateLimit({
  windowMs: 5 * 1_000,
  max: 3,
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
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests!",
  handler: (req, res, next, options) => {
    console.error(`Rate limit triggered for IP ${getClientIP(req)} on route: ${req.originalUrl}`);
    res.status(options.statusCode).send(options.message);
  },
});
const chatCompletionsRateLimit = rateLimit({
  windowMs: 1 * 1_000,
  max: 2,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests!",
  handler: (req, res, next, options) => {
    console.error(`Rate limit triggered for IP ${getClientIP(req)} on route: ${req.originalUrl}`);
    res.status(options.statusCode).send(options.message);
  }
});
const tokenStatsRateLimit = rateLimit({
  windowMs: 1 * 1_000,
  max: 4,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests!",
  handler: (req, res, next, options) => {
    console.error(`Rate limit triggered for IP ${getClientIP(req)} on route: ${req.originalUrl}`);
    res.status(options.statusCode).send(options.message);
  }
});
const userManageRateLimit = rateLimit({
  windowMs: 1 * 1_000,
  max: 4,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests!",
  handler: (req, res, next, options) => {
    console.error(`Rate limit triggered for IP ${getClientIP(req)} on route: ${req.originalUrl}`);
    res.status(options.statusCode).send(options.message);
  }
});
const authRateLimit = rateLimit({
  windowMs: 60 * 1_000, // 1 minute
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many authentication requests!",
  handler: (req, res, next, options) => {
    console.error(`Rate limit triggered for IP ${getClientIP(req)} on route: ${req.originalUrl}`);
    res.status(options.statusCode).send(options.message);
  },
});


import session from "express-session";
import connectSqlite3 from "connect-sqlite3";
import bcrypt from "bcrypt";

const SQLiteStore = connectSqlite3(session);

// OAuth state storage for CSRF protection
const oauthStates = new Map<string, { timestamp: number; returnTo?: string }>();
const STATE_EXPIRY = 10 * 60 * 1000; // 10 minutes

// Clean up expired states periodically
setInterval(() => {
  const now = Date.now();
  oauthStates.forEach((value, key) => {
    if (now - value.timestamp > STATE_EXPIRY) {
      oauthStates.delete(key);
    }
  });
}, 60 * 1000); // Clean every minute

// Middleware for admin authentication (legacy - for username/password login)
function adminAuth(req: Request, res: Response, next: Function) {
  if ((req.session as any).adminId) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
}

// Unified role-based authentication middleware
async function requireRole(role: 'admin' | 'provider') {
  return async (req: Request, res: Response, next: Function) => {
    try {
      // Check for legacy admin session (Super Admin)
      if (role === 'admin' && (req.session as any).adminId) {
        (req as any).isSuperAdmin = true;
        return next();
      }

      // Check for Discord user session
      const session = await getSessionFromRequest(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized - Please login" });
      }

      const user = await storage.getDiscordUser(session.userId);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized - User not found" });
      }

      if (user.banned) {
        return res.status(403).json({ error: "Account banned" });
      }

      // Check if user has the required role
      const userRoles = user.roles || ["user"];
      if (!userRoles.includes(role)) {
        return res.status(403).json({ error: `Forbidden - ${role} role required` });
      }

      // Attach user to request for downstream use
      (req as any).discordUser = user;
      (req as any).isSuperAdmin = false;
      next();
    } catch (error: any) {
      console.error('Role auth error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

// Legacy provider auth code removed - now using Discord OAuth with roles

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

async function resolveTokenAllowedProviders(userToken: any): Promise<string[]> {
  if (userToken.allowedProviders && userToken.allowedProviders.length > 0) {
    return userToken.allowedProviders;
  }

  if (userToken.createdByProviderId) {
    const providers = await storage.getProviders();
    return providers
      .filter((provider) => provider.ownerId === userToken.createdByProviderId)
      .map((provider) => provider.id);
  }

  return [];
}

// Shared helper to fetch models for a provider and persist them
const MODEL_SYNC_TIMEOUT_MS = 10_000;
const PROVIDER_MAX_RPM = 500;

async function syncProviderModels(providerId: string) {
  const provider = await storage.getProvider(providerId);
  if (!provider) {
    throw new Error("Provider not found");
  }

  const apiKey = await storage.getNextApiKey(provider.id);
  if (!apiKey) {
    throw new Error("No API keys configured");
  }

  // Normalize base URL - remove trailing slash
  const baseUrl = provider.baseUrl.replace(/\/$/, "");
  const modelsUrl = `${baseUrl}/models`;

  console.log(`[MODEL SYNC] Fetching models from: ${modelsUrl}`);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey.key}`,
    ...(provider.customHeaders || {}),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_SYNC_TIMEOUT_MS);

  let response: globalThis.Response;
  try {
    response = await fetch(modelsUrl, { headers, signal: controller.signal });
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`Model fetch timed out after ${MODEL_SYNC_TIMEOUT_MS / 1000} seconds`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`);
  }

  const data = await response.json();
  console.log("[MODEL SYNC] Received data:", JSON.stringify(data).substring(0, 200));

  let modelIds: string[] = [];
  if (data.data && Array.isArray(data.data)) {
    modelIds = data.data.map((m: any) => m.id).filter(Boolean);
  } else if (Array.isArray(data)) {
    modelIds = data.map((m: any) => m.id).filter(Boolean);
  } else {
    throw new Error("Unexpected response format from provider");
  }

  if (modelIds.length === 0) {
    throw new Error("No models found in provider response");
  }

  const sortedModelIds = modelIds.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const models = await storage.replaceProviderModels(provider.id, sortedModelIds);

  return { models, count: models.length };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Behind a proxy/CDN (e.g., Cloudflare) we must trust the first hop so
  // req.secure reflects the original HTTPS request and X-Forwarded-* works.
  app.set("trust proxy", 1);

  // Enable CORS
  app.use(cors({
    origin: true, // Reflect request origin to allow all origins while supporting credentials
    credentials: true,
  }));

  if (!process.env.SESSION_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SET A SESSION SECRET TO PREVENT COOKIE ATTACKS! THIS IS NON-NEGOTIABLE!');
    } else {
      console.log("WARNING: YOU HAVE NOT SET A SESSION SECRET IN THE ENV, " + 
          "BUT THE APP STILL RUNS BECAUSE IT'S NONPRODUCTION MODE!");
      console.log("WARNING: YOU HAVE NOT SET A SESSION SECRET IN THE ENV, " + 
          "BUT THE APP STILL RUNS BECAUSE IT'S NONPRODUCTION MODE!");
      console.log("WARNING: YOU HAVE NOT SET A SESSION SECRET IN THE ENV, " + 
          "BUT THE APP STILL RUNS BECAUSE IT'S NONPRODUCTION MODE!");
    }
  }

  // Session configuration
  app.use(session({
    store: new SQLiteStore({
      db: 'sessions.sqlite',
      dir: './'
    }) as any,
    secret: process.env.SESSION_SECRET || 'your-secret-here',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  // Public routes


  // Discord OAuth Routes

  // GET /api/auth/discord - Initiate OAuth flow
  app.get("/api/auth/discord", authRateLimit, (req: Request, res: Response) => {
    // Generate cryptographically secure state
    const state = randomUUID();
    
    // Store state with optional return URL
    const returnTo = req.query.returnTo as string | undefined;
    oauthStates.set(state, { timestamp: Date.now(), returnTo });
    
    // Build authorization URL and redirect
    const authUrl = buildAuthorizationUrl(state);
    res.redirect(authUrl);
  });

  // GET /api/auth/discord/callback - Handle OAuth callback
  app.get("/api/auth/discord/callback", authRateLimit, async (req: Request, res: Response) => {
    const { code, state, error } = req.query;
    
    // Handle OAuth errors from Discord
    if (error) {
      console.error("Discord OAuth error:", error);
      return res.redirect("/?error=oauth_denied");
    }
    
    // Validate state parameter
    if (!state || typeof state !== 'string') {
      return res.redirect("/?error=invalid_state");
    }
    
    const storedState = oauthStates.get(state);
    if (!storedState) {
      return res.redirect("/?error=invalid_state");
    }
    
    // Remove used state
    oauthStates.delete(state);
    
    // Check state expiry
    if (Date.now() - storedState.timestamp > STATE_EXPIRY) {
      return res.redirect("/?error=state_expired");
    }
    
    // Validate code
    if (!code || typeof code !== 'string') {
      return res.redirect("/?error=missing_code");
    }
    
    try {
      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(code);
      
      // Fetch user info from Discord
      const discordUser = await fetchUserInfo(tokens.access_token);

      // Check for Guild Membership if configured
      const requiredGuildId = process.env.GUILD_ID;
      if (requiredGuildId) {
        try {
          const userGuilds = await fetchUserGuilds(tokens.access_token);
          const isMember = userGuilds.some(guild => guild.id === requiredGuildId);
          
          if (!isMember) {
            console.log(`User ${discordUser.username} (${discordUser.id}) attempted login but is not in required guild ${requiredGuildId}`);
            return res.redirect("/?error=guild_required");
          }
        } catch (guildError) {
          console.error("Failed to verify guild membership:", guildError);
          // If we can't verify membership but it's required, fail safe
          return res.redirect("/?error=auth_failed");
        }
      }
      
      // Create or update user in database
      const clientIp = getClientIP(req);
      const now = Date.now();
      
      let user = await storage.getDiscordUser(discordUser.id);
      if (user) {
        if (user.banned) {
          return res.redirect("/?error=account_banned");
        }

        // Update existing user
        // Only update IP if user doesn't have one set (first login)
        // Subsequent IP updates must be manual via the update endpoint
        const updateData: any = {
          username: discordUser.username,
          discriminator: discordUser.discriminator,
          globalName: discordUser.global_name,
          email: discordUser.email,
          avatar: discordUser.avatar,
        };
        
        if (!user.ip) {
          updateData.ip = clientIp;
          updateData.lastIpUpdate = now;
        }
        
        user = await storage.updateDiscordUser(discordUser.id, updateData);
      } else {
        // Create new user
        user = await storage.createDiscordUser({
          id: discordUser.id,
          username: discordUser.username,
          discriminator: discordUser.discriminator,
          globalName: discordUser.global_name,
          email: discordUser.email,
          avatar: discordUser.avatar,
          ip: clientIp,
          lastIpUpdate: now,
        });
      }
      
      // Create session token
      const sessionToken = await createSessionToken({
        userId: discordUser.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: Date.now() + (tokens.expires_in * 1000),
      });
      
      // Set session cookie
      setSessionCookie(res, sessionToken);
      
      // Redirect to return URL or home
      const returnTo = storedState.returnTo || "/";
      res.redirect(returnTo);
      
    } catch (error: any) {
      console.error("Discord OAuth callback error:", error);
      res.redirect("/?error=auth_failed");
    }
  });

  // GET /api/auth/me - Get current authenticated user
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    // Prevent caching to ensure ban status is always fresh
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    try {
      const session = await getSessionFromRequest(req);
      
      if (!session) {
        return res.json({ authenticated: false, user: null });
      }
      
      // Check if token needs refresh (expires within 1 hour)
      const ONE_HOUR = 60 * 60 * 1000;
      if (session.tokenExpiresAt - Date.now() < ONE_HOUR) {
        try {
          // Attempt to refresh the token
          const newTokens = await refreshAccessToken(session.refreshToken);
          
          // Create new session with refreshed tokens
          const newSessionToken = await createSessionToken({
            userId: session.userId,
            accessToken: newTokens.access_token,
            refreshToken: newTokens.refresh_token,
            tokenExpiresAt: Date.now() + (newTokens.expires_in * 1000),
          });
          
          // Update cookie with new session
          setSessionCookie(res, newSessionToken);
        } catch (refreshError) {
          console.error("Token refresh failed:", refreshError);
          // Clear invalid session
          clearSessionCookie(res);
          return res.json({ authenticated: false, user: null });
        }
      }
      
      // Get user from database
      const user = await storage.getDiscordUser(session.userId);
      
      if (!user) {
        clearSessionCookie(res);
        return res.json({ authenticated: false, user: null });
      }
      
      // Return user info (without sensitive data)
      res.json({
        authenticated: true,
        user: {
          id: user.id,
          username: user.username,
          globalName: user.globalName,
          email: user.email,
          avatar: user.avatar,
          avatarUrl: user.avatar
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
            : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator) % 5}.png`,
          authorizedIp: user.ip,
          currentIp: getClientIP(req),
          banned: user.banned,
          roles: user.roles || ["user"],
        },
      });
      
    } catch (error: any) {
      console.error("Auth me error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/auth/update-ip - Update authorized IP
  app.post("/api/auth/update-ip", authRateLimit, async (req: Request, res: Response) => {
    try {
      const session = await getSessionFromRequest(req);
      
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const user = await storage.getDiscordUser(session.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user.banned) {
        return res.status(403).json({ error: "Account banned" });
      }
      
      const now = Date.now();
      const thirtyMinutes = 30 * 60 * 1000;
      
      // Check cooldown - skip if user has no IP set (allows immediate refresh after admin revokes IP)
      if (user.ip && user.lastIpUpdate && (now - user.lastIpUpdate < thirtyMinutes)) {
        const remainingMinutes = Math.ceil((thirtyMinutes - (now - user.lastIpUpdate)) / 60000);
        return res.status(429).json({
          error: `You can only update your IP once every 30 minutes. Please wait ${remainingMinutes} minutes.`
        });
      }
      
      // Get IP from request body or fallback to client IP
      const { ip: customIp } = req.body;
      let newIp: string;
      
      if (customIp) {
        // Validate custom IP
        const ipVersion = detectIPVersion(customIp);
        if (ipVersion === 'unknown') {
          return res.status(400).json({ error: "Invalid IP address format" });
        }
        newIp = customIp;
      } else {
        // Fallback to client's current IP
        newIp = getClientIP(req);
      }
      
      // Update IP
      const updatedUser = await storage.updateDiscordUser(user.id, {
        ip: newIp,
        lastIpUpdate: now,
      });
      
      res.json({
        success: true,
        ip: newIp,
        message: "Authorized IP updated successfully"
      });
      
    } catch (error: any) {
      console.error("Error updating IP:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/auth/logout - Logout and clear session
  app.post("/api/auth/logout", authRateLimit, (req: Request, res: Response) => {
    clearSessionCookie(res);
    res.json({ success: true });
  });

  app.get("/api/admin/me", async (req: Request, res: Response) => {
    if (!(req.session as any).adminId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    res.json({
      authenticated: true
    });
  });
  
  app.use('/api/admin', adminApiRateLimit);
  
  // Admin login
  app.post("/api/admin/login", adminLoginRateLimit, async (req: Request, res: Response) => {
    const { username, password } = req.body;

    try {
      const admin = await storage.getAdmin(username);

      if (!admin) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const isValid = await bcrypt.compare(password, admin.password);

      if (isValid) {
        (req.session as any).adminId = admin.id;
        req.session.save(() => {
          res.json({ success: true });
        });
      } else {
        res.status(401).json({ error: "Invalid credentials" });
      }
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });




  // Admin logout
  app.post("/api/admin/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });

  // Legacy provider auth routes removed - now using Discord OAuth with roles

  // Get stats (public)
  app.get("/api/stats", async (req: Request, res: Response) => {
    const stats = await storage.getStats();
    res.json(stats);
  });

  // Get all providers with models (public, only enabled)
  app.get("/api/providers/public", async (req: Request, res: Response) => {
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
  app.post("/api/token/stats", tokenStatsRateLimit, async (req: Request, res: Response) => {
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
  app.patch("/api/token/update-name", subkeyRenameRateLimit, async (req: Request, res: Response) => {
    const { token, name } = req.body;

    if (!token || !name) {
      return res.status(400).json({ error: "Token and name are required" });
    }

    const nameValidation = checkStringValidity(name);
    if (!nameValidation.valid) {
      return res.status(400).json({ error: nameValidation.error });
    }

    if (name.length > 50) {
      return res.status(400).json({ error: "Name cannot be greater than 50 characters" });
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
  app.post("/api/user/manage", userManageRateLimit, async (req: Request, res: Response) => {
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
      const allowedProviders = await resolveTokenAllowedProviders(userToken);
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
          allowedProviderIds: allowedProviders,
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
  app.post("/api/user/sub-keys", subKeyRateLimit, async (req: Request, res: Response) => {
    const { token, name, maxRPD, maxRPM, allowedProviders, expiresAt } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Parent token is required" });
    }

    // validate name
    if (!name || (!(checkStringValidity(name).valid)) || name.length > 50) {
      return res.status(400).json({ error: "Name has to be valid and below 50 characters!" });
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
  app.delete("/api/user/sub-keys/:id", async (req: Request, res: Response) => {
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
  app.post("/api/user/sub-keys/:id/disable", async (req: Request, res: Response) => {
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
  app.post("/api/user/sub-keys/:id/enable", async (req: Request, res: Response) => {
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

  const getOwnedProviders = async (providerAccountId: string) => {
    const providers = await storage.getProviders();
    return providers.filter((provider) => provider.ownerId === providerAccountId);
  };

  const getOwnedProviderIds = async (providerAccountId: string) => {
    const ownedProviders = await getOwnedProviders(providerAccountId);
    return ownedProviders.map((provider) => provider.id);
  };

  const findOwnedApiKey = async (providerAccountId: string, keyId: string) => {
    const ownedProviders = await getOwnedProviders(providerAccountId);
    for (const provider of ownedProviders) {
      const keys = await storage.getApiKeys(provider.id);
      const match = keys.find((key) => key.id === keyId);
      if (match) {
        return { provider, key: match };
      }
    }
    return null;
  };

  const findOwnedModel = async (providerAccountId: string, modelId: string) => {
    const ownedProviders = await getOwnedProviders(providerAccountId);
    for (const provider of ownedProviders) {
      const models = await storage.getModels(provider.id);
      const match = models.find((model) => model.id === modelId);
      if (match) {
        return { provider, model: match };
      }
    }
    return null;
  };

  // Provider routes (protected)
  app.get("/api/providers", await requireRole('provider'), async (req: Request, res: Response) => {
    const discordUser = (req as any).discordUser;
    const providers = await getOwnedProviders(discordUser.id);
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

  app.post("/api/providers", await requireRole('provider'), async (req: Request, res: Response) => {
    const discordUser = (req as any).discordUser;
    try {
      const data = insertProviderSchema.parse(req.body);

      const existingProviders = await storage.getProviders();
      if (existingProviders.some(p => p.name.toLowerCase() === data.name.toLowerCase())) {
        return res.status(400).json({ error: "A provider with this name already exists" });
      }

      const provider = await storage.createProvider({ ...data, ownerId: discordUser.id });
      res.json(provider);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/providers/:id", await requireRole('provider'), async (req: Request, res: Response) => {
    const discordUser = (req as any).discordUser;
    try {
      const existingProvider = await storage.getProvider(req.params.id);
      if (!existingProvider) {
        return res.status(404).json({ error: "Provider not found" });
      }
      if (existingProvider.ownerId !== discordUser.id) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      if (req.body.name) {
        const existingProviders = await storage.getProviders();
        if (existingProviders.some(p => p.id !== req.params.id && p.name.toLowerCase() === req.body.name.toLowerCase())) {
          return res.status(400).json({ error: "A provider with this name already exists" });
        }
      }

      const { name, baseUrl, enabled, customHeaders, disableCacheDiscount } = req.body;
      const provider = await storage.updateProvider(req.params.id, {
        name,
        baseUrl,
        enabled,
        customHeaders,
        disableCacheDiscount,
      });
      if (!provider) {
        return res.status(404).json({ error: "Provider not found" });
      }
      res.json(provider);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/providers/:id", await requireRole('provider'), async (req: Request, res: Response) => {
    const discordUser = (req as any).discordUser;
    const provider = await storage.getProvider(req.params.id);
    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }
    if (provider.ownerId !== discordUser.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    const success = await storage.deleteProvider(req.params.id);
    res.json({ success });
  });

  // Provider API Keys
  app.get("/api/providers/:id/keys", await requireRole('provider'), async (req: Request, res: Response) => {
    const discordUser = (req as any).discordUser;
    const provider = await storage.getProvider(req.params.id);
    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }
    if (provider.ownerId !== discordUser.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    const keys = await storage.getApiKeys(req.params.id);
    res.json(keys);
  });

  app.post("/api/providers/:id/keys", await requireRole('provider'), async (req: Request, res: Response) => {
    const discordUser = (req as any).discordUser;
    const provider = await storage.getProvider(req.params.id);
    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }
    if (provider.ownerId !== discordUser.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    try {
      const data = insertApiKeySchema.parse({
        ...req.body,
        providerId: req.params.id,
      });
      const key = await storage.createApiKey(data);

      let modelSync: { success: boolean; count?: number; error?: string } | undefined;
      try {
        const result = await syncProviderModels(req.params.id);
        modelSync = { success: true, count: result.count };
      } catch (syncError: any) {
        console.error("Auto model sync failed after adding key:", syncError);
        modelSync = { success: false, error: syncError.message };
      }

      res.json({ ...key, modelSync });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/providers/keys/:id", await requireRole('provider'), async (req: Request, res: Response) => {
    const discordUser = (req as any).discordUser;
    const ownedKey = await findOwnedApiKey(discordUser.id, req.params.id);
    if (!ownedKey) {
      return res.status(404).json({ error: "API key not found" });
    }
    const success = await storage.deleteApiKey(req.params.id);
    res.json({ success });
  });

  app.patch("/api/providers/keys/:id", await requireRole('provider'), async (req: Request, res: Response) => {
    const discordUser = (req as any).discordUser;
    const { key } = req.body;
    if (!key) {
      return res.status(400).json({ error: "Key is required" });
    }
    const ownedKey = await findOwnedApiKey(discordUser.id, req.params.id);
    if (!ownedKey) {
      return res.status(404).json({ error: "API key not found" });
    }
    const apiKey = await storage.updateApiKey(req.params.id, key);
    if (!apiKey) {
      return res.status(404).json({ error: "API key not found" });
    }
    res.json(apiKey);
  });

  // Provider Models
  app.get("/api/providers/:id/models", await requireRole('provider'), async (req: Request, res: Response) => {
    const discordUser = (req as any).discordUser;
    const provider = await storage.getProvider(req.params.id);
    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }
    if (provider.ownerId !== discordUser.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    const models = await storage.getModels(req.params.id);
    res.json(models);
  });

  app.post("/api/providers/:id/check-models", await requireRole('provider'), async (req: Request, res: Response) => {
    const discordUser = (req as any).discordUser;
    const provider = await storage.getProvider(req.params.id);
    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }
    if (provider.ownerId !== discordUser.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    try {
      const result = await syncProviderModels(req.params.id);
      res.json(result);
    } catch (error: any) {
      console.error("Check models error:", error);
      if (error.message === "No API keys configured") {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/providers/models/:id", await requireRole('provider'), async (req: Request, res: Response) => {
    const discordUser = (req as any).discordUser;
    const ownedModel = await findOwnedModel(discordUser.id, req.params.id);
    if (!ownedModel) {
      return res.status(404).json({ error: "Model not found" });
    }
    const model = await storage.updateModel(req.params.id, req.body);
    if (!model) {
      return res.status(404).json({ error: "Model not found" });
    }
    res.json(model);
  });

  app.delete("/api/providers/models/:id", await requireRole('provider'), async (req: Request, res: Response) => {
    const discordUser = (req as any).discordUser;
    const ownedModel = await findOwnedModel(discordUser.id, req.params.id);
    if (!ownedModel) {
      return res.status(404).json({ error: "Model not found" });
    }
    const success = await storage.deleteModel(req.params.id);
    res.json({ success });
  });

  app.post("/api/providers/:id/models/update-cost-all", await requireRole('provider'), async (req: Request, res: Response) => {
    const discordUser = (req as any).discordUser;
    const provider = await storage.getProvider(req.params.id);
    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }
    if (provider.ownerId !== discordUser.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

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

  app.patch("/api/providers/:id/models/bulk", await requireRole('provider'), async (req: Request, res: Response) => {
    const discordUser = (req as any).discordUser;
    const provider = await storage.getProvider(req.params.id);
    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }
    if (provider.ownerId !== discordUser.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    try {
      const { updates } = req.body;

      if (!updates || !Array.isArray(updates)) {
        return res.status(400).json({ error: "Updates array is required" });
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: "Updates array cannot be empty" });
      }

      for (const update of updates) {
        if (!update.id || typeof update.id !== "string") {
          return res.status(400).json({ error: "Each update must have a valid 'id' field" });
        }

        let hasUpdateField = false;

        if (update.enabled !== undefined) {
          if (typeof update.enabled !== "boolean") {
            return res.status(400).json({ error: "Each update must have a valid 'enabled' field" });
          }
          hasUpdateField = true;
        }

        if (update.requestCost !== undefined) {
          if (typeof update.requestCost !== "number" || update.requestCost < 1) {
            return res.status(400).json({ error: "Each update must have a valid 'requestCost' field" });
          }
          hasUpdateField = true;
        }

        if (update.tokenLimit !== undefined) {
          if (update.tokenLimit !== null && (typeof update.tokenLimit !== "number" || update.tokenLimit < 1)) {
            return res.status(400).json({ error: "Each update must have a valid 'tokenLimit' field" });
          }
          hasUpdateField = true;
        }

        if (!hasUpdateField) {
          return res.status(400).json({ error: "Each update must include at least one field to update" });
        }
      }

      const providerModels = await storage.getModels(req.params.id);
      const providerModelIds = new Set(providerModels.map((model) => model.id));
      const invalidModelIds = updates.filter((update) => !providerModelIds.has(update.id));
      if (invalidModelIds.length > 0) {
        return res.status(403).json({ error: "One or more models are not owned by this provider" });
      }

      const updatedModels = await storage.bulkUpdateModelsByIds(updates);
      const allModels = await storage.getModels(req.params.id);

      res.json({
        success: true,
        updated: updatedModels.length,
        models: allModels,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Provider user tokens
  app.get("/api/providers/tokens", await requireRole('provider'), async (req: Request, res: Response) => {
    const discordUser = (req as any).discordUser;
    const tokens = await storage.getUserTokens();
    const ownedTokens = tokens.filter((token) => token.createdByProviderId === discordUser.id);
    const tokensWithUsage = await Promise.all(
      ownedTokens.map(async (token) => {
        const todayUsage = await storage.getTodayUsageCount(token.id);
        return {
          ...token,
          usedRPD: todayUsage,
        };
      })
    );
    res.json(tokensWithUsage);
  });

  app.post("/api/providers/tokens", await requireRole('provider'), async (req: Request, res: Response) => {
    const discordUser = (req as any).discordUser;
    try {
      const data = insertUserTokenSchema.parse(req.body);
      if (data.maxRPM > PROVIDER_MAX_RPM) {
        return res.status(400).json({ error: `Max RPM cannot exceed ${PROVIDER_MAX_RPM}` });
      }

      const ownedProviderIds = await getOwnedProviderIds(discordUser.id);
      if (ownedProviderIds.length === 0) {
        return res.status(400).json({ error: "No providers available for this account" });
      }

      let allowedProviders = data.allowedProviders;
      if (allowedProviders && allowedProviders.length > 0) {
        const invalid = allowedProviders.filter((id) => !ownedProviderIds.includes(id));
        if (invalid.length > 0) {
          return res.status(400).json({ error: "Invalid provider access requested" });
        }
      } else {
        allowedProviders = ownedProviderIds;
      }

      const token = await storage.createUserToken({
        ...data,
        keyType: "master",
        allowedProviders,
        createdByProviderId: discordUser.id,
      });
      res.json(token);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/providers/tokens/:id", await requireRole('provider'), async (req: Request, res: Response) => {
    const discordUser = (req as any).discordUser;
    try {
      const token = await storage.getUserTokenById(req.params.id);
      if (!token || token.createdByProviderId !== discordUser.id) {
        return res.status(404).json({ error: "Token not found" });
      }

      if (req.body.maxRPM !== undefined && req.body.maxRPM > PROVIDER_MAX_RPM) {
        return res.status(400).json({ error: `Max RPM cannot exceed ${PROVIDER_MAX_RPM}` });
      }

      let resolvedAllowedProviders = req.body.allowedProviders;
      if (resolvedAllowedProviders !== undefined) {
        const ownedProviderIds = await getOwnedProviderIds(discordUser.id);
        if (!Array.isArray(resolvedAllowedProviders) || resolvedAllowedProviders.length === 0) {
          resolvedAllowedProviders = ownedProviderIds;
        } else {
          const invalid = resolvedAllowedProviders.filter((id: string) => !ownedProviderIds.includes(id));
          if (invalid.length > 0) {
            return res.status(400).json({ error: "Invalid provider access requested" });
          }
        }
      }

      const updateData = {
        name: req.body.name,
        maxRPD: req.body.maxRPD,
        maxRPM: req.body.maxRPM,
        allowedProviders: resolvedAllowedProviders,
        expiresAt: req.body.expiresAt,
        disabled: req.body.disabled,
        sigmaBoy: req.body.sigmaBoy,
        maxSubKeys: req.body.maxSubKeys,
      };

      const updatedToken = await storage.updateUserToken(req.params.id, updateData);
      if (!updatedToken) {
        return res.status(404).json({ error: "Token not found" });
      }
      res.json(updatedToken);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/providers/tokens/:id", await requireRole('provider'), async (req: Request, res: Response) => {
    const discordUser = (req as any).discordUser;
    const token = await storage.getUserTokenById(req.params.id);
    if (!token || token.createdByProviderId !== discordUser.id) {
      return res.status(404).json({ error: "Token not found" });
    }
    const success = await storage.deleteUserToken(req.params.id);
    res.json({ success });
  });

  app.post("/api/providers/tokens/:id/regenerate", await requireRole('provider'), async (req: Request, res: Response) => {
    const discordUser = (req as any).discordUser;
    const token = await storage.getUserTokenById(req.params.id);
    if (!token || token.createdByProviderId !== discordUser.id) {
      return res.status(404).json({ error: "Token not found" });
    }

    try {
      const updatedToken = await storage.regenerateUserToken(req.params.id);
      if (!updatedToken) {
        return res.status(404).json({ error: "Token not found" });
      }
      res.json(updatedToken);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/providers/tokens/:id/sub-keys", await requireRole('provider'), async (req: Request, res: Response) => {
    const discordUser = (req as any).discordUser;
    const { name, maxRPD, maxRPM, allowedProviders, expiresAt } = req.body;

    if (!name || (!(checkStringValidity(name).valid)) || name.length > 50) {
      return res.status(400).json({ error: "Name has to be valid and below 50 characters!" });
    }

    const parentToken = await storage.getUserTokenById(req.params.id);
    if (!parentToken || parentToken.createdByProviderId !== discordUser.id) {
      return res.status(404).json({ error: "Parent token not found" });
    }

    const numericRPD = typeof maxRPD === "string" ? parseFloat(maxRPD) : maxRPD;
    const numericRPM = typeof maxRPM === "string" ? parseFloat(maxRPM) : maxRPM;

    if (numericRPM > PROVIDER_MAX_RPM) {
      return res.status(400).json({ error: `Max RPM cannot exceed ${PROVIDER_MAX_RPM}` });
    }

    const validation = await storage.canCreateSubKey(parentToken.id, numericRPD, numericRPM);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.reason });
    }

    if (expiresAt && expiresAt <= Date.now()) {
      return res.status(400).json({ error: "Expiration date must be in the future" });
    }

    let parentAllowed = parentToken.allowedProviders || [];
    if (parentAllowed.length === 0) {
      parentAllowed = await getOwnedProviderIds(discordUser.id);
    }
    let resolvedAllowed = allowedProviders;
    if (resolvedAllowed && resolvedAllowed.length > 0) {
      const invalid = resolvedAllowed.filter((id: string) => !parentAllowed.includes(id));
      if (invalid.length > 0) {
        return res.status(400).json({ error: "Invalid provider access requested" });
      }
    } else {
      resolvedAllowed = parentAllowed;
    }

    try {
      const subKey = await storage.createUserToken({
        name,
        maxRPD: numericRPD,
        maxRPM: numericRPM,
        allowedProviders: resolvedAllowed,
        parentTokenId: parentToken.id,
        keyType: "sub",
        expiresAt,
        createdByProviderId: discordUser.id,
      });

      res.json(subKey);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/providers/sub-keys/:id", await requireRole('provider'), async (req: Request, res: Response) => {
    const discordUser = (req as any).discordUser;
    const subKey = await storage.getUserTokenById(req.params.id);
    if (!subKey || subKey.createdByProviderId !== discordUser.id) {
      return res.status(404).json({ error: "Sub-key not found" });
    }

    try {
      const deletedCount = await storage.cascadeDeleteSubKeys(subKey.id);
      await storage.deleteUserToken(subKey.id);
      res.json({ success: true, deletedCount: deletedCount + 1 });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/providers/sub-keys/:id/disable", await requireRole('provider'), async (req: Request, res: Response) => {
    const discordUser = (req as any).discordUser;
    const subKey = await storage.getUserTokenById(req.params.id);
    if (!subKey || subKey.createdByProviderId !== discordUser.id) {
      return res.status(404).json({ error: "Sub-key not found" });
    }

    try {
      await storage.updateUserToken(subKey.id, { disabled: true });
      const disabledCount = await storage.cascadeDisableSubKeys(subKey.id);
      res.json({ success: true, disabledCount: disabledCount + 1 });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/providers/sub-keys/:id/enable", await requireRole('provider'), async (req: Request, res: Response) => {
    const discordUser = (req as any).discordUser;
    const subKey = await storage.getUserTokenById(req.params.id);
    if (!subKey || subKey.createdByProviderId !== discordUser.id) {
      return res.status(404).json({ error: "Sub-key not found" });
    }

    if (subKey.expiresAt && subKey.expiresAt <= Date.now()) {
      return res.status(400).json({ error: "Cannot enable expired sub-key. Please update expiration date first." });
    }

    try {
      await storage.updateUserToken(subKey.id, { disabled: false });
      const enabledCount = await storage.cascadeEnableSubKeys(subKey.id);
      res.json({ success: true, enabledCount: enabledCount + 1 });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Admin routes (protected)

  // Discord Users
  app.get("/api/admin/users", await requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const users = await storage.getDiscordUsers();
      const usersWithAvatar = users.map((user) => ({
        ...user,
        avatarUrl: user.avatar
          ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
          : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator) % 5}.png`,
      }));
      res.json(usersWithAvatar);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/users/:id/ban", await requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const { reason } = req.body;
      const user = await storage.banDiscordUser(req.params.id, reason);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ success: true, user });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/users/:id/unban", await requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const user = await storage.unbanDiscordUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ success: true, user });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/users/:id/revoke-ip", await requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const user = await storage.updateDiscordUser(req.params.id, {
        ip: null as any,
        lastIpUpdate: null as any
      });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ success: true, user });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update user roles - Super Admin can manage all roles, Discord Admins can only manage provider role
  app.post("/api/admin/users/:id/roles", adminApiRateLimit, async (req: Request, res: Response) => {
    try {
      const { roles } = req.body;
      
      if (!Array.isArray(roles)) {
        return res.status(400).json({ error: "Roles must be an array" });
      }

      // Validate roles
      const validRoles = ["user", "provider", "admin"];
      const invalidRoles = roles.filter(r => !validRoles.includes(r));
      if (invalidRoles.length > 0) {
        return res.status(400).json({ error: `Invalid roles: ${invalidRoles.join(", ")}` });
      }

      // Check authentication
      const isSuperAdmin = !!(req.session as any).adminId;
      const session = await getSessionFromRequest(req);
      let isDiscordAdmin = false;
      
      if (session) {
        const adminUser = await storage.getDiscordUser(session.userId);
        isDiscordAdmin = adminUser?.roles?.includes("admin") || false;
      }

      if (!isSuperAdmin && !isDiscordAdmin) {
        return res.status(401).json({ error: "Unauthorized - Admin access required" });
      }

      // Only Super Admin can manage admin role
      if (roles.includes("admin") && !isSuperAdmin) {
        return res.status(403).json({ error: "Forbidden - Only Super Admin can assign admin role" });
      }

      // Prevent removing admin role from Super Admin's own account
      if (isSuperAdmin && session) {
        const targetUser = await storage.getDiscordUser(req.params.id);
        if (targetUser?.id === session.userId && !roles.includes("admin")) {
          return res.status(400).json({ error: "Cannot remove admin role from your own account" });
        }
      }

      const user = await storage.updateDiscordUser(req.params.id, { roles });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ success: true, user });
    } catch (error: any) {
      console.error("Error updating user roles:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Provider accounts
  app.get("/api/admin/provider-accounts", await requireRole('admin'), async (req: Request, res: Response) => {
    const accounts = providerAuthStorage.getProviderAccounts().map((account) => ({
      id: account.id,
      username: account.username,
      createdAt: account.createdAt,
      hasSession: Boolean(account.sessionToken),
    }));
    res.json(accounts);
  });

  app.post("/api/admin/provider-accounts", await requireRole('admin'), async (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    try {
      const normalizedUsername = String(username).trim();
      if (!normalizedUsername) {
        return res.status(400).json({ error: "Username is required" });
      }

      const existing = providerAuthStorage.getProviderByUsername(normalizedUsername);
      if (existing) {
        return res.status(400).json({ error: "A provider account with this username already exists" });
      }

      const hashedPassword = await bcrypt.hash(String(password), 10);
      const account = providerAuthStorage.createProviderAccount(normalizedUsername, hashedPassword);
      res.json({
        id: account.id,
        username: account.username,
        createdAt: account.createdAt,
        hasSession: Boolean(account.sessionToken),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/admin/provider-accounts/:id", await requireRole('admin'), async (req: Request, res: Response) => {
    const { username, password, clearSession } = req.body;

    try {
      const existing = providerAuthStorage.getProviderById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Provider account not found" });
      }

      let updatedUsername: string | undefined;
      if (username !== undefined) {
        const normalizedUsername = String(username).trim();
        if (!normalizedUsername) {
          return res.status(400).json({ error: "Username is required" });
        }
        if (normalizedUsername !== existing.username) {
          const conflict = providerAuthStorage.getProviderByUsername(normalizedUsername);
          if (conflict && conflict.id !== existing.id) {
            return res.status(400).json({ error: "A provider account with this username already exists" });
          }
        }
        updatedUsername = normalizedUsername;
      }

      let passwordHash: string | undefined;
      if (password !== undefined) {
        const normalizedPassword = String(password);
        if (!normalizedPassword) {
          return res.status(400).json({ error: "Password is required" });
        }
        passwordHash = await bcrypt.hash(normalizedPassword, 10);
      }

      const updated = providerAuthStorage.updateProviderAccount(req.params.id, {
        username: updatedUsername,
        passwordHash,
        clearSession: Boolean(clearSession),
      });

      if (!updated) {
        return res.status(404).json({ error: "Provider account not found" });
      }

      res.json({
        id: updated.id,
        username: updated.username,
        createdAt: updated.createdAt,
        hasSession: Boolean(updated.sessionToken),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/admin/provider-accounts/:id", await requireRole('admin'), async (req: Request, res: Response) => {
    const existing = providerAuthStorage.getProviderById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Provider account not found" });
    }

    const providers = await storage.getProviders();
    const ownsProviders = providers.some((provider) => provider.ownerId === existing.id);
    if (ownsProviders) {
      return res.status(400).json({ error: "Cannot delete account that owns providers" });
    }

    const success = providerAuthStorage.deleteProviderAccount(req.params.id);
    res.json({ success });
  });

  // Providers
  app.get("/api/admin/providers", await requireRole('admin'), async (req: Request, res: Response) => {
    const providers = await storage.getProviders();
    const providersWithCounts = await Promise.all(
      providers.map(async (provider) => {
        const keys = await storage.getApiKeys(provider.id);
        const models = await storage.getModels(provider.id);
        
        // Get Discord user owner details
        let ownerInfo = null;
        if (provider.ownerId) {
          const discordOwner = await storage.getDiscordUser(provider.ownerId);
          if (discordOwner) {
            ownerInfo = {
              id: discordOwner.id,
              username: discordOwner.username,
              globalName: discordOwner.globalName,
              avatarUrl: discordOwner.avatar
                ? `https://cdn.discordapp.com/avatars/${discordOwner.id}/${discordOwner.avatar}.png`
                : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordOwner.discriminator) % 5}.png`,
            };
          }
        }
        
        return {
          ...provider,
          keysCount: keys.length,
          modelsCount: models.length,
          ownerInfo,
          ownerUsername: ownerInfo ? (ownerInfo.globalName || ownerInfo.username) : "Unassigned",
        };
      })
    );
    res.json(providersWithCounts);
  });

  app.post("/api/admin/providers/:id/assign-owner", await requireRole('admin'), async (req: Request, res: Response) => {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const provider = await storage.getProvider(req.params.id);
    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    const normalizedUserId = String(userId).trim();
    if (!normalizedUserId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Verify Discord user exists
    const discordUser = await storage.getDiscordUser(normalizedUserId);
    if (!discordUser) {
      return res.status(404).json({ error: "Discord user not found" });
    }

    const previousOwnerId = provider.ownerId;
    const updatedProvider = await storage.updateProvider(req.params.id, { ownerId: discordUser.id });
    if (!updatedProvider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    let deletedTokens = 0;
    if (previousOwnerId !== discordUser.id) {
      const tokens = await storage.getUserTokens();
      const tokensToDelete = tokens.filter((token) => {
        const allowed = token.allowedProviders;
        if (!allowed || allowed.length === 0) {
          return true;
        }
        return allowed.includes(updatedProvider.id);
      });

      for (const token of tokensToDelete) {
        const deleted = await storage.deleteUserToken(token.id);
        if (deleted) {
          deletedTokens++;
        }
      }
    }

    res.json({
      success: true,
      deletedTokens,
      provider: {
        ...updatedProvider,
        ownerInfo: {
          id: discordUser.id,
          username: discordUser.username,
          globalName: discordUser.globalName,
          avatarUrl: discordUser.avatar
            ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
            : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator) % 5}.png`,
        },
        ownerUsername: discordUser.globalName || discordUser.username,
      },
    });
  });

  app.post("/api/admin/providers", await requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const data = insertProviderSchema.parse(req.body);

      // Check for duplicate provider name
      const existingProviders = await storage.getProviders();
      if (existingProviders.some(p => p.name.toLowerCase() === data.name.toLowerCase())) {
        return res.status(400).json({ error: "A provider with this name already exists" });
      }

      const provider = await storage.createProvider(data);

      // Skip auto-sync at creation time because providers normally have no keys yet.
      res.json(provider);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/admin/providers/:id", await requireRole('admin'), async (req: Request, res: Response) => {
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

  app.delete("/api/admin/providers/:id", await requireRole('admin'), async (req: Request, res: Response) => {
    const success = await storage.deleteProvider(req.params.id);
    res.json({ success });
  });

  // API Keys
  app.get("/api/admin/providers/:id/keys", await requireRole('admin'), async (req: Request, res: Response) => {
    const keys = await storage.getApiKeys(req.params.id);
    res.json(keys);
  });

  app.post("/api/admin/providers/:id/keys", await requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const data = insertApiKeySchema.parse({
        ...req.body,
        providerId: req.params.id,
      });
      const key = await storage.createApiKey(data);

      // Auto-sync models now that we have at least one key
      let modelSync: { success: boolean; count?: number; error?: string } | undefined;
      try {
        const result = await syncProviderModels(req.params.id);
        modelSync = { success: true, count: result.count };
      } catch (syncError: any) {
        console.error("Auto model sync failed after adding key:", syncError);
        modelSync = { success: false, error: syncError.message };
      }

      res.json({ ...key, modelSync });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/admin/keys/:id", await requireRole('admin'), async (req: Request, res: Response) => {
    const success = await storage.deleteApiKey(req.params.id);
    res.json({ success });
  });

  app.patch("/api/admin/keys/:id", await requireRole('admin'), async (req: Request, res: Response) => {
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
  app.get("/api/admin/providers/:id/models", await requireRole('admin'), async (req: Request, res: Response) => {
    const models = await storage.getModels(req.params.id);
    res.json(models);
  });

  app.post("/api/admin/providers/:id/check-models", await requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const result = await syncProviderModels(req.params.id);
      res.json(result);
    } catch (error: any) {
      console.error('Check models error:', error);

      // Map some expected errors to friendlier status codes
      if (error.message === "Provider not found") {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === "No API keys configured") {
        return res.status(400).json({ error: error.message });
      }

      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/admin/models/:id", await requireRole('admin'), async (req: Request, res: Response) => {
    const model = await storage.updateModel(req.params.id, req.body);
    if (!model) {
      return res.status(404).json({ error: "Model not found" });
    }
    res.json(model);
  });

  app.delete("/api/admin/models/:id", await requireRole('admin'), async (req: Request, res: Response) => {
    const success = await storage.deleteModel(req.params.id);
    res.json({ success });
  });

  // Bulk model operations
  app.post("/api/admin/providers/:id/models/update-cost-all", await requireRole('admin'), async (req: Request, res: Response) => {
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

  // Bulk model updates - accepts array of model updates
  app.patch("/api/admin/providers/:id/models/bulk", await requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const { updates } = req.body;
      
      if (!updates || !Array.isArray(updates)) {
        return res.status(400).json({ error: "Updates array is required" });
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: "Updates array cannot be empty" });
      }

      // Validate that all updates have required fields
      for (const update of updates) {
        if (!update.id || typeof update.id !== 'string') {
          return res.status(400).json({ error: "Each update must have a valid 'id' field" });
        }

        let hasUpdateField = false;

        if (update.enabled !== undefined) {
          if (typeof update.enabled !== 'boolean') {
            return res.status(400).json({ error: "Each update must have a valid 'enabled' field" });
          }
          hasUpdateField = true;
        }

        if (update.requestCost !== undefined) {
          if (typeof update.requestCost !== 'number' || update.requestCost < 1) {
            return res.status(400).json({ error: "Each update must have a valid 'requestCost' field" });
          }
          hasUpdateField = true;
        }

        if (update.tokenLimit !== undefined) {
          if (update.tokenLimit !== null && (typeof update.tokenLimit !== 'number' || update.tokenLimit < 1)) {
            return res.status(400).json({ error: "Each update must have a valid 'tokenLimit' field" });
          }
          hasUpdateField = true;
        }

        if (!hasUpdateField) {
          return res.status(400).json({ error: "Each update must include at least one field to update" });
        }
      }

      // Use the efficient bulk update method (single transaction)
      const updatedModels = await storage.bulkUpdateModelsByIds(updates);

      // Get all models for this provider to return
      const allModels = await storage.getModels(req.params.id);
      
      res.json({
        success: true,
        updated: updatedModels.length,
        models: allModels
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // User Tokens
  app.get("/api/admin/tokens", await requireRole('admin'), async (req: Request, res: Response) => {
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

  app.post("/api/admin/tokens", await requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const data = insertUserTokenSchema.parse(req.body);
      const token = await storage.createUserToken(data);
      res.json(token);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/admin/tokens/:id", await requireRole('admin'), async (req: Request, res: Response) => {
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

  app.delete("/api/admin/tokens/:id", await requireRole('admin'), async (req: Request, res: Response) => {
    const success = await storage.deleteUserToken(req.params.id);
    res.json({ success });
  });

  app.post("/api/admin/tokens/:id/regenerate", await requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const token = await storage.regenerateUserToken(req.params.id);
      if (!token) {
        return res.status(404).json({ error: "Token not found" });
      }
      res.json(token);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/debug/ip", (req: Request, res: Response) => {
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
  app.get("/v1/models", userTokenAuth, async (req, res) => {
    const userToken = (req as any).userToken;

    // Get all enabled providers
    const providers = await storage.getProviders();
    let enabledProviders = providers.filter((p) => p.enabled);

    // Filter providers based on user's allowed providers if specified
    const allowedProviderIds = await resolveTokenAllowedProviders(userToken);
    if (allowedProviderIds.length > 0) {
      enabledProviders = enabledProviders.filter((p) =>
        allowedProviderIds.includes(p.id)
      );
    }

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
  app.post("/v1/chat/completions", chatCompletionsRateLimit, flexibleAuth, async (req: Request, res: Response) => {
    // Check IP Authorization
    const clientIp = getClientIP(req);
    const isStreaming = req.body.stream === true;
    
    try {
      const isAuthorized = await storage.isIpAuthorized(clientIp);
      if (!isAuthorized) {
        console.error(`IP authorization failed for ${clientIp} on route: ${req.originalUrl}`);
        
        const deniedMessage = `# Your request was denied!
Your IP address is not whitelisted on our platform.

![Hanging](https://static.wikia.nocookie.net/doki-doki-literature-club/images/2/2d/Sayori_Hanging_%28s_kill%29.png/revision/latest?cb=20171117231739)

If you're an authorized user, update your IP on the platform.

The IP received for this request was: \`${clientIp}\`

-------------

Make sure to delete or reroll this message.`;

        const completionId = `chatcmpl-${randomUUID().split('-')[0]}`;
        const timestamp = Math.floor(Date.now() / 1000);
        const model = req.body.model || "unknown";

        // Handle streaming response
        if (isStreaming) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          
          // Send initial chunk with role
          const initialChunk = {
            id: completionId,
            object: "chat.completion.chunk",
            created: timestamp,
            model: model,
            choices: [{
              index: 0,
              delta: { role: "assistant", content: "" },
              finish_reason: null
            }]
          };
          res.write(`data: ${JSON.stringify(initialChunk)}\n\n`);
          
          // Send content chunk
          const contentChunk = {
            id: completionId,
            object: "chat.completion.chunk",
            created: timestamp,
            model: model,
            choices: [{
              index: 0,
              delta: { content: deniedMessage },
              finish_reason: null
            }]
          };
          res.write(`data: ${JSON.stringify(contentChunk)}\n\n`);
          
          // Send final chunk
          const finalChunk = {
            id: completionId,
            object: "chat.completion.chunk",
            created: timestamp,
            model: model,
            choices: [{
              index: 0,
              delta: {},
              finish_reason: "stop"
            }]
          };
          res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
          
          // Send [DONE] marker
          res.write('data: [DONE]\n\n');
          return res.end();
        }
        
        // Handle non-streaming response
        return res.status(200).json({
          id: completionId,
          object: "chat.completion",
          created: timestamp,
          model: model,
          choices: [{
            index: 0,
            message: {
              role: "assistant",
              content: deniedMessage,
              refusal: null
            },
            finish_reason: "stop",
            logprobs: null
          }],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
          }
        });
      }
    } catch (error) {
      console.error("Error checking IP authorization:", error);
      
      const errorMessage = `# Your request was denied!
Your IP address is not whitelisted on our platform.

If you're an authorized user, update your IP on the platform.

The IP received for this request was: ${clientIp}

-# Make sure to delete or reroll this message.`;

      const completionId = `chatcmpl-${randomUUID().split('-')[0]}`;
      const timestamp = Math.floor(Date.now() / 1000);
      const model = req.body.model || "unknown";

      // Handle streaming response for errors
      if (isStreaming) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        const initialChunk = {
          id: completionId,
          object: "chat.completion.chunk",
          created: timestamp,
          model: model,
          choices: [{
            index: 0,
            delta: { role: "assistant", content: "" },
            finish_reason: null
          }]
        };
        res.write(`data: ${JSON.stringify(initialChunk)}\n\n`);
        
        const contentChunk = {
          id: completionId,
          object: "chat.completion.chunk",
          created: timestamp,
          model: model,
          choices: [{
            index: 0,
            delta: { content: errorMessage },
            finish_reason: null
          }]
        };
        res.write(`data: ${JSON.stringify(contentChunk)}\n\n`);
        
        const finalChunk = {
          id: completionId,
          object: "chat.completion.chunk",
          created: timestamp,
          model: model,
          choices: [{
            index: 0,
            delta: {},
            finish_reason: "stop"
          }]
        };
        res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
        
        res.write('data: [DONE]\n\n');
        return res.end();
      }

      // Handle non-streaming response for errors
      return res.status(403).json({
        id: completionId,
        object: "chat.completion",
        created: timestamp,
        model: model,
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: errorMessage,
            refusal: null
          },
          finish_reason: "stop",
          logprobs: null
        }],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      });
    }

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
      const inputTokens = countInputTokens(requestBody.messages || []);

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
      const providerMatch = model.match(/^(.+)\s+\((.+?)\)$/);
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
      const allowedProviderIds = await resolveTokenAllowedProviders(userToken);
      if (allowedProviderIds.length > 0) {
        if (!allowedProviderIds.includes(provider.id)) {
          return safeSendError(403, `You don't have access to ${targetModel.modelId} from ${provider.name}`);
        }
      }

      if (targetModel.tokenLimit !== null && targetModel.tokenLimit !== undefined) {
        const limit = Number(targetModel.tokenLimit);
        if (Number.isFinite(limit) && inputTokens > limit) {
          return safeSendError(400, `Context size too large! Valid: [${limit}], sent: [${inputTokens}]`);
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

      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ model: targetModel.modelId, ...requestBody }),
      });

      // Check if provider returned an error response
      if (!response.ok) {
        console.error(`[${requestId}] Provider error: ${response.status} ${response.statusText}`);
        // Log the actual error for debugging but don't expose it to the user
        try {
          const errorBody = await response.text();
          console.error(`[${requestId}] Provider error body (not exposed to user): ${errorBody}`);
        } catch (e) {
          // Ignore if we can't read the error body
        }
        await storage.decrementActiveRequests();
        // Return generic error message to avoid leaking provider sensitive info like base URL or even token
        return safeSendError(response.status, "Provider failed to generate response");
      }

      // Check if streaming is requested
      const isStreaming = requestBody.stream === true;
      console.log(`[DEBUG] Streaming requested: ${isStreaming}`);

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
            // Use the values extracted from the stream
            outputTokens = streamOutputTokens;
            actualInputTokens = streamInputTokens || inputTokens;

            // If we have total tokens but missing output tokens, calculate it
            if (outputTokens === 0 && totalTokens > 0) {
              outputTokens = totalTokens > actualInputTokens ? totalTokens - actualInputTokens : 0;
            }

            // Recalculate total if needed
            if (totalTokens === 0 && outputTokens > 0) {
              totalTokens = actualInputTokens + outputTokens;
            }
          } else {
            // Fallback: estimate from streamed content if provider didn't return usage
            console.log(`[${requestId}] Provider didn't return token usage in stream, estimating from content`);

            if (streamedContent) {
              outputTokens = estimateTokens(streamedContent);
              totalTokens = actualInputTokens + outputTokens;

              console.log(`[${requestId}] Estimated tokens - Input: ${actualInputTokens}, Output: ${outputTokens}, Total: ${totalTokens}`);
            } else {
              // If we couldn't collect content, at least record input tokens
              totalTokens = actualInputTokens;
              console.log(`[${requestId}] Could not estimate output tokens, recording input tokens only: ${actualInputTokens}`);
            }
          }

          // Track usage for streaming with pre-calculated cost
          // For sub-keys, create usage records for entire ancestor chain
          if (userToken.parentTokenId) {
            console.log(`[DEBUG] Creating usage record for chain - userToken.parentTokenId exists`);
            try {
              await storage.createUsageRecordForChain(userToken.id, {
                modelId: targetModel.id,
                providerId: provider.id,
                tokens: totalTokens,
                inputTokens: actualInputTokens,
                outputTokens: outputTokens,
                cost: requestCost,
              });
              console.log(`[DEBUG] Usage record chain created successfully`);
            } catch (usageError: any) {
              console.error(`[ERROR] Failed to create usage record chain:`, usageError.message);
              // Don't fail the entire request if usage tracking fails
            }
          } else {
            // For master keys, create a single usage record
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
              // Don't fail the entire request if usage tracking fails
            }
          }

          // Log completed request
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

        // Check if provider returns usage info
        if (data.usage) {
          // Try to get output tokens directly from completion_tokens or output_tokens
          outputTokens = data.usage.completion_tokens || data.usage.output_tokens || 0;

          // Get input tokens if available (more accurate than our estimate)
          actualInputTokens = data.usage.prompt_tokens || data.usage.input_tokens || inputTokens;

          // Get or calculate total tokens
          tokens = data.usage.total_tokens || (actualInputTokens + outputTokens);

          // If we still don't have output tokens but have total, calculate it
          if (outputTokens === 0 && tokens > 0) {
            outputTokens = tokens > actualInputTokens ? tokens - actualInputTokens : 0;
          }
        }

        // If no usage data at all, fallback to estimation
        if (tokens === 0 && outputTokens === 0) {
          // Fallback: estimate tokens from response content if provider doesn't return usage
          console.log(`[${requestId}] Provider didn't return token usage, estimating from response content`);

          // Estimate output tokens from the response content
          if (data.choices && data.choices[0]?.message?.content) {
            outputTokens = estimateTokens(data.choices[0].message.content);
          }

          // Calculate total tokens
          tokens = actualInputTokens + outputTokens;

          console.log(`[${requestId}] Estimated tokens - Input: ${actualInputTokens}, Output: ${outputTokens}, Total: ${tokens}`);
        }

        // For sub-keys, create usage records for entire ancestor chain
        if (userToken.keyType === "sub") {
          console.log(`[DEBUG] Creating usage record for chain - userToken.keyType === "sub"`);
          try {
            await storage.createUsageRecordForChain(userToken.id, {
              modelId: targetModel.id,
              providerId: provider.id,
              tokens,
              inputTokens: actualInputTokens,
              outputTokens: outputTokens,
              cost: requestCost,
            });
            console.log(`[DEBUG] Usage record chain created successfully for non-streaming`);
          } catch (usageError: any) {
            console.error(`[ERROR] Failed to create usage record chain (non-streaming):`, usageError.message);
            // Don't fail the entire request if usage tracking fails
          }
        } else {
          // For master keys, create a single usage record
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
            // Don't fail the entire request if usage tracking fails
          }
        }

        // Log completed request
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
      // Return generic error message to avoid leaking sensitive information
      safeSendError(500, "Provider failed to generate response");
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
