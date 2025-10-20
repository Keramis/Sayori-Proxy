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

// Encryption constants
const KEY_LENGTH = 32;
const OLD_FIXED_IV = '0123456789abcdef'; // For backwards compatibility

/**
 * Derives the encryption key from the password using scrypt
 * @param password - The DB_ENCRYPTION_KEY value from .env
 * @param salt - The SCRYPT_SALT value from .env
 * @returns Buffer containing the derived encryption key
 */
export function deriveKey(password: string, salt: string): Buffer {
  return scryptSync(password, salt, KEY_LENGTH);
}

/**
 * Decrypts an encrypted hex string using AES-256-CBC
 * @param encryptedText - The encrypted data in hex format (can be new iv:data format or old format)
 * @param encryptionKey - The derived encryption key (Buffer)
 * @returns Decrypted string
 */
export function decryptData(encryptedText: string, encryptionKey: Buffer): string {
  try {
    const parts = encryptedText.split(':');
    if (parts.length === 2 && parts[0].length === 32) { // New format: IV:Ciphertext
      const iv = Buffer.from(parts[0], 'hex');
      const encryptedData = parts[1];
      const decipher = createDecipheriv('aes-256-cbc', encryptionKey, iv);
      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } else { // Old format: Just Ciphertext with fixed IV
      const iv = Buffer.from(OLD_FIXED_IV);
      const decipher = createDecipheriv('aes-256-cbc', encryptionKey, iv);
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypts the database.json file and parses it as JSON
 * @param encryptedData - The encrypted hex string from database.json
 * @param password - The DB_ENCRYPTION_KEY value from .env
 * @param salt - The SCRYPT_SALT value from .env
 * @returns Parsed database object
 */
export function decryptDatabase(encryptedData: string, password: string, salt: string): Database {
  const encryptionKey = deriveKey(password, salt);
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
 * @param salt - The SCRYPT_SALT value from .env
 * @param dbPath - Optional custom path to database.json (defaults to ./database.json from cwd)
 * @returns Parsed database object
 */
export function loadDatabase(password: string, salt: string, dbPath?: string): Database {
  const databasePath = dbPath || path.join(process.cwd(), 'database.json');

  if (!fs.existsSync(databasePath)) {
    throw new Error(`Database file not found at: ${databasePath}`);
  }

  const encryptedData = fs.readFileSync(databasePath, 'utf8').trim();

  if (!encryptedData) {
    throw new Error('Database file is empty');
  }

  return decryptDatabase(encryptedData, password, salt);
}

/**
 * Convenience function to load database using environment variable
 * Requires DB_ENCRYPTION_KEY and SCRYPT_SALT to be set in process.env
 * @param dbPath - Optional custom path to database.json
 * @returns Parsed database object
 */
export function loadDatabaseFromEnv(dbPath?: string): Database {
  const password = process.env.DB_ENCRYPTION_KEY;
  const salt = process.env.SCRYPT_SALT;

  if (!password) {
    throw new Error('DB_ENCRYPTION_KEY environment variable is not set');
  }
  if (!salt) {
    throw new Error('SCRYPT_SALT environment variable is not set');
  }

  return loadDatabase(password, salt, dbPath);
}

