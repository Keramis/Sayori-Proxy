# Tokenization & Accurate Token Counting Specification

Author: Architect Mode
Date: 2025-11-14

## Objective

Replace heuristic token estimation in [`estimateTokens()`](server/routes.ts:954) and [`countInputTokens()`](server/routes.ts:959) with deterministic OpenAI-compatible tokenization using `@dqbd/tiktoken`, prevent token inflation across ancestor chains, and establish consistent handling for streaming vs non-streaming responses, while preserving cost-based quota logic.

## Scope

Impacted Areas:
- Input token counting in [`POST /v1/chat/completions`](server/routes.ts:967)
- Output token counting (streaming and non-streaming paths)
- Usage record creation for master keys and sub-key chains
- Stats aggregation in [`getStats()`](server/sqlite-storage.ts:1093) and [`getStats()`](server/storage.ts:842)
- Quota validation (remains cost-based; token counting is informational)
- Migration of existing usage records (normalize ancestor entries)

New/Modified Files:
- New: [`server/tokenizer.ts`](server/tokenizer.ts:1)
- Modified: [`package.json`](package.json:1) (add dependency)
- Modified: [`server/routes.ts`](server/routes.ts:954)
- Modified: [`server/sqlite-storage.ts`](server/sqlite-storage.ts:891)
- Modified: [`server/storage.ts`](server/storage.ts:714)
- New: [`tools/testTokenCounts.ts`](tools/testTokenCounts.ts:1)
- New: [`tools/migrateTokenUsage.ts`](tools/migrateTokenUsage.ts:1)

## Current Problems & Bug List

1. Inaccurate Estimation:
   - Uses a naive length/4 heuristic in [`estimateTokens()`](server/routes.ts:954) which fails for:
     - Unicode, emojis, CJK characters, surrogate pairs
     - System messages, long role metadata
     - Repeated short messages / JSON overhead
2. Input Token Overcount / Underrepresent:
   - [`countInputTokens()`](server/routes.ts:959) JSON-stringifies the entire message array, counting structural characters and ordering noise not actually tokenized by OpenAI’s chat formatting.
3. Streaming Output Inconsistency:
   - Fallback estimation uses same heuristic; token usage in partial SSE chunks may produce partial counts leading to misaligned total vs input/output splits (`totalTokens` recomputation logic around streaming finalize lines 1269–1287 in [`server/routes.ts`](server/routes.ts:1269)).
4. Tool Call Handling:
   - Current logic does not explicitly count function/tool calls as structured tokens; they are swallowed or approximated via aggregated JSON if at all.
5. Token Inflation Across Hierarchies:
   - Chain recording via [`createUsageRecordForChain()`](server/storage.ts:714) and [`createUsageRecordForChain()`](server/sqlite-storage.ts:891) duplicates identical token counts for every ancestor, inflating global totals and misrepresenting actual leaf usage.
6. Aggregated Stats Pollution:
   - Global token counters (JSON variant: [`totalTokensAll`](server/storage.ts:849)) accumulate inflated values from ancestor duplication.
7. Ambiguous Relationship Between Cost and Tokens:
   - Quota logic operates purely on cost (`cost` field). Tokens are secondary but inflated tokens can mislead users in dashboards.
8. Caching Inefficiency:
   - Payload cache at [`payloadCache`](server/routes.ts:950) prevents re-costing but not re-tokenization; repeated identical requests still re-run heuristic estimation.
9. Missing Deterministic Encoding Selection:
   - Different OpenAI models (e.g. gpt-4o / gpt-4.1 / mini) use updated encoding (`o200k_base`), but no abstraction for mapping.
10. Lack of Error Strategy:
   - If tokenization fails (e.g., binary content or unexpected structure), system silently continues with heuristic fallback but no user visibility.
11. Migration Gap:
   - Historical usage records retain inflated tokens; post-change stats mixture will be inconsistent unless normalized.
12. Potential Race in Streaming:
   - If provider usage arrives late, fallback estimation already fires; no reconciliation step.

## Design Principles

- Deterministic: Always use `@dqbd/tiktoken` encodings.
- Non-inflating: Only leaf token records carry token counts; ancestor chain records keep cost only.
- Non-blocking: Failures in tokenization fall back (configurable) unless `STRICT_TOKEN_COUNT=1` set.
- Streaming Parity: Attempt to derive accurate counts from provider usage; if absent, reconstruct from streamed content buffer.
- Extensible: Support future provider model families without refactoring core code paths.

