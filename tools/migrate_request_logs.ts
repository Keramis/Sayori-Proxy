import Database from 'better-sqlite3';
import * as path from 'path';

/**
 * Migration script to update request_logs table schema
 * Makes model_id and provider_id nullable to support logging failed/unauthorized requests
 */

const dbPath = path.join(process.cwd(), 'database.sqlite');

console.log('Starting request_logs migration...');
console.log(`Database path: ${dbPath}`);

const db = new Database(dbPath);
db.pragma('foreign_keys = OFF');

try {
  // Start transaction
  db.exec('BEGIN TRANSACTION');

  // Check if request_logs table exists
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='request_logs'"
  ).get();

  if (!tableExists) {
    console.log('request_logs table does not exist. No migration needed.');
    db.exec('COMMIT');
    db.close();
    process.exit(0);
  }

  console.log('Backing up existing request_logs data...');

  // Create temporary backup table
  db.exec(`
    CREATE TABLE request_logs_backup AS 
    SELECT * FROM request_logs
  `);

  const backupCount = db.prepare('SELECT COUNT(*) as count FROM request_logs_backup').get() as { count: number };
  console.log(`Backed up ${backupCount.count} records`);

  // Drop old table
  console.log('Dropping old request_logs table...');
  db.exec('DROP TABLE request_logs');

  // Create new table with updated schema
  console.log('Creating new request_logs table with nullable model_id and provider_id...');
  db.exec(`
    CREATE TABLE request_logs (
      id TEXT PRIMARY KEY,
      ip TEXT NOT NULL,
      discord_user_id TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      model_id TEXT,
      provider_id TEXT,
      timestamp INTEGER NOT NULL,
      referer TEXT,
      status_code INTEGER NOT NULL,
      latency INTEGER NOT NULL,
      FOREIGN KEY (discord_user_id) REFERENCES discord_users(id) ON DELETE SET NULL,
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE SET NULL,
      FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL
    )
  `);

  // Restore data from backup
  console.log('Restoring data to new table...');
  db.exec(`
    INSERT INTO request_logs (
      id, ip, discord_user_id, input_tokens, output_tokens,
      model_id, provider_id, timestamp, referer, status_code, latency
    )
    SELECT 
      id, ip, discord_user_id, input_tokens, output_tokens,
      model_id, provider_id, timestamp, referer, status_code, latency
    FROM request_logs_backup
  `);

  const newCount = db.prepare('SELECT COUNT(*) as count FROM request_logs').get() as { count: number };
  console.log(`Restored ${newCount.count} records`);

  // Recreate indexes
  console.log('Recreating indexes...');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_request_logs_ip ON request_logs(ip);
    CREATE INDEX IF NOT EXISTS idx_request_logs_discord_user_id ON request_logs(discord_user_id);
    CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp ON request_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_request_logs_model_id ON request_logs(model_id);
    CREATE INDEX IF NOT EXISTS idx_request_logs_provider_id ON request_logs(provider_id);
  `);

  // Drop backup table
  console.log('Cleaning up backup table...');
  db.exec('DROP TABLE request_logs_backup');

  // Commit transaction
  db.exec('COMMIT');

  console.log('✅ Migration completed successfully!');
  console.log(`   - ${newCount.count} records migrated`);
  console.log('   - model_id and provider_id are now nullable');
  console.log('   - All indexes recreated');

} catch (error) {
  console.error('❌ Migration failed:', error);
  db.exec('ROLLBACK');
  throw error;
} finally {
  db.pragma('foreign_keys = ON');
  db.close();
}