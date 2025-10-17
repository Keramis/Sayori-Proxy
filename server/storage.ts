import {
  Provider,
  InsertProvider,
  ApiKey,
  InsertApiKey,
  Model,
  InsertModel,
  UserToken,
  InsertUserToken,
  UsageRecord,
  InsertUsageRecord,
  Stats,
  AdminCredentials,
} from "@shared/schema";
import { randomUUID, createCipheriv, createDecipheriv, scryptSync } from "crypto";
import * as fs from "fs";
import * as path from "path";

const DB_FILE = path.join(process.cwd(), "database.json");

interface Database {
  providers: Provider[];
  apiKeys: ApiKey[];
  models: Model[];
  userTokens: UserToken[];
  usageRecords: UsageRecord[];
  authMode: "user_tokens" | "general_password" | "no_auth";
  generalPassword?: string;
}

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
  deleteModel(id: string): Promise<boolean>;
  deleteModelsByProvider(providerId: string): Promise<void>;

  // User Token methods
  getUserTokens(): Promise<UserToken[]>;
  getUserToken(token: string): Promise<UserToken | undefined>;
  getUserTokenById(id: string): Promise<UserToken | undefined>;
  createUserToken(userToken: InsertUserToken): Promise<UserToken>;
  updateUserToken(id: string, userToken: Partial<InsertUserToken>): Promise<UserToken | undefined>;
  deleteUserToken(id: string): Promise<boolean>;

  // Usage methods
  createUsageRecord(record: InsertUsageRecord): Promise<UsageRecord>;
  getUsageRecords(userTokenId: string): Promise<UsageRecord[]>;
  getTodayUsageCount(userTokenId: string): Promise<number>;
  getMinuteUsageCount(userTokenId: string): Promise<number>;

  // Stats methods
  getStats(): Promise<Stats>;
  incrementActiveRequests(): Promise<void>;
  decrementActiveRequests(): Promise<void>;

  // Admin methods
  getAdminCredentials(): Promise<AdminCredentials>;
  updateAdminCredentials(credentials: AdminCredentials): Promise<void>;
  
  // Auth methods
  getAuthMode(): Promise<"user_tokens" | "general_password" | "no_auth">;
  getGeneralPassword(): Promise<string | undefined>;
}

export class JSONStorage implements IStorage {
  private db: Database;
  private activeRequests: number = 0;
  private startTime: number = Date.now();
  private encryptionKey: Buffer | null = null;

  constructor() {
    // Initialize encryption key from environment
    if (process.env.DB_ENCRYPTION_KEY) {
      this.encryptionKey = scryptSync(process.env.DB_ENCRYPTION_KEY, 'salt', 32);
    }
    this.db = this.loadDatabase();
  }

