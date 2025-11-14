// Migration Script: Normalize ancestor usage records to eliminate token inflation.
//
// Strategy:
// 1. Load all user tokens and build ancestor maps.
// 2. Load all usage records (direct DB query; public storage API lacks global getter).
// 3. For each leaf usage record (tokens > 0), detect any ancestor records sharing:
//       (modelId, providerId, timestamp[, ±tolerance]) with tokens > 0
//    and set tokens/inputTokens/outputTokens = 0 for ancestor rows.
// 4. Produce a summary report.
//
// IMPORTANT:
// - SQLite backend only. For JSON storage, parse database.json separately.
// - Run:
//     tsx tools/migrateTokenUsage.ts [--dry-run] [--tolerance=MS] [--verbose]
//
// Flags:
//   --dry-run       Perform analysis only; DO NOT modify usage_records.
//   --tolerance=MS  Milliseconds tolerance when matching ancestor timestamps.
//                   Default: 0 (exact match). Useful if ancestor writes are delayed.
//   --verbose       Extra per-record logging.
//
// Safety:
// - Creates backup table `usage_records_backup_<epoch>` before modifications (unless --dry-run).
// - All updates happen inside a single transaction.
//
// Limitations:
// - Does not recompute leaf token counts; only zeroes ancestor inflation.
// - Tolerance too large may zero unrelated rows; choose conservatively.
//
// Exit codes:
//   0 success (even dry-run)
//   1 fatal error
//
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

// Resolve project root (assuming script run from project root)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(process.cwd(), "database.sqlite");

// Parse CLI args
const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const VERBOSE = argv.includes("--verbose");
const toleranceArg = argv.find(a => a.startsWith("--tolerance="));
const TIME_TOLERANCE_MS = toleranceArg ? Math.max(0, parseInt(toleranceArg.split("=")[1], 10)) : 0;

interface RawToken {
  id: string;
  name: string;
  parent_token_id: string | null;
  key_type: string;
}

interface RawUsage {
  id: string;
  user_token_id: string;
  model_id: string;
  provider_id: string;
  tokens: number;
  input_tokens: number;
  output_tokens: number;
  timestamp: number;
  cost: number;
}

function log(msg: string) {
  console.log(`[MIGRATE] ${msg}`);
}

function main() {
  log("Starting migration to normalize ancestor token inflation...");

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  // Fetch tokens
  const tokensStmt = db.prepare(
    "SELECT id, name, parent_token_id, key_type FROM user_tokens"
  );
  // Cast result rows to RawToken[] (better-sqlite3 returns unknown[] under strict TS)
  const tokens = tokensStmt.all().map(r => r as RawToken);

  // Build ancestor chains (token id -> array of ancestor ids excluding self)
  const parentMap = new Map<string, string | null>();
  tokens.forEach((t) => parentMap.set(t.id, t.parent_token_id));

  function getAncestorChain(tokenId: string): string[] {
    const ancestors: string[] = [];
    let current = parentMap.get(tokenId);
    let safety = 0;
    while (current && safety < 100) {
      ancestors.push(current);
      current = parentMap.get(current) || null;
      safety++;
    }
    return ancestors;
  }

  // Determine leaf tokens: any token that has no children OR simply treat all tokens.
  // We will treat every token with key_type === 'sub' or 'master' as potential leaf,
  // but only records with tokens > 0 will drive ancestor normalization.
  const tokensById = new Map(tokens.map((t) => [t.id, t]));

  // Fetch all usage records
  const usageStmt = db.prepare(
    "SELECT id, user_token_id, model_id, provider_id, tokens, input_tokens, output_tokens, timestamp, cost FROM usage_records"
  );
  const allUsage = usageStmt.all().map(r => r as RawUsage);

  // Index usage by user_token_id for efficiency
  const usageByToken = new Map<string, RawUsage[]>();
  for (const u of allUsage) {
    if (!usageByToken.has(u.user_token_id)) {
      usageByToken.set(u.user_token_id, []);
    }
    usageByToken.get(u.user_token_id)!.push(u);
  }

  // Helper to find ancestor usage records matching leaf usage signature
  function findAncestorInflatedRecords(leafUsage: RawUsage, ancestors: string[]): RawUsage[] {
    const inflated: RawUsage[] = [];
    for (const ancestorId of ancestors) {
      const ancestorRecords = usageByToken.get(ancestorId);
      if (!ancestorRecords) continue;
      for (const ar of ancestorRecords) {
        if (
          ar.model_id === leafUsage.model_id &&
          ar.provider_id === leafUsage.provider_id &&
          Math.abs(ar.timestamp - leafUsage.timestamp) <= TIME_TOLERANCE_MS &&
          ar.tokens > 0 // Only inflated if ancestor has >0 tokens
        ) {
          inflated.push(ar);
        }
      }
    }
    return inflated;
  }

  // Prepare statements
  const backupTableName = `usage_records_backup_${Date.now()}`;
  db.transaction(() => {
    log(`Creating backup table: ${backupTableName}`);
    db.prepare(
      `CREATE TABLE ${backupTableName} AS SELECT * FROM usage_records`
    ).run();
  })();

  const updateStmt = db.prepare(
    "UPDATE usage_records SET tokens = 0, input_tokens = 0, output_tokens = 0 WHERE id = ?"
  );

  let totalAncestorZeroed = 0;
  let totalLeafRecordsExamined = 0;
  let totalInflatedDetected = 0;

  const processFn = () => {
    for (const usage of allUsage) {
      // Leaf candidates only (tokens > 0)
      if (usage.tokens <= 0) continue;

      totalLeafRecordsExamined++;

      const tokenMeta = tokensById.get(usage.user_token_id);
      if (!tokenMeta) continue;

      const ancestors = getAncestorChain(tokenMeta.id);
      if (ancestors.length === 0) continue;

      const inflated = findAncestorInflatedRecords(usage, ancestors);
      if (inflated.length > 0) {
        totalInflatedDetected += inflated.length;
        if (VERBOSE) {
          log(
            `Leaf usage ${usage.id} (${usage.user_token_id}) matched ${inflated.length} ancestor inflated record(s)`
          );
        }
      }
      for (const inf of inflated) {
        if (!DRY_RUN) {
          updateStmt.run(inf.id);
        }
        totalAncestorZeroed++;
        if (VERBOSE) {
          log(`Zeroed ancestor record ${inf.id}${DRY_RUN ? " (dry-run skip)" : ""}`);
        }
      }
    }
  };

  if (DRY_RUN) {
    log("Dry-run mode active: NOT modifying any rows.");
    processFn();
  } else {
    db.transaction(() => {
      processFn();
    })();
  }

  log(`Examined leaf usage records: ${totalLeafRecordsExamined}`);
  log(`Inflated ancestor records detected: ${totalInflatedDetected}`);
  log(`Ancestor records ${DRY_RUN ? "that WOULD be" : "actually"} zeroed: ${totalAncestorZeroed}`);
  log(`Tolerance (ms): ${TIME_TOLERANCE_MS}`);
  log(`Mode: ${DRY_RUN ? "DRY-RUN" : "EXECUTION"}`);
  log("Migration complete.");

  db.close();
}

try {
  main();
} catch (err: any) {
  console.error("[MIGRATE] Migration failed:", err?.message);
  process.exit(1);
}