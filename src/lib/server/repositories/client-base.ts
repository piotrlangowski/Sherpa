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
    const default_arpu_uplift = data.default_arpu_uplift !== undefined ? data.default_arpu_uplift : current.default_arpu_uplift;
    const default_arpu_uplift_percent = data.default_arpu_uplift_percent !== undefined ? data.default_arpu_uplift_percent : current.default_arpu_uplift_percent;
    const default_churn_reduction = data.default_churn_reduction !== undefined ? data.default_churn_reduction : current.default_churn_reduction;
    const default_acquisition_uplift = data.default_acquisition_uplift !== undefined ? data.default_acquisition_uplift : current.default_acquisition_uplift;
    const default_gross_margin = data.default_gross_margin !== undefined ? data.default_gross_margin : (current.default_gross_margin !== undefined ? current.default_gross_margin : 1.0);
    const default_adoption_ramp_months = data.default_adoption_ramp_months !== undefined ? data.default_adoption_ramp_months : (current.default_adoption_ramp_months !== undefined ? current.default_adoption_ramp_months : 0);
    const default_copilot_margin_threshold = data.default_copilot_margin_threshold !== undefined ? data.default_copilot_margin_threshold : (current.default_copilot_margin_threshold !== undefined ? current.default_copilot_margin_threshold : 0.78);
    const default_agent_margin_threshold = data.default_agent_margin_threshold !== undefined ? data.default_agent_margin_threshold : (current.default_agent_margin_threshold !== undefined ? current.default_agent_margin_threshold : 0.62);
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE client_base
      SET total_users = ?, default_arpu = ?, default_monthly_churn_rate = ?,
          default_monthly_acquisition = ?, default_acquisition_growth_rate = ?,
          default_ai_adoption_rate = ?, default_retention_floor = ?,
          default_expansion_rate = ?, default_arpu_uplift = ?, default_arpu_uplift_percent = ?,
          default_churn_reduction = ?, default_acquisition_uplift = ?,
          default_gross_margin = ?, default_adoption_ramp_months = ?,
          default_copilot_margin_threshold = ?, default_agent_margin_threshold = ?, updated_at = ?
      WHERE id = 'singleton'
    `).run(
      total_users, default_arpu, default_monthly_churn_rate,
      default_monthly_acquisition, default_acquisition_growth_rate,
      default_ai_adoption_rate, default_retention_floor,
      default_expansion_rate, default_arpu_uplift, default_arpu_uplift_percent,
      default_churn_reduction, default_acquisition_uplift,
      default_gross_margin, default_adoption_ramp_months,
      default_copilot_margin_threshold, default_agent_margin_threshold, now
    );
    
    return this.get();
  }
};
