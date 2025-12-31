import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import * as path from "path";

export interface ProviderAccount {
  id: string;
  username: string;
  password: string;
  sessionToken?: string;
  createdAt: number;
}

export class ProviderAuthStorage {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const databasePath = dbPath || path.join(process.cwd(), "providers.db");
    this.db = new Database(databasePath);
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS provider_accounts (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        session_token TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_provider_accounts_username ON provider_accounts(username);
      CREATE INDEX IF NOT EXISTS idx_provider_accounts_session ON provider_accounts(session_token);
    `);
  }

  private rowToProvider(row: any): ProviderAccount {
    return {
      id: row.id,
      username: row.username,
      password: row.password,
      sessionToken: row.session_token ?? undefined,
      createdAt: row.created_at,
    };
  }

  getProviderByUsername(username: string): ProviderAccount | undefined {
    const row = this.db.prepare("SELECT * FROM provider_accounts WHERE username = ?").get(username);
    return row ? this.rowToProvider(row) : undefined;
  }

  getProviderById(id: string): ProviderAccount | undefined {
    const row = this.db.prepare("SELECT * FROM provider_accounts WHERE id = ?").get(id);
    return row ? this.rowToProvider(row) : undefined;
  }

  getProviderBySessionToken(sessionToken: string): ProviderAccount | undefined {
    const row = this.db.prepare("SELECT * FROM provider_accounts WHERE session_token = ?").get(sessionToken);
    return row ? this.rowToProvider(row) : undefined;
  }

  getProviderAccounts(): ProviderAccount[] {
    const rows = this.db.prepare("SELECT * FROM provider_accounts ORDER BY created_at DESC").all();
    return rows.map((row) => this.rowToProvider(row));
  }

  createProviderAccount(username: string, passwordHash: string): ProviderAccount {
    const id = randomUUID();
    const createdAt = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO provider_accounts (id, username, password, created_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, username, passwordHash, createdAt);
    return {
      id,
      username,
      password: passwordHash,
      createdAt,
    };
  }

  updateProviderAccount(id: string, updates: { username?: string; passwordHash?: string; clearSession?: boolean }): ProviderAccount | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.username !== undefined) {
      fields.push("username = ?");
      values.push(updates.username);
    }
    if (updates.passwordHash !== undefined) {
      fields.push("password = ?");
      values.push(updates.passwordHash);
    }
    if (updates.clearSession) {
      fields.push("session_token = NULL");
    }

    if (fields.length === 0) {
      return this.getProviderById(id);
    }

    const stmt = this.db.prepare(`UPDATE provider_accounts SET ${fields.join(", ")} WHERE id = ?`);
    stmt.run(...values, id);
    return this.getProviderById(id);
  }

  deleteProviderAccount(id: string): boolean {
    const stmt = this.db.prepare("DELETE FROM provider_accounts WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  setProviderSession(id: string, sessionToken: string): void {
    const stmt = this.db.prepare("UPDATE provider_accounts SET session_token = ? WHERE id = ?");
    stmt.run(sessionToken, id);
  }

  clearProviderSession(id: string): void {
    const stmt = this.db.prepare("UPDATE provider_accounts SET session_token = NULL WHERE id = ?");
    stmt.run(id);
  }
}

export const providerAuthStorage = new ProviderAuthStorage();
