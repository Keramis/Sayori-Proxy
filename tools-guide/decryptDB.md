# Database Decryption Utility Guide

**File Location:** `tools/decryptDB.ts`

This utility provides functions to decrypt and read the `database.json` file for external applications like Discord bots, analytics tools, monitoring services, or any other integrations that need access to Sayori Proxy's database.

---

## Table of Contents

1. [Overview](#overview)
2. [Installation & Setup](#installation--setup)
3. [Quick Start Examples](#quick-start-examples)
4. [Function Reference](#function-reference)
5. [Data Types](#data-types)
6. [Real-World Use Cases](#real-world-use-cases)
7. [Error Handling](#error-handling)

---

## Overview

The Sayori Proxy stores all data in an encrypted JSON file (`database.json`). This encryption uses:

- **Algorithm:** AES-256-CBC
- **Key Derivation:** scrypt with fixed salt `"salt"` and 32-byte key length
- **IV (Initialization Vector):** Fixed value `"0123456789abcdef"`
- **Format:** Encrypted data stored as hexadecimal string

The decryption utility allows external applications to read this database without needing to run HTTP requests to the Sayori Proxy server.

---

## Installation & Setup

### 1. Copy the Utility to Your Project

```bash
# From your Discord bot or external application
cp /path/to/Sayori-Proxy/tools/decryptDB.ts ./src/utils/
```

### 2. Set Environment Variable

Add your database encryption key to your `.env` file:

```env
DB_ENCRYPTION_KEY=your-encryption-key-here
```

**Important:** This must be the **same key** used by Sayori Proxy server.

### 3. Ensure Database Access

Your application needs file system access to `database.json`:

```bash
# Option 1: Shared file system (both apps on same machine)
# Both apps can access /path/to/Sayori-Proxy/database.json

# Option 2: Symlink
ln -s /path/to/Sayori-Proxy/database.json ./database.json

# Option 3: Set custom path in code
const db = loadDatabaseFromEnv('/path/to/Sayori-Proxy/database.json');
```

---

## Quick Start Examples

### Example 1: Load Database (Recommended)

```typescript
import { loadDatabaseFromEnv } from './utils/decryptDB';

// Load using DB_ENCRYPTION_KEY from environment
const db = loadDatabaseFromEnv();

console.log('Total Providers:', db.providers.length);
console.log('Total User Tokens:', db.userTokens.length);
console.log('Total Usage Records:', db.usageRecords.length);
```

### Example 2: Get User Token Stats

```typescript
import { loadDatabaseFromEnv } from './utils/decryptDB';

function getUserStats(tokenString: string) {
  const db = loadDatabaseFromEnv();

  // Find the user token
  const userToken = db.userTokens.find(t => t.token === tokenString);

  if (!userToken) {
    throw new Error('Token not found');
  }

  // Calculate today's usage
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const todayRecords = db.usageRecords.filter(r =>
    r.userTokenId === userToken.id &&
    r.timestamp >= todayStart
  );

  const totalUsedToday = todayRecords.reduce((sum, r) => sum + r.cost, 0);
  const remainingToday = userToken.maxRPD - totalUsedToday;

  return {
    name: userToken.name,
    usedToday: totalUsedToday,
    maxRPD: userToken.maxRPD,
    remainingToday: remainingToday,
    maxRPM: userToken.maxRPM,
    totalRequests: todayRecords.length,
  };
}

// Usage
const stats = getUserStats('sk_3a73410...');
console.log(stats);
// Output:
// {
//   name: 'Tooru',
//   usedToday: 45.5,
//   maxRPD: 10000,
//   remainingToday: 9954.5,
//   maxRPM: 10,
//   totalRequests: 12
// }
```

### Example 3: Discord Bot Integration

```typescript
import { SlashCommandBuilder } from 'discord.js';
import { loadDatabaseFromEnv } from './utils/decryptDB';

export const data = new SlashCommandBuilder()
  .setName('mystats')
  .setDescription('Check your API usage stats')
  .addStringOption(option =>
    option.setName('token')
      .setDescription('Your API token')
      .setRequired(true)
  );

export async function execute(interaction) {
  const tokenInput = interaction.options.getString('token');

  try {
    const db = loadDatabaseFromEnv();
    const userToken = db.userTokens.find(t => t.token === tokenInput);

    if (!userToken) {
      return interaction.reply({
        content: 'Token not found!',
        ephemeral: true
      });
    }

    // Calculate usage
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const todayRecords = db.usageRecords.filter(r =>
      r.userTokenId === userToken.id && r.timestamp >= todayStart
    );
    const usedToday = todayRecords.reduce((sum, r) => sum + r.cost, 0);

    await interaction.reply({
      embeds: [{
        title: `📊 Stats for ${userToken.name}`,
        color: 0x3498db,
        fields: [
          {
            name: 'Daily Usage',
            value: `${usedToday.toFixed(2)} / ${userToken.maxRPD}`,
            inline: true
          },
          {
            name: 'Remaining',
            value: `${(userToken.maxRPD - usedToday).toFixed(2)}`,
            inline: true
          },
          {
            name: 'Rate Limit',
            value: `${userToken.maxRPM} req/min`,
            inline: true
          },
          {
            name: 'Requests Today',
            value: `${todayRecords.length}`,
            inline: true
          },
        ],
        timestamp: new Date().toISOString(),
      }],
      ephemeral: true
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    await interaction.reply({
      content: 'Failed to fetch stats. Please try again later.',
      ephemeral: true
    });
  }
}
```

---

## Function Reference

### `deriveKey(password: string): Buffer`

Derives an encryption key from a password using the scrypt algorithm.

**Parameters:**
- `password` (string): The encryption password (same as `DB_ENCRYPTION_KEY`)

**Returns:**
- `Buffer`: A 32-byte encryption key

**Example:**
```typescript
import { deriveKey } from './utils/decryptDB';

const password = 'my-secret-password';
const key = deriveKey(password);

console.log('Key length:', key.length); // Output: 32
console.log('Key type:', key instanceof Buffer); // Output: true
```

---

### `decryptData(encryptedHex: string, encryptionKey: Buffer): string`

Decrypts an AES-256-CBC encrypted hexadecimal string.

**Parameters:**
- `encryptedHex` (string): The encrypted data in hexadecimal format
- `encryptionKey` (Buffer): The derived 32-byte encryption key

**Returns:**
- `string`: Decrypted plaintext (JSON string)

**Throws:**
- `Error`: If decryption fails

**Example:**
```typescript
import { decryptData, deriveKey } from './utils/decryptDB';

const encryptedHex = 'abc123def456...'; // Hex string from database.json
const key = deriveKey('my-password');

const decrypted = decryptData(encryptedHex, key);
console.log('Decrypted:', decrypted); // Output: JSON string
```

---

### `decryptDatabase(encryptedData: string, password: string): Database`

Decrypts encrypted database data and parses it as JSON.

**Parameters:**
- `encryptedData` (string): The encrypted hex string from `database.json`
- `password` (string): The `DB_ENCRYPTION_KEY` value

**Returns:**
- `Database`: Parsed database object with all data

**Throws:**
- `Error`: If decryption fails or JSON parsing fails

**Example:**
```typescript
import { decryptDatabase } from './utils/decryptDB';
import * as fs from 'fs';

const encryptedData = fs.readFileSync('./database.json', 'utf8').trim();
const password = 'my-encryption-key';

const db = decryptDatabase(encryptedData, password);

console.log('Providers:', db.providers.length);
console.log('User Tokens:', db.userTokens.length);
```

---

### `loadDatabase(password: string, dbPath?: string): Database`

Loads and decrypts the `database.json` file from disk.

**Parameters:**
- `password` (string): The `DB_ENCRYPTION_KEY` value
- `dbPath` (string, optional): Custom path to `database.json`
  - Default: `./database.json` (current working directory)

**Returns:**
- `Database`: Parsed database object

**Throws:**
- `Error`: If file not found, empty, or decryption fails

**Example:**
```typescript
import { loadDatabase } from './utils/decryptDB';

// Load from default location (./database.json)
const db1 = loadDatabase('my-encryption-key');

// Load from custom path
const db2 = loadDatabase('my-encryption-key', '/path/to/database.json');

console.log('Providers:', db1.providers.length);
```

---

### `loadDatabaseFromEnv(dbPath?: string): Database` ⭐ **Recommended**

Loads and decrypts the database using the `DB_ENCRYPTION_KEY` environment variable.

**Parameters:**
- `dbPath` (string, optional): Custom path to `database.json`
  - Default: `./database.json` (current working directory)

**Returns:**
- `Database`: Parsed database object

**Throws:**
- `Error`: If `DB_ENCRYPTION_KEY` is not set, file not found, or decryption fails

**Example:**
```typescript
import { loadDatabaseFromEnv } from './utils/decryptDB';

// Requires DB_ENCRYPTION_KEY in process.env
const db = loadDatabaseFromEnv();

console.log('Auth Mode:', db.authMode);
console.log('Providers:', db.providers.length);
console.log('Models:', db.models.length);

// With custom path
const db2 = loadDatabaseFromEnv('/custom/path/database.json');
```

---

## Data Types

### `Database` Interface

The main database structure returned by decryption functions.

```typescript
interface Database {
  providers: Provider[];        // AI service providers (OpenAI, Anthropic, etc.)
  apiKeys: ApiKey[];            // API keys for each provider
  models: Model[];              // Available AI models
  userTokens: UserToken[];      // User access tokens
  usageRecords: UsageRecord[];  // Historical usage data
  authMode: "user_tokens" | "general_password" | "no_auth";
  generalPassword?: string;     // Optional general access password
}
```

---

### `Provider` Interface

AI service provider configuration.

```typescript
interface Provider {
  id: string;                    // UUID
  name: string;                  // Provider name (e.g., "OpenAI", "Anthropic")
  baseUrl: string;               // API base URL
  enabled: boolean;              // Whether provider is active
  createdAt: number;             // Unix timestamp (milliseconds)
  customHeaders?: Record<string, string>;  // Optional HTTP headers
  disableCacheDiscount?: boolean;          // Disable cache cost reduction
}
```

**Example:**
```typescript
const provider = db.providers[0];
// {
//   id: '4b2c1a87-c0db-4275-8f07-1b18e6983b83',
//   name: 'AWS',
//   baseUrl: 'https://agentrouter.org/v1',
//   enabled: true,
//   createdAt: 1728905863698
// }
```

---

### `ApiKey` Interface

API key for a specific provider.

```typescript
interface ApiKey {
  id: string;          // UUID
  providerId: string;  // References Provider.id
  key: string;         // The actual API key (encrypted in storage)
  lastUsed: number;    // Unix timestamp (milliseconds)
  requestCount: number; // Total requests made with this key
}
```

---

### `Model` Interface

AI model configuration.

```typescript
interface Model {
  id: string;          // UUID
  providerId: string;  // References Provider.id
  modelId: string;     // Model name (e.g., "gpt-4", "claude-3-opus")
  enabled: boolean;    // Whether model is available
  requestCost: number; // Cost per request (fractional allowed)
}
```

---

### `UserToken` Interface

User access token with rate limits.

```typescript
interface UserToken {
  id: string;            // UUID
  name: string;          // User-friendly name
  token: string;         // API token (format: "sk_xxxxx")
  maxRPD: number;        // Max Requests Per Day (fractional cost counted)
  maxRPM: number;        // Max Requests Per Minute
  createdAt: number;     // Unix timestamp (milliseconds)
  allowedProviders?: string[]; // Optional: Restrict to specific provider IDs
}
```

**Example:**
```typescript
const userToken = db.userTokens[0];
// {
//   id: '016ef704-b854-484c-a9c5-f27c05beaebb',
//   name: 'Tooru',
//   token: 'sk_3a73410d64854f20a2d47ce89e33b0b1',
//   maxRPD: 10000,
//   maxRPM: 10,
//   createdAt: 1728913949030,
//   allowedProviders: ['4b2c1a87-c0db-4275-8f07-1b18e6983b83']
// }
```

---

### `UsageRecord` Interface

Individual API request usage record.

```typescript
interface UsageRecord {
  id: string;           // UUID
  userTokenId: string;  // References UserToken.id
  modelId: string;      // Model name used
  providerId: string;   // References Provider.id
  tokens: number;       // Total tokens (input + output)
  inputTokens: number;  // Input/prompt tokens
  outputTokens: number; // Output/completion tokens
  timestamp: number;    // Unix timestamp (milliseconds)
  cost: number;         // Fractional cost (e.g., 1.0, 0.1, 2.5)
}
```

---

## Real-World Use Cases

### Use Case 1: Get Specific User Token Stats

**Scenario:** User wants to check their remaining quota, last used time, and usage statistics.

```typescript
import { loadDatabaseFromEnv, Database, UserToken, UsageRecord } from './utils/decryptDB';

interface UserStats {
  // Basic Info
  name: string;
  token: string;
  createdAt: Date;

  // Quota & Limits
  maxRPD: number;
  maxRPM: number;
  usedRPD: number;
  remainingRPD: number;
  quotaPercentage: number;

  // Usage Stats
  lastUsed: Date | null;
  totalRequests: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;

  // Time-based Stats
  requestsToday: number;
  requestsThisWeek: number;
  requestsThisMonth: number;

  // Model Usage Breakdown
  topModels: Array<{ modelId: string; count: number; tokens: number }>;

  // Recent Activity
  recentRequests: Array<{
    timestamp: Date;
    modelId: string;
    tokens: number;
    cost: number;
  }>;
}

function getUserTokenStats(tokenString: string): UserStats {
  const db = loadDatabaseFromEnv();

  // Find user token
  const userToken = db.userTokens.find(t => t.token === tokenString);
  if (!userToken) {
    throw new Error('Token not found');
  }

  // Get all usage records for this user
  const allRecords = db.usageRecords.filter(r => r.userTokenId === userToken.id);

  // Calculate time boundaries
  const now = Date.now();
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const weekStart = now - (7 * 24 * 60 * 60 * 1000);
  const monthStart = now - (30 * 24 * 60 * 60 * 1000);

  // Today's usage
  const todayRecords = allRecords.filter(r => r.timestamp >= todayStart);
  const usedRPD = todayRecords.reduce((sum, r) => sum + r.cost, 0);
  const remainingRPD = userToken.maxRPD - usedRPD;
  const quotaPercentage = (usedRPD / userToken.maxRPD) * 100;

  // Last used
  const sortedRecords = allRecords.sort((a, b) => b.timestamp - a.timestamp);
  const lastUsed = sortedRecords.length > 0
    ? new Date(sortedRecords[0].timestamp)
    : null;

  // Total stats
  const totalRequests = allRecords.length;
  const totalTokens = allRecords.reduce((sum, r) => sum + r.tokens, 0);
  const totalInputTokens = allRecords.reduce((sum, r) => sum + r.inputTokens, 0);
  const totalOutputTokens = allRecords.reduce((sum, r) => sum + r.outputTokens, 0);

  // Time-based requests
  const requestsToday = todayRecords.length;
  const requestsThisWeek = allRecords.filter(r => r.timestamp >= weekStart).length;
  const requestsThisMonth = allRecords.filter(r => r.timestamp >= monthStart).length;

  // Model usage breakdown
  const modelUsage: Record<string, { count: number; tokens: number }> = {};
  allRecords.forEach(r => {
    if (!modelUsage[r.modelId]) {
      modelUsage[r.modelId] = { count: 0, tokens: 0 };
    }
    modelUsage[r.modelId].count++;
    modelUsage[r.modelId].tokens += r.tokens;
  });

  const topModels = Object.entries(modelUsage)
    .map(([modelId, stats]) => ({ modelId, ...stats }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Recent activity (last 10 requests)
  const recentRequests = sortedRecords.slice(0, 10).map(r => ({
    timestamp: new Date(r.timestamp),
    modelId: r.modelId,
    tokens: r.tokens,
    cost: r.cost,
  }));

  return {
    // Basic Info
    name: userToken.name,
    token: userToken.token,
    createdAt: new Date(userToken.createdAt),

    // Quota & Limits
    maxRPD: userToken.maxRPD,
    maxRPM: userToken.maxRPM,
    usedRPD: usedRPD,
    remainingRPD: remainingRPD,
    quotaPercentage: quotaPercentage,

    // Usage Stats
    lastUsed: lastUsed,
    totalRequests: totalRequests,
    totalTokens: totalTokens,
    totalInputTokens: totalInputTokens,
    totalOutputTokens: totalOutputTokens,

    // Time-based Stats
    requestsToday: requestsToday,
    requestsThisWeek: requestsThisWeek,
    requestsThisMonth: requestsThisMonth,

    // Model Usage
    topModels: topModels,

    // Recent Activity
    recentRequests: recentRequests,
  };
}

// Usage Example
const stats = getUserTokenStats('sk_3a73410d64854f20a2d47ce89e33b0b1');

console.log('User:', stats.name);
console.log('Remaining RPD Quota:', stats.remainingRPD.toFixed(2));
console.log('Last Used:', stats.lastUsed?.toISOString());
console.log('Quota Used:', stats.quotaPercentage.toFixed(2) + '%');
console.log('Total Requests:', stats.totalRequests);
console.log('Top Model:', stats.topModels[0]?.modelId);

// Output Example:
// User: Tooru
// Remaining RPD Quota: 9824.70
// Last Used: 2025-10-16T10:32:15.789Z
// Quota Used: 1.75%
// Total Requests: 106
// Top Model: claude-3-5-sonnet-20241022
```

---

### Use Case 2: Discord Bot - User Stats Command

**Scenario:** Discord bot command that displays comprehensive user statistics.

```typescript
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { loadDatabaseFromEnv } from './utils/decryptDB';

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('Check your detailed API usage statistics')
  .addStringOption(option =>
    option.setName('token')
      .setDescription('Your API token')
      .setRequired(true)
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const tokenInput = interaction.options.getString('token');

  try {
    const db = loadDatabaseFromEnv('/path/to/Sayori-Proxy/database.json');

    // Find user token
    const userToken = db.userTokens.find(t => t.token === tokenInput);
    if (!userToken) {
      return interaction.editReply('❌ Token not found!');
    }

    // Get usage records
    const allRecords = db.usageRecords.filter(r => r.userTokenId === userToken.id);
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const todayRecords = allRecords.filter(r => r.timestamp >= todayStart);

    // Calculate stats
    const usedToday = todayRecords.reduce((sum, r) => sum + r.cost, 0);
    const remainingToday = userToken.maxRPD - usedToday;
    const quotaPercent = (usedToday / userToken.maxRPD) * 100;

    // Last used
    const sortedRecords = allRecords.sort((a, b) => b.timestamp - a.timestamp);
    const lastUsed = sortedRecords.length > 0
      ? new Date(sortedRecords[0].timestamp)
      : null;

    // Total stats
    const totalTokens = allRecords.reduce((sum, r) => sum + r.tokens, 0);
    const avgTokensPerRequest = allRecords.length > 0
      ? totalTokens / allRecords.length
      : 0;

    // Model breakdown
    const modelCounts: Record<string, number> = {};
    allRecords.forEach(r => {
      modelCounts[r.modelId] = (modelCounts[r.modelId] || 0) + 1;
    });
    const topModels = Object.entries(modelCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([model, count]) => `• ${model}: ${count} requests`)
      .join('\n') || 'No usage yet';

    // Create embed
    const embed = new EmbedBuilder()
      .setTitle(`📊 API Statistics for ${userToken.name}`)
      .setColor(quotaPercent >= 80 ? 0xe74c3c : quotaPercent >= 50 ? 0xf39c12 : 0x2ecc71)
      .addFields(
        {
          name: '📈 Daily Quota',
          value: `Used: **${usedToday.toFixed(2)}** / ${userToken.maxRPD}\nRemaining: **${remainingToday.toFixed(2)}**\nPercentage: **${quotaPercent.toFixed(1)}%**`,
          inline: true
        },
        {
          name: '⚡ Rate Limits',
          value: `Max RPM: **${userToken.maxRPM}** req/min\nMax RPD: **${userToken.maxRPD}** req/day`,
          inline: true
        },
        {
          name: '🕐 Last Used',
          value: lastUsed
            ? `<t:${Math.floor(lastUsed.getTime() / 1000)}:R>`
            : 'Never used',
          inline: false
        },
        {
          name: '📊 Total Statistics',
          value: `Total Requests: **${allRecords.length}**\nTotal Tokens: **${totalTokens.toLocaleString()}**\nAvg Tokens/Request: **${avgTokensPerRequest.toFixed(0)}**`,
          inline: true
        },
        {
          name: '🤖 Top Models',
          value: topModels,
          inline: true
        },
        {
          name: '📅 Today\'s Activity',
          value: `Requests: **${todayRecords.length}**\nTokens: **${todayRecords.reduce((sum, r) => sum + r.tokens, 0).toLocaleString()}**`,
          inline: false
        }
      )
      .setFooter({ text: `Token created on ${new Date(userToken.createdAt).toLocaleDateString()}` })
      .setTimestamp();

    // Add warning if quota is high
    if (quotaPercent >= 80) {
      embed.setDescription('⚠️ **Warning:** You are close to your daily quota limit!');
    }

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('Error fetching stats:', error);
    await interaction.editReply('❌ Failed to fetch statistics. Please try again later.');
  }
}
```

---

### Use Case 3: Get Remaining RPD Quota (Simple Function)

**Scenario:** Quick function to check if a user has enough quota remaining.

```typescript
import { loadDatabaseFromEnv } from './utils/decryptDB';

interface QuotaInfo {
  maxRPD: number;
  usedRPD: number;
  remainingRPD: number;
  percentageUsed: number;
  hasQuotaRemaining: boolean;
}

function getRemainingQuota(tokenString: string): QuotaInfo {
  const db = loadDatabaseFromEnv();

  // Find user token
  const userToken = db.userTokens.find(t => t.token === tokenString);
  if (!userToken) {
    throw new Error('Token not found');
  }

  // Get today's records
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const todayRecords = db.usageRecords.filter(r =>
    r.userTokenId === userToken.id && r.timestamp >= todayStart
  );

  // Calculate usage
  const usedRPD = todayRecords.reduce((sum, r) => sum + r.cost, 0);
  const remainingRPD = userToken.maxRPD - usedRPD;
  const percentageUsed = (usedRPD / userToken.maxRPD) * 100;

  return {
    maxRPD: userToken.maxRPD,
    usedRPD: usedRPD,
    remainingRPD: remainingRPD,
    percentageUsed: percentageUsed,
    hasQuotaRemaining: remainingRPD > 0,
  };
}

// Usage
const quota = getRemainingQuota('sk_3a73410d64854f20a2d47ce89e33b0b1');

console.log(`Remaining: ${quota.remainingRPD.toFixed(2)} / ${quota.maxRPD}`);
console.log(`Used: ${quota.percentageUsed.toFixed(1)}%`);
console.log(`Can make request: ${quota.hasQuotaRemaining}`);

// Output:
// Remaining: 9824.70 / 10000
// Used: 1.8%
// Can make request: true
```

---

### Use Case 4: Check Last Used Timestamp

**Scenario:** Get when a token was last used and time since last use.

```typescript
import { loadDatabaseFromEnv } from './utils/decryptDB';

interface LastUsedInfo {
  lastUsed: Date | null;
  timeSinceLastUse: string;
  minutesSinceLastUse: number;
  isActive: boolean; // Used within last hour
}

function getLastUsedInfo(tokenString: string): LastUsedInfo {
  const db = loadDatabaseFromEnv();

  // Find user token
  const userToken = db.userTokens.find(t => t.token === tokenString);
  if (!userToken) {
    throw new Error('Token not found');
  }

  // Get latest usage record
  const userRecords = db.usageRecords
    .filter(r => r.userTokenId === userToken.id)
    .sort((a, b) => b.timestamp - a.timestamp);

  if (userRecords.length === 0) {
    return {
      lastUsed: null,
      timeSinceLastUse: 'Never used',
      minutesSinceLastUse: Infinity,
      isActive: false,
    };
  }

  const lastUsed = new Date(userRecords[0].timestamp);
  const now = Date.now();
  const minutesSince = (now - lastUsed.getTime()) / (1000 * 60);

  // Format time since
  let timeSinceLastUse: string;
  if (minutesSince < 1) {
    timeSinceLastUse = 'Just now';
  } else if (minutesSince < 60) {
    timeSinceLastUse = `${Math.floor(minutesSince)} minutes ago`;
  } else if (minutesSince < 1440) {
    timeSinceLastUse = `${Math.floor(minutesSince / 60)} hours ago`;
  } else {
    timeSinceLastUse = `${Math.floor(minutesSince / 1440)} days ago`;
  }

  return {
    lastUsed: lastUsed,
    timeSinceLastUse: timeSinceLastUse,
    minutesSinceLastUse: minutesSince,
    isActive: minutesSince < 60, // Active if used within last hour
  };
}

// Usage
const lastUsedInfo = getLastUsedInfo('sk_3a73410d64854f20a2d47ce89e33b0b1');

console.log('Last Used:', lastUsedInfo.lastUsed?.toISOString());
console.log('Time Since:', lastUsedInfo.timeSinceLastUse);
console.log('Is Active:', lastUsedInfo.isActive);

// Output:
// Last Used: 2025-10-16T10:32:15.789Z
// Time Since: 15 minutes ago
// Is Active: true
```

---

### Use Case 5: Get All Token Stats (Admin Dashboard)

**Scenario:** Admin wants to see all users' quota usage at a glance.

```typescript
import { loadDatabaseFromEnv } from './utils/decryptDB';

interface TokenSummary {
  name: string;
  token: string;
  maxRPD: number;
  usedRPD: number;
  remainingRPD: number;
  percentageUsed: number;
  lastUsed: Date | null;
  requestsToday: number;
  totalRequests: number;
  status: 'active' | 'warning' | 'critical' | 'inactive';
}

function getAllTokenStats(): TokenSummary[] {
  const db = loadDatabaseFromEnv();
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const oneHourAgo = Date.now() - (60 * 60 * 1000);

  return db.userTokens.map(token => {
    // Get usage records
    const allRecords = db.usageRecords.filter(r => r.userTokenId === token.id);
    const todayRecords = allRecords.filter(r => r.timestamp >= todayStart);

    // Calculate usage
    const usedRPD = todayRecords.reduce((sum, r) => sum + r.cost, 0);
    const remainingRPD = token.maxRPD - usedRPD;
    const percentageUsed = (usedRPD / token.maxRPD) * 100;

    // Last used
    const sortedRecords = allRecords.sort((a, b) => b.timestamp - a.timestamp);
    const lastUsed = sortedRecords.length > 0
      ? new Date(sortedRecords[0].timestamp)
      : null;

    // Determine status
    let status: 'active' | 'warning' | 'critical' | 'inactive';
    if (!lastUsed || lastUsed.getTime() < oneHourAgo) {
      status = 'inactive';
    } else if (percentageUsed >= 90) {
      status = 'critical';
    } else if (percentageUsed >= 70) {
      status = 'warning';
    } else {
      status = 'active';
    }

    return {
      name: token.name,
      token: token.token,
      maxRPD: token.maxRPD,
      usedRPD: usedRPD,
      remainingRPD: remainingRPD,
      percentageUsed: percentageUsed,
      lastUsed: lastUsed,
      requestsToday: todayRecords.length,
      totalRequests: allRecords.length,
      status: status,
    };
  });
}

// Usage
const allStats = getAllTokenStats();

console.log('=== Token Statistics ===\n');
allStats.forEach(stat => {
  const statusEmoji = {
    active: '✅',
    warning: '⚠️',
    critical: '🔴',
    inactive: '⚪',
  }[stat.status];

  console.log(`${statusEmoji} ${stat.name}`);
  console.log(`   Token: ${stat.token.substring(0, 10)}...`);
  console.log(`   Quota: ${stat.usedRPD.toFixed(2)} / ${stat.maxRPD} (${stat.percentageUsed.toFixed(1)}%)`);
  console.log(`   Remaining: ${stat.remainingRPD.toFixed(2)}`);
  console.log(`   Requests Today: ${stat.requestsToday}`);
  console.log(`   Last Used: ${stat.lastUsed ? stat.lastUsed.toISOString() : 'Never'}`);
  console.log('');
});

// Output:
// === Token Statistics ===
//
// ✅ Tooru
//    Token: sk_3a73410...
//    Quota: 175.30 / 10000 (1.8%)
//    Remaining: 9824.70
//    Requests Today: 12
//    Last Used: 2025-10-16T10:32:15.789Z
//
// ⚪ Alice
//    Token: sk_abc1234...
//    Quota: 0.00 / 5000 (0.0%)
//    Remaining: 5000.00
//    Requests Today: 0
//    Last Used: Never
```

---

### Use Case 6: Quota Warning System

**Scenario:** Automated system that sends alerts when users are close to their quota limits.

```typescript
import { loadDatabaseFromEnv } from './utils/decryptDB';

interface QuotaWarning {
  name: string;
  token: string;
  usedRPD: number;
  maxRPD: number;
  remainingRPD: number;
  percentageUsed: number;
  severity: 'warning' | 'critical';
}

function checkQuotaWarnings(warningThreshold = 70, criticalThreshold = 90): QuotaWarning[] {
  const db = loadDatabaseFromEnv();
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const warnings: QuotaWarning[] = [];

  for (const token of db.userTokens) {
    const todayRecords = db.usageRecords.filter(r =>
      r.userTokenId === token.id && r.timestamp >= todayStart
    );

    const usedRPD = todayRecords.reduce((sum, r) => sum + r.cost, 0);
    const remainingRPD = token.maxRPD - usedRPD;
    const percentageUsed = (usedRPD / token.maxRPD) * 100;

    if (percentageUsed >= warningThreshold) {
      warnings.push({
        name: token.name,
        token: token.token,
        usedRPD: usedRPD,
        maxRPD: token.maxRPD,
        remainingRPD: remainingRPD,
        percentageUsed: percentageUsed,
        severity: percentageUsed >= criticalThreshold ? 'critical' : 'warning',
      });
    }
  }

  return warnings.sort((a, b) => b.percentageUsed - a.percentageUsed);
}

// Usage - run this periodically (e.g., every 30 minutes)
setInterval(() => {
  const warnings = checkQuotaWarnings(70, 90);

  if (warnings.length > 0) {
    console.log(`⚠️ Found ${warnings.length} quota warnings:\n`);

    warnings.forEach(w => {
      const emoji = w.severity === 'critical' ? '🔴' : '⚠️';
      console.log(`${emoji} ${w.name}: ${w.percentageUsed.toFixed(1)}% used`);
      console.log(`   Remaining: ${w.remainingRPD.toFixed(2)} / ${w.maxRPD}`);

      // Send notification (Discord, email, SMS, etc.)
      // sendDiscordAlert(w);
      // sendEmailAlert(w);
    });
  }
}, 30 * 60 * 1000); // Every 30 minutes
```

---

### Use Case 7: Caching for Better Performance

**Scenario:** Cache database to avoid reading file on every request.

```typescript
import { loadDatabaseFromEnv, Database } from './utils/decryptDB';

class DatabaseCache {
  private cache: Database | null = null;
  private lastLoaded: number = 0;
  private cacheTTL: number = 30000; // 30 seconds
  private dbPath: string;

  constructor(dbPath?: string, cacheTTL = 30000) {
    this.dbPath = dbPath || '/path/to/Sayori-Proxy/database.json';
    this.cacheTTL = cacheTTL;
  }

  getDatabase(): Database {
    const now = Date.now();

    // Check if cache is still valid
    if (this.cache && (now - this.lastLoaded) < this.cacheTTL) {
      return this.cache;
    }

    // Reload database
    this.cache = loadDatabaseFromEnv(this.dbPath);
    this.lastLoaded = now;

    console.log('Database cache refreshed');
    return this.cache;
  }

  invalidate(): void {
    this.cache = null;
    this.lastLoaded = 0;
  }
}

// Create singleton instance
export const dbCache = new DatabaseCache('/path/to/database.json', 30000);

// Usage in your Discord bot commands
export async function getQuickStats(tokenString: string) {
  const db = dbCache.getDatabase(); // Uses cache

  const userToken = db.userTokens.find(t => t.token === tokenString);
  // ... rest of logic
}

// Force refresh if needed
export function refreshCache() {
  dbCache.invalidate();
}
```

---

## Error Handling

All functions throw errors that should be caught and handled:

```typescript
import { loadDatabaseFromEnv } from './utils/decryptDB';

try {
  const db = loadDatabaseFromEnv();
  console.log('Database loaded successfully');
} catch (error) {
  if (error.message.includes('DB_ENCRYPTION_KEY')) {
    console.error('Environment variable not set');
  } else if (error.message.includes('not found')) {
    console.error('Database file missing');
  } else if (error.message.includes('Decryption failed')) {
    console.error('Wrong password or corrupted data');
  } else {
    console.error('Unknown error:', error);
  }
}
```

### Common Error Messages

| Error Message | Cause | Solution |
|---------------|-------|----------|
| `DB_ENCRYPTION_KEY environment variable is not set` | Missing env var | Add `DB_ENCRYPTION_KEY` to `.env` |
| `Database file not found at: [path]` | File doesn't exist | Check file path or create symlink |
| `Database file is empty` | Empty file | Ensure Sayori Proxy has written data |
| `Decryption failed` | Wrong password or corrupted data | Verify encryption key matches |
| `Failed to parse decrypted data as JSON` | Invalid JSON after decryption | Database may be corrupted |

---

## Testing

Run the comprehensive test script:

```bash
DB_ENCRYPTION_KEY="your-key-here" npx tsx test-decrypt.ts
```

Expected output:
```
=== Testing decryptDB.ts Utilities ===

Test 1: deriveKey()
  ✓ Key derived successfully
  - Key type: Buffer
  - Key length: 32 bytes

Test 2: loadDatabaseFromEnv()
  ✓ Database loaded successfully
  ...

=== All Tests Passed! ===
```

---

## Security Notes

1. **Protect Your Encryption Key:** Never commit `DB_ENCRYPTION_KEY` to version control
2. **File Permissions:** Ensure `database.json` has appropriate permissions (600 or 640)
3. **Environment Variables:** Use `.env` files with proper `.gitignore` rules
4. **API Keys in Database:** The database contains sensitive API keys - protect decrypted data
5. **Read-only Access:** This utility is read-only. To modify data, use Sayori Proxy's API

---

**Last Updated:** October 16, 2025
**Version:** 1.0.0
**Author:** Sayori Proxy Team
