import { z } from "zod";

// Provider schema
export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  createdAt: number;
  customHeaders?: Record<string, string>;
  disableCacheDiscount?: boolean;
  ownerId?: string;
}

export const insertProviderSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
  enabled: z.boolean().default(true),
  customHeaders: z.record(z.string()).optional(),
  disableCacheDiscount: z.boolean().default(false).optional(),
  ownerId: z.string().optional(),
});

export type InsertProvider = z.infer<typeof insertProviderSchema>;

// API Key schema
export interface ApiKey {
  id: string;
  providerId: string;
  key: string;
  lastUsed: number;
  requestCount: number;
}

export const insertApiKeySchema = z.object({
  providerId: z.string(),
  key: z.string().min(1),
});

export type InsertApiKey = z.infer<typeof insertApiKeySchema>;

// Model schema
export interface Model {
  id: string;
  providerId: string;
  modelId: string;
  enabled: boolean;
  requestCost: number;
  tokenLimit?: number | null;
}

export const insertModelSchema = z.object({
  providerId: z.string(),
  modelId: z.string().min(1),
  enabled: z.boolean().default(true),
  requestCost: z.number().int().positive().default(1),
  tokenLimit: z.number().int().positive().nullable().optional(),
});

export type InsertModel = z.infer<typeof insertModelSchema>;

// User Token schema
export interface UserToken {
  id: string;
  name: string;
  token: string;
  maxRPD: number;
  maxRPM: number;
  createdAt: number;
  allowedProviders?: string[];
  parentTokenId?: string; // ID of parent token (undefined for master keys)
  keyType: "master" | "sub"; // Type of key
  expiresAt?: number; // Expiration timestamp (undefined = never expires)
  disabled?: boolean; // If true, the key is disabled (default: false)
  sigmaBoy?: boolean; // If true, allows creating sub-keys (default: false for "regular" tier)
  maxSubKeys?: number; // Maximum number of sub-keys that can be created (default: 20 for Sigma Boy)
  createdByProviderId?: string;
}

export const insertUserTokenSchema = z.object({
  name: z.string().min(1),
  maxRPD: z.number().int().positive(),
  maxRPM: z.number().int().positive(),
  allowedProviders: z.array(z.string()).optional(),
  parentTokenId: z.string().optional(),
  keyType: z.enum(["master", "sub"]).default("master"),
  expiresAt: z.number().optional(),
  disabled: z.boolean().optional(),
  sigmaBoy: z.boolean().optional(),
  maxSubKeys: z.number().int().min(2).optional(),
  createdByProviderId: z.string().optional(),
});

export type InsertUserToken = z.infer<typeof insertUserTokenSchema>;

// Usage Record schema
export interface UsageRecord {
  id: string;
  userTokenId: string;
  modelId: string;
  providerId: string;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  timestamp: number;
  cost: number;
}

export const insertUsageRecordSchema = z.object({
  userTokenId: z.string(),
  modelId: z.string(),
  providerId: z.string(),
  tokens: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cost: z.number().positive().optional(),
});

export type InsertUsageRecord = z.infer<typeof insertUsageRecordSchema>;

// Stats schema
export interface Stats {
  totalTokens: number;
  totalRequests: number;
  activeRequests: number;
  successRate: number;
  uptime: number;
}

// Admin credentials
export interface AdminCredentials {
  username: string;
  password: string;
}

export interface Admin {
  id: string;
  username: string;
  password: string;
  createdAt: number;
}

// Discord User schema
export interface DiscordUser {
  id: string;              // Discord user ID (primary key)
  username: string;        // Discord username
  discriminator: string;   // Discord discriminator (legacy, may be "0")
  globalName?: string;     // Display name (new Discord naming)
  avatar?: string;         // Avatar hash
  createdAt: number;       // When user first logged in (timestamp)
  lastLoginAt: number;     // Last login timestamp
  ip?: string;             // Authorized IP address
  lastIpUpdate?: number;   // Timestamp of last IP update
  banned?: boolean;        // Whether the user is banned
  banReason?: string;      // Reason for ban
  roles?: string[];        // User roles: ["user", "provider", "admin"]
}

export const insertDiscordUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  discriminator: z.string(),
  globalName: z.string().optional(),
  avatar: z.string().optional(),
  ip: z.string().optional(),
  lastIpUpdate: z.number().optional(),
  banned: z.boolean().optional(),
  banReason: z.string().optional(),
  roles: z.array(z.enum(["user", "provider", "admin"])).optional(),
});

export type InsertDiscordUser = z.infer<typeof insertDiscordUserSchema>;

// Request Log schema
export interface RequestLog {
  id: string;
  ip: string;
  discordUserId?: string;
  inputTokens: number;
  outputTokens: number;
  modelId: string;
  providerId: string;
  timestamp: number;
  referer?: string;
  statusCode: number;
  latency: number;
}

export const insertRequestLogSchema = z.object({
  ip: z.string(),
  discordUserId: z.string().optional(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  modelId: z.string(),
  providerId: z.string(),
  referer: z.string().optional(),
  statusCode: z.number().int(),
  latency: z.number().nonnegative(),
});

export type InsertRequestLog = z.infer<typeof insertRequestLogSchema>;
