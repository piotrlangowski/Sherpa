import db from '../db';
import type { PoolTier, PoolBurnRate } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { scenariosRepository } from './scenarios';

export const poolTiersRepository = {
  getAll(): PoolTier[] {
    const rows = db.prepare(`
      SELECT id, name, monthly_fee, credit_pool_size, capture, created_at, updated_at
      FROM pool_tiers
      ORDER BY name ASC
    `).all() as any[];

    return rows.map(r => ({
      id: r.id,
      name: r.name,
      monthly_fee: r.monthly_fee,
      credit_pool_size: r.credit_pool_size,
      capture: r.capture,
      created_at: r.created_at,
      updated_at: r.updated_at
    }));
  },

  getById(id: string): PoolTier | null {
    const r = db.prepare(`
      SELECT id, name, monthly_fee, credit_pool_size, capture, created_at, updated_at
      FROM pool_tiers
      WHERE id = ?
    `).get(id) as any;

    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      monthly_fee: r.monthly_fee,
      credit_pool_size: r.credit_pool_size,
      capture: r.capture,
      created_at: r.created_at,
      updated_at: r.updated_at
    };
  },

  getBurnRates(tierId: string): PoolBurnRate[] {
    const rows = db.prepare(`
      SELECT br.id, br.tier_id, br.service_id, br.burn_rate, s.name as service_name
      FROM pool_burn_rates br
      JOIN services s ON s.id = br.service_id
      WHERE br.tier_id = ?
      ORDER BY s.name ASC
    `).all(tierId) as any[];

    return rows.map(r => ({
      id: r.id,
      tier_id: r.tier_id,
      service_id: r.service_id,
      burn_rate: r.burn_rate,
      service_name: r.service_name
    }));
  },

  create(data: { name: string; monthly_fee: number; credit_pool_size: number; capture?: number | null; burn_rates?: Array<{ service_id: string; burn_rate: number }> }): PoolTier {
    const id = uuidv4();
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare(`
        INSERT INTO pool_tiers (id, name, monthly_fee, credit_pool_size, capture, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, data.name, data.monthly_fee, data.credit_pool_size, data.capture ?? null, now, now);

      if (data.burn_rates && data.burn_rates.length > 0) {
        const insertRate = db.prepare(`
          INSERT INTO pool_burn_rates (id, tier_id, service_id, burn_rate) VALUES (?, ?, ?, ?)
        `);
        for (const br of data.burn_rates) {
          insertRate.run(uuidv4(), id, br.service_id, br.burn_rate);
        }
      }
    })();

    return this.getById(id)!;
  },

  update(id: string, data: Partial<{ name: string; monthly_fee: number; credit_pool_size: number; capture: number | null; burn_rates: Array<{ service_id: string; burn_rate: number }> }>): void {
    const current = this.getById(id);
    if (!current) throw new Error(`Pool tier not found: ${id}`);

    const name = data.name !== undefined ? data.name : current.name;
    const monthly_fee = data.monthly_fee !== undefined ? data.monthly_fee : current.monthly_fee;
    const credit_pool_size = data.credit_pool_size !== undefined ? data.credit_pool_size : current.credit_pool_size;
    const capture = data.capture !== undefined ? data.capture : current.capture;
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare(`
        UPDATE pool_tiers
        SET name = ?, monthly_fee = ?, credit_pool_size = ?, capture = ?, updated_at = ?
        WHERE id = ?
      `).run(name, monthly_fee, credit_pool_size, capture ?? null, now, id);

      if (data.burn_rates !== undefined) {
        db.prepare("DELETE FROM pool_burn_rates WHERE tier_id = ?").run(id);
        const insertRate = db.prepare(`
          INSERT INTO pool_burn_rates (id, tier_id, service_id, burn_rate) VALUES (?, ?, ?, ?)
        `);
        for (const br of data.burn_rates) {
          insertRate.run(uuidv4(), id, br.service_id, br.burn_rate);
        }
      }
    })();

    // Invalidate cached results for scenarios using this tier
    const affectedScenarios = scenariosRepository.findScenarioIdsByPoolTierId(id);
    scenariosRepository.invalidateResults(affectedScenarios);
  },

  delete(id: string): void {
    db.transaction(() => {
      db.prepare("UPDATE scenarios SET pool_tier_id = NULL WHERE pool_tier_id = ?").run(id);
      db.prepare("DELETE FROM pool_burn_rates WHERE tier_id = ?").run(id);
      db.prepare("DELETE FROM pool_tiers WHERE id = ?").run(id);
    })();
  }
};
