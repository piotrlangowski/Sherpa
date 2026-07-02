import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { SherpaDatabase } from './shared/sqlite-adapter.js';
import { resolveSherpaDbPath } from './shared/db-path.js';
import { runMigrations } from './shared/db-schema.js';
import { seedDatabase } from './shared/seed.js';

const repoDbPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data/sherpa.db');
const dbPath = resolveSherpaDbPath({ repoDbPath });

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// Always log to stderr in MCP servers to avoid stdout JSON-RPC corruption
console.error(`MCP connecting to database at: ${dbPath}`);

let db: SherpaDatabase;
try {
  db = new SherpaDatabase(dbPath);
  // busy_timeout must be set BEFORE journal_mode: switching to WAL takes a brief exclusive
  // lock, and without a timeout a concurrent opener (dashboard + MCP write the same file)
  // fails immediately with "database is locked".
  db.pragma('busy_timeout = 5000');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Self-initialize: create the schema and demo data on first run so the
  // server works standalone, without the SvelteKit app having run first.
  runMigrations(db);
  seedDatabase(db);
} catch (err) {
  console.error(`MCP failed to open database: ${err}`);
  throw err;
}

export default db;
export { dbPath };
