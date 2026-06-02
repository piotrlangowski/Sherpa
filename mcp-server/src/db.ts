import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const dbPaths = [
  process.env.SHERPA_DB_PATH,
  '/Users/piotrlangowski/Documents/Sherpa/data/sherpa.db',
  path.join(process.cwd(), '../data/sherpa.db'),
  path.join(process.cwd(), 'data/sherpa.db'),
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data/sherpa.db')
].filter(Boolean) as string[];

let dbPath = '';
for (const p of dbPaths) {
  if (fs.existsSync(p)) {
    dbPath = p;
    break;
  }
}

// Fallback to absolute default
if (!dbPath) {
  dbPath = '/Users/piotrlangowski/Documents/Sherpa/data/sherpa.db';
}

// Always log to stderr in MCP servers to avoid stdout JSON-RPC corruption
console.error(`MCP connecting to database at: ${dbPath}`);

let db: Database.Database;
try {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
} catch (err) {
  console.error(`MCP failed to open database: ${err}`);
  throw err;
}

export default db;
export { dbPath };
