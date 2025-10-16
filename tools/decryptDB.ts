/**
 * Database Decryption Utility
 *
 * This utility provides functions to decrypt the database.json file
 * for external use (e.g., Discord bots, analytics tools, etc.)
 */

import { createDecipheriv, scryptSync } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Database type definitions
export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  createdAt: number;
  customHeaders?: Record<string, string>;
  disableCacheDiscount?: boolean;
}

export interface ApiKey {
  id: string;
  providerId: string;
  key: string;
  lastUsed: number;
  requestCount: number;
}

export interface Model {
  id: string;
  providerId: string;
  modelId: string;
  enabled: boolean;
  requestCost: number;
}

export interface UserToken {
  id: string;
  name: string;
  token: string;
  maxRPD: number;
  maxRPM: number;
  createdAt: number;
  allowedProviders?: string[];
}

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

export interface Database {
  providers: Provider[];
  apiKeys: ApiKey[];
  models: Model[];
  userTokens: UserToken[];
  usageRecords: UsageRecord[];
  authMode: "user_tokens" | "general_password" | "no_auth";
  generalPassword?: string;
}

// Encryption constants (must match server/storage.ts)
const FIXED_IV = '0123456789abcdef';
const FIXED_SALT = 'salt';
const KEY_LENGTH = 32;

/**
 * Derives the encryption key from the password using scrypt
 * @param password - The DB_ENCRYPTION_KEY value from .env
 * @returns Buffer containing the derived encryption key
 */
export function deriveKey(password: string): Buffer {
  return scryptSync(password, FIXED_SALT, KEY_LENGTH);
}

/**
 * Decrypts an encrypted hex string using AES-256-CBC
 * @param encryptedHex - The encrypted data in hex format
 * @param encryptionKey - The derived encryption key (Buffer)
 * @returns Decrypted string
 */
export function decryptData(encryptedHex: string, encryptionKey: Buffer): string {
  try {
    const iv = Buffer.from(FIXED_IV);
    const decipher = createDecipheriv('aes-256-cbc', encryptionKey, iv);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypts the database.json file and parses it as JSON
 * @param encryptedData - The encrypted hex string from database.json
 * @param password - The DB_ENCRYPTION_KEY value from .env
 * @returns Parsed database object
 */
export function decryptDatabase(encryptedData: string, password: string): Database {
  const encryptionKey = deriveKey(password);
  const decryptedJson = decryptData(encryptedData, encryptionKey);

  try {
    return JSON.parse(decryptedJson) as Database;
  } catch (error) {
    throw new Error(`Failed to parse decrypted data as JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Loads and decrypts the database.json file from disk
 * @param password - The DB_ENCRYPTION_KEY value from .env
 * @param dbPath - Optional custom path to database.json (defaults to ./database.json from cwd)
 * @returns Parsed database object
 */
export function loadDatabase(password: string, dbPath?: string): Database {
  const databasePath = dbPath || path.join(process.cwd(), 'database.json');

  if (!fs.existsSync(databasePath)) {
    throw new Error(`Database file not found at: ${databasePath}`);
  }

  const encryptedData = fs.readFileSync(databasePath, 'utf8').trim();

  if (!encryptedData) {
    throw new Error('Database file is empty');
  }

  return decryptDatabase(encryptedData, password);
}

/**
 * Convenience function to load database using environment variable
 * Requires DB_ENCRYPTION_KEY to be set in process.env
 * @param dbPath - Optional custom path to database.json
 * @returns Parsed database object
 */
export function loadDatabaseFromEnv(dbPath?: string): Database {
  const password = process.env.DB_ENCRYPTION_KEY;

  if (!password) {
    throw new Error('DB_ENCRYPTION_KEY environment variable is not set');
  }

  return loadDatabase(password, dbPath);
}

// Example usage (commented out)
/*
// Method 1: Using environment variable
import { loadDatabaseFromEnv } from './tools/decryptDB';

const db = loadDatabaseFromEnv();
console.log('Providers:', db.providers);
console.log('User Tokens:', db.userTokens);

// Method 2: Using explicit password
import { loadDatabase } from './tools/decryptDB';

const db = loadDatabase('your-encryption-key-here');
console.log('Models:', db.models);

// Method 3: Decrypt custom data
import { decryptDatabase } from './tools/decryptDB';

const encryptedData = 'abc123...'; // hex string
const db = decryptDatabase(encryptedData, 'your-key');
*/
