import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
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
  Admin,
  DiscordUser,
  InsertDiscordUser,
  RequestLog,
  InsertRequestLog,
  UserApiKey,
  InsertUserApiKey,
} from '@shared/schema';
import { IStorage } from './storage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SQLiteStorage implements IStorage {
  private db: Database.Database;
  private activeRequests: number = 0;
  private startTime: number = Date.now();

  constructor(dbPath?: string) {
    const databasePath = dbPath || path.join(process.cwd(), 'database.sqlite');

    // Initialize database
    this.db = new Database(databasePath);
    this.db.pragma('foreign_keys = ON');
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    try {
      const tableCheck = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='providers'").get();
      if (!tableCheck) {
        const initScriptPath = path.join(__dirname, 'sqlite-init.sql');
        if (fs.existsSync(initScriptPath)) {
          const initScript = fs.readFileSync(initScriptPath, 'utf8');
          console.log('Initializing fresh database...');

          try {
            this.db.exec(initScript);
            console.log('Database initialized successfully');
          } catch (error) {
            console.error('Error executing full script, trying statement by statement:', error);

            const statements = initScript.split(';').filter(stmt => stmt.trim().length > 0);
            for (let i = 0; i < statements.length; i++) {
              const statement = statements[i].trim();
              if (statement) {
                try {
                  console.log(`Executing statement ${i + 1}/${statements.length}:`, statement.substring(0, 100) + '...');
                  this.db.exec(statement + ';');
                } catch (stmtError) {
                  console.error(`Error in statement ${i + 1}:`, statement);
                  throw stmtError;
                }
              }
            }
          }
        } else {
          throw new Error(`SQLite initialization script not found at ${initScriptPath}`);
        }
      }

      this.ensureModelTokenLimitColumn();
      this.ensureProviderOwnerColumn();
      this.ensureUserTokenCreatorColumn();
      this.ensureDiscordUserIpColumns();
      this.ensureDiscordUserBannedColumn();
      this.ensureDiscordUserRolesColumn();
      this.ensureRequestLogsTable();
      this.ensureUserApiKeysTable();
    } catch (error) {
      console.error('Error initializing database:', error);
      throw error;
    }
  }

  private ensureModelTokenLimitColumn(): void {
    const columns = this.db.prepare("PRAGMA table_info(models)").all() as { name: string }[];
    if (columns.length === 0) return;
    const hasTokenLimit = columns.some((column) => column.name === "token_limit");
    if (!hasTokenLimit) {
      this.db.exec("ALTER TABLE models ADD COLUMN token_limit INTEGER");
    }
  }

  private ensureProviderOwnerColumn(): void {
    const columns = this.db.prepare("PRAGMA table_info(providers)").all() as { name: string }[];
    if (columns.length === 0) return;
    const hasOwnerId = columns.some((column) => column.name === "owner_id");
    if (!hasOwnerId) {
      this.db.exec("ALTER TABLE providers ADD COLUMN owner_id TEXT");
    }
  }

  private ensureUserTokenCreatorColumn(): void {
    const columns = this.db.prepare("PRAGMA table_info(user_tokens)").all() as { name: string }[];
    if (columns.length === 0) return;
    const hasCreator = columns.some((column) => column.name === "created_by_provider_id");
    if (!hasCreator) {
      this.db.exec("ALTER TABLE user_tokens ADD COLUMN created_by_provider_id TEXT");
    }
  }

  private ensureDiscordUserIpColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(discord_users)").all() as { name: string }[];
    if (columns.length === 0) return;
    const hasIp = columns.some((column) => column.name === "ip");
    if (!hasIp) {
      this.db.exec("ALTER TABLE discord_users ADD COLUMN ip TEXT");
    }
    const hasLastIpUpdate = columns.some((column) => column.name === "last_ip_update");
    if (!hasLastIpUpdate) {
      this.db.exec("ALTER TABLE discord_users ADD COLUMN last_ip_update INTEGER");
    }
  }

  private ensureDiscordUserBannedColumn(): void {
    const columns = this.db.prepare("PRAGMA table_info(discord_users)").all() as { name: string }[];
    if (columns.length === 0) return;
    const hasBanned = columns.some((column) => column.name === "banned");
    if (!hasBanned) {
      this.db.exec("ALTER TABLE discord_users ADD COLUMN banned INTEGER DEFAULT 0");
    }
    const hasBanReason = columns.some((column) => column.name === "ban_reason");
    if (!hasBanReason) {
      this.db.exec("ALTER TABLE discord_users ADD COLUMN ban_reason TEXT");
    }
  }

  private ensureDiscordUserRolesColumn(): void {
    const columns = this.db.prepare("PRAGMA table_info(discord_users)").all() as { name: string }[];
    if (columns.length === 0) return;
    const hasRoles = columns.some((column) => column.name === "roles");
    if (!hasRoles) {
      this.db.exec("ALTER TABLE discord_users ADD COLUMN roles TEXT DEFAULT '[\"user\"]'");
      // Create index for roles column
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_discord_users_roles ON discord_users(roles)");
    }
  }

  private ensureRequestLogsTable(): void {
    const tableCheck = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='request_logs'").get();
    if (!tableCheck) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS request_logs (
          id TEXT PRIMARY KEY,
          ip TEXT NOT NULL,
          discord_user_id TEXT,
          input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          model_id TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          referer TEXT,
          status_code INTEGER NOT NULL,
          latency INTEGER NOT NULL,
          FOREIGN KEY (discord_user_id) REFERENCES discord_users(id) ON DELETE SET NULL,
          FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE SET NULL,
          FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL
        );
        
        CREATE INDEX IF NOT EXISTS idx_request_logs_ip ON request_logs(ip);
        CREATE INDEX IF NOT EXISTS idx_request_logs_discord_user_id ON request_logs(discord_user_id);
        CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp ON request_logs(timestamp);
        CREATE INDEX IF NOT EXISTS idx_request_logs_model_id ON request_logs(model_id);
        CREATE INDEX IF NOT EXISTS idx_request_logs_provider_id ON request_logs(provider_id);
      `);
    }
  }

  private ensureUserApiKeysTable(): void {
    const tableCheck = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_api_keys'").get();
    if (!tableCheck) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS user_api_keys (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          api_key TEXT NOT NULL UNIQUE,
          created_at INTEGER NOT NULL,
          last_rotated_at INTEGER,
          FOREIGN KEY (user_id) REFERENCES discord_users(id) ON DELETE CASCADE
        );
        
        CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON user_api_keys(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_api_keys_api_key ON user_api_keys(api_key);
      `);
    }
  }

  private rowToProvider(row: any): Provider {
    return {
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
      customHeaders: row.custom_headers ? JSON.parse(row.custom_headers) : undefined,
      disableCacheDiscount: Boolean(row.disable_cache_discount),
      ownerId: row.owner_id ?? undefined,
    };
  }

  private rowToApiKey(row: any): ApiKey {
    return {
      id: row.id,
      providerId: row.provider_id,
      key: row.key,
      lastUsed: row.last_used,
      requestCount: row.request_count,
    };
  }

  private rowToModel(row: any): Model {
    return {
      id: row.id,
      providerId: row.provider_id,
      modelId: row.model_id,
      enabled: Boolean(row.enabled),
      requestCost: row.request_cost,
      tokenLimit: row.token_limit ?? null,
    };
  }

  private rowToUserToken(row: any): UserToken {
    return {
      id: row.id,
      name: row.name,
      token: row.token,
      maxRPD: row.max_rpd,
      maxRPM: row.max_rpm,
      createdAt: row.created_at,
      allowedProviders: row.allowed_providers ? JSON.parse(row.allowed_providers) : undefined,
      parentTokenId: row.parent_token_id,
      keyType: row.key_type,
      expiresAt: row.expires_at,
      disabled: !Boolean(row.enabled), // Convert enabled to disabled
      sigmaBoy: Boolean(row.sigma_boy),
      maxSubKeys: row.max_sub_keys,
      createdByProviderId: row.created_by_provider_id ?? undefined,
    };
  }

  private rowToUsageRecord(row: any): UsageRecord {
    return {
      id: row.id,
      userTokenId: row.user_token_id,
      modelId: row.model_id,
      providerId: row.provider_id,
      tokens: row.tokens,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      timestamp: row.timestamp,
      cost: row.cost,
    };
  }

  private rowToDiscordUser(row: any): DiscordUser {
    let roles: string[] = ["user"];
    if (row.roles) {
      try {
        roles = JSON.parse(row.roles);
        if (!Array.isArray(roles)) {
          roles = ["user"];
        }
      } catch {
        roles = ["user"];
      }
    }
    
    return {
      id: row.id,
      username: row.username,
      discriminator: row.discriminator,
      globalName: row.global_name ?? undefined,
      avatar: row.avatar ?? undefined,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
      ip: row.ip ?? undefined,
      lastIpUpdate: row.last_ip_update ?? undefined,
      banned: Boolean(row.banned),
      banReason: row.ban_reason ?? undefined,
      roles: roles,
    };
  }

  private rowToRequestLog(row: any): RequestLog {
    return {
      id: row.id,
      ip: row.ip,
      discordUserId: row.discord_user_id ?? undefined,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      modelId: row.model_id,
      providerId: row.provider_id,
      timestamp: row.timestamp,
      referer: row.referer ?? undefined,
      statusCode: row.status_code,
      latency: row.latency,
    };
  }

  private rowToUserApiKey(row: any): UserApiKey {
    return {
      id: row.id,
      userId: row.user_id,
      apiKey: row.api_key,
      createdAt: row.created_at,
      lastRotatedAt: row.last_rotated_at ?? undefined,
    };
  }

  // Provider methods go here, TODO, ADD LATER OMG COMMENTS
  async getProviders(): Promise<Provider[]> {
    try {
      const stmt = this.db.prepare('SELECT * FROM providers ORDER BY name');
      const rows = stmt.all();
      return rows.map(this.rowToProvider);
    } catch (error) {
      console.error('Error getting providers:', error);
      throw error;
    }
  }

  async getProvider(id: string): Promise<Provider | undefined> {
    try {
      const stmt = this.db.prepare('SELECT * FROM providers WHERE id = ?');
      const row = stmt.get(id);
      return row ? this.rowToProvider(row) : undefined;
    } catch (error) {
      console.error('Error getting provider:', error);
      throw error;
    }
  }

  async createProvider(provider: InsertProvider): Promise<Provider> {
    try {
      const id = randomUUID();
      const now = Date.now();

      const stmt = this.db.prepare(`
        INSERT INTO providers (id, name, base_url, enabled, created_at, custom_headers, disable_cache_discount, owner_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        provider.name,
        provider.baseUrl,
        provider.enabled ? 1 : 0,
        now,
        provider.customHeaders ? JSON.stringify(provider.customHeaders) : null,
        provider.disableCacheDiscount ? 1 : 0,
        provider.ownerId || null
      );

      const result = await this.getProvider(id);
      if (!result) {
        throw new Error(`Failed to create provider with ID: ${id}`);
      }
      return result;
    } catch (error) {
      console.error('Error creating provider:', error);
      throw error;
    }
  }

  async updateProvider(id: string, provider: Partial<InsertProvider>): Promise<Provider | undefined> {
    try {
      const existing = await this.getProvider(id);
      if (!existing) return undefined;

      const updates: string[] = [];
      const values: any[] = [];

      if (provider.name !== undefined) {
        updates.push('name = ?');
        values.push(provider.name);
      }
      if (provider.baseUrl !== undefined) {
        updates.push('base_url = ?');
        values.push(provider.baseUrl);
      }
      if (provider.enabled !== undefined) {
        updates.push('enabled = ?');
        values.push(provider.enabled ? 1 : 0);
      }
      if (provider.customHeaders !== undefined) {
        updates.push('custom_headers = ?');
        values.push(provider.customHeaders ? JSON.stringify(provider.customHeaders) : null);
      }
      if (provider.disableCacheDiscount !== undefined) {
        updates.push('disable_cache_discount = ?');
        values.push(provider.disableCacheDiscount ? 1 : 0);
      }
      if (provider.ownerId !== undefined) {
        updates.push('owner_id = ?');
        values.push(provider.ownerId);
      }

      if (updates.length === 0) return existing;

      values.push(id);
      const stmt = this.db.prepare(`UPDATE providers SET ${updates.join(', ')} WHERE id = ?`);
      stmt.run(...values);

      return this.getProvider(id);
    } catch (error) {
      console.error('Error updating provider:', error);
      throw error;
    }
  }

  async deleteProvider(id: string): Promise<boolean> {
    try {
      const transaction = this.db.transaction((providerId: string) => {
        const now = Date.now();

        // Clean up scoped keys before deleting the provider so existing databases
        // don't rely solely on the trigger.
        const tokens = this.db.prepare(`
          SELECT id, allowed_providers 
          FROM user_tokens 
          WHERE key_type = 'master' AND allowed_providers IS NOT NULL AND deleted_at IS NULL
        `).all() as { id: string; allowed_providers: string | null }[];

        const updateAllowedProviders = this.db.prepare('UPDATE user_tokens SET allowed_providers = ? WHERE id = ?');
        const softDeleteToken = this.db.prepare('UPDATE user_tokens SET allowed_providers = ?, deleted_at = ? WHERE id = ?');

        for (const token of tokens) {
          let providers: string[];

          try {
            providers = JSON.parse(token.allowed_providers || '[]');
            if (!Array.isArray(providers)) {
              continue;
            }
          } catch {
            continue;
          }

          const filtered = providers.filter((p) => p !== providerId);
          if (filtered.length === providers.length) {
            continue; // Provider not in this token's allowed list
          }

          if (filtered.length === 0) {
            softDeleteToken.run(JSON.stringify(filtered), now, token.id);
          } else {
            updateAllowedProviders.run(JSON.stringify(filtered), token.id);
          }
        }

        const stmt = this.db.prepare('DELETE FROM providers WHERE id = ?');
        const result = stmt.run(providerId);
        return result.changes > 0;
      });

      return transaction(id);
    } catch (error) {
      console.error('Error deleting provider:', error);
      throw error;
    }
  }

  // AP Key methods
  async getApiKeys(providerId: string): Promise<ApiKey[]> {
    try {
      const stmt = this.db.prepare('SELECT * FROM api_keys WHERE provider_id = ? ORDER BY last_used DESC');
      const rows = stmt.all(providerId);
      return rows.map(this.rowToApiKey);
    } catch (error) {
      console.error('Error getting API keys:', error);
      throw error;
    }
  }

  async createApiKey(apiKey: InsertApiKey): Promise<ApiKey> {
    try {
      const id = randomUUID();

      const stmt = this.db.prepare(`
        INSERT INTO api_keys (id, provider_id, key, last_used, request_count)
        VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(id, apiKey.providerId, apiKey.key, 0, 0);

      const getStmt = this.db.prepare('SELECT * FROM api_keys WHERE id = ?');
      const row = getStmt.get(id);
      return this.rowToApiKey(row);
    } catch (error) {
      console.error('Error creating API key:', error);
      throw error;
    }
  }

  async deleteApiKey(id: string): Promise<boolean> {
    try {
      const stmt = this.db.prepare('DELETE FROM api_keys WHERE id = ?');
      const result = stmt.run(id);
      return result.changes > 0;
    } catch (error) {
      console.error('Error deleting API key:', error);
      throw error;
    }
  }

  async updateApiKey(id: string, key: string): Promise<ApiKey | undefined> {
    try {
      const stmt = this.db.prepare('UPDATE api_keys SET key = ? WHERE id = ?');
      const result = stmt.run(key, id);

      if (result.changes === 0) return undefined;

      const getStmt = this.db.prepare('SELECT * FROM api_keys WHERE id = ?');
      const row = getStmt.get(id);
      return this.rowToApiKey(row);
    } catch (error) {
      console.error('Error updating API key:', error);
      throw error;
    }
  }

  async getNextApiKey(providerId: string): Promise<ApiKey | undefined> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM api_keys 
        WHERE provider_id = ? 
        ORDER BY request_count ASC, last_used ASC 
        LIMIT 1
      `);
      const row = stmt.get(providerId);
      return row ? this.rowToApiKey(row) : undefined;
    } catch (error) {
      console.error('Error getting next API key:', error);
      throw error;
    }
  }

  async updateApiKeyUsage(id: string): Promise<void> {
    try {
      const now = Date.now();
      const stmt = this.db.prepare(`
        UPDATE api_keys 
        SET last_used = ?, request_count = request_count + 1 
        WHERE id = ?
      `);
      stmt.run(now, id);
    } catch (error) {
      console.error('Error updating API key usage:', error);
      throw error;
    }
  }

  // Model methods
  async getModels(providerId?: string): Promise<Model[]> {
    try {
      let stmt;
      if (providerId) {
        stmt = this.db.prepare('SELECT * FROM models WHERE provider_id = ? ORDER BY model_id');
        const rows = stmt.all(providerId);
        return rows.map(this.rowToModel);
      } else {
        stmt = this.db.prepare('SELECT * FROM models ORDER BY provider_id, model_id');
        const rows = stmt.all();
        return rows.map(this.rowToModel);
      }
    } catch (error) {
      console.error('Error getting models:', error);
      throw error;
    }
  }

  async createModel(model: InsertModel): Promise<Model> {
    try {
      const id = randomUUID();

      const stmt = this.db.prepare(`
        INSERT INTO models (id, provider_id, model_id, enabled, request_cost, token_limit)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        model.providerId,
        model.modelId,
        model.enabled ? 1 : 0,
        model.requestCost || 1,
        model.tokenLimit ?? null
      );

      const getStmt = this.db.prepare('SELECT * FROM models WHERE id = ?');
      const row = getStmt.get(id);
      return this.rowToModel(row);
    } catch (error) {
      console.error('Error creating model:', error);
      throw error;
    }
  }

  async updateModel(id: string, model: Partial<InsertModel>): Promise<Model | undefined> {
    try {
      const updates: string[] = [];
      const values: any[] = [];

      if (model.modelId !== undefined) {
        updates.push('model_id = ?');
        values.push(model.modelId);
      }
      if (model.enabled !== undefined) {
        updates.push('enabled = ?');
        values.push(model.enabled ? 1 : 0);
      }
      if (model.requestCost !== undefined) {
        updates.push('request_cost = ?');
        values.push(model.requestCost);
      }
      if (model.tokenLimit !== undefined) {
        updates.push('token_limit = ?');
        values.push(model.tokenLimit);
      }

      if (updates.length === 0) {
        const getStmt = this.db.prepare('SELECT * FROM models WHERE id = ?');
        const row = getStmt.get(id);
        return row ? this.rowToModel(row) : undefined;
      }

      values.push(id);
      const stmt = this.db.prepare(`UPDATE models SET ${updates.join(', ')} WHERE id = ?`);
      stmt.run(...values);

      const getStmt = this.db.prepare('SELECT * FROM models WHERE id = ?');
      const row = getStmt.get(id);
      return row ? this.rowToModel(row) : undefined;
    } catch (error) {
      console.error('Error updating model:', error);
      throw error;
    }
  }

  async deleteModel(id: string): Promise<boolean> {
    try {
      const stmt = this.db.prepare('DELETE FROM models WHERE id = ?');
      const result = stmt.run(id);
      return result.changes > 0;
    } catch (error) {
      console.error('Error deleting model:', error);
      throw error;
    }
  }

  async deleteModelsByProvider(providerId: string): Promise<void> {
    try {
      const stmt = this.db.prepare('DELETE FROM models WHERE provider_id = ?');
      stmt.run(providerId);
    } catch (error) {
      console.error('Error deleting models by provider:', error);
      throw error;
    }
  }

  async replaceProviderModels(providerId: string, modelIds: string[]): Promise<Model[]> {
  const transaction = this.db.transaction(() => {
    try {
      // Get existing models for this provider
      const existingStmt = this.db.prepare('SELECT * FROM models WHERE provider_id = ?');
      const existingModels = existingStmt.all(providerId).map(this.rowToModel);
      
      // Create a Set of new model IDs for quick lookup
      const newModelIdSet = new Set(modelIds);
      
      // Create a Map of existing models by modelId
      const existingModelMap = new Map(
        existingModels.map(m => [m.modelId, m])
      );
      
      const resultModels: Model[] = [];
      
      // Process new models: add if they don't exist, re-enable if they do
      for (const modelId of modelIds) {
        const existing = existingModelMap.get(modelId);
        
        if (existing) {
          // Model exists - if it was disabled, re-enable it (model came back!)
          if (!existing.enabled) {
            const updateStmt = this.db.prepare('UPDATE models SET enabled = 1 WHERE id = ?');
            updateStmt.run(existing.id);
            
            resultModels.push({
              ...existing,
              enabled: true,
            });
          } else {
            // Model already exists and is enabled - keep as-is
            resultModels.push(existing);
          }
        } else {
          // New model - create it
          const id = randomUUID();
          const insertStmt = this.db.prepare(`
            INSERT INTO models (id, provider_id, model_id, enabled, request_cost, token_limit)
            VALUES (?, ?, ?, ?, ?, ?)
          `);
          insertStmt.run(id, providerId, modelId, 1, 1, null);
          
          resultModels.push({
            id,
            providerId,
            modelId,
            enabled: true,
            requestCost: 1,
            tokenLimit: null,
          });
        }
      }
      
      // Disable old models (preserves historical data)
      for (const existing of existingModels) {
        if (!newModelIdSet.has(existing.modelId)) {
          const updateStmt = this.db.prepare('UPDATE models SET enabled = 0 WHERE id = ?');
          updateStmt.run(existing.id);
          
          resultModels.push({
            ...existing,
            enabled: false,
          });
        }
      }
      
      return resultModels;
    } catch (error) {
      console.error('Error in replaceProviderModels transaction:', error);
      throw error;
    }
  });

  return transaction();
}


  async updateModelsByProvider(providerId: string, updates: Partial<InsertModel>): Promise<Model[]> {
    const transaction = this.db.transaction(() => {
      try {
        const updateFields: string[] = [];
        const values: any[] = [];

        if (updates.enabled !== undefined) {
          updateFields.push('enabled = ?');
          values.push(updates.enabled ? 1 : 0);
        }
        if (updates.requestCost !== undefined) {
          updateFields.push('request_cost = ?');
          values.push(updates.requestCost);
        }
        if (updates.tokenLimit !== undefined) {
          updateFields.push('token_limit = ?');
          values.push(updates.tokenLimit);
        }

        if (updateFields.length === 0) {
          const getStmt = this.db.prepare('SELECT * FROM models WHERE provider_id = ?');
          const rows = getStmt.all(providerId);
          return rows.map(this.rowToModel);
        }

        values.push(providerId);
        const stmt = this.db.prepare(`
          UPDATE models SET ${updateFields.join(', ')} 
          WHERE provider_id = ?
        `);
        stmt.run(...values);

        const getStmt = this.db.prepare('SELECT * FROM models WHERE provider_id = ?');
        const rows = getStmt.all(providerId);
        return rows.map(this.rowToModel);
      } catch (error) {
        console.error('Error in updateModelsByProvider transaction:', error);
        throw error;
      }
    });

    return transaction();
  }

  async enableAllModelsByProvider(providerId: string): Promise<Model[]> {
    return this.updateModelsByProvider(providerId, { enabled: true });
  }

  async disableAllModelsByProvider(providerId: string): Promise<Model[]> {
    return this.updateModelsByProvider(providerId, { enabled: false });
  }

  async updateCostAllModelsByProvider(providerId: string, requestCost: number): Promise<Model[]> {
    return this.updateModelsByProvider(providerId, { requestCost });
  }

  async bulkUpdateModelsByIds(updates: Array<{ id: string; enabled?: boolean; requestCost?: number; tokenLimit?: number | null }>): Promise<Model[]> {
    const transaction = this.db.transaction(() => {
      try {
        // Execute all updates within the transaction
        for (const update of updates) {
          const updateFields: string[] = [];
          const values: any[] = [];

          if (typeof update.enabled === 'boolean') {
            updateFields.push('enabled = ?');
            values.push(update.enabled ? 1 : 0);
          }
          if (typeof update.requestCost === 'number') {
            updateFields.push('request_cost = ?');
            values.push(update.requestCost);
          }
          if (update.tokenLimit !== undefined) {
            updateFields.push('token_limit = ?');
            values.push(update.tokenLimit);
          }

          if (updateFields.length === 0) {
            continue;
          }

          const updateStmt = this.db.prepare(`UPDATE models SET ${updateFields.join(', ')} WHERE id = ?`);
          updateStmt.run(...values, update.id);
        }
        
        // Fetch and return all updated models
        const modelIds = updates.map(u => u.id);
        const placeholders = modelIds.map(() => '?').join(',');
        const getStmt = this.db.prepare(`SELECT * FROM models WHERE id IN (${placeholders})`);
        const rows = getStmt.all(...modelIds);
        
        return rows.map(this.rowToModel);
      } catch (error) {
        console.error('Error in bulkUpdateModelsByIds transaction:', error);
        throw error;
      }
    });

    return transaction();
  }

  // User Token methods
  async getUserTokens(): Promise<UserToken[]> {
    try {
      const stmt = this.db.prepare('SELECT * FROM user_tokens WHERE deleted_at IS NULL ORDER BY created_at DESC');
      const rows = stmt.all();
      return rows.map(this.rowToUserToken);
    } catch (error) {
      console.error('Error getting user tokens:', error);
      throw error;
    }
  }

  async getUserToken(token: string): Promise<UserToken | undefined> {
    try {
      const stmt = this.db.prepare('SELECT * FROM user_tokens WHERE token = ? AND deleted_at IS NULL');
      const row = stmt.get(token);
      return row ? this.rowToUserToken(row) : undefined;
    } catch (error) {
      console.error('Error getting user token:', error);
      throw error;
    }
  }

  async getUserTokenById(id: string): Promise<UserToken | undefined> {
    try {
      const stmt = this.db.prepare('SELECT * FROM user_tokens WHERE id = ? AND deleted_at IS NULL');
      const row = stmt.get(id);
      return row ? this.rowToUserToken(row) : undefined;
    } catch (error) {
      console.error('Error getting user token by ID:', error);
      throw error;
    }
  }

  async createUserToken(userToken: InsertUserToken): Promise<UserToken> {
    try {
      const id = randomUUID();
      const token = "sk_" + randomUUID().replace(/-/g, "");
      const now = Date.now();

      const stmt = this.db.prepare(`
        INSERT INTO user_tokens (
          id, name, token, max_rpd, max_rpm, created_at, allowed_providers,
          parent_token_id, key_type, expires_at, enabled, sigma_boy, max_sub_keys,
          created_by_provider_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        userToken.name,
        token,
        userToken.maxRPD,
        userToken.maxRPM,
        now,
        userToken.allowedProviders ? JSON.stringify(userToken.allowedProviders) : null,
        userToken.parentTokenId || null,
        userToken.keyType || "master",
        userToken.expiresAt || null,
        userToken.disabled ? 0 : 1,
        userToken.sigmaBoy ? 1 : 0,
        userToken.maxSubKeys || 20,
        userToken.createdByProviderId || null
      );

      const result = await this.getUserTokenById(id);
      if (!result) {
        throw new Error(`Failed to create user token with ID: ${id}`);
      }
      return result;
    } catch (error) {
      console.error('Error creating user token:', error);
      throw error;
    }
  }

  async updateUserToken(id: string, userToken: Partial<InsertUserToken>): Promise<UserToken | undefined> {
    try {
      const updates: string[] = [];
      const values: any[] = [];

      if (userToken.name !== undefined) {
        updates.push('name = ?');
        values.push(userToken.name);
      }
      if (userToken.maxRPD !== undefined) {
        updates.push('max_rpd = ?');
        values.push(userToken.maxRPD);
      }
      if (userToken.maxRPM !== undefined) {
        updates.push('max_rpm = ?');
        values.push(userToken.maxRPM);
      }
      if (userToken.allowedProviders !== undefined) {
        updates.push('allowed_providers = ?');
        values.push(userToken.allowedProviders ? JSON.stringify(userToken.allowedProviders) : null);
      }
      if (userToken.parentTokenId !== undefined) {
        updates.push('parent_token_id = ?');
        values.push(userToken.parentTokenId);
      }
      if (userToken.keyType !== undefined) {
        updates.push('key_type = ?');
        values.push(userToken.keyType);
      }
      if (userToken.expiresAt !== undefined) {
        updates.push('expires_at = ?');
        values.push(userToken.expiresAt);
      }
      if (userToken.disabled !== undefined) {
        updates.push('enabled = ?');
        values.push(userToken.disabled ? 0 : 1);
      }
      if (userToken.sigmaBoy !== undefined) {
        updates.push('sigma_boy = ?');
        values.push(userToken.sigmaBoy ? 1 : 0);
      }
      if (userToken.maxSubKeys !== undefined) {
        updates.push('max_sub_keys = ?');
        values.push(userToken.maxSubKeys);
      }
      if (userToken.createdByProviderId !== undefined) {
        updates.push('created_by_provider_id = ?');
        values.push(userToken.createdByProviderId);
      }

      if (updates.length === 0) {
        return this.getUserTokenById(id);
      }

      values.push(id);
      const stmt = this.db.prepare(`UPDATE user_tokens SET ${updates.join(', ')} WHERE id = ?`);
      stmt.run(...values);

      return this.getUserTokenById(id);
    } catch (error) {
      console.error('Error updating user token:', error);
      throw error;
    }
  }

  async deleteUserToken(id: string): Promise<boolean> {
    try {
      // const stmt = this.db.prepare('DELETE FROM user_tokens WHERE id = ?');
      const stmt = this.db.prepare('UPDATE user_tokens SET deleted_at = ? WHERE id = ?');
      const result = stmt.run(Date.now(), id);
      return result.changes > 0;
    } catch (error) {
      console.error('Error deleting user token:', error);
      throw error;
    }
  }

  async regenerateUserToken(id: string): Promise<UserToken | undefined> {
    try {
      const newToken = "sk_" + randomUUID().replace(/-/g, "");
      const stmt = this.db.prepare('UPDATE user_tokens SET token = ? WHERE id = ?');
      const result = stmt.run(newToken, id);

      if (result.changes === 0) return undefined;

      return this.getUserTokenById(id);
    } catch (error) {
      console.error('Error regenerating user token:', error);
      throw error;
    }
  }

  // Sub-key specific methods
  async getSubKeys(parentTokenId: string): Promise<UserToken[]> {
    try {
      const stmt = this.db.prepare('SELECT * FROM user_tokens WHERE parent_token_id = ? AND deleted_at IS NULL ORDER BY created_at DESC');
      const rows = stmt.all(parentTokenId);
      return rows.map(this.rowToUserToken);
    } catch (error) {
      console.error('Error getting sub-keys:', error);
      throw error;
    }
  }

  async getAncestorChain(tokenId: string): Promise<UserToken[]> {
    try {
      const chain: UserToken[] = [];
      let currentId: string | undefined = tokenId;
      let iterations = 0;
      const maxIterations = 100; // Prevent infinite loops - bandaid solution honestly, idfk why but i couldnt think of a better solution adn this works so yeah

      while (currentId && iterations < maxIterations) {
        const stmt = this.db.prepare('SELECT * FROM user_tokens WHERE id = ? AND deleted_at IS NULL');
        const row: any = stmt.get(currentId);

        if (!row) break;

        chain.push(this.rowToUserToken(row));
        currentId = row.parent_token_id;
        iterations++;
      }

      if (iterations >= maxIterations) {
        throw new Error("Circular reference detected in token hierarchy");
      }

      return chain;
    } catch (error) {
      console.error('Error getting ancestor chain:', error);
      throw error;
    }
  }

  async getRootToken(tokenId: string): Promise<UserToken | undefined> {
    try {
      const chain = await this.getAncestorChain(tokenId);
      return chain.length > 0 ? chain[chain.length - 1] : undefined;
    } catch (error) {
      console.error('Error getting root token:', error);
      throw error;
    }
  }

  async getTotalAllocatedQuota(parentTokenId: string): Promise<{ rpd: number; rpm: number }> {
    try {
      const stmt = this.db.prepare(`
        SELECT
          COALESCE(SUM(max_rpd), 0) as total_rpd,
          COALESCE(SUM(max_rpm), 0) as total_rpm
        FROM user_tokens
        WHERE parent_token_id = ? AND deleted_at IS NULL
      `);
      const result = stmt.get(parentTokenId) as { total_rpd: number; total_rpm: number };

      return {
        rpd: Number(result.total_rpd.toFixed(2)),
        rpm: Number(result.total_rpm.toFixed(2)),
      };
    } catch (error) {
      console.error('Error getting total allocated quota:', error);
      throw error;
    }
  }

  isStrictNumber(value: any): boolean {
    return typeof value === 'number' && !Number.isNaN(value);
  }

  async canCreateSubKey(parentTokenId: string, requestedRPD: number, requestedRPM: number): Promise<{ valid: boolean; reason?: string }> {
    try {
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

      // Validate input values
      if (!this.isStrictNumber(requestedRPD) || !this.isStrictNumber(requestedRPM)) {
        return {
          valid: false,
          reason: "Dude please stop trying to fuck up our service dawg"
        };
      }

      const allocated = await this.getTotalAllocatedQuota(parentTokenId);

      // Check for zero or negative values
      if (requestedRPD <= 0 || requestedRPM <= 0) {
        return {
          valid: false,
          reason: "Cannot set zero or negative values for RPD or RPM!"
        };
      }

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
    } catch (error) {
      console.error('Error checking if can create sub-key:', error);
      return { valid: false, reason: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async validateAncestorChain(tokenId: string): Promise<{ valid: boolean; reason?: string }> {
    try {
      const chain = await this.getAncestorChain(tokenId);

      // Check each token in the chain to make sure none of em bitches are disabled
      for (const token of chain) {
        if (token.disabled) {
          return {
            valid: false,
            reason: `Token disabled: ${token.name} (${token.keyType === "master" ? "master key" : "sub-key"})`,
          };
        }

        if (token.expiresAt && token.expiresAt <= Date.now()) {
          await this.updateUserToken(token.id, { disabled: true });
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

  async validateAncestorChainQuota(tokenId: string, requestCost: number): Promise<{ valid: boolean; reason?: string; insufficientToken?: string }> {
    try {
      const chain = await this.getAncestorChain(tokenId);

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

  async createUsageRecordForChain(tokenId: string, record: Omit<InsertUsageRecord, "userTokenId">): Promise<void> {
    console.log(`[DEBUG] createUsageRecordForChain called for tokenId: ${tokenId}`);

    // FIX: Don't use transaction for async operations - handle manually
    try {
      console.log(`[DEBUG] Getting ancestor chain for tokenId: ${tokenId} `);
      const chain = await this.getAncestorChain(tokenId);
      console.log(`[DEBUG] Found ${chain.length} tokens in ancestor chain`);

      for (const token of chain) {
        console.log(`[DEBUG] Creating usage record for token: ${token.id} (${token.name})`);
        await this.createUsageRecord({
          ...record,
          userTokenId: token.id,
        });
      }
      console.log(`[DEBUG] Successfully created usage records for chain`);
    } catch (error) {
      console.error('[ERROR] Error in createUsageRecordForChain:', error);
      throw error;
    }
  }

  async cascadeDeleteSubKeys(parentTokenId: string): Promise<number> {
    try {
      let totalDeleted = 0;
      let currentGeneration = [parentTokenId];

      // Delete up to 2 generations at a time for cascading :sungl:
      for (let gen = 0; gen < 2 && currentGeneration.length > 0; gen++) {
        const nextGeneration: string[] = [];

        for (const tokenId of currentGeneration) {
          const subKeys = await this.getSubKeys(tokenId);

          for (const subKey of subKeys) {
            nextGeneration.push(subKey.id);
            const deleteStmt = this.db.prepare('DELETE FROM user_tokens WHERE id = ?');
            deleteStmt.run(subKey.id);
            totalDeleted++;
          }
        }

        currentGeneration = nextGeneration;
      }

      // If there are more generations, schedule async deletionn
      if (currentGeneration.length > 0) {
        setTimeout(async () => {
          for (const tokenId of currentGeneration) {
            await this.cascadeDeleteSubKeys(tokenId);
          }
        }, 100);
      }

      return totalDeleted;
    } catch (error) {
      console.error('Error in cascadeDeleteSubKeys:', error);
      throw error;
    }
  }

  async cascadeDisableSubKeys(parentTokenId: string): Promise<number> {
    try {
      let totalDisabled = 0;
      const subKeys = await this.getSubKeys(parentTokenId);

      for (const subKey of subKeys) {
        await this.updateUserToken(subKey.id, { disabled: true });
        totalDisabled++;

        const childrenDisabled = await this.cascadeDisableSubKeys(subKey.id);
        totalDisabled += childrenDisabled;
      }

      return totalDisabled;
    } catch (error) {
      console.error('Error in cascadeDisableSubKeys:', error);
      throw error;
    }
  }

  async cascadeEnableSubKeys(parentTokenId: string): Promise<number> {
    try {
      let totalEnabled = 0;
      const subKeys = await this.getSubKeys(parentTokenId);

      for (const subKey of subKeys) {
        const isExpired = subKey.expiresAt && subKey.expiresAt <= Date.now();

        if (!isExpired) {
          await this.updateUserToken(subKey.id, { disabled: false });
          totalEnabled++;

          const childrenEnabled = await this.cascadeEnableSubKeys(subKey.id);
          totalEnabled += childrenEnabled;
        }
      }

      return totalEnabled;
    } catch (error) {
      console.error('Error in cascadeEnableSubKeys:', error);
      throw error;
    }
  }

  async createUsageRecord(record: InsertUsageRecord): Promise<UsageRecord> {
    try {
      const id = randomUUID();
      const now = Date.now();

      const userTokenCheck = this.db.prepare('SELECT id FROM user_tokens WHERE id = ?').get(record.userTokenId);
      const modelCheck = this.db.prepare('SELECT id FROM models WHERE id = ?').get(record.modelId);
      const providerCheck = this.db.prepare('SELECT id FROM providers WHERE id = ?').get(record.providerId);

      if (!userTokenCheck) {
        throw new Error(`Foreign key constraint failed: user_token_id '${record.userTokenId}' does not exist in user_tokens table`);
      }

      if (!modelCheck) {
        throw new Error(`Foreign key constraint failed: model_id '${record.modelId}' does not exist in models table`);
      }

      if (!providerCheck) {
        throw new Error(`Foreign key constraint failed: provider_id '${record.providerId}' does not exist in providers table`);
      }

      const stmt = this.db.prepare(`
        INSERT INTO usage_records(
        id, user_token_id, model_id, provider_id, tokens, input_tokens,
        output_tokens, timestamp, cost
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

      stmt.run(
        id,
        record.userTokenId,
        record.modelId,
        record.providerId,
        record.tokens || 0,
        record.inputTokens || 0,
        record.outputTokens || 0,
        now,
        record.cost || 1
      );

      const getStmt = this.db.prepare('SELECT * FROM usage_records WHERE id = ?');
      const row = getStmt.get(id);
      return this.rowToUsageRecord(row);
    } catch (error) {
      console.error('Error creating usage record:', error);
      throw error;
    }
  }

  async getUsageRecords(userTokenId: string): Promise<UsageRecord[]> {
    try {
      const stmt = this.db.prepare('SELECT * FROM usage_records WHERE user_token_id = ? ORDER BY timestamp DESC');
      const rows = stmt.all(userTokenId);
      return rows.map(this.rowToUsageRecord);
    } catch (error) {
      console.error('Error getting usage records:', error);
      throw error;
    }
  }

  async getTodayUsageCount(userTokenId: string): Promise<number> {
    try {
      const now = new Date();
      const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

      const stmt = this.db.prepare(`
        SELECT COALESCE(SUM(cost), 0) as total_cost
        FROM usage_records 
        WHERE user_token_id = ? AND timestamp >= ?
      `);
      const result = stmt.get(userTokenId, today) as { total_cost: number };

      return Number(result.total_cost.toFixed(2));
    } catch (error) {
      console.error('Error getting today usage count:', error);
      throw error;
    }
  }

  async getMinuteUsageCount(userTokenId: string): Promise<number> {
    try {
      const oneMinuteAgo = Date.now() - 60000;

      const stmt = this.db.prepare(`
        SELECT COALESCE(SUM(cost), 0) as total_cost
        FROM usage_records 
        WHERE user_token_id = ? AND timestamp >= ?
      `);
      const result = stmt.get(userTokenId, oneMinuteAgo) as { total_cost: number };

      return Number(result.total_cost.toFixed(2));
    } catch (error) {
      console.error('Error getting minute usage count:', error);
      throw error;
    }
  }

  // Stats methods
  async getStats(): Promise<Stats> {
    try {
      const totalTokensStmt = this.db.prepare('SELECT CAST(value AS INTEGER) as value FROM system_config WHERE key = ?');
      const totalTokensResult = totalTokensStmt.get('total_tokens_all') as { value: number } | undefined;
      const totalTokens = totalTokensResult?.value || 0;

      const totalRequestsStmt = this.db.prepare('SELECT CAST(value AS INTEGER) as value FROM system_config WHERE key = ?');
      const totalRequestsResult = totalRequestsStmt.get('total_requests_all') as { value: number } | undefined;
      const totalRequests = totalRequestsResult?.value || 0;

      const uptime = Math.floor((Date.now() - this.startTime) / 1000);

      return {
        totalTokens,
        totalRequests,
        activeRequests: this.activeRequests,
        successRate: 100, // calculated based on error tracking
        uptime,
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      throw error;
    }
  }

  async incrementActiveRequests(): Promise<void> {
    this.activeRequests++;
  }

  async decrementActiveRequests(): Promise<void> {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
  }

  // Admin methods
  async getAdmin(username: string): Promise<Admin | undefined> {
    try {
      const stmt = this.db.prepare('SELECT * FROM admins WHERE username = ?');
      const row = stmt.get(username);
      if (!row) return undefined;

      return {
        id: (row as any).id,
        username: (row as any).username,
        password: (row as any).password,
        createdAt: (row as any).created_at,
      };
    } catch (error) {
      console.error('Error getting admin:', error);
      throw error;
    }
  }

  async createAdmin(username: string, password: string): Promise<Admin> {
    try {
      const id = randomUUID();
      const now = Date.now();

      const stmt = this.db.prepare(`
        INSERT INTO admins(id, username, password, created_at)
    VALUES(?, ?, ?, ?)
      `);

      stmt.run(id, username, password, now);

      return {
        id,
        username,
        password,
        createdAt: now,
      };
    } catch (error) {
      console.error('Error creating admin:', error);
      throw error;
    }
  }

  // Auth methods
  async getAuthMode(): Promise<"user_tokens" | "general_password" | "no_auth"> {
    try {
      const stmt = this.db.prepare('SELECT value FROM system_config WHERE key = ?');
      const row = stmt.get('auth_mode') as { value: string } | undefined;
      // Parse the JSON string value if it's stored as JSON
      let value = row?.value;
      if (value && (value.startsWith('"') || value.startsWith("'"))) {
        value = JSON.parse(value);
      }
      return (value as "user_tokens" | "general_password" | "no_auth") || "user_tokens";
    } catch (error) {
      console.error('Error getting auth mode:', error);
      return "user_tokens";
    }
  }

  async getGeneralPassword(): Promise<string | undefined> {
    try {
      const stmt = this.db.prepare('SELECT value FROM system_config WHERE key = ?');
      const row = stmt.get('general_password') as { value: string } | undefined;
      return row?.value === 'NULL' ? undefined : row?.value;
    } catch (error) {
      console.error('Error getting general password:', error);
      return undefined;
    }
  }

  // Discord User methods
  async getDiscordUser(id: string): Promise<DiscordUser | undefined> {
    try {
      const stmt = this.db.prepare('SELECT * FROM discord_users WHERE id = ?');
      const row = stmt.get(id);
      return row ? this.rowToDiscordUser(row) : undefined;
    } catch (error) {
      console.error('Error getting Discord user:', error);
      throw error;
    }
  }

  async getDiscordUsers(): Promise<DiscordUser[]> {
    try {
      const stmt = this.db.prepare('SELECT * FROM discord_users ORDER BY last_login_at DESC');
      const rows = stmt.all();
      return rows.map(this.rowToDiscordUser);
    } catch (error) {
      console.error('Error getting Discord users:', error);
      throw error;
    }
  }

  async createDiscordUser(user: InsertDiscordUser): Promise<DiscordUser> {
    try {
      const now = Date.now();
      const roles = user.roles && user.roles.length > 0 ? JSON.stringify(user.roles) : '["user"]';

      const stmt = this.db.prepare(`
        INSERT INTO discord_users (id, username, discriminator, global_name, avatar, created_at, last_login_at, ip, last_ip_update, banned, ban_reason, roles)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        user.id,
        user.username,
        user.discriminator,
        user.globalName ?? null,
        user.avatar ?? null,
        now,
        now,
        user.ip ?? null,
        user.lastIpUpdate ?? null,
        user.banned ? 1 : 0,
        user.banReason ?? null,
        roles
      );

      const result = await this.getDiscordUser(user.id);
      if (!result) {
        throw new Error(`Failed to create Discord user with ID: ${user.id}`);
      }
      return result;
    } catch (error) {
      console.error('Error creating Discord user:', error);
      throw error;
    }
  }

  async isIpAuthorized(ip: string): Promise<boolean> {
    try {
      const stmt = this.db.prepare('SELECT 1 FROM discord_users WHERE ip = ? AND banned = 0');
      const row = stmt.get(ip);
      return !!row;
    } catch (error) {
      console.error('Error checking authorized IP:', error);
      throw error;
    }
  }

  async banDiscordUser(id: string, reason?: string): Promise<DiscordUser | undefined> {
    return this.updateDiscordUser(id, { banned: true, banReason: reason || "Dictatorship" });
  }

  async unbanDiscordUser(id: string): Promise<DiscordUser | undefined> {
    return this.updateDiscordUser(id, { banned: false, banReason: undefined });
  }

  async updateDiscordUser(id: string, user: Partial<InsertDiscordUser>): Promise<DiscordUser | undefined> {
    try {
      const existing = await this.getDiscordUser(id);
      if (!existing) return undefined;

      const updates: string[] = [];
      const values: any[] = [];

      if (user.username !== undefined) {
        updates.push('username = ?');
        values.push(user.username);
      }
      if (user.discriminator !== undefined) {
        updates.push('discriminator = ?');
        values.push(user.discriminator);
      }
      if (user.globalName !== undefined) {
        updates.push('global_name = ?');
        values.push(user.globalName);
      }
      if (user.avatar !== undefined) {
        updates.push('avatar = ?');
        values.push(user.avatar);
      }
      if (user.ip !== undefined) {
        updates.push('ip = ?');
        values.push(user.ip);
      }
      if (user.lastIpUpdate !== undefined) {
        updates.push('last_ip_update = ?');
        values.push(user.lastIpUpdate);
      }
      if (user.banned !== undefined) {
        updates.push('banned = ?');
        values.push(user.banned ? 1 : 0);
      }
      if (user.banReason !== undefined) {
        updates.push('ban_reason = ?');
        values.push(user.banReason);
      }
      if (user.roles !== undefined) {
        updates.push('roles = ?');
        values.push(JSON.stringify(user.roles));
      }

      // Always update lastLoginAt
      updates.push('last_login_at = ?');
      values.push(Date.now());

      if (updates.length === 0) return existing;

      values.push(id);
      const stmt = this.db.prepare(`UPDATE discord_users SET ${updates.join(', ')} WHERE id = ?`);
      stmt.run(...values);

      return this.getDiscordUser(id);
    } catch (error) {
      console.error('Error updating Discord user:', error);
      throw error;
    }
  }

  // Request Log methods
  async createRequestLog(log: InsertRequestLog): Promise<RequestLog> {
    try {
      const id = randomUUID();
      const now = Date.now();

      const stmt = this.db.prepare(`
        INSERT INTO request_logs (
          id, ip, discord_user_id, input_tokens, output_tokens,
          model_id, provider_id, timestamp, referer, status_code, latency
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        log.ip,
        log.discordUserId ?? null,
        log.inputTokens,
        log.outputTokens,
        log.modelId ?? null,
        log.providerId ?? null,
        now,
        log.referer ?? null,
        log.statusCode,
        log.latency
      );

      const getStmt = this.db.prepare('SELECT * FROM request_logs WHERE id = ?');
      const row = getStmt.get(id);
      return this.rowToRequestLog(row);
    } catch (error) {
      console.error('Error creating request log:', error);
      throw error;
    }
  }

  async getRequestLogs(options?: {
    page?: number;
    limit?: number;
    search?: string;
    modelId?: string;
    providerId?: string;
  }): Promise<{ logs: RequestLog[]; total: number }> {
    try {
      const page = options?.page ?? 1;
      const limit = options?.limit ?? 50;
      const offset = (page - 1) * limit;

      let whereClause = '';
      const params: any[] = [];

      const conditions: string[] = [];

      if (options?.search) {
        conditions.push('(rl.ip LIKE ? OR du.username LIKE ? OR du.global_name LIKE ?)');
        const searchPattern = `%${options.search}%`;
        params.push(searchPattern, searchPattern, searchPattern);
      }

      if (options?.modelId) {
        conditions.push('rl.model_id = ?');
        params.push(options.modelId);
      }

      if (options?.providerId) {
        conditions.push('rl.provider_id = ?');
        params.push(options.providerId);
      }

      if (conditions.length > 0) {
        whereClause = 'WHERE ' + conditions.join(' AND ');
      }

      // Get total count
      const countStmt = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM request_logs rl
        LEFT JOIN discord_users du ON rl.discord_user_id = du.id
        ${whereClause}
      `);
      const countResult = countStmt.get(...params) as { count: number };
      const total = countResult.count;

      // Get paginated logs
      const stmt = this.db.prepare(`
        SELECT rl.*
        FROM request_logs rl
        LEFT JOIN discord_users du ON rl.discord_user_id = du.id
        ${whereClause}
        ORDER BY rl.timestamp DESC
        LIMIT ? OFFSET ?
      `);
      const rows = stmt.all(...params, limit, offset);
      const logs = rows.map(this.rowToRequestLog.bind(this));

      return { logs, total };
    } catch (error) {
      console.error('Error getting request logs:', error);
      throw error;
    }
  }

  // User API Key methods
  async getUserApiKey(userId: string): Promise<UserApiKey | undefined> {
    try {
      const stmt = this.db.prepare('SELECT * FROM user_api_keys WHERE user_id = ?');
      const row = stmt.get(userId);
      return row ? this.rowToUserApiKey(row) : undefined;
    } catch (error) {
      console.error('Error getting user API key:', error);
      throw error;
    }
  }

  async createUserApiKey(userId: string): Promise<UserApiKey> {
    try {
      const id = randomUUID();
      const apiKey = "uak_" + randomUUID().replace(/-/g, "");
      const now = Date.now();

      const stmt = this.db.prepare(`
        INSERT INTO user_api_keys (id, user_id, api_key, created_at, last_rotated_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(id, userId, apiKey, now, null);

      const result = await this.getUserApiKey(userId);
      if (!result) {
        throw new Error(`Failed to create user API key for user ID: ${userId}`);
      }
      return result;
    } catch (error) {
      console.error('Error creating user API key:', error);
      throw error;
    }
  }

  async rotateUserApiKey(userId: string): Promise<UserApiKey> {
    try {
      const newApiKey = "uak_" + randomUUID().replace(/-/g, "");
      const now = Date.now();

      const stmt = this.db.prepare(`
        UPDATE user_api_keys
        SET api_key = ?, last_rotated_at = ?
        WHERE user_id = ?
      `);
      
      const result = stmt.run(newApiKey, now, userId);

      if (result.changes === 0) {
        throw new Error(`No API key found for user ID: ${userId}`);
      }

      const updatedKey = await this.getUserApiKey(userId);
      if (!updatedKey) {
        throw new Error(`Failed to retrieve rotated API key for user ID: ${userId}`);
      }
      return updatedKey;
    } catch (error) {
      console.error('Error rotating user API key:', error);
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}
