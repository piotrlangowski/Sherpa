import path from 'path';
import fs from 'fs';
import { SherpaDatabase } from '../shared/sqlite-adapter';
import { runMigrations } from '../shared/db-schema';
import { seedDatabase } from '../shared/seed';

const dbDir = path.join(process.cwd(), 'data');
const dbPath = path.join(dbDir, 'sherpa.db');

// Ensure database directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db: SherpaDatabase;

try {
  db = new SherpaDatabase(dbPath);
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
