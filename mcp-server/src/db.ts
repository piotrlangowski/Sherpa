import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { SherpaDatabase } from './shared/sqlite-adapter.js';
import { runMigrations } from './shared/db-schema.js';
import { seedDatabase } from './shared/seed.js';

function userDataDir(): string {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Sherpa');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Sherpa');
  }
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'Sherpa');
}

// Resolution order:
// 1. SHERPA_DB_PATH — always wins, even if the file does not exist yet.
//    Dev/test environment separation relies on this: a fresh path must never
//    silently fall back to another database.
// 2. <repo>/data/sherpa.db — when running from the repository (build/ sits at
//    mcp-server/build/), share the database with the SvelteKit dev app.
// 3. OS user data directory — packaged installs (e.g. Claude Desktop extension).
// Guard against an unsubstituted "${user_config...}" placeholder or empty value
// coming from an extension host's mcp_config env block
const envDbPath =
  process.env.SHERPA_DB_PATH && !process.env.SHERPA_DB_PATH.includes('${')
    ? process.env.SHERPA_DB_PATH
    : undefined;

let dbPath: string;
if (envDbPath) {
  dbPath = envDbPath;
} else {
  const repoDbPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data/sherpa.db');
  dbPath = fs.existsSync(repoDbPath) ? repoDbPath : path.join(userDataDir(), 'sherpa.db');
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// Always log to stderr in MCP servers to avoid stdout JSON-RPC corruption
console.error(`MCP connecting to database at: ${dbPath}`);

let db: SherpaDatabase;
try {
  db = new SherpaDatabase(dbPath);
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
