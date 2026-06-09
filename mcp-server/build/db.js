import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
// Canonical path: build/ sits at mcp-server/build/, so ../../data/sherpa.db resolves to <project-root>/data/sherpa.db
const canonicalPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data/sherpa.db');
const dbPaths = [
    process.env.SHERPA_DB_PATH,
    canonicalPath,
    path.join(process.cwd(), 'data/sherpa.db'),
    path.join(process.cwd(), '../data/sherpa.db'),
].filter(Boolean);
let dbPath = canonicalPath;
for (const p of dbPaths) {
    if (fs.existsSync(p)) {
        dbPath = p;
        break;
    }
}
// Always log to stderr in MCP servers to avoid stdout JSON-RPC corruption
console.error(`MCP connecting to database at: ${dbPath}`);
let db;
try {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
}
catch (err) {
    console.error(`MCP failed to open database: ${err}`);
    throw err;
}
export default db;
export { dbPath };
