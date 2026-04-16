import { Database } from "bun:sqlite";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
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
import { IStorage } from "./storage";

export class SQLiteStorage implements IStorage {
  private db: Database;
  private activeRequests: number = 0;
  private startTime: number = Date.now();

  constructor(dbPath?: string) {
    const databasePath = dbPath || path.join(process.cwd(), "database.sqlite");

    // Initialize database
    this.db = new Database(databasePath);
    this.db.exec("PRAGMA foreign_keys = ON");
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    try {
      const tableCheck = this.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='providers'",
        )
        .get();
      if (!tableCheck) {
        const initScriptPath = path.join(
          process.cwd(),
          "server",
          "sqlite-init.sql",
        );
        if (fs.existsSync(initScriptPath)) {
          const initScript = fs.readFileSync(initScriptPath, "utf8");
          console.log("Initializing fresh database...");

          try {
            this.db.exec(initScript);
            console.log("Database initialized successfully");
          } catch (error) {
            console.error(
              "Error executing full script, trying statement by statement:",
              error,
            );

            const statements = initScript
              .split(";")
              .filter((stmt) => stmt.trim().length > 0);
            for (let i = 0; i < statements.length; i++) {
              const statement = statements[i].trim();
              if (statement) {
                try {
                  console.log(
                    `Executing statement ${i + 1}/${statements.length}:`,
                    statement.substring(0, 100) + "...",
                  );
                  this.db.exec(statement + ";");
                } catch (stmtError) {
                  console.error(`Error in statement ${i + 1}:`, statement);
                  throw stmtError;
                }
              }
            }
          }
        } else {
          throw new Error(
            `SQLite initialization script not found at ${initScriptPath}`,
          );
        }
      }

      this.ensureModelTokenLimitColumn();
      this.ensureProviderOwnerColumn();
      this.ensureProviderVisibilityColumns();
      this.ensureProviderRateLimitColumns();
      this.ensureUserApiKeyRateLimitColumns();
      this.ensureDiscordUserIpColumns();
      this.ensureDiscordUserBannedColumn();
      this.ensureDiscordUserRolesColumn();
      this.ensureRequestLogsTable();
      this.ensureUserApiKeysTable();
      this.ensureUsageRecordsDiscordUserId();
      this.ensureUsageRecordsProviderTimestampIndex();
    } catch (error) {
      console.error("Error initializing database:", error);
      throw error;
    }
  }

  private ensureModelTokenLimitColumn(): void {
    const columns = this.db.prepare("PRAGMA table_info(models)").all() as {
      name: string;
    }[];
    if (columns.length === 0) return;
    const hasTokenLimit = columns.some(
      (column) => column.name === "token_limit",
    );
    if (!hasTokenLimit) {
      this.db.exec("ALTER TABLE models ADD COLUMN token_limit INTEGER");
    }
  }

  private ensureProviderOwnerColumn(): void {
    const columns = this.db.prepare("PRAGMA table_info(providers)").all() as {
      name: string;
    }[];
    if (columns.length === 0) return;
    const hasOwnerId = columns.some((column) => column.name === "owner_id");
    if (!hasOwnerId) {
      this.db.exec("ALTER TABLE providers ADD COLUMN owner_id TEXT");
    }
  }

  private ensureProviderVisibilityColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(providers)").all() as {
      name: string;
    }[];
    if (columns.length === 0) return;
    const hasVisibility = columns.some(
      (column) => column.name === "visibility",
    );
    if (!hasVisibility) {
      this.db.exec(
        "ALTER TABLE providers ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'",
      );
    }
    const hasAllowedRoles = columns.some(
      (column) => column.name === "allowed_roles",
    );
    if (!hasAllowedRoles) {
      this.db.exec("ALTER TABLE providers ADD COLUMN allowed_roles TEXT");
    }
  }

  private ensureProviderRateLimitColumns(): void {
    const columns = this.db
      .prepare("PRAGMA table_info(providers)")
      .all() as { name: string }[];
    if (columns.length === 0) return;
    const hasMaxRPD = columns.some((column) => column.name === "max_rpd");
    if (!hasMaxRPD) {
      this.db.exec("ALTER TABLE providers ADD COLUMN max_rpd INTEGER");
    }
    const hasMaxRPM = columns.some((column) => column.name === "max_rpm");
    if (!hasMaxRPM) {
      this.db.exec("ALTER TABLE providers ADD COLUMN max_rpm INTEGER");
    }
  }

  private ensureUserApiKeyRateLimitColumns(): void {
    const columns = this.db
      .prepare("PRAGMA table_info(user_api_keys)")
      .all() as { name: string }[];
    if (columns.length === 0) return;
    const hasMaxRPD = columns.some((column) => column.name === "max_rpd");
    if (!hasMaxRPD) {
      this.db.exec(
        "ALTER TABLE user_api_keys ADD COLUMN max_rpd REAL NOT NULL DEFAULT 1000",
      );
    }
    const hasMaxRPM = columns.some((column) => column.name === "max_rpm");
    if (!hasMaxRPM) {
      this.db.exec(
        "ALTER TABLE user_api_keys ADD COLUMN max_rpm REAL NOT NULL DEFAULT 60",
      );
    }
  }

  private ensureUsageRecordsProviderTimestampIndex(): void {
    const tableCheck = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='usage_records'",
      )
      .get();
    if (!tableCheck) {
      return;
    }
    const indexes = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_usage_records_provider_timestamp'",
      )
      .get();
    if (!indexes) {
      this.db.exec(
        "CREATE INDEX idx_usage_records_provider_timestamp ON usage_records(provider_id, timestamp)",
      );
    }
  }

  private ensureDiscordUserIpColumns(): void {
    const columns = this.db
      .prepare("PRAGMA table_info(discord_users)")
      .all() as { name: string }[];
    if (columns.length === 0) return;
    const hasIp = columns.some((column) => column.name === "ip");
    if (!hasIp) {
      this.db.exec("ALTER TABLE discord_users ADD COLUMN ip TEXT");
    }
    const hasLastIpUpdate = columns.some(
      (column) => column.name === "last_ip_update",
    );
    if (!hasLastIpUpdate) {
      this.db.exec(
        "ALTER TABLE discord_users ADD COLUMN last_ip_update INTEGER",
      );
    }
  }

  private ensureDiscordUserBannedColumn(): void {
    const columns = this.db
      .prepare("PRAGMA table_info(discord_users)")
      .all() as { name: string }[];
    if (columns.length === 0) return;
    const hasBanned = columns.some((column) => column.name === "banned");
    if (!hasBanned) {
      this.db.exec(
        "ALTER TABLE discord_users ADD COLUMN banned INTEGER DEFAULT 0",
      );
    }
    const hasBanReason = columns.some((column) => column.name === "ban_reason");
    if (!hasBanReason) {
      this.db.exec("ALTER TABLE discord_users ADD COLUMN ban_reason TEXT");
    }
  }

  private ensureDiscordUserRolesColumn(): void {
    const columns = this.db
      .prepare("PRAGMA table_info(discord_users)")
      .all() as { name: string }[];
    if (columns.length === 0) return;
    const hasRoles = columns.some((column) => column.name === "roles");
    if (!hasRoles) {
      this.db.exec(
        "ALTER TABLE discord_users ADD COLUMN roles TEXT DEFAULT '[\"user\"]'",
      );
      // Create index for roles column
      this.db.exec(
        "CREATE INDEX IF NOT EXISTS idx_discord_users_roles ON discord_users(roles)",
      );
    }
  }

  private ensureRequestLogsTable(): void {
    const tableCheck = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='request_logs'",
      )
      .get();
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
    const tableCheck = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='user_api_keys'",
      )
      .get();
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

  /**
   * Migrate usage_records from user_token_id to discord_user_id.
   * If the table still has the old column, rebuild it preserving data.
   * Old records that can't be mapped to a discord_user_id get NULL (kept for historical stats).
   */
  private ensureUsageRecordsDiscordUserId(): void {
    const tableCheck = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='usage_records'",
      )
      .get();
    if (!tableCheck) {
      // Fresh install — create with correct schema
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS usage_records (
          id TEXT PRIMARY KEY,
          discord_user_id TEXT NOT NULL,
          model_id TEXT,
          provider_id TEXT,
          tokens INTEGER DEFAULT 0,
          input_tokens INTEGER DEFAULT 0,
          output_tokens INTEGER DEFAULT 0,
          timestamp INTEGER NOT NULL,
          cost REAL NOT NULL DEFAULT 1.0,
          FOREIGN KEY (discord_user_id) REFERENCES discord_users(id) ON DELETE SET NULL,
          FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE SET NULL,
          FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_usage_records_discord_user_id ON usage_records(discord_user_id);
        CREATE INDEX IF NOT EXISTS idx_usage_records_timestamp ON usage_records(timestamp);
      `);
      return;
    }

    // Existing table — check if it has the old column
    const columns = this.db
      .prepare("PRAGMA table_info(usage_records)")
      .all() as { name: string }[];
    const hasDiscordUserId = columns.some(
      (col) => col.name === "discord_user_id",
    );
    if (hasDiscordUserId) return; // Already migrated

    console.log(
      "[MIGRATION] Migrating usage_records: user_token_id → discord_user_id...",
    );

    const fkResult = this.db.query("PRAGMA foreign_keys").get() as {
      foreign_keys: number;
    } | null;
    const fkWasOn = fkResult?.foreign_keys === 1;
    this.db.exec("PRAGMA foreign_keys = OFF");

    this.db.exec(`
      DROP TRIGGER IF EXISTS promote_child_usage_on_delete;
      DROP TRIGGER IF EXISTS nullify_parent_usage_on_delete;
      DROP TRIGGER IF EXISTS soft_delete_keys_on_provider_delete;
      DROP TRIGGER IF EXISTS cascade_soft_delete_to_subkeys;
      DROP TABLE IF EXISTS user_tokens;
    `);

    this.db.exec(`DROP TABLE IF EXISTS usage_records_new`);

    this.db.exec(`
      CREATE TABLE usage_records_new (
        id TEXT PRIMARY KEY,
        discord_user_id TEXT,
        model_id TEXT,
        provider_id TEXT,
        tokens INTEGER DEFAULT 0,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        timestamp INTEGER NOT NULL,
        cost REAL NOT NULL DEFAULT 1.0
      );

      INSERT INTO usage_records_new (id, discord_user_id, model_id, provider_id, tokens, input_tokens, output_tokens, timestamp, cost)
        SELECT id, NULL, model_id, provider_id, tokens, input_tokens, output_tokens, timestamp, cost
        FROM usage_records;

      DROP TABLE usage_records;
      ALTER TABLE usage_records_new RENAME TO usage_records;

      CREATE INDEX idx_usage_records_discord_user_id ON usage_records(discord_user_id);
      CREATE INDEX idx_usage_records_timestamp ON usage_records(timestamp);
    `);

    if (fkWasOn) this.db.exec("PRAGMA foreign_keys = ON");

    console.log("[MIGRATION] usage_records migration complete.");
  }

  private rowToProvider(row: any): Provider {
    return {
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
      customHeaders: row.custom_headers
        ? JSON.parse(row.custom_headers)
        : undefined,
      disableCacheDiscount: Boolean(row.disable_cache_discount),
      ownerId: row.owner_id ?? undefined,
      visibility: row.visibility || "public",
      allowedRoles: row.allowed_roles
        ? JSON.parse(row.allowed_roles)
        : undefined,
      maxRPD: row.max_rpd ?? null,
      maxRPM: row.max_rpm ?? null,
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

  private rowToUsageRecord(row: any): UsageRecord {
    return {
      id: row.id,
      discordUserId: row.discord_user_id,
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
      maxRPD: row.max_rpd ?? 1000,
      maxRPM: row.max_rpm ?? 60,
    };
  }

  // Provider methods go here, TODO, ADD LATER OMG COMMENTS
  async getProviders(): Promise<Provider[]> {
    try {
      const stmt = this.db.prepare("SELECT * FROM providers ORDER BY name");
      const rows = stmt.all();
      return rows.map(this.rowToProvider);
    } catch (error) {
      console.error("Error getting providers:", error);
      throw error;
    }
  }

  async getProvider(id: string): Promise<Provider | undefined> {
    try {
      const stmt = this.db.prepare("SELECT * FROM providers WHERE id = ?");
      const row = stmt.get(id);
      return row ? this.rowToProvider(row) : undefined;
    } catch (error) {
      console.error("Error getting provider:", error);
      throw error;
    }
  }

  async createProvider(provider: InsertProvider): Promise<Provider> {
    try {
      const id = randomUUID();
      const now = Date.now();

      const stmt = this.db.prepare(`
        INSERT INTO providers (id, name, base_url, enabled, created_at, custom_headers, disable_cache_discount, owner_id, visibility, allowed_roles, max_rpd, max_rpm)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        provider.name,
        provider.baseUrl,
        provider.enabled ? 1 : 0,
        now,
        provider.customHeaders ? JSON.stringify(provider.customHeaders) : null,
        provider.disableCacheDiscount ? 1 : 0,
        provider.ownerId || null,
        provider.visibility || "public",
        provider.allowedRoles ? JSON.stringify(provider.allowedRoles) : null,
        provider.maxRPD,
        provider.maxRPM,
      );

      const result = await this.getProvider(id);
      if (!result) {
        throw new Error(`Failed to create provider with ID: ${id}`);
      }
      return result;
    } catch (error) {
      console.error("Error creating provider:", error);
      throw error;
    }
  }

  async updateProvider(
    id: string,
    provider: Partial<InsertProvider>,
  ): Promise<Provider | undefined> {
    try {
      const existing = await this.getProvider(id);
      if (!existing) return undefined;

      const updates: string[] = [];
      const values: any[] = [];

      if (provider.name !== undefined) {
        updates.push("name = ?");
        values.push(provider.name);
      }
      if (provider.baseUrl !== undefined) {
        updates.push("base_url = ?");
        values.push(provider.baseUrl);
      }
      if (provider.enabled !== undefined) {
        updates.push("enabled = ?");
        values.push(provider.enabled ? 1 : 0);
      }
      if (provider.customHeaders !== undefined) {
        updates.push("custom_headers = ?");
        values.push(
          provider.customHeaders
            ? JSON.stringify(provider.customHeaders)
            : null,
        );
      }
      if (provider.disableCacheDiscount !== undefined) {
        updates.push("disable_cache_discount = ?");
        values.push(provider.disableCacheDiscount ? 1 : 0);
      }
      if (provider.ownerId !== undefined) {
        updates.push("owner_id = ?");
        values.push(provider.ownerId);
      }
      if (provider.visibility !== undefined) {
        updates.push("visibility = ?");
        values.push(provider.visibility);
      }
      if (provider.allowedRoles !== undefined) {
        updates.push("allowed_roles = ?");
        values.push(
          provider.allowedRoles ? JSON.stringify(provider.allowedRoles) : null,
        );
      }
      if (provider.maxRPD !== undefined) {
        updates.push("max_rpd = ?");
        values.push(provider.maxRPD);
      }
      if (provider.maxRPM !== undefined) {
        updates.push("max_rpm = ?");
        values.push(provider.maxRPM);
      }

      if (updates.length === 0) return existing;

      values.push(id);
      const stmt = this.db.prepare(
        `UPDATE providers SET ${updates.join(", ")} WHERE id = ?`,
      );
      stmt.run(...values);

      return this.getProvider(id);
    } catch (error) {
      console.error("Error updating provider:", error);
      throw error;
    }
  }

  async deleteProvider(id: string): Promise<boolean> {
    try {
      const stmt = this.db.prepare("DELETE FROM providers WHERE id = ?");
      const result = stmt.run(id);
      return result.changes > 0;
    } catch (error) {
      console.error("Error deleting provider:", error);
      throw error;
    }
  }

  // AP Key methods
  async getApiKeys(providerId: string): Promise<ApiKey[]> {
    try {
      const stmt = this.db.prepare(
        "SELECT * FROM api_keys WHERE provider_id = ? ORDER BY last_used DESC",
      );
      const rows = stmt.all(providerId);
      return rows.map(this.rowToApiKey);
    } catch (error) {
      console.error("Error getting API keys:", error);
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

      const getStmt = this.db.prepare("SELECT * FROM api_keys WHERE id = ?");
      const row = getStmt.get(id);
      return this.rowToApiKey(row);
    } catch (error) {
      console.error("Error creating API key:", error);
      throw error;
    }
  }

  async deleteApiKey(id: string): Promise<boolean> {
    try {
      const stmt = this.db.prepare("DELETE FROM api_keys WHERE id = ?");
      const result = stmt.run(id);
      return result.changes > 0;
    } catch (error) {
      console.error("Error deleting API key:", error);
      throw error;
    }
  }

  async updateApiKey(id: string, key: string): Promise<ApiKey | undefined> {
    try {
      const stmt = this.db.prepare("UPDATE api_keys SET key = ? WHERE id = ?");
      const result = stmt.run(key, id);

      if (result.changes === 0) return undefined;

      const getStmt = this.db.prepare("SELECT * FROM api_keys WHERE id = ?");
      const row = getStmt.get(id);
      return this.rowToApiKey(row);
    } catch (error) {
      console.error("Error updating API key:", error);
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
      console.error("Error getting next API key:", error);
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
      console.error("Error updating API key usage:", error);
      throw error;
    }
  }

  // Model methods
  async getModels(providerId?: string): Promise<Model[]> {
    try {
      let stmt;
      if (providerId) {
        stmt = this.db.prepare(
          "SELECT * FROM models WHERE provider_id = ? ORDER BY model_id",
        );
        const rows = stmt.all(providerId);
        return rows.map(this.rowToModel);
      } else {
        stmt = this.db.prepare(
          "SELECT * FROM models ORDER BY provider_id, model_id",
        );
        const rows = stmt.all();
        return rows.map(this.rowToModel);
      }
    } catch (error) {
      console.error("Error getting models:", error);
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
        model.tokenLimit ?? null,
      );

      const getStmt = this.db.prepare("SELECT * FROM models WHERE id = ?");
      const row = getStmt.get(id);
      return this.rowToModel(row);
    } catch (error) {
      console.error("Error creating model:", error);
      throw error;
    }
  }

  async updateModel(
    id: string,
    model: Partial<InsertModel>,
  ): Promise<Model | undefined> {
    try {
      const updates: string[] = [];
      const values: any[] = [];

      if (model.modelId !== undefined) {
        updates.push("model_id = ?");
        values.push(model.modelId);
      }
      if (model.enabled !== undefined) {
        updates.push("enabled = ?");
        values.push(model.enabled ? 1 : 0);
      }
      if (model.requestCost !== undefined) {
        updates.push("request_cost = ?");
        values.push(model.requestCost);
      }
      if (model.tokenLimit !== undefined) {
        updates.push("token_limit = ?");
        values.push(model.tokenLimit);
      }

      if (updates.length === 0) {
        const getStmt = this.db.prepare("SELECT * FROM models WHERE id = ?");
        const row = getStmt.get(id);
        return row ? this.rowToModel(row) : undefined;
      }

      values.push(id);
      const stmt = this.db.prepare(
        `UPDATE models SET ${updates.join(", ")} WHERE id = ?`,
      );
      stmt.run(...values);

      const getStmt = this.db.prepare("SELECT * FROM models WHERE id = ?");
      const row = getStmt.get(id);
      return row ? this.rowToModel(row) : undefined;
    } catch (error) {
      console.error("Error updating model:", error);
      throw error;
    }
  }

  async deleteModel(id: string): Promise<boolean> {
    try {
      const stmt = this.db.prepare("DELETE FROM models WHERE id = ?");
      const result = stmt.run(id);
      return result.changes > 0;
    } catch (error) {
      console.error("Error deleting model:", error);
      throw error;
    }
  }

  async deleteModelsByProvider(providerId: string): Promise<void> {
    try {
      const stmt = this.db.prepare("DELETE FROM models WHERE provider_id = ?");
      stmt.run(providerId);
    } catch (error) {
      console.error("Error deleting models by provider:", error);
      throw error;
    }
  }

  async replaceProviderModels(
    providerId: string,
    modelIds: string[],
  ): Promise<Model[]> {
    const transaction = this.db.transaction(() => {
      try {
        // Get existing models for this provider
        const existingStmt = this.db.prepare(
          "SELECT * FROM models WHERE provider_id = ?",
        );
        const existingModels = existingStmt
          .all(providerId)
          .map(this.rowToModel);

        // Create a Set of new model IDs for quick lookup
        const newModelIdSet = new Set(modelIds);

        // Create a Map of existing models by modelId
        const existingModelMap = new Map(
          existingModels.map((m) => [m.modelId, m]),
        );

        const resultModels: Model[] = [];

        // Process new models: add if they don't exist, re-enable if they do
        for (const modelId of modelIds) {
          const existing = existingModelMap.get(modelId);

          if (existing) {
            // Model exists - if it was disabled, re-enable it (model came back!)
            if (!existing.enabled) {
              const updateStmt = this.db.prepare(
                "UPDATE models SET enabled = 1 WHERE id = ?",
              );
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
            const updateStmt = this.db.prepare(
              "UPDATE models SET enabled = 0 WHERE id = ?",
            );
            updateStmt.run(existing.id);

            resultModels.push({
              ...existing,
              enabled: false,
            });
          }
        }

        return resultModels;
      } catch (error) {
        console.error("Error in replaceProviderModels transaction:", error);
        throw error;
      }
    });

    return transaction();
  }

  async updateModelsByProvider(
    providerId: string,
    updates: Partial<InsertModel>,
  ): Promise<Model[]> {
    const transaction = this.db.transaction(() => {
      try {
        const updateFields: string[] = [];
        const values: any[] = [];

        if (updates.enabled !== undefined) {
          updateFields.push("enabled = ?");
          values.push(updates.enabled ? 1 : 0);
        }
        if (updates.requestCost !== undefined) {
          updateFields.push("request_cost = ?");
          values.push(updates.requestCost);
        }
        if (updates.tokenLimit !== undefined) {
          updateFields.push("token_limit = ?");
          values.push(updates.tokenLimit);
        }

        if (updateFields.length === 0) {
          const getStmt = this.db.prepare(
            "SELECT * FROM models WHERE provider_id = ?",
          );
          const rows = getStmt.all(providerId);
          return rows.map(this.rowToModel);
        }

        values.push(providerId);
        const stmt = this.db.prepare(`
          UPDATE models SET ${updateFields.join(", ")}
          WHERE provider_id = ?
        `);
        stmt.run(...values);

        const getStmt = this.db.prepare(
          "SELECT * FROM models WHERE provider_id = ?",
        );
        const rows = getStmt.all(providerId);
        return rows.map(this.rowToModel);
      } catch (error) {
        console.error("Error in updateModelsByProvider transaction:", error);
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

  async updateCostAllModelsByProvider(
    providerId: string,
    requestCost: number,
  ): Promise<Model[]> {
    return this.updateModelsByProvider(providerId, { requestCost });
  }

  async bulkUpdateModelsByIds(
    updates: Array<{
      id: string;
      enabled?: boolean;
      requestCost?: number;
      tokenLimit?: number | null;
    }>,
  ): Promise<Model[]> {
    const transaction = this.db.transaction(() => {
      try {
        // Execute all updates within the transaction
        for (const update of updates) {
          const updateFields: string[] = [];
          const values: any[] = [];

          if (typeof update.enabled === "boolean") {
            updateFields.push("enabled = ?");
            values.push(update.enabled ? 1 : 0);
          }
          if (typeof update.requestCost === "number") {
            updateFields.push("request_cost = ?");
            values.push(update.requestCost);
          }
          if (update.tokenLimit !== undefined) {
            updateFields.push("token_limit = ?");
            values.push(update.tokenLimit);
          }

          if (updateFields.length === 0) {
            continue;
          }

          const updateStmt = this.db.prepare(
            `UPDATE models SET ${updateFields.join(", ")} WHERE id = ?`,
          );
          updateStmt.run(...values, update.id);
        }

        // Fetch and return all updated models
        const modelIds = updates.map((u) => u.id);
        const placeholders = modelIds.map(() => "?").join(",");
        const getStmt = this.db.prepare(
          `SELECT * FROM models WHERE id IN (${placeholders})`,
        );
        const rows = getStmt.all(...modelIds);

        return rows.map(this.rowToModel);
      } catch (error) {
        console.error("Error in bulkUpdateModelsByIds transaction:", error);
        throw error;
      }
    });

    return transaction();
  }

  async createUsageRecord(record: InsertUsageRecord): Promise<UsageRecord> {
    try {
      const id = randomUUID();
      const now = Date.now();

      const modelCheck = this.db
        .prepare("SELECT id FROM models WHERE id = ?")
        .get(record.modelId);
      const providerCheck = this.db
        .prepare("SELECT id FROM providers WHERE id = ?")
        .get(record.providerId);

      if (!modelCheck) {
        throw new Error(
          `Foreign key constraint failed: model_id '${record.modelId}' does not exist in models table`,
        );
      }

      if (!providerCheck) {
        throw new Error(
          `Foreign key constraint failed: provider_id '${record.providerId}' does not exist in providers table`,
        );
      }

      const stmt = this.db.prepare(`
        INSERT INTO usage_records(
        id, discord_user_id, model_id, provider_id, tokens, input_tokens,
        output_tokens, timestamp, cost
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

      stmt.run(
        id,
        record.discordUserId,
        record.modelId,
        record.providerId,
        record.tokens || 0,
        record.inputTokens || 0,
        record.outputTokens || 0,
        now,
        record.cost || 1,
      );

      const getStmt = this.db.prepare(
        "SELECT * FROM usage_records WHERE id = ?",
      );
      const row = getStmt.get(id);
      return this.rowToUsageRecord(row);
    } catch (error) {
      console.error("Error creating usage record:", error);
      throw error;
    }
  }

  async getUsageRecords(discordUserId: string): Promise<UsageRecord[]> {
    try {
      const stmt = this.db.prepare(
        "SELECT * FROM usage_records WHERE discord_user_id = ? ORDER BY timestamp DESC",
      );
      const rows = stmt.all(discordUserId);
      return rows.map(this.rowToUsageRecord);
    } catch (error) {
      console.error("Error getting usage records:", error);
      throw error;
    }
  }

  async getTodayUsageCount(discordUserId: string): Promise<number> {
    try {
      const now = new Date();
      const today = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
      );

      const stmt = this.db.prepare(`
        SELECT COALESCE(SUM(cost), 0) as total_cost
        FROM usage_records
        WHERE discord_user_id = ? AND timestamp >= ?
      `);
      const result = stmt.get(discordUserId, today) as { total_cost: number };

      return Number(result.total_cost.toFixed(2));
    } catch (error) {
      console.error("Error getting today usage count:", error);
      throw error;
    }
  }

  async getMinuteUsageCount(discordUserId: string): Promise<number> {
    try {
      const oneMinuteAgo = Date.now() - 60000;

      const stmt = this.db.prepare(`
        SELECT COALESCE(SUM(cost), 0) as total_cost
        FROM usage_records
        WHERE discord_user_id = ? AND timestamp >= ?
      `);
      const result = stmt.get(discordUserId, oneMinuteAgo) as {
        total_cost: number;
      };

      return Number(result.total_cost.toFixed(2));
    } catch (error) {
      console.error("Error getting minute usage count:", error);
      throw error;
    }
  }

  async getProviderTodayUsageCount(providerId: string): Promise<number> {
    try {
      const now = new Date();
      const today = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
      );

      const stmt = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM usage_records
        WHERE provider_id = ? AND timestamp >= ?
      `);
      const result = stmt.get(providerId, today) as { count: number };

      return result.count;
    } catch (error) {
      console.error("Error getting provider today usage count:", error);
      throw error;
    }
  }

  async getProviderMinuteUsageCount(providerId: string): Promise<number> {
    try {
      const oneMinuteAgo = Date.now() - 60000;

      const stmt = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM usage_records
        WHERE provider_id = ? AND timestamp >= ?
      `);
      const result = stmt.get(providerId, oneMinuteAgo) as { count: number };

      return result.count;
    } catch (error) {
      console.error("Error getting provider minute usage count:", error);
      throw error;
    }
  }

  // Stats methods
  async getStats(): Promise<Stats> {
    try {
      const totalTokensStmt = this.db.prepare(
        "SELECT CAST(value AS INTEGER) as value FROM system_config WHERE key = ?",
      );
      const totalTokensResult = totalTokensStmt.get("total_tokens_all") as
        | { value: number }
        | undefined;
      const totalTokens = totalTokensResult?.value || 0;

      const totalRequestsStmt = this.db.prepare(
        "SELECT CAST(value AS INTEGER) as value FROM system_config WHERE key = ?",
      );
      const totalRequestsResult = totalRequestsStmt.get(
        "total_requests_all",
      ) as { value: number } | undefined;
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
      console.error("Error getting stats:", error);
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
      const stmt = this.db.prepare("SELECT * FROM admins WHERE username = ?");
      const row = stmt.get(username);
      if (!row) return undefined;

      return {
        id: (row as any).id,
        username: (row as any).username,
        password: (row as any).password,
        createdAt: (row as any).created_at,
      };
    } catch (error) {
      console.error("Error getting admin:", error);
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
      console.error("Error creating admin:", error);
      throw error;
    }
  }

  // Discord User methods
  async getDiscordUser(id: string): Promise<DiscordUser | undefined> {
    try {
      const stmt = this.db.prepare("SELECT * FROM discord_users WHERE id = ?");
      const row = stmt.get(id);
      return row ? this.rowToDiscordUser(row) : undefined;
    } catch (error) {
      console.error("Error getting Discord user:", error);
      throw error;
    }
  }

  async getDiscordUsers(): Promise<DiscordUser[]> {
    try {
      const stmt = this.db.prepare(
        "SELECT * FROM discord_users ORDER BY last_login_at DESC",
      );
      const rows = stmt.all();
      return rows.map(this.rowToDiscordUser);
    } catch (error) {
      console.error("Error getting Discord users:", error);
      throw error;
    }
  }

  async createDiscordUser(user: InsertDiscordUser): Promise<DiscordUser> {
    try {
      const now = Date.now();
      const roles =
        user.roles && user.roles.length > 0
          ? JSON.stringify(user.roles)
          : '["user"]';

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
        roles,
      );

      const result = await this.getDiscordUser(user.id);
      if (!result) {
        throw new Error(`Failed to create Discord user with ID: ${user.id}`);
      }
      return result;
    } catch (error) {
      console.error("Error creating Discord user:", error);
      throw error;
    }
  }

  async isIpAuthorized(ip: string): Promise<boolean> {
    try {
      const stmt = this.db.prepare(
        "SELECT 1 FROM discord_users WHERE ip = ? AND banned = 0",
      );
      const row = stmt.get(ip);
      return !!row;
    } catch (error) {
      console.error("Error checking authorized IP:", error);
      throw error;
    }
  }

  async banDiscordUser(
    id: string,
    reason?: string,
  ): Promise<DiscordUser | undefined> {
    return this.updateDiscordUser(id, {
      banned: true,
      banReason: reason || "Dictatorship",
    });
  }

  async unbanDiscordUser(id: string): Promise<DiscordUser | undefined> {
    return this.updateDiscordUser(id, { banned: false, banReason: undefined });
  }

  async updateDiscordUser(
    id: string,
    user: Partial<InsertDiscordUser>,
  ): Promise<DiscordUser | undefined> {
    try {
      const existing = await this.getDiscordUser(id);
      if (!existing) return undefined;

      const updates: string[] = [];
      const values: any[] = [];

      if (user.username !== undefined) {
        updates.push("username = ?");
        values.push(user.username);
      }
      if (user.discriminator !== undefined) {
        updates.push("discriminator = ?");
        values.push(user.discriminator);
      }
      if (user.globalName !== undefined) {
        updates.push("global_name = ?");
        values.push(user.globalName);
      }
      if (user.avatar !== undefined) {
        updates.push("avatar = ?");
        values.push(user.avatar);
      }
      if (user.ip !== undefined) {
        updates.push("ip = ?");
        values.push(user.ip);
      }
      if (user.lastIpUpdate !== undefined) {
        updates.push("last_ip_update = ?");
        values.push(user.lastIpUpdate);
      }
      if (user.banned !== undefined) {
        updates.push("banned = ?");
        values.push(user.banned ? 1 : 0);
      }
      if (user.banReason !== undefined) {
        updates.push("ban_reason = ?");
        values.push(user.banReason);
      }
      if (user.roles !== undefined) {
        updates.push("roles = ?");
        values.push(JSON.stringify(user.roles));
      }

      // Always update lastLoginAt
      updates.push("last_login_at = ?");
      values.push(Date.now());

      if (updates.length === 0) return existing;

      values.push(id);
      const stmt = this.db.prepare(
        `UPDATE discord_users SET ${updates.join(", ")} WHERE id = ?`,
      );
      stmt.run(...values);

      return this.getDiscordUser(id);
    } catch (error) {
      console.error("Error updating Discord user:", error);
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
        log.latency,
      );

      const getStmt = this.db.prepare(
        "SELECT * FROM request_logs WHERE id = ?",
      );
      const row = getStmt.get(id);
      return this.rowToRequestLog(row);
    } catch (error) {
      console.error("Error creating request log:", error);
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

      let whereClause = "";
      const params: any[] = [];

      const conditions: string[] = [];

      if (options?.search) {
        conditions.push(
          "(rl.ip LIKE ? OR du.username LIKE ? OR du.global_name LIKE ?)",
        );
        const searchPattern = `%${options.search}%`;
        params.push(searchPattern, searchPattern, searchPattern);
      }

      if (options?.modelId) {
        conditions.push("rl.model_id = ?");
        params.push(options.modelId);
      }

      if (options?.providerId) {
        conditions.push("rl.provider_id = ?");
        params.push(options.providerId);
      }

      if (conditions.length > 0) {
        whereClause = "WHERE " + conditions.join(" AND ");
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
      console.error("Error getting request logs:", error);
      throw error;
    }
  }

  // User API Key methods
  async getUserApiKey(userId: string): Promise<UserApiKey | undefined> {
    try {
      const stmt = this.db.prepare(
        "SELECT * FROM user_api_keys WHERE user_id = ?",
      );
      const row = stmt.get(userId);
      return row ? this.rowToUserApiKey(row) : undefined;
    } catch (error) {
      console.error("Error getting user API key:", error);
      throw error;
    }
  }

  async getUserApiKeyByKey(apiKey: string): Promise<UserApiKey | undefined> {
    try {
      const stmt = this.db.prepare(
        "SELECT * FROM user_api_keys WHERE api_key = ?",
      );
      const row = stmt.get(apiKey);
      return row ? this.rowToUserApiKey(row) : undefined;
    } catch (error) {
      console.error("Error getting user API key by key:", error);
      throw error;
    }
  }

  async getUserApiKeysByUserId(userId: string): Promise<UserApiKey[]> {
    try {
      const stmt = this.db.prepare(
        "SELECT * FROM user_api_keys WHERE user_id = ? ORDER BY created_at DESC",
      );
      const rows = stmt.all(userId);
      return rows.map(this.rowToUserApiKey.bind(this));
    } catch (error) {
      console.error("Error getting user API keys by user ID:", error);
      throw error;
    }
  }

  async createUserApiKey(userId: string): Promise<UserApiKey> {
    try {
      const id = randomUUID();
      const apiKey = "sk_sp_" + randomUUID().replace(/-/g, "");
      const now = Date.now();

      const stmt = this.db.prepare(`
        INSERT INTO user_api_keys (id, user_id, api_key, created_at, max_rpd, max_rpm)
        VALUES (?, ?, ?, ?, 250, 10)
      `);

      stmt.run(id, userId, apiKey, now);

      const getStmt = this.db.prepare(
        "SELECT * FROM user_api_keys WHERE id = ?",
      );
      const row = getStmt.get(id);
      return this.rowToUserApiKey(row);
    } catch (error) {
      console.error("Error creating user API key:", error);
      throw error;
    }
  }

  async rotateUserApiKey(id: string): Promise<UserApiKey | undefined> {
    try {
      const newKey = "sk_sp_" + randomUUID().replace(/-/g, "");
      const now = Date.now();
      const stmt = this.db.prepare(
        "UPDATE user_api_keys SET api_key = ?, last_rotated_at = ? WHERE id = ?",
      );
      const result = stmt.run(newKey, now, id);
      if (result.changes === 0) return undefined;
      const getStmt = this.db.prepare(
        "SELECT * FROM user_api_keys WHERE id = ?",
      );
      const row = getStmt.get(id);
      return row ? this.rowToUserApiKey(row) : undefined;
    } catch (error) {
      console.error("Error rotating user API key:", error);
      throw error;
    }
  }

  async updateUserApiKeyRateLimits(
    id: string,
    maxRPD: number,
    maxRPM: number,
  ): Promise<UserApiKey | undefined> {
    try {
      const stmt = this.db.prepare(
        "UPDATE user_api_keys SET max_rpd = ?, max_rpm = ? WHERE id = ?",
      );
      const result = stmt.run(maxRPD, maxRPM, id);
      if (result.changes === 0) return undefined;
      const getStmt = this.db.prepare(
        "SELECT * FROM user_api_keys WHERE id = ?",
      );
      const row = getStmt.get(id);
      return row ? this.rowToUserApiKey(row) : undefined;
    } catch (error) {
      console.error("Error updating user API key rate limits:", error);
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}
