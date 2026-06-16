import db from '../db';
import type { CostItem, CostCategory, CostFrequency, Currency } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { scenariosRepository } from './scenarios';

export const costsRepository = {
  getAll(): CostItem[] {
    const rows = db.prepare(`
      SELECT c.id, c.name, c.category, c.subcategory, c.amount, c.frequency, c.currency, c.service_id, c.created_at, c.updated_at,
             s.name as service_name
      FROM cost_items c
      LEFT JOIN services s ON c.service_id = s.id
      ORDER BY c.category ASC, c.name ASC
    `).all() as any[];
    
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      category: r.category as CostCategory,
      subcategory: r.subcategory,
      amount: r.amount,
      frequency: r.frequency as CostFrequency,
      currency: r.currency as Currency,
      service_id: r.service_id,
      created_at: r.created_at,
      updated_at: r.updated_at,
      service_name: r.service_name || undefined
    }));
  },

  getById(id: string): CostItem | null {
    const r = db.prepare(`
      SELECT c.id, c.name, c.category, c.subcategory, c.amount, c.frequency, c.currency, c.service_id, c.created_at, c.updated_at,
             s.name as service_name
      FROM cost_items c
      LEFT JOIN services s ON c.service_id = s.id
      WHERE c.id = ?
    `).get(id) as any;
    
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      category: r.category as CostCategory,
      subcategory: r.subcategory,
      amount: r.amount,
      frequency: r.frequency as CostFrequency,
      currency: r.currency as Currency,
      service_id: r.service_id,
      created_at: r.created_at,
      updated_at: r.updated_at,
      service_name: r.service_name || undefined
    };
  },

  create(data: Omit<CostItem, 'id' | 'created_at' | 'updated_at'>): CostItem {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO cost_items (id, name, category, subcategory, amount, frequency, currency, service_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.name, data.category, data.subcategory || null, data.amount, data.frequency, data.currency || 'USD', data.service_id || null, now, now);
    
    return this.getById(id)!;
  },

  update(id: string, data: Partial<Omit<CostItem, 'id' | 'created_at' | 'updated_at'>>): void {
    const current = this.getById(id);
    if (!current) throw new Error(`Cost item not found: ${id}`);
    
    const name = data.name !== undefined ? data.name : current.name;
    const category = data.category !== undefined ? data.category : current.category;
    const subcategory = data.subcategory !== undefined ? data.subcategory : current.subcategory;
    const amount = data.amount !== undefined ? data.amount : current.amount;
    const frequency = data.frequency !== undefined ? data.frequency : current.frequency;
    const currency = data.currency !== undefined ? data.currency : current.currency;
    const service_id = data.service_id !== undefined ? data.service_id : current.service_id;
    const now = new Date().toISOString();
    
    db.prepare(`
      UPDATE cost_items
      SET name = ?, category = ?, subcategory = ?, amount = ?, frequency = ?, currency = ?, service_id = ?, updated_at = ?
      WHERE id = ?
    `).run(name, category, subcategory, amount, frequency, currency, service_id || null, now, id);

    // Invalidate cached results for scenarios using this cost item
    const affectedScenarios = scenariosRepository.findScenarioIdsByCostItemId(id);
    scenariosRepository.invalidateResults(affectedScenarios);
  },

  delete(id: string): void {
    db.transaction(() => {
      db.prepare("DELETE FROM scenario_costs WHERE cost_item_id = ?").run(id);
      db.prepare("DELETE FROM scenario_entity_overrides WHERE entity_type = 'cost' AND entity_id = ?").run(id);
      db.prepare("DELETE FROM cost_items WHERE id = ?").run(id);
    })();
  }
};
