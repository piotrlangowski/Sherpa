import db from '../db';
import type { ClientBase } from '../../types';

export const clientBaseRepository = {
  get(): ClientBase {
    let row = db.prepare("SELECT * FROM client_base WHERE id = 'singleton'").get() as ClientBase | undefined;
    
    if (!row) {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO client_base (id, updated_at)
        VALUES ('singleton', ?)
      `).run(now);
      row = db.prepare("SELECT * FROM client_base WHERE id = 'singleton'").get() as ClientBase;
    }
    
    return row;
  },

  update(data: Partial<Omit<ClientBase, 'id' | 'updated_at'>>): ClientBase {
    const current = this.get();
    
    const total_users = data.total_users !== undefined ? data.total_users : current.total_users;
    const default_arpu = data.default_arpu !== undefined ? data.default_arpu : current.default_arpu;
    const default_monthly_churn_rate = data.default_monthly_churn_rate !== undefined ? data.default_monthly_churn_rate : current.default_monthly_churn_rate;
    const default_monthly_acquisition = data.default_monthly_acquisition !== undefined ? data.default_monthly_acquisition : current.default_monthly_acquisition;
    const default_acquisition_growth_rate = data.default_acquisition_growth_rate !== undefined ? data.default_acquisition_growth_rate : current.default_acquisition_growth_rate;
    const default_ai_adoption_rate = data.default_ai_adoption_rate !== undefined ? data.default_ai_adoption_rate : current.default_ai_adoption_rate;
    const default_retention_floor = data.default_retention_floor !== undefined ? data.default_retention_floor : current.default_retention_floor;
    const default_expansion_rate = data.default_expansion_rate !== undefined ? data.default_expansion_rate : current.default_expansion_rate;
    const now = new Date().toISOString();
    
    db.prepare(`
      UPDATE client_base
      SET total_users = ?, default_arpu = ?, default_monthly_churn_rate = ?,
          default_monthly_acquisition = ?, default_acquisition_growth_rate = ?,
          default_ai_adoption_rate = ?, default_retention_floor = ?,
          default_expansion_rate = ?, updated_at = ?
      WHERE id = 'singleton'
    `).run(
      total_users, default_arpu, default_monthly_churn_rate,
      default_monthly_acquisition, default_acquisition_growth_rate,
      default_ai_adoption_rate, default_retention_floor,
      default_expansion_rate, now
    );
    
    return this.get();
  }
};
