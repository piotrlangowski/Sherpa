import db from '../db';
import type { Settings, Currency } from '../../types';

export const settingsRepository = {
  get(): Settings {
    const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    const settingsMap: Record<string, string> = {};
    for (const r of rows) {
      settingsMap[r.key] = r.value;
    }
    
    return {
      company_name: settingsMap['company_name'] || 'Acme Analytics',
      currency: (settingsMap['currency'] as Currency) || 'USD',
      default_discount_rate: parseFloat(settingsMap['default_discount_rate'] || '0.10'),
      setup_completed: settingsMap['setup_completed'] === '1',
      projection_horizon_months: parseInt(settingsMap['projection_horizon_months'] || '36', 10),
      hubspot_access_token: settingsMap['hubspot_access_token'] || ''
    };
  },

  update(settings: Partial<Settings>): void {
    const updateStmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    db.transaction(() => {
      if (settings.company_name !== undefined) {
        updateStmt.run('company_name', settings.company_name);
      }
      if (settings.currency !== undefined) {
        updateStmt.run('currency', settings.currency);
      }
      if (settings.default_discount_rate !== undefined) {
        updateStmt.run('default_discount_rate', settings.default_discount_rate.toString());
      }
      if (settings.setup_completed !== undefined) {
        updateStmt.run('setup_completed', settings.setup_completed ? '1' : '0');
      }
      if (settings.projection_horizon_months !== undefined) {
        updateStmt.run('projection_horizon_months', settings.projection_horizon_months.toString());
      }
      if (settings.hubspot_access_token !== undefined) {
        updateStmt.run('hubspot_access_token', settings.hubspot_access_token);
      }
    })();
  },

  async reset(): Promise<void> {
    // Delete database file and let db init trigger seed
    db.transaction(() => {
      db.prepare("DELETE FROM settings").run();
      db.prepare("DELETE FROM providers").run();
      db.prepare("DELETE FROM services").run();
      db.prepare("DELETE FROM packs").run();
      db.prepare("DELETE FROM pack_services").run();
      db.prepare("DELETE FROM plans").run();
      db.prepare("DELETE FROM plan_services").run();
      db.prepare("DELETE FROM plan_packs").run();
      db.prepare("DELETE FROM service_dependencies").run();
      db.prepare("DELETE FROM verticals").run();
      db.prepare("DELETE FROM vertical_plans").run();
      db.prepare("DELETE FROM vertical_packs").run();
      db.prepare("DELETE FROM cost_items").run();
      db.prepare("DELETE FROM cohort_configs").run();
      db.prepare("DELETE FROM scenarios").run();
      db.prepare("DELETE FROM scenario_services").run();
      db.prepare("DELETE FROM scenario_packs").run();
      db.prepare("DELETE FROM scenario_plans").run();
      db.prepare("DELETE FROM scenario_costs").run();
      db.prepare("DELETE FROM scenario_results").run();
    })();
    // Re-seed since settings table is empty
    const { seedDatabase } = await import('../seed');
    seedDatabase(db);
  }
};
