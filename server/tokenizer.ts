// Accurate OpenAI-compatible token counting utilities.
// Implements deterministic token counting using @dqbd/tiktoken with
// model family -> encoding mapping and NO heuristic length/4 fallback.
//
// Environment variables:
//   STRICT_TOKEN_COUNT=1  -> (informational) all failures already throw; no heuristic exists.
//
// Public API:
//   getEncodingForModel(modelId: string): EncodingName
//   getTokenizer(modelId: string): Tiktoken
//   countChatTokens(messages: ChatMessage[], modelId: string, opts?): number
//   countTextTokens(text: string, modelId: string): number
//   warmTokenizers(modelIds?: string[]): void
//
// Notes:
// - Chat token counting encodes each message in a deterministic linearized form:
//   `${role}\n${name?}\n${content}\n[TOOL_CALL:...]...`
// - Tool calls (OpenAI-style) are appended as `[TOOL_CALL:type]\nfunctionName\nfunctionArgs`
// - Structural overhead constants (STRUCTURAL_OVERHEAD_PER_MESSAGE, PRIMING_OVERHEAD) approximate legacy ChatML framing.
// - Caching: identical message arrays (canonicalized JSON) reuse computed counts.
// - Anti-inflation of aggregated counts handled in storage layer (leaf-only recording).
//
// IMPORTANT: Unknown / un-mapped models automatically fall back to cl100k_base encoding (never heuristic).

import { get_encoding, Tiktoken, type TiktokenEncoding } from "@dqbd/tiktoken";

// --------------------- Types ---------------------

export interface ChatMessage {
  role: string;
  content?: string;
  // OpenAI-style tool calls (delta.tool_calls during streaming or final response)
  tool_calls?: Array<{
    type?: string;
    id?: string;
    function?: {
      name: string;
      arguments: string;
    };
  }>;
  // Some providers may return name or other fields
  name?: string;
}

// --------------------- Configuration ---------------------

// Structural token overhead constants (tunable)
const STRUCTURAL_OVERHEAD_PER_MESSAGE = 4; // approximate legacy overhead
const PRIMING_OVERHEAD = 2; // system priming / end-of-text bias

// Cache settings
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 5000;

// --------------------- Internal State ---------------------

// Encoding cache: encoding name -> Tiktoken instance
const encodingCache: Map<string, Tiktoken> = new Map();

// Message token count cache
interface TokenCacheEntry {
  tokens: number;
  timestamp: number;
}
const messageTokenCache: Map<string, TokenCacheEntry> = new Map();

// --------------------- Encoding Mapping ---------------------

/**
 * Returns encoding name for supplied model identifier.
 * Mapping rules (case-insensitive):
 *   - gpt-4o, gpt-4.1, mini (including variants like gpt-4o-mini) -> o200k_base
 *   - default -> cl100k_base
 */
export function getEncodingForModel(modelId: string): TiktokenEncoding {
  const id = modelId.toLowerCase();
  if (
    id.includes("gpt-4o") ||
    id.includes("gpt-4.1") ||
    id.includes("mini")
  ) {
    return "o200k_base" as TiktokenEncoding;
  }
  return "cl100k_base";
}

/**
 * Returns a Tiktoken instance for the model's encoding (lazy-loaded & cached).
 * If primary encoding initialization fails, falls back to cl100k_base.
 * Throws if both primary and fallback fail.
 */
export function getTokenizer(modelId: string): Tiktoken {
  const primaryEncoding = getEncodingForModel(modelId);
  let enc = encodingCache.get(primaryEncoding);
  if (!enc) {
    try {
      enc = get_encoding(primaryEncoding as TiktokenEncoding);
      encodingCache.set(primaryEncoding, enc);
    } catch (err: any) {
      if (primaryEncoding !== "cl100k_base") {
        console.warn(
          `[TOKENIZER][ENCODING_FAIL] '${primaryEncoding}' failed for model '${modelId}' (${err?.message}). Falling back to 'cl100k_base'.`
        );
        try {
          const fallbackEncoding: TiktokenEncoding = "cl100k_base";
          enc =
            encodingCache.get(fallbackEncoding) ||
            get_encoding(fallbackEncoding);
          encodingCache.set(fallbackEncoding, enc);
        } catch (fallbackErr: any) {
          throw new Error(
            `[TOKENIZER] Failed primary '${primaryEncoding}' and fallback 'cl100k_base' for model '${modelId}': ${fallbackErr?.message}`
          );
        }
      } else {
        throw new Error(
          `[TOKENIZER] Failed to initialize encoding '${primaryEncoding}' for model '${modelId}': ${err?.message}`
        );
      }
    }
  }
  return enc;
}

// --------------------- Utilities ---------------------

/**
 * Heuristic fallback: approximate tokens as length / 4 (rounded up).
 */
export function estimateTokensHeuristic(text: string): number {
  return Math.ceil(text.length / 4);
}

function isStrictMode(): boolean {
  return process.env.STRICT_TOKEN_COUNT === "1";
}

/**
 * Canonicalize messages to a stable JSON string suitable for cache key usage.
 * Ensures ordering & minimal formatting without whitespace variance.
 */