## Encoding Mapping

Model families (string contains case-insensitive pattern):

| Pattern | Encoding |
| ------- | -------- |
| gpt-4o | o200k_base |
| gpt-4.1 | o200k_base |
| mini (for 4o-mini variants) | o200k_base |
| default (all others) | cl100k_base |

Function: [`getEncodingForModel()`](server/tokenizer.ts:40) selects encoding once per process, with memoization.

## New Module Outline: server/tokenizer.ts

Planned Functions:

1. [`initTokenizer()`](server/tokenizer.ts:1)
   - Lazy singleton initialization loading required encodings via `@dqbd/tiktoken`.
2. [`getEncodingForModel(modelId: string)`](server/tokenizer.ts:40)
   - Pattern matching as above; returns encoding name string.
3. [`getTokenizer(modelId: string)`](server/tokenizer.ts:55)
   - Returns an encoding instance keyed by encoding name.
4. [`serializeChatMessage(msg)`](server/tokenizer.ts:75)
   - Produces linear string: role + newline + content; tool_calls serialized deterministically.
5. [`countChatTokens(messages: ChatMessage[], modelId: string)`](server/tokenizer.ts:95)
   - Iterates messages, applies encoding, adds structural overhead consistent with OpenAI spec (approx: per-message +4 tokens if aligning with older ChatML style) — adjustable via constant.
6. [`countTextTokens(text: string, modelId: string)`](server/tokenizer.ts:130)
   - Plain encoding length for completions portion.
7. [`safeCountWrapper(fn)`](server/tokenizer.ts:150)
   - Error boundary applying fallback approximation or throwing if STRICT_TOKEN_COUNT is set.

Example Pseudocode (non-final):

```ts
// server/tokenizer.ts (planned)
import { initTokenizer } from "@dqbd/tiktoken/lite"; // actual import pattern TBD

export function getEncodingForModel(modelId: string): string {
  // mapping rules...
}

export function countChatTokens(messages: any[], modelId: string): number {
  // deterministic counting...
}

export function countTextTokens(text: string, modelId: string): number {
  // deterministic counting...
}
```

References above will be implemented precisely in Code mode.

## Token Recording Anti-Inflation

Replace chain usage recording with:

- New function: [`createUsageRecordForChainLeafTokens()`](server/sqlite-storage.ts:906) and counterpart in JSON storage.
- Behavior:
  - Leaf (request initiator) writes true tokens (tokens, inputTokens, outputTokens)
  - Ancestors write: tokens=0, inputTokens=0, outputTokens=0, cost=requestCost
  - Rationale: Maintain cost-based quota correctness; eliminate token duplication.

Adjust call sites:
- Streaming branch (after final token reconciliation) lines around [`totalTokens` finalize](server/routes.ts:1269)
- Non-streaming branch lines around usage record creation (post data usage extraction) near [`tokens = data.usage.total_tokens`](server/routes.ts:1372)

## Streaming Handling Upgrade

Flow:
1. Accumulate `streamedContent` (existing logic).
2. If usage numbers provided: trust them directly.
3. Else: finalize with `countTextTokens(streamedContent, modelId)`.
4. If `streamedContent` empty AND provider emits partial usage: derive totals as best-effort; else input-only record.
5. Ensure consistent termination (`res.end()`) remains (already patched at [`res.end()` call](server/routes.ts:1349)).

## Caching Enhancement

Extend `payloadCache` entries:
- New structure: `{ timestamp, payload, inputTokenCount }`
- On cache hit and same payload, reuse `inputTokenCount`.
- Update path at lines [`payloadCache.set`](server/routes.ts:1142).

## Fallback Strategy

Environment variable:
- `STRICT_TOKEN_COUNT=1`
  - On encoding failure: throw 500 internal error with clear message.
- Default (undefined or 0):
  - On failure: warn log, fallback to `Math.ceil(text.length / 4)` to avoid blocking.

Affected wrappers:
- [`countChatTokens()`](server/tokenizer.ts:95)
- [`countTextTokens()`](server/tokenizer.ts:130)

## Migration Plan

Script: [`tools/migrateTokenUsage.ts`](tools/migrateTokenUsage.ts:1)

