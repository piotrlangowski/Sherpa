import db from '../db';
import type { CohortConfig } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export const cohortsRepository = {
  getAll(): CohortConfig[] {
    const rows = db.prepare(`
      SELECT c.id, c.name, c.vertical_id, c.current_users, c.monthly_acquisition, 
             c.acquisition_growth_rate, c.monthly_churn_rate, c.retention_floor, 
             c.monthly_expansion_rate, c.ai_adoption_rate, c.base_arpu, c.created_at, c.updated_at,
             v.name as vertical_name
      FROM cohort_configs c
      LEFT JOIN verticals v ON c.vertical_id = v.id
      ORDER BY c.name ASC
    `).all() as any[];
    
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      vertical_id: r.vertical_id,
      current_users: r.current_users,
      monthly_acquisition: r.monthly_acquisition,
      acquisition_growth_rate: r.acquisition_growth_rate,
      monthly_churn_rate: r.monthly_churn_rate,
      retention_floor: r.retention_floor,
      monthly_expansion_rate: r.monthly_expansion_rate,
      ai_adoption_rate: r.ai_adoption_rate,
      base_arpu: r.base_arpu,
      created_at: r.created_at,
      updated_at: r.updated_at,
      vertical_name: r.vertical_name || undefined
    }));
  },

  getById(id: string): CohortConfig | null {
    const r = db.prepare(`
      SELECT c.id, c.name, c.vertical_id, c.current_users, c.monthly_acquisition, 
             c.acquisition_growth_rate, c.monthly_churn_rate, c.retention_floor, 
             c.monthly_expansion_rate, c.ai_adoption_rate, c.base_arpu, c.created_at, c.updated_at,
             v.name as vertical_name
      FROM cohort_configs c
      LEFT JOIN verticals v ON c.vertical_id = v.id
      WHERE c.id = ?
    `).get(id) as any;
    
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      vertical_id: r.vertical_id,
      current_users: r.current_users,
      monthly_acquisition: r.monthly_acquisition,
      acquisition_growth_rate: r.acquisition_growth_rate,
      monthly_churn_rate: r.monthly_churn_rate,
      retention_floor: r.retention_floor,
      monthly_expansion_rate: r.monthly_expansion_rate,
      ai_adoption_rate: r.ai_adoption_rate,
      base_arpu: r.base_arpu,
      created_at: r.created_at,
      updated_at: r.updated_at,
      vertical_name: r.vertical_name || undefined
    };
  },

  create(data: Omit<CohortConfig, 'id' | 'created_at' | 'updated_at'>): CohortConfig {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO cohort_configs (id, name, vertical_id, current_users, monthly_acquisition, 
                                 acquisition_growth_rate, monthly_churn_rate, retention_floor, 
                                 monthly_expansion_rate, ai_adoption_rate, base_arpu, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.name,
      data.vertical_id || null,
      data.current_users,
      data.monthly_acquisition,
      data.acquisition_growth_rate,
      data.monthly_churn_rate,
      data.retention_floor,
      data.monthly_expansion_rate,
      data.ai_adoption_rate,
      data.base_arpu,
      now,
      now
    );
    
    return this.getById(id)!;
  },

  update(id: string, data: Partial<Omit<CohortConfig, 'id' | 'created_at' | 'updated_at'>>): void {
    const current = this.getById(id);
    if (!current) throw new Error(`Cohort configuration not found: ${id}`);
    
    const name = data.name !== undefined ? data.name : current.name;
    const vertical_id = data.vertical_id !== undefined ? data.vertical_id : current.vertical_id;
    const current_users = data.current_users !== undefined ? data.current_users : current.current_users;
    const monthly_acquisition = data.monthly_acquisition !== undefined ? data.monthly_acquisition : current.monthly_acquisition;
    const acquisition_growth_rate = data.acquisition_growth_rate !== undefined ? data.acquisition_growth_rate : current.acquisition_growth_rate;
    const monthly_churn_rate = data.monthly_churn_rate !== undefined ? data.monthly_churn_rate : current.monthly_churn_rate;
    const retention_floor = data.retention_floor !== undefined ? data.retention_floor : current.retention_floor;
    const monthly_expansion_rate = data.monthly_expansion_rate !== undefined ? data.monthly_expansion_rate : current.monthly_expansion_rate;
    const ai_adoption_rate = data.ai_adoption_rate !== undefined ? data.ai_adoption_rate : current.ai_adoption_rate;
    const base_arpu = data.base_arpu !== undefined ? data.base_arpu : current.base_arpu;
    const now = new Date().toISOString();
    
    db.prepare(`
      UPDATE cohort_configs
      SET name = ?, vertical_id = ?, current_users = ?, monthly_acquisition = ?, 
          acquisition_growth_rate = ?, monthly_churn_rate = ?, retention_floor = ?, 
          monthly_expansion_rate = ?, ai_adoption_rate = ?, base_arpu = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name,
      vertical_id || null,
      current_users,
      monthly_acquisition,
      acquisition_growth_rate,
      monthly_churn_rate,
      retention_floor,
      monthly_expansion_rate,
      ai_adoption_rate,
      base_arpu,
      now,
      id
    );
  },

  delete(id: string): void {
    db.transaction(() => {
      db.prepare("UPDATE scenarios SET cohort_config_id = NULL WHERE cohort_config_id = ?").run(id);
      db.prepare("DELETE FROM cohort_configs WHERE id = ?").run(id);
    })();
  }
};
