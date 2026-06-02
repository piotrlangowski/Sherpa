import db from '../db';
import type { Provider } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { scenariosRepository } from './scenarios';

export const providersRepository = {
  getAll(): Provider[] {
    const rows = db.prepare(`
      SELECT id, name, model_name, input_price, output_price, is_predefined, updated_at
      FROM providers
      ORDER BY name ASC, model_name ASC
    `).all() as any[];
    
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      model_name: r.model_name,
      input_price: r.input_price,
      output_price: r.output_price,
      is_predefined: r.is_predefined === 1,
      updated_at: r.updated_at
    }));
  },

  getById(id: string): Provider | null {
    const r = db.prepare(`
      SELECT id, name, model_name, input_price, output_price, is_predefined, updated_at
      FROM providers
      WHERE id = ?
    `).get(id) as any;
    
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      model_name: r.model_name,
      input_price: r.input_price,
      output_price: r.output_price,
      is_predefined: r.is_predefined === 1,
      updated_at: r.updated_at
    };
  },

  create(data: Omit<Provider, 'id' | 'updated_at'>): Provider {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO providers (id, name, model_name, input_price, output_price, is_predefined, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.name, data.model_name, data.input_price, data.output_price, data.is_predefined ? 1 : 0, now);
    
    return {
      id,
      ...data,
      updated_at: now
    };
  },

  update(id: string, data: Partial<Omit<Provider, 'id' | 'updated_at'>>): void {
    const current = this.getById(id);
    if (!current) throw new Error(`Provider not found: ${id}`);
    
    const name = data.name !== undefined ? data.name : current.name;
    const model_name = data.model_name !== undefined ? data.model_name : current.model_name;
    const input_price = data.input_price !== undefined ? data.input_price : current.input_price;
    const output_price = data.output_price !== undefined ? data.output_price : current.output_price;
    const is_predefined = data.is_predefined !== undefined ? (data.is_predefined ? 1 : 0) : (current.is_predefined ? 1 : 0);
    const now = new Date().toISOString();
    
    db.prepare(`
      UPDATE providers
      SET name = ?, model_name = ?, input_price = ?, output_price = ?, is_predefined = ?, updated_at = ?
      WHERE id = ?
    `).run(name, model_name, input_price, output_price, is_predefined, now, id);

    // Invalidate cached results for scenarios whose services use this provider
    const affectedScenarios = scenariosRepository.findScenarioIdsByProviderId(id);
    scenariosRepository.invalidateResults(affectedScenarios);
  },

  delete(id: string): void {
    db.prepare("DELETE FROM providers WHERE id = ?").run(id);
  }
};
