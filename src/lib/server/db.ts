import path from 'path';
import fs from 'fs';
import { dev } from '$app/environment';
import { SherpaDatabase } from '../shared/sqlite-adapter';
import { resolveSherpaDbPath } from '../shared/db-path';
import { runMigrations } from '../shared/db-schema';
import { seedDatabase } from '../shared/seed';

// Under `npm run dev` cwd is the repo root — always use ./data/sherpa.db (legacy
// behavior, creates it on first run). In the standalone build the launcher always
// sets SHERPA_DB_PATH; run manually without it, an existing repo DB still wins.
const dbPath = resolveSherpaDbPath({
  repoDbPath: path.join(process.cwd(), 'data', 'sherpa.db'),
  preferRepoPath: dev
});
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

let db: SherpaDatabase;
try {
  db = new SherpaDatabase(dbPath);
  // busy_timeout must be set BEFORE journal_mode: switching to WAL takes a brief exclusive
  // lock, and without a timeout a concurrent opener (dashboard + MCP write the same file,
  // parallel test workers too) fails immediately with "database is locked".
  db.pragma('busy_timeout = 5000');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  seedDatabase(db);
} catch (err) {
  console.error('Failed to initialize SQLite Database:', err);
  throw err;
}

export default db;
export { dbPath };
