import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'sherpa.db');
const db = new Database(dbPath);

console.log('Seeded tables and count of rows:');
const tables = ['settings', 'providers', 'services', 'packs', 'plans', 'verticals', 'cost_items', 'cohort_configs', 'scenarios', 'scenario_services', 'scenario_results'];
for (const table of tables) {
  try {
    const row = db.prepare(`SELECT count(*) as count FROM ${table}`).get();
    console.log(`- ${table}: ${row.count} rows`);
  } catch (err) {
    console.error(`- ${table}: Error - ${err.message}`);
  }
}

const settings = db.prepare(`SELECT * FROM settings`).all();
console.log('Settings:', settings);