  private encrypt(text: string): string {
    if (!this.encryptionKey) return text;
    
    const iv = Buffer.from('0123456789abcdef'); // Fixed IV for simplicity
    const cipher = createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  private decrypt(encrypted: string): string {
    if (!this.encryptionKey) return encrypted;
    
    try {
      const iv = Buffer.from('0123456789abcdef');
      const decipher = createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.error("Decryption failed, data might not be encrypted:", error);
      return encrypted;
    }
  }

  private loadDatabase(): Database {
    try {
      if (fs.existsSync(DB_FILE)) {
        const data = fs.readFileSync(DB_FILE, "utf8");
        // Check if file is not empty before parsing
        if (data.trim()) {
          const decryptedData = this.decrypt(data);
          const db = JSON.parse(decryptedData);
          // Ensure authMode exists for backward compatibility
          if (!db.authMode) {
            db.authMode = (process.env.AUTH_MODE as "user_tokens" | "general_password" | "no_auth") || "user_tokens";
          }
          if (!db.generalPassword && process.env.GENERAL_PASSWORD) {
            db.generalPassword = process.env.GENERAL_PASSWORD;
          }
          // Migrate existing usage records to include inputTokens and outputTokens
          if (db.usageRecords && Array.isArray(db.usageRecords)) {
            db.usageRecords = db.usageRecords.map((record: any) => {
              if (record.inputTokens === undefined || record.outputTokens === undefined) {
                return {
                  ...record,
                  inputTokens: record.inputTokens || 0,
                  outputTokens: record.outputTokens || 0,
                };
              }
              return record;
            });
          }
          return db;
        }
      }
    } catch (error) {
      console.error("Error loading database:", error);
    }

    // Default database - admin credentials are read from .env, not stored here
    const defaultDb: Database = {
      providers: [],
      apiKeys: [],
      models: [],
      userTokens: [],
      usageRecords: [],
      authMode: (process.env.AUTH_MODE as "user_tokens" | "general_password" | "no_auth") || "user_tokens",
      generalPassword: process.env.GENERAL_PASSWORD,
    };

    // Save the default database to file
    this.db = defaultDb;
    this.saveDatabase();

    return defaultDb;
  }

  private saveDatabase(): void {
    try {
      const jsonData = JSON.stringify(this.db, null, 2);
      const encryptedData = this.encrypt(jsonData);
      fs.writeFileSync(DB_FILE, encryptedData);
    } catch (error) {
      console.error("Error saving database:", error);
    }
  }

  // Provider methods
  async getProviders(): Promise<Provider[]> {
    return this.db.providers;
  }

  async getProvider(id: string): Promise<Provider | undefined> {
    return this.db.providers.find((p) => p.id === id);
  }

  async createProvider(provider: InsertProvider): Promise<Provider> {
    const newProvider: Provider = {
      id: randomUUID(),
      ...provider,
      createdAt: Date.now(),
    };
    this.db.providers.push(newProvider);
    this.saveDatabase();
    return newProvider;
  }

  async updateProvider(id: string, provider: Partial<InsertProvider>): Promise<Provider | undefined> {
    const index = this.db.providers.findIndex((p) => p.id === id);
    if (index === -1) return undefined;

    this.db.providers[index] = { ...this.db.providers[index], ...provider };
    this.saveDatabase();
    return this.db.providers[index];
  }

  async deleteProvider(id: string): Promise<boolean> {
    const initialLength = this.db.providers.length;
    this.db.providers = this.db.providers.filter((p) => p.id !== id);
    this.db.apiKeys = this.db.apiKeys.filter((k) => k.providerId !== id);
    this.db.models = this.db.models.filter((m) => m.providerId !== id);
    this.saveDatabase();
    return this.db.providers.length < initialLength;
  }

  // API Key methods
  async getApiKeys(providerId: string): Promise<ApiKey[]> {
    return this.db.apiKeys.filter((k) => k.providerId === providerId);
  }

  async createApiKey(apiKey: InsertApiKey): Promise<ApiKey> {
    const newKey: ApiKey = {
      id: randomUUID(),
      ...apiKey,
      lastUsed: 0,
      requestCount: 0,
    };
    this.db.apiKeys.push(newKey);
    this.saveDatabase();
    return newKey;
  }

  async deleteApiKey(id: string): Promise<boolean> {
    const initialLength = this.db.apiKeys.length;
    this.db.apiKeys = this.db.apiKeys.filter((k) => k.id !== id);
    this.saveDatabase();
    return this.db.apiKeys.length < initialLength;
  }

  async updateApiKey(id: string, key: string): Promise<ApiKey | undefined> {
    const apiKey = this.db.apiKeys.find((k) => k.id === id);
    if (!apiKey) return undefined;
    apiKey.key = key;
    this.saveDatabase();
    return apiKey;
  }

  async getNextApiKey(providerId: string): Promise<ApiKey | undefined> {
    const keys = this.db.apiKeys.filter((k) => k.providerId === providerId);
    if (keys.length === 0) return undefined;

    // Round-robin: find the key with the lowest request count
    return keys.reduce((prev, curr) => (prev.requestCount <= curr.requestCount ? prev : curr));
  }

  async updateApiKeyUsage(id: string): Promise<void> {
    const key = this.db.apiKeys.find((k) => k.id === id);
    if (key) {
      key.lastUsed = Date.now();
      key.requestCount++;
      this.saveDatabase();
    }
  }

  // Model methods
  async getModels(providerId?: string): Promise<Model[]> {
    if (providerId) {
      return this.db.models.filter((m) => m.providerId === providerId);
    }
    return this.db.models;
  }

  async createModel(model: InsertModel): Promise<Model> {
    const newModel: Model = {
      id: randomUUID(),
      ...model,
      requestCost: model.requestCost || 1,
    };
    this.db.models.push(newModel);
    this.saveDatabase();
    return newModel;
  }

  async updateModel(id: string, model: Partial<InsertModel>): Promise<Model | undefined> {
    const index = this.db.models.findIndex((m) => m.id === id);
    if (index === -1) return undefined;

    this.db.models[index] = { ...this.db.models[index], ...model };
    this.saveDatabase();
    return this.db.models[index];
  }

  async deleteModel(id: string): Promise<boolean> {
    const initialLength = this.db.models.length;
    this.db.models = this.db.models.filter((m) => m.id !== id);
    this.saveDatabase();
    return this.db.models.length < initialLength;
  }

  async deleteModelsByProvider(providerId: string): Promise<void> {
    this.db.models = this.db.models.filter((m) => m.providerId !== providerId);
    this.saveDatabase();
  }

  // User Token methods
  async getUserTokens(): Promise<UserToken[]> {
    return this.db.userTokens;
  }

  async getUserToken(token: string): Promise<UserToken | undefined> {
    return this.db.userTokens.find((t) => t.token === token);
  }

  async getUserTokenById(id: string): Promise<UserToken | undefined> {
    return this.db.userTokens.find((t) => t.id === id);
  }

  async createUserToken(userToken: InsertUserToken): Promise<UserToken> {
    const token = "sk_" + randomUUID().replace(/-/g, "");
    const newToken: UserToken = {
      id: randomUUID(),
      ...userToken,
      token,
      createdAt: Date.now(),
    };
    this.db.userTokens.push(newToken);
    this.saveDatabase();
    return newToken;
  }

  async updateUserToken(id: string, userToken: Partial<InsertUserToken>): Promise<UserToken | undefined> {
    const index = this.db.userTokens.findIndex((t) => t.id === id);
    if (index === -1) return undefined;

    this.db.userTokens[index] = { ...this.db.userTokens[index], ...userToken };
    this.saveDatabase();
    return this.db.userTokens[index];
  }

  async deleteUserToken(id: string): Promise<boolean> {
    const initialLength = this.db.userTokens.length;
    this.db.userTokens = this.db.userTokens.filter((t) => t.id !== id);
    this.saveDatabase();
    return this.db.userTokens.length < initialLength;
  }

  // Usage methods
  async createUsageRecord(record: InsertUsageRecord): Promise<UsageRecord> {
    const newRecord: UsageRecord = {
      id: randomUUID(),
      ...record,
      cost: record.cost || 1,
      timestamp: Date.now(),
    };
    this.db.usageRecords.push(newRecord);
    this.saveDatabase();
    return newRecord;
  }

  async getUsageRecords(userTokenId: string): Promise<UsageRecord[]> {
    return this.db.usageRecords.filter((r) => r.userTokenId === userTokenId);
  }

  async getTodayUsageCount(userTokenId: string): Promise<number> {
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const records = this.db.usageRecords.filter(
      (r) => r.userTokenId === userTokenId && r.timestamp >= today
    );
    const sum = records.reduce((sum, record) => sum + (record.cost || 1), 0);
    // Round to 2 decimal places to avoid floating point precision issues
    return Math.round(sum * 100) / 100;
  }

  async getMinuteUsageCount(userTokenId: string): Promise<number> {
    const oneMinuteAgo = Date.now() - 60000;
    const records = this.db.usageRecords.filter(
      (r) => r.userTokenId === userTokenId && r.timestamp >= oneMinuteAgo
    );
    const sum = records.reduce((sum, record) => sum + (record.cost || 1), 0);
    // Round to 2 decimal places to avoid floating point precision issues
    return Math.round(sum * 100) / 100;
  }

  // Stats methods
  async getStats(): Promise<Stats> {
    const totalTokens = this.db.usageRecords.reduce((sum, r) => sum + r.tokens, 0);
    const totalRequests = this.db.usageRecords.length;
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    
    return {
      totalTokens,
      totalRequests,
      activeRequests: this.activeRequests,
      successRate: 100, // Can be calculated based on error tracking
      uptime,
    };
  }

  async incrementActiveRequests(): Promise<void> {
    this.activeRequests++;
  }

  async decrementActiveRequests(): Promise<void> {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
  }

  // Admin methods - credentials are always read from .env
  async getAdminCredentials(): Promise<AdminCredentials> {
    return {
      username: process.env.ADMIN_USERNAME || "admin",
      password: process.env.ADMIN_PASSWORD || "admin",
    };
  }

  async updateAdminCredentials(credentials: AdminCredentials): Promise<void> {
    throw new Error("Admin credentials must be updated in the .env file, not in the database");
  }

  // Auth methods
  async getAuthMode(): Promise<"user_tokens" | "general_password" | "no_auth"> {
    return this.db.authMode || "user_tokens";
  }

  async getGeneralPassword(): Promise<string | undefined> {
    return this.db.generalPassword;
  }
}

export const storage = new JSONStorage();