Steps:
1. Load all usage records.
2. Build token -> ancestry map using `getAncestorChain()`.
3. Detect ancestor duplicates: any record where there exists a token whose parent chain also contains identical (modelId, providerId, timestamp +/- tolerance).
4. For such ancestor records:
   - Set tokens/inputTokens/outputTokens to 0 (preserve cost).
5. (Optional) Recompute leaf token counts for recent window (e.g., last 7 days) by re-tokenizing raw request payloads if stored (not currently stored — if absent, skip recompute).
6. Write summary output.

Rollback Safety:
- Keep backup file `usage_records_backup.json` (JSON storage only) or SQLite `.backup` documentation for sqlite.

## Testing Strategy

Script: [`tools/testTokenCounts.ts`](tools/testTokenCounts.ts:1)

Test Cases:
1. Simple user + assistant messages.
2. Multi-role (system, user, assistant).
3. Tool calls:
   - Include `tool_calls` array with JSON call args; verify tokens stable.
4. Unicode / Emojis.
5. Large prompt (≥ 16k chars) performance stress; ensure no OOM.
6. Repeated identical payload: ensure cache reduces second run time.

Outputs:
- Console table: `{ case, expectedApproxRange, actualTokens }`
- Exit non-zero if STRICT_TOKEN_COUNT and failure encountered.

## Dashboard & Stats Impact

Modify:
- Stats token total calculations to sum only records where `tokens > 0`.
- If raw total (historical) desired: add field `inflatedTokens` (optional; not required now).
- Lines to adjust:
  - SQLite variant: [`getStats()`](server/sqlite-storage.ts:1093)
  - JSON variant: [`getStats()`](server/storage.ts:842)

## Quota Logic Preservation

Quota checks rely on `cost`:
- Functions unaffected: [`validateAncestorChainQuota()`](server/sqlite-storage.ts:868), [`getTodayUsageCount()`](server/sqlite-storage.ts:1056)
- Confirm no token-based quota enforcement introduced.

## Implementation Sequence (Mapped to TODO)

1. Add dependency (`@dqbd/tiktoken`) (DONE after Code mode).
2. Implement tokenizer module functions.
3. Replace estimation calls in routes.
4. Integrate caching token reuse.
5. Update streaming logic.
6. Update chain recording (leaf-only).
7. Adjust stats functions.
8. Add migration script.
9. Add test script.
10. Add docs (this file).
11. Provide handoff summary.

## Mermaid Flow

```mermaid
flowchart TD
  A[Incoming chat request] --> B[Resolve model & provider]
  B --> C[Check cache for payload]
  C -->|Hit| D[Reuse input tokens]
  C -->|Miss| E[Tokenize input via countChatTokens]
  E --> F[Quota validation (cost based)]
  D --> F
  F --> G[Send to provider]
  G --> H{Streaming?}
  H -->|Yes| I[Accumulate streamedContent + usage fields]
  H -->|No| J[Receive final JSON]
  I --> K[Derive output tokens]
  J --> K
  K --> L{Sub-key?}
  L -->|Yes| M[Record leaf tokens; ancestors zero tokens]
  L -->|No| N[Record tokens once]
  M --> O[Update stats]
  N --> O
```

## Risks & Mitigations

| Risk | Mitigation |
| ---- | ---------- |
| Performance overhead for very large prompts | Cache input token counts; lazy init; avoid repeated encoding |
| Encoding library failure or mismatch | Fallback approximation unless STRICT_TOKEN_COUNT |
| Historical data inconsistency | Migration script zeros ancestor tokens |
| Unexpected model naming | Pattern matching with lowercase includes; fallback to default encoding |
| Provider usage partial vs final mismatch | Always reconcile before recording; streaming finalize block unifies logic |

## Logging Adjustments

Add structured logs:
- `[TOKENS] input=<n> output=<n> total=<n> model=<modelId> encoding=<enc>`
- Warnings for fallback: `[TOKENS][FALLBACK] reason=<err> lengthApprox=<n>`

## Handoff Summary (for Code Mode)

Implement:
- Add dependency line in `dependencies`.
- Create `server/tokenizer.ts` with outlined functions.
- Refactor route handler:
  - Replace heuristic calls
  - Introduce cache reuse per payload
  - Centralize token derivation logic before usage record creation
- Introduce new storage methods for leaf-only token recording (or a branching conditional before existing creation).
- Update stats summation logic to ignore ancestor zero-token rows.
- Add migration & test scripts.
- Validate via test script; ensure environment variable toggles fallback.

End of Specification.
