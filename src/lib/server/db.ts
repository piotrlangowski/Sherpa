import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { runMigrations } from './schema';
import { seedDatabase } from './seed';

const dbDir = path.join(process.cwd(), 'data');
const dbPath = path.join(dbDir, 'sherpa.db');

// Ensure database directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db: Database.Database;

try {
  db = new Database(dbPath, { verbose: console.log });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  
  // Initialize Schema
  runMigrations(db);
  
  // Initialize Seed Data
  seedDatabase(db);
  
} catch (err) {
  console.error('Failed to initialize SQLite Database:', err);
  throw err;
}

export default db;