function canonicalizeMessages(messages: ChatMessage[]): string {
  return JSON.stringify(
    messages.map((m) => ({
      role: m.role,
      content: m.content ?? "",
      tool_calls: m.tool_calls?.map((tc) => ({
        type: tc.type,
        function: tc.function
          ? { name: tc.function.name, arguments: tc.function.arguments }
          : undefined,
        id: tc.id,
      })),
      name: m.name,
    }))
  );
}

/**
 * Serialize a single message to a deterministic linear text chunk that mimics
 * approximate tokenization structure for role/content/tool calls.
 */
function serializeMessage(message: ChatMessage): string {
  const parts: string[] = [];

  // Role
  parts.push(message.role || "");

  // Name (some provider variants)
  if (message.name) {
    parts.push(message.name);
  }

  // Content
  if (message.content) {
    parts.push(message.content);
  }

  // Tool calls (serialize each function call in a deterministic way)
  if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
    for (const tc of message.tool_calls) {
      const funcName = tc.function?.name || "";
      const funcArgs = tc.function?.arguments || "";
      const toolType = tc.type || "function";
      parts.push(`[TOOL_CALL:${toolType}]`);
      parts.push(funcName);
      parts.push(funcArgs);
    }
  }

  // Join with newline to keep simple segmentation (role\nname\ncontent\n...).
  return parts.join("\n");
}

/**
 * Encode text using tokenizer. No heuristic fallback; all failures throw.
 */
function safeEncodeLength(text: string, tokenizer: Tiktoken | undefined): number {
  if (!tokenizer) {
    throw new Error("[TOKENIZER] No tokenizer instance available.");
  }
  try {
    const ids = tokenizer.encode(text);
    return ids.length;
  } catch (err: any) {
    throw new Error(`[TOKENIZER] Encoding failure: ${err?.message}`);
  }
}

/**
 * Prune expired cache entries & enforce max size.
 */
function maintainCache() {
  const now = Date.now();
  if (messageTokenCache.size > MAX_CACHE_ENTRIES) {
    // Simple eviction: remove oldest entries beyond half max
    const entries = Array.from(messageTokenCache.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    );
    const removeCount = Math.floor(entries.length / 2);
    for (let i = 0; i < removeCount; i++) {
      messageTokenCache.delete(entries[i][0]);
    }
  }
  // Expire TTL (Map.forEach avoids downlevel iteration issues)
  messageTokenCache.forEach((entry, key) => {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      messageTokenCache.delete(key);
    }
  });
}

// --------------------- Public Counting Functions ---------------------

export interface CountChatTokensOptions {
  useCache?: boolean;
  includeStructuralOverhead?: boolean;
}

/**
 * Counts tokens for an array of chat messages, including tool calls.
 * Adds structural overhead per message + priming cost by default.
 */
export function countChatTokens(
  messages: ChatMessage[] = [],
  modelId: string,
  opts: CountChatTokensOptions = {}
): number {
  const {
    useCache = true,
    includeStructuralOverhead = true,
  } = opts;

  maintainCache();

  const tokenizer = getTokenizer(modelId); // may fallback if not strict
  const cacheKey = useCache ? `${modelId}:${canonicalizeMessages(messages)}` : null;

  if (cacheKey && messageTokenCache.has(cacheKey)) {
    return messageTokenCache.get(cacheKey)!.tokens;
  }

  let total = 0;
  for (const msg of messages) {
    const serialized = serializeMessage(msg);
    const length = safeEncodeLength(serialized, tokenizer);
    total += length;
    if (includeStructuralOverhead) {
      total += STRUCTURAL_OVERHEAD_PER_MESSAGE;
    }
  }

  if (includeStructuralOverhead) {
    total += PRIMING_OVERHEAD;
  }

  if (cacheKey) {
    messageTokenCache.set(cacheKey, { tokens: total, timestamp: Date.now() });
  }

  return total;
}

/**
 * Counts tokens for plain completion text (output side).
 */
export function countTextTokens(text: string, modelId: string): number {
  const tokenizer = getTokenizer(modelId);
  return safeEncodeLength(text || "", tokenizer);
}

// --------------------- Warm-up / Preload ---------------------

/**
 * Optional helper to pre-initialize tokenizers for a set of model IDs to
 * avoid first-request latency.
 */
export function warmTokenizers(modelIds: string[] = []): void {
  for (const id of modelIds) {
    try {
      getTokenizer(id);
    } catch (err: any) {
      if (isStrictMode()) {
        throw err;
      }
      console.warn(`[TOKENIZER][WARM] Failed to warm tokenizer for '${id}': ${err?.message}`);
    }
  }
}

// --------------------- Diagnostics ---------------------

/**
 * Returns diagnostic snapshot useful for debugging memory / cache behavior.
 */
export function getTokenizerDiagnostics() {
  return {
    encodingCacheSize: encodingCache.size,
    messageTokenCacheSize: messageTokenCache.size,
    cacheTTLms: CACHE_TTL_MS,
    maxCacheEntries: MAX_CACHE_ENTRIES,
    strictMode: isStrictMode(),
  };
}

// --------------------- Example (Comment) ---------------------
//
// Example usage inside routes:
//
// import { countChatTokens, countTextTokens } from './tokenizer';
//
// const inputTokens = countChatTokens(requestBody.messages, targetModel.modelId);
// // After streaming or final response:
// const outputTokens = countTextTokens(generatedContent, targetModel.modelId);
//
// --------------------------------------------------------------
