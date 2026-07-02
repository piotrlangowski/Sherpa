import db from '../db';
import type { Vertical } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { scenariosRepository } from './scenarios';

export const verticalsRepository = {
  getAll(): Vertical[] {
    const rows = db.prepare("SELECT id, name, description, tam_users, sam_users, som_users, created_at, updated_at FROM verticals ORDER BY name ASC").all() as any[];
    
    return rows.map(r => {
      // Load linked plans
      const planRows = db.prepare(`
        SELECT p.id, p.name
        FROM plans p
        JOIN vertical_plans vp ON p.id = vp.plan_id
        WHERE vp.vertical_id = ?
      `).all(r.id) as any[];

      // Load linked packs
      const packRows = db.prepare(`
        SELECT pk.id, pk.name
        FROM packs pk
        JOIN vertical_packs vpk ON pk.id = vpk.pack_id
        WHERE vpk.vertical_id = ?
      `).all(r.id) as any[];

      return {
        id: r.id,
        name: r.name,
        description: r.description || '',
        tam_users: r.tam_users,
        sam_users: r.sam_users,
        som_users: r.som_users,
        created_at: r.created_at,
        updated_at: r.updated_at,
        plans: planRows,
        packs: packRows
      };
    });
  },

  getById(id: string): Vertical | null {
    const r = db.prepare("SELECT id, name, description, tam_users, sam_users, som_users, created_at, updated_at FROM verticals WHERE id = ?").get(id) as any;
    if (!r) return null;
    
    const planRows = db.prepare(`
      SELECT p.id, p.name, p.base_price
      FROM plans p
      JOIN vertical_plans vp ON p.id = vp.plan_id
      WHERE vp.vertical_id = ?
    `).all(id) as any[];

    const packRows = db.prepare(`
      SELECT pk.id, pk.name, pk.description
      FROM packs pk
      JOIN vertical_packs vpk ON pk.id = vpk.pack_id
      WHERE vpk.vertical_id = ?
    `).all(id) as any[];
    
    return {
      id: r.id,
      name: r.name,
      description: r.description || '',
      tam_users: r.tam_users,
      sam_users: r.sam_users,
      som_users: r.som_users,
      created_at: r.created_at,
      updated_at: r.updated_at,
      plans: planRows,
      packs: packRows
    };
  },

  create(data: Omit<Vertical, 'id' | 'created_at' | 'updated_at'> & { plan_ids?: string[]; pack_ids?: string[] }): Vertical {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    db.transaction(() => {
      db.prepare(`
        INSERT INTO verticals (id, name, description, tam_users, sam_users, som_users, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, data.name, data.description || null, data.tam_users, data.sam_users, data.som_users, now, now);
        
      if (data.plan_ids && data.plan_ids.length > 0) {
        const insertPlanLink = db.prepare("INSERT INTO vertical_plans (vertical_id, plan_id) VALUES (?, ?)");
        for (const pId of data.plan_ids) {
          insertPlanLink.run(id, pId);
        }
      }
      
      if (data.pack_ids && data.pack_ids.length > 0) {
        const insertPackLink = db.prepare("INSERT INTO vertical_packs (vertical_id, pack_id) VALUES (?, ?)");
        for (const pkId of data.pack_ids) {
          insertPackLink.run(id, pkId);
        }
      }
    })();
    
    return this.getById(id)!;
  },

  update(id: string, data: Partial<Omit<Vertical, 'id' | 'created_at' | 'updated_at'>> & { plan_ids?: string[]; pack_ids?: string[] }): void {
    const current = this.getById(id);
    if (!current) throw new Error(`Vertical not found: ${id}`);
    
    const name = data.name !== undefined ? data.name : current.name;
    const description = data.description !== undefined ? data.description : current.description;
    const tam_users = data.tam_users !== undefined ? data.tam_users : current.tam_users;
    const sam_users = data.sam_users !== undefined ? data.sam_users : current.sam_users;
    const som_users = data.som_users !== undefined ? data.som_users : current.som_users;
    const now = new Date().toISOString();
    
    db.transaction(() => {
      db.prepare(`
        UPDATE verticals
        SET name = ?, description = ?, tam_users = ?, sam_users = ?, som_users = ?, updated_at = ?
        WHERE id = ?
      `).run(name, description || null, tam_users, sam_users, som_users, now, id);
        
      if (data.plan_ids !== undefined) {
        db.prepare("DELETE FROM vertical_plans WHERE vertical_id = ?").run(id);
        if (data.plan_ids.length > 0) {
          const insertPlanLink = db.prepare("INSERT INTO vertical_plans (vertical_id, plan_id) VALUES (?, ?)");
          for (const pId of data.plan_ids) {
            insertPlanLink.run(id, pId);
          }
        }
      }
      
      if (data.pack_ids !== undefined) {
        db.prepare("DELETE FROM vertical_packs WHERE vertical_id = ?").run(id);
        if (data.pack_ids.length > 0) {
          const insertPackLink = db.prepare("INSERT INTO vertical_packs (vertical_id, pack_id) VALUES (?, ?)");
          for (const pkId of data.pack_ids) {
            insertPackLink.run(id, pkId);
          }
        }
      }
    })();

    const affected = scenariosRepository.findScenarioIdsByVerticalId(id);
    scenariosRepository.invalidateResults(affected);
  },

  delete(id: string): void {
    const affected = scenariosRepository.findScenarioIdsByVerticalId(id);
    db.transaction(() => {
      db.prepare("DELETE FROM vertical_plans WHERE vertical_id = ?").run(id);
      db.prepare("DELETE FROM vertical_packs WHERE vertical_id = ?").run(id);
      db.prepare("UPDATE cohort_configs SET vertical_id = NULL WHERE vertical_id = ?").run(id);
      db.prepare("DELETE FROM scenario_verticals WHERE vertical_id = ?").run(id);
      db.prepare("DELETE FROM scenario_scope_overrides WHERE target_type = 'vertical' AND target_id = ?").run(id);
      db.prepare("DELETE FROM verticals WHERE id = ?").run(id);
    })();
    scenariosRepository.invalidateResults(affected);
  }
};
