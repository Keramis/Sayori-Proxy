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
import { randomUUID, createCipheriv, createDecipheriv, scryptSync, randomBytes } from "crypto";
import * as fs from "fs";
import * as path from "path";
import "dotenv";

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
  updateModelsByProvider(providerId: string, updates: Partial<InsertModel>): Promise<Model[]>;
  deleteModel(id: string): Promise<boolean>;
  deleteModelsByProvider(providerId: string): Promise<void>;
  replaceProviderModels(providerId: string, modelIds: string[]): Promise<Model[]>;
  enableAllModelsByProvider(providerId: string): Promise<Model[]>;
  disableAllModelsByProvider(providerId: string): Promise<Model[]>;
  updateCostAllModelsByProvider(providerId: string, requestCost: number): Promise<Model[]>;

  // User Token methods
  getUserTokens(): Promise<UserToken[]>;
  getUserToken(token: string): Promise<UserToken | undefined>;
  getUserTokenById(id: string): Promise<UserToken | undefined>;
  createUserToken(userToken: InsertUserToken): Promise<UserToken>;
  updateUserToken(id: string, userToken: Partial<InsertUserToken>): Promise<UserToken | undefined>;
  deleteUserToken(id: string): Promise<boolean>;

  // Sub-key methods
  getSubKeys(parentTokenId: string): Promise<UserToken[]>;
  getAncestorChain(tokenId: string): Promise<UserToken[]>;
  getRootToken(tokenId: string): Promise<UserToken | undefined>;
  getTotalAllocatedQuota(parentTokenId: string): Promise<{ rpd: number; rpm: number }>;
  canCreateSubKey(parentTokenId: string, requestedRPD: number, requestedRPM: number): Promise<{ valid: boolean; reason?: string }>;
  validateAncestorChain(tokenId: string): Promise<{ valid: boolean; reason?: string }>;
  validateAncestorChainQuota(tokenId: string, requestCost: number): Promise<{ valid: boolean; reason?: string; insufficientToken?: string }>;
  createUsageRecordForChain(tokenId: string, record: Omit<InsertUsageRecord, "userTokenId">): Promise<void>;
  cascadeDeleteSubKeys(parentTokenId: string): Promise<number>;
  cascadeDisableSubKeys(parentTokenId: string): Promise<number>;
  cascadeEnableSubKeys(parentTokenId: string): Promise<number>;

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
  
  private pendingSave: boolean = false;
  private pendingSaveTimer: NodeJS.Timeout | null = null;

  /**
   * Governs the save interval for `scheduleSave()`.
  */
  private SAVE_INTERVAL: number = 60_000;

  constructor() {
    if (process.env.DB_ENCRYPTION_KEY) {
      const salt = process.env.SCRYPT_SALT || 'salt';
      this.encryptionKey = scryptSync(process.env.DB_ENCRYPTION_KEY, salt, 32);
    }
    this.db = this.loadDatabase();
  }

  private encrypt(text: string): string {
    if (!this.encryptionKey) return text;
    
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(encryptedText: string): string {
    if (!this.encryptionKey) return encryptedText;
    
    try {
      const parts = encryptedText.split(':');
      if (parts.length === 2 && parts[0].length === 32) {
        const iv = Buffer.from(parts[0], 'hex');
        const encryptedData = parts[1];
        const decipher = createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
        let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      } else {
        const iv = Buffer.from('0123456789abcdef');
        const decipher = createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      }
    } catch (error) {
      console.error("Decryption failed, data might be corrupted or key is wrong:", error);
      return encryptedText;
    }
  }

  private loadDatabase(): Database {
    try {
      if (fs.existsSync(DB_FILE)) {
        const data = fs.readFileSync(DB_FILE, "utf8");
        if (data.trim()) {
          const decryptedData = this.decrypt(data);
          const db = JSON.parse(decryptedData);
          if (!db.authMode) {
            db.authMode = (process.env.AUTH_MODE as "user_tokens" | "general_password" | "no_auth") || "user_tokens";
          }
          if (!db.generalPassword && process.env.GENERAL_PASSWORD) {
            db.generalPassword = process.env.GENERAL_PASSWORD;
          }
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
          if (db.userTokens && Array.isArray(db.userTokens)) {
            db.userTokens = db.userTokens.map((token: any) => {
              if (!token.keyType) {
                token.keyType = "master";
              }
              if (token.parentTokenId === undefined) {
                token.parentTokenId = undefined;
              }
              if (token.disabled === undefined) {
                token.disabled = false;
              }
              // Backward compatibility: all master keys become Sigma Boy tier
              if (token.keyType === "master" && token.sigmaBoy === undefined) {
                token.sigmaBoy = true;
                token.maxSubKeys = token.maxSubKeys || 20;
              }
              // For sub-keys, preserve existing sigmaBoy setting or default to false
              if (token.keyType === "sub" && token.sigmaBoy === undefined) {
                token.sigmaBoy = false;
              }
              // Ensure maxSubKeys is set for all Sigma Boy keys
              if (token.sigmaBoy && !token.maxSubKeys) {
                token.maxSubKeys = 20;
              }
              return token;
            });
          }
          return db;
        }
      }
    } catch (error) {
      console.error("Error loading database:", error);
    }

    const defaultDb: Database = {
      providers: [],
      apiKeys: [],
      models: [],
      userTokens: [],
      usageRecords: [],
      authMode: (process.env.AUTH_MODE as "user_tokens" | "general_password" | "no_auth") || "user_tokens",
      generalPassword: process.env.GENERAL_PASSWORD,
    };

    this.db = defaultDb;
    this.forceSave();

    return defaultDb;
  }

  /**
   * Saves the database by stringifying the in-memory JSON, then encrypting
   * it before writing to a file with `writeFileSync`, halting operations.
   */
  private saveDatabase(): void {
    console.log('[saveDatabase] called!');
    try {
      const jsonData = JSON.stringify(this.db, null, 2);
      const encryptedData = this.encrypt(jsonData);
      fs.writeFileSync(DB_FILE, encryptedData);
    } catch (error) {
      console.error("Error saving database:", error);
    }
    console.log('[saveDatabase] success!');
  }

  /**
   * Schedules a save to be completed in the database. Since the database
   * that's being used is always in-memory, this will not interfere with stats
   * and normal operations; rather, just the file backup.
   * 
   * Delays saving by up to `SAVE_INTERVAL`.
   */
  private scheduleSave(): void {
    if (this.pendingSave) return; //already scheduled, don't fuck it up!
    console.log("[scheduleSave] running...");

    this.pendingSave = true; //lock
    this.pendingSaveTimer = setTimeout( () => {
      this.saveDatabase();
      this.pendingSaveTimer = null;
      this.pendingSave = false;
      console.log("[scheduleSave] done!");
    }, this.SAVE_INTERVAL);
  }

  /**
   * Forces a save to be completed, clearing the `pendingSaveTimer` used in
   * `scheduleSave` to not overrun the database. Used in administrator
   * operations.
   */
  private forceSave(): void {
    console.log("[forceSave] running...");
    if (this.pendingSaveTimer) {
      clearTimeout(this.pendingSaveTimer); //not going to save twice
      this.pendingSaveTimer = null;
      this.pendingSave = false;
    }
    console.log("[forceSave] done!");
    this.saveDatabase();
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
    this.forceSave();
    return newProvider;
  }

  async updateProvider(id: string, provider: Partial<InsertProvider>): Promise<Provider | undefined> {
    const index = this.db.providers.findIndex((p) => p.id === id);
    if (index === -1) return undefined;

    this.db.providers[index] = { ...this.db.providers[index], ...provider };
    this.forceSave();
    return this.db.providers[index];
  }

  async deleteProvider(id: string): Promise<boolean> {
    const initialLength = this.db.providers.length;
    this.db.providers = this.db.providers.filter((p) => p.id !== id);
    this.db.apiKeys = this.db.apiKeys.filter((k) => k.providerId !== id);
    this.db.models = this.db.models.filter((m) => m.providerId !== id);
    this.forceSave();
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
    this.forceSave();
    return newKey;
  }

  async deleteApiKey(id: string): Promise<boolean> {
    const initialLength = this.db.apiKeys.length;
    this.db.apiKeys = this.db.apiKeys.filter((k) => k.id !== id);
    this.forceSave();
    return this.db.apiKeys.length < initialLength;
  }

  async updateApiKey(id: string, key: string): Promise<ApiKey | undefined> {
    const apiKey = this.db.apiKeys.find((k) => k.id === id);
    if (!apiKey) return undefined;
    apiKey.key = key;
    this.forceSave();
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
      this.scheduleSave();
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
    this.forceSave();
    return newModel;
  }

  async updateModel(id: string, model: Partial<InsertModel>): Promise<Model | undefined> {
    const index = this.db.models.findIndex((m) => m.id === id);
    if (index === -1) return undefined;

    this.db.models[index] = { ...this.db.models[index], ...model };
    this.forceSave();
    return this.db.models[index];
  }

  async deleteModel(id: string): Promise<boolean> {
    const initialLength = this.db.models.length;
    this.db.models = this.db.models.filter((m) => m.id !== id);
    this.forceSave();
    return this.db.models.length < initialLength;
  }

  async deleteModelsByProvider(providerId: string): Promise<void> {
    this.db.models = this.db.models.filter((m) => m.providerId !== providerId);
    this.forceSave();
  }

  async replaceProviderModels(providerId: string, modelIds: string[]): Promise<Model[]> {
    // Delete existing models for this provider
    this.db.models = this.db.models.filter((m) => m.providerId !== providerId);

    // Create new models
    const newModels: Model[] = modelIds.map((modelId) => ({
      id: randomUUID(),
      providerId: providerId,
      modelId: modelId,
      enabled: true,
      requestCost: 1,
    }));

    this.db.models.push(...newModels);
    this.forceSave();
    return newModels;
  }

  async updateModelsByProvider(providerId: string, updates: Partial<InsertModel>): Promise<Model[]> {
    const updatedModels: Model[] = [];
    for (const model of this.db.models) {
      if (model.providerId === providerId) {
        const index = this.db.models.findIndex((m) => m.id === model.id);
        if (index !== -1) {
          this.db.models[index] = { ...this.db.models[index], ...updates };
          updatedModels.push(this.db.models[index]);
        }
      }
    }
    this.scheduleSave();
    return updatedModels;
  }

  // Enable all models for a provider
  async enableAllModelsByProvider(providerId: string): Promise<Model[]> {
    return this.updateModelsByProvider(providerId, { enabled: true });
  }

  // Disable all models for a provider  
  async disableAllModelsByProvider(providerId: string): Promise<Model[]> {
    return this.updateModelsByProvider(providerId, { enabled: false });
  }

  // Update cost for all models for a provider
  async updateCostAllModelsByProvider(providerId: string, requestCost: number): Promise<Model[]> {
    return this.updateModelsByProvider(providerId, { requestCost });
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
      keyType: userToken.keyType || "master",
      disabled: userToken.disabled || false,
      sigmaBoy: userToken.sigmaBoy || false,
      maxSubKeys: userToken.maxSubKeys || 20,
      token,
      createdAt: Date.now(),
    };
    this.db.userTokens.push(newToken);
    this.scheduleSave();
    return newToken;
  }

  async updateUserToken(id: string, userToken: Partial<InsertUserToken>): Promise<UserToken | undefined> {
    const index = this.db.userTokens.findIndex((t) => t.id === id);
    if (index === -1) return undefined;

    this.db.userTokens[index] = { ...this.db.userTokens[index], ...userToken };
    this.scheduleSave();
    return this.db.userTokens[index];
  }

  async deleteUserToken(id: string): Promise<boolean> {
    const initialLength = this.db.userTokens.length;
    this.db.userTokens = this.db.userTokens.filter((t) => t.id !== id);
    this.scheduleSave();
    return this.db.userTokens.length < initialLength;
  }

  // Sub-key specific methods

  // Get all sub-keys of a parent token
  async getSubKeys(parentTokenId: string): Promise<UserToken[]> {
    return this.db.userTokens.filter((t) => t.parentTokenId === parentTokenId);
  }

  // Get ancestor chain from child to root (returns array: [child, parent, grandparent, ...])
  async getAncestorChain(tokenId: string): Promise<UserToken[]> {
    const chain: UserToken[] = [];
    let currentId: string | undefined = tokenId;

    while (currentId) {
      const token = await this.getUserTokenById(currentId);
      if (!token) break;

      chain.push(token);
      currentId = token.parentTokenId;

      // Prevent infinite loops
      if (chain.length > 100) {
        throw new Error("Circular reference detected in token hierarchy");
      }
    }

    return chain;
  }

  // Get the root/master token for any token in the hierarchy
  async getRootToken(tokenId: string): Promise<UserToken | undefined> {
    const chain = await this.getAncestorChain(tokenId);
    return chain[chain.length - 1];
  }

  // Calculate total allocated quota for all sub-keys of a parent
  async getTotalAllocatedQuota(parentTokenId: string): Promise<{ rpd: number; rpm: number }> {
    const subKeys = await this.getSubKeys(parentTokenId);

    const totalRPD = subKeys.reduce((sum, key) => sum + (key.maxRPD || 0), 0);
    const totalRPM = subKeys.reduce((sum, key) => sum + (key.maxRPM || 0), 0);

    return {
      rpd: Number((totalRPD).toFixed(2)),
      rpm: Number((totalRPM).toFixed(2)),
    };
  }

  isStrictNumber(value: any): boolean {
    return typeof value === 'number' && !Number.isNaN(value);
  }

  // Validate if a parent can create a sub-key with given quotas
  async canCreateSubKey(parentTokenId: string, requestedRPD: number, requestedRPM: number): Promise<{ valid: boolean; reason?: string }> {
    const parent = await this.getUserTokenById(parentTokenId);
    if (!parent) {
      return { valid: false, reason: "Parent token not found" };
    }

    // Check if parent has Sigma Boy tier (required to create sub-keys)
    if (!parent.sigmaBoy) {
      return {
        valid: false,
        reason: "Only Sigma Boy tier tokens can create sub-keys"
      };
    }

    // Check sub-key count limit
    const existingSubKeys = await this.getSubKeys(parentTokenId);
    const maxSubKeys = parent.maxSubKeys || 20;
    
    if (existingSubKeys.length >= maxSubKeys) {
      return {
        valid: false,
        reason: `Sub-key limit reached. Maximum allowed: ${maxSubKeys}`
      };
    }

    //tooru how did you not check for this part 2
    if (!this.isStrictNumber(requestedRPD) || !this.isStrictNumber(requestedRPM)) {
      return {
        valid: false,
        reason: "Dude please stop trying to fuck up our service dawg"
      };
    }

    const allocated = await this.getTotalAllocatedQuota(parentTokenId);

    // tooru how did you not check for this shit bro
    if (requestedRPD <= 0 || requestedRPM <= 0) {
      return {
        valid: false,
        reason: "Cannot set zero or negative values for RPD or RPM!"
      };
    }

    // extra check because fuck you
    const newTotalRPD = allocated.rpd + Math.abs(requestedRPD);
    const newTotalRPM = allocated.rpm + Math.abs(requestedRPM);

    if (newTotalRPD > parent.maxRPD) {
      return { 
        valid: false,
        reason: `Exceeds parent RPD limit. Available: ${parent.maxRPD - allocated.rpd}, Requested: ${requestedRPD}`,
      };
    }

    if (newTotalRPM > parent.maxRPM) {
      return {
        valid: false,
        reason: `Exceeds parent RPM limit. Available: ${parent.maxRPM - allocated.rpm}, Requested: ${requestedRPM}`,
      };
    }

    return { valid: true };
  }

  // Check if entire ancestor chain is valid for processing requests
  async validateAncestorChain(tokenId: string): Promise<{ valid: boolean; reason?: string }> {
    try {
      const chain = await this.getAncestorChain(tokenId);

      // Check each token in the chain
      for (const token of chain) {
        // Check if disabled
        if (token.disabled) {
          return {
            valid: false,
            reason: `Token disabled: ${token.name} (${token.keyType === "master" ? "master key" : "sub-key"})`,
          };
        }

        // Check expiration and auto-disable if expired
        if (token.expiresAt && token.expiresAt <= Date.now()) {
          // Auto-disable the expired token
          await this.updateUserToken(token.id, { disabled: true });
          // Cascade disable all children
          await this.cascadeDisableSubKeys(token.id);

          return {
            valid: false,
            reason: `Token expired and auto-disabled: ${token.name} (${token.keyType === "master" ? "master key" : "sub-key"})`,
          };
        }

        const todayUsage = await this.getTodayUsageCount(token.id);
        const minuteUsage = await this.getMinuteUsageCount(token.id);

        if (todayUsage >= token.maxRPD) {
          return {
            valid: false,
            reason: `Daily limit exceeded for ${token.keyType === "master" ? "master key" : "parent sub-key"}: ${token.name}`,
          };
        }

        if (minuteUsage >= token.maxRPM) {
          return {
            valid: false,
            reason: `Rate limit exceeded for ${token.keyType === "master" ? "master key" : "parent sub-key"}: ${token.name}`,
          };
        }
      }

      return { valid: true };
    } catch (error: any) {
      return { valid: false, reason: error.message };
    }
  }

  // Check if entire ancestor chain has enough quota for the request cost
  async validateAncestorChainQuota(tokenId: string, requestCost: number): Promise<{ valid: boolean; reason?: string; insufficientToken?: string }> {
    try {
      const chain = await this.getAncestorChain(tokenId);

      // Check each token in the chain has enough remaining quota
      for (const token of chain) {
        const todayUsage = await this.getTodayUsageCount(token.id);
        const remainingQuota = Number((token.maxRPD - todayUsage).toFixed(2));

        if (remainingQuota < requestCost) {
          return {
            valid: false,
            reason: `Insufficient quota in ${token.keyType === "master" ? "master key" : "ancestor sub-key"}: ${token.name}`,
            insufficientToken: token.name,
          };
        }
      }

      return { valid: true };
    } catch (error: any) {
      return { valid: false, reason: error.message };
    }
  }

  // Create usage records for entire ancestor chain
  async createUsageRecordForChain(tokenId: string, record: Omit<InsertUsageRecord, "userTokenId">): Promise<void> {
    const chain = await this.getAncestorChain(tokenId);

    // Create usage record for each token in the chain
    for (const token of chain) {
      await this.createUsageRecord({
        ...record,
        userTokenId: token.id,
      });
    }
  }

  // Cascade delete sub-keys (2 generations at a time with delay)
  async cascadeDeleteSubKeys(parentTokenId: string): Promise<number> {
    let totalDeleted = 0;
    let currentGeneration = [parentTokenId];

    // Delete up to 2 generations at a time
    for (let gen = 0; gen < 2 && currentGeneration.length > 0; gen++) {
      const nextGeneration: string[] = [];

      for (const tokenId of currentGeneration) {
        const subKeys = await this.getSubKeys(tokenId);

        for (const subKey of subKeys) {
          nextGeneration.push(subKey.id);
          await this.deleteUserToken(subKey.id);
          totalDeleted++;
        }
      }

      currentGeneration = nextGeneration;
    }

    // If there are more generations, schedule async deletion
    if (currentGeneration.length > 0) {
      setTimeout(async () => {
        for (const tokenId of currentGeneration) {
          await this.cascadeDeleteSubKeys(tokenId);
        }
      }, 100); // Small delay before continuing
    }

    return totalDeleted;
  }

  // Cascade disable sub-keys (recursively disable all descendants)
  async cascadeDisableSubKeys(parentTokenId: string): Promise<number> {
    let totalDisabled = 0;
    const subKeys = await this.getSubKeys(parentTokenId);

    for (const subKey of subKeys) {
      // Disable this sub-key
      await this.updateUserToken(subKey.id, { disabled: true });
      totalDisabled++;

      // Recursively disable its children
      const childrenDisabled = await this.cascadeDisableSubKeys(subKey.id);
      totalDisabled += childrenDisabled;
    }

    return totalDisabled;
  }

  // Cascade enable sub-keys (recursively enable all descendants)
  async cascadeEnableSubKeys(parentTokenId: string): Promise<number> {
    let totalEnabled = 0;
    const subKeys = await this.getSubKeys(parentTokenId);

    for (const subKey of subKeys) {
      // Only enable if not expired
      const isExpired = subKey.expiresAt && subKey.expiresAt <= Date.now();
      if (!isExpired) {
        await this.updateUserToken(subKey.id, { disabled: false });
        totalEnabled++;

        // Recursively enable its children
        const childrenEnabled = await this.cascadeEnableSubKeys(subKey.id);
        totalEnabled += childrenEnabled;
      }
    }

    return totalEnabled;
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
    this.scheduleSave();
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
    return Number(sum.toFixed(2));
  }

  async getMinuteUsageCount(userTokenId: string): Promise<number> {
    const oneMinuteAgo = Date.now() - 60000;
    const records = this.db.usageRecords.filter(
      (r) => r.userTokenId === userTokenId && r.timestamp >= oneMinuteAgo
    );
    const sum = records.reduce((sum, record) => sum + (record.cost || 1), 0);
    // Round to 2 decimal places to avoid floating point precision issues
    return Number(sum.toFixed(2));
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

