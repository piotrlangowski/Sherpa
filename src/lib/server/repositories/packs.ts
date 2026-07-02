import db from '../db';
import type { Pack, Service } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { scenariosRepository } from './scenarios';

export const packsRepository = {
  getAll(): Pack[] {
    const rows = db.prepare("SELECT id, name, description, created_at, updated_at FROM packs ORDER BY name ASC").all() as any[];
    
    return rows.map(r => {
      // Load services in pack
      const serviceRows = db.prepare(`
        SELECT s.id, s.name, s.status
        FROM services s
        JOIN pack_services ps ON s.id = ps.service_id
        WHERE ps.pack_id = ?
      `).all(r.id) as any[];

      return {
        id: r.id,
        name: r.name,
        description: r.description || '',
        created_at: r.created_at,
        updated_at: r.updated_at,
        services: serviceRows
      };
    });
  },

  getById(id: string): Pack | null {
    const r = db.prepare("SELECT id, name, description, created_at, updated_at FROM packs WHERE id = ?").get(id) as any;
    if (!r) return null;
    
    const serviceRows = db.prepare(`
      SELECT s.id, s.name, s.status, s.provider_id, s.avg_input_tokens, s.avg_output_tokens, 
             s.avg_requests_per_user_month, s.fixed_cost_per_month
      FROM services s
      JOIN pack_services ps ON s.id = ps.service_id
      WHERE ps.pack_id = ?
    `).all(id) as any[];
    
    return {
      id: r.id,
      name: r.name,
      description: r.description || '',
      created_at: r.created_at,
      updated_at: r.updated_at,
      services: serviceRows
    };
  },

  create(data: Omit<Pack, 'id' | 'created_at' | 'updated_at'> & { service_ids?: string[] }): Pack {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    db.transaction(() => {
      db.prepare("INSERT INTO packs (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
        .run(id, data.name, data.description || null, now, now);
        
      if (data.service_ids && data.service_ids.length > 0) {
        const insertLink = db.prepare("INSERT INTO pack_services (pack_id, service_id) VALUES (?, ?)");
        for (const sId of data.service_ids) {
          insertLink.run(id, sId);
        }
      }
    })();
    
    return this.getById(id)!;
  },

  update(id: string, data: Partial<Omit<Pack, 'id' | 'created_at' | 'updated_at'>> & { service_ids?: string[] }): void {
    const current = this.getById(id);
    if (!current) throw new Error(`Pack not found: ${id}`);
    
    const name = data.name !== undefined ? data.name : current.name;
    const description = data.description !== undefined ? data.description : current.description;
    const now = new Date().toISOString();
    
    db.transaction(() => {
      db.prepare("UPDATE packs SET name = ?, description = ?, updated_at = ? WHERE id = ?")
        .run(name, description || null, now, id);
        
      if (data.service_ids !== undefined) {
        db.prepare("DELETE FROM pack_services WHERE pack_id = ?").run(id);
        if (data.service_ids.length > 0) {
          const insertLink = db.prepare("INSERT INTO pack_services (pack_id, service_id) VALUES (?, ?)");
          for (const sId of data.service_ids) {
            insertLink.run(id, sId);
          }
        }
      }
    })();

    const affected = scenariosRepository.findScenarioIdsByPackId(id);
    scenariosRepository.invalidateResults(affected);
  },

  delete(id: string): void {
    const affected = scenariosRepository.findScenarioIdsByPackId(id);
    db.transaction(() => {
      db.prepare("DELETE FROM pack_services WHERE pack_id = ?").run(id);
      db.prepare("DELETE FROM plan_packs WHERE pack_id = ?").run(id);
      db.prepare("DELETE FROM vertical_packs WHERE pack_id = ?").run(id);
      db.prepare("DELETE FROM scenario_packs WHERE pack_id = ?").run(id);
      db.prepare("DELETE FROM monetization_configs WHERE entity_type = 'pack' AND entity_id = ?").run(id);
      db.prepare("DELETE FROM packs WHERE id = ?").run(id);
    })();
    scenariosRepository.invalidateResults(affected);
  }
};
