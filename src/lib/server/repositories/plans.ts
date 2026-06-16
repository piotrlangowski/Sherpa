import db from '../db';
import type { Plan } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export const plansRepository = {
  getAll(): Plan[] {
    const rows = db.prepare("SELECT id, name, description, base_price, created_at, updated_at FROM plans ORDER BY name ASC").all() as any[];
    
    return rows.map(r => {
      // Load services directly in plan
      const serviceRows = db.prepare(`
        SELECT s.id, s.name, s.status
        FROM services s
        JOIN plan_services ps ON s.id = ps.service_id
        WHERE ps.plan_id = ?
      `).all(r.id) as any[];

      // Load packs in plan
      const packRows = db.prepare(`
        SELECT p.id, p.name
        FROM packs p
        JOIN plan_packs pp ON p.id = pp.pack_id
        WHERE pp.plan_id = ?
      `).all(r.id) as any[];

      return {
        id: r.id,
        name: r.name,
        description: r.description || '',
        base_price: r.base_price,
        created_at: r.created_at,
        updated_at: r.updated_at,
        services: serviceRows,
        packs: packRows
      };
    });
  },

  getById(id: string): Plan | null {
    const r = db.prepare("SELECT id, name, description, base_price, created_at, updated_at FROM plans WHERE id = ?").get(id) as any;
    if (!r) return null;
    
    const serviceRows = db.prepare(`
      SELECT s.id, s.name, s.status, s.provider_id, s.avg_input_tokens, s.avg_output_tokens, 
             s.avg_requests_per_user_month, s.fixed_cost_per_month
      FROM services s
      JOIN plan_services ps ON s.id = ps.service_id
      WHERE ps.plan_id = ?
    `).all(id) as any[];

    const packRows = db.prepare(`
      SELECT p.id, p.name, p.description
      FROM packs p
      JOIN plan_packs pp ON p.id = pp.pack_id
      WHERE pp.plan_id = ?
    `).all(id) as any[];
    
    return {
      id: r.id,
      name: r.name,
      description: r.description || '',
      base_price: r.base_price,
      created_at: r.created_at,
      updated_at: r.updated_at,
      services: serviceRows,
      packs: packRows
    };
  },

  create(data: Omit<Plan, 'id' | 'created_at' | 'updated_at'> & { service_ids?: string[]; pack_ids?: string[] }): Plan {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    db.transaction(() => {
      db.prepare("INSERT INTO plans (id, name, description, base_price, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(id, data.name, data.description || null, data.base_price, now, now);
        
      if (data.service_ids && data.service_ids.length > 0) {
        const insertServiceLink = db.prepare("INSERT INTO plan_services (plan_id, service_id) VALUES (?, ?)");
        for (const sId of data.service_ids) {
          insertServiceLink.run(id, sId);
        }
      }
      
      if (data.pack_ids && data.pack_ids.length > 0) {
        const insertPackLink = db.prepare("INSERT INTO plan_packs (plan_id, pack_id) VALUES (?, ?)");
        for (const pId of data.pack_ids) {
          insertPackLink.run(id, pId);
        }
      }
    })();
    
    return this.getById(id)!;
  },

  update(id: string, data: Partial<Omit<Plan, 'id' | 'created_at' | 'updated_at'>> & { service_ids?: string[]; pack_ids?: string[] }): void {
    const current = this.getById(id);
    if (!current) throw new Error(`Plan not found: ${id}`);
    
    const name = data.name !== undefined ? data.name : current.name;
    const description = data.description !== undefined ? data.description : current.description;
    const base_price = data.base_price !== undefined ? data.base_price : current.base_price;
    const now = new Date().toISOString();
    
    db.transaction(() => {
      db.prepare("UPDATE plans SET name = ?, description = ?, base_price = ?, updated_at = ? WHERE id = ?")
        .run(name, description || null, base_price, now, id);
        
      if (data.service_ids !== undefined) {
        db.prepare("DELETE FROM plan_services WHERE plan_id = ?").run(id);
        if (data.service_ids.length > 0) {
          const insertServiceLink = db.prepare("INSERT INTO plan_services (plan_id, service_id) VALUES (?, ?)");
          for (const sId of data.service_ids) {
            insertServiceLink.run(id, sId);
          }
        }
      }
      
      if (data.pack_ids !== undefined) {
        db.prepare("DELETE FROM plan_packs WHERE plan_id = ?").run(id);
        if (data.pack_ids.length > 0) {
          const insertPackLink = db.prepare("INSERT INTO plan_packs (plan_id, pack_id) VALUES (?, ?)");
          for (const pId of data.pack_ids) {
            insertPackLink.run(id, pId);
          }
        }
      }
    })();
  },

  delete(id: string): void {
    db.transaction(() => {
      db.prepare("DELETE FROM plan_services WHERE plan_id = ?").run(id);
      db.prepare("DELETE FROM plan_packs WHERE plan_id = ?").run(id);
      db.prepare("DELETE FROM vertical_plans WHERE plan_id = ?").run(id);
      db.prepare("DELETE FROM scenario_plans WHERE plan_id = ?").run(id);
      db.prepare("DELETE FROM monetization_configs WHERE entity_type = 'plan' AND entity_id = ?").run(id);
      db.prepare("DELETE FROM scenario_entity_overrides WHERE entity_type = 'plan' AND entity_id = ?").run(id);
      db.prepare("DELETE FROM plans WHERE id = ?").run(id);
    })();
  }
};
