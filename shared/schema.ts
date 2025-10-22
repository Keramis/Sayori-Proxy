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
}

export const insertProviderSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
  enabled: z.boolean().default(true),
  customHeaders: z.record(z.string()).optional(),
  disableCacheDiscount: z.boolean().default(false).optional(),
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
}

export const insertModelSchema = z.object({
  providerId: z.string(),
  modelId: z.string().min(1),
  enabled: z.boolean().default(true),
  requestCost: z.number().int().positive().default(1),
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
