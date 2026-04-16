import {
  Provider,
  InsertProvider,
  ApiKey,
  InsertApiKey,
  Model,
  InsertModel,
  UsageRecord,
  InsertUsageRecord,
  Stats,
  AdminCredentials,
  Admin,
  DiscordUser,
  InsertDiscordUser,
  RequestLog,
  InsertRequestLog,
  UserApiKey,
  InsertUserApiKey,
} from "@shared/schema";

export interface IStorage {
  // Provider methods
  getProviders(): Promise<Provider[]>;
  getProvider(id: string): Promise<Provider | undefined>;
  createProvider(provider: InsertProvider): Promise<Provider>;
  updateProvider(id: string, provider: Partial<InsertProvider>): Promise<Provider | undefined>;
  deleteProvider(id: string): Promise<boolean>;

  // API Key methods
  getApiKeys(providerId: string): Promise<ApiKey[]>;
  createApiKey(apiKey: InsertApiKey): Promise<ApiKey>;
  deleteApiKey(id: string): Promise<boolean>;
  updateApiKey(id: string, key: string): Promise<ApiKey | undefined>;
  getNextApiKey(providerId: string): Promise<ApiKey | undefined>;
  updateApiKeyUsage(id: string): Promise<void>;

  // Model methods
  getModels(providerId?: string): Promise<Model[]>;
  createModel(model: InsertModel): Promise<Model>;
  updateModel(id: string, model: Partial<InsertModel>): Promise<Model | undefined>;
  updateModelsByProvider(providerId: string, updates: Partial<InsertModel>): Promise<Model[]>;
  deleteModel(id: string): Promise<boolean>;
  deleteModelsByProvider(providerId: string): Promise<void>;
  replaceProviderModels(providerId: string, modelIds: string[]): Promise<Model[]>;
  enableAllModelsByProvider(providerId: string): Promise<Model[]>;
  disableAllModelsByProvider(providerId: string): Promise<Model[]>;
  updateCostAllModelsByProvider(providerId: string, requestCost: number): Promise<Model[]>;

  // Usage methods
  createUsageRecord(record: InsertUsageRecord): Promise<UsageRecord>;
  getUsageRecords(discordUserId: string): Promise<UsageRecord[]>;
  getTodayUsageCount(discordUserId: string): Promise<number>;
  getMinuteUsageCount(discordUserId: string): Promise<number>;
  getProviderTodayUsageCount(providerId: string): Promise<number>;
  getProviderMinuteUsageCount(providerId: string): Promise<number>;

  // Stats methods
  getStats(): Promise<Stats>;
  incrementActiveRequests(): Promise<void>;
  decrementActiveRequests(): Promise<void>;

  // Admin methods
  getAdmin(username: string): Promise<Admin | undefined>;
  createAdmin(username: string, password: string): Promise<Admin>;

  // Discord User methods
  getDiscordUser(id: string): Promise<DiscordUser | undefined>;
  getDiscordUsers(): Promise<DiscordUser[]>;
  createDiscordUser(user: InsertDiscordUser): Promise<DiscordUser>;
  updateDiscordUser(id: string, user: Partial<InsertDiscordUser>): Promise<DiscordUser | undefined>;
  banDiscordUser(id: string, reason?: string): Promise<DiscordUser | undefined>;
  unbanDiscordUser(id: string): Promise<DiscordUser | undefined>;
  isIpAuthorized(ip: string): Promise<boolean>;

  // Request Log methods
  createRequestLog(log: InsertRequestLog): Promise<RequestLog>;
  getRequestLogs(options?: {
    page?: number;
    limit?: number;
    search?: string;
    modelId?: string;
    providerId?: string;
  }): Promise<{ logs: RequestLog[]; total: number }>;

  // User API Key methods
  getUserApiKey(userId: string): Promise<UserApiKey | undefined>;
  getUserApiKeyByKey(apiKey: string): Promise<UserApiKey | undefined>;
  getUserApiKeysByUserId(userId: string): Promise<UserApiKey[]>;
  createUserApiKey(userId: string): Promise<UserApiKey>;
  rotateUserApiKey(id: string): Promise<UserApiKey | undefined>;
  updateUserApiKeyRateLimits(id: string, maxRPD: number, maxRPM: number): Promise<UserApiKey | undefined>;

  // User deletion / IP anonymization
  scrubUserData(userId: string): Promise<void>;
  deleteDiscordUser(userId: string): Promise<void>;
}

import { SQLiteStorage } from './sqlite-storage';
export { SQLiteStorage } from './sqlite-storage';
export const storage = new SQLiteStorage();
