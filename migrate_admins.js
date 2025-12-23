import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'database.sqlite');
const db = new Database(dbPath);

console.log('Migrating database...');

try {
  // Check if admins table exists
  const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admins'").get();
  
  if (!tableCheck) {
    console.log('Creating admins table...');
    db.exec(`
      CREATE TABLE admins (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
    console.log('Admins table created successfully.');
  } else {
    console.log('Admins table already exists.');
  }
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}

console.log('Migration complete.');
