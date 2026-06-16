import db from '../db';
import type { EntityOverride, EntityOverrideRecord, EntityOverrideType, CostFrequency } from '../../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Per-scenario overrides of a catalog entity's financial parameters
 * (service tokens/usage/fixed cost, cost amount/frequency, provider prices,
 * plan base_price). Polymorphic over `entity_type`, keyed per scenario.
 *
 * This mirrors `monetizationRepository` exactly — the only structural
 * difference is that an override is ALWAYS scenario-scoped (no catalog row),
 * so `scenarioId` is a required argument everywhere.
 */

const SELECT_COLUMNS = `
  id, entity_type, entity_id,
  avg_input_tokens, avg_output_tokens, avg_requests_per_user_month, fixed_cost_per_month,
  amount, frequency,
  input_price, output_price,
  base_price
`;

/** The override value columns, in INSERT/UPDATE order. */
const VALUE_COLUMNS = [
  'avg_input_tokens', 'avg_output_tokens', 'avg_requests_per_user_month', 'fixed_cost_per_month',
  'amount', 'frequency',
  'input_price', 'output_price',
  'base_price'
] as const;

function rowToOverride(r: any): EntityOverride {
  return {
    avg_input_tokens: r.avg_input_tokens,
    avg_output_tokens: r.avg_output_tokens,
    avg_requests_per_user_month: r.avg_requests_per_user_month,
    fixed_cost_per_month: r.fixed_cost_per_month,
    amount: r.amount,
    frequency: (r.frequency as CostFrequency) ?? null,
    input_price: r.input_price,
    output_price: r.output_price,
    base_price: r.base_price
  };
}

/** A column-ordered tuple of the override value fields for INSERT/UPDATE. */
function overrideValues(o: EntityOverride): any[] {
  return [
    o.avg_input_tokens ?? null,
    o.avg_output_tokens ?? null,
    o.avg_requests_per_user_month ?? null,
    o.fixed_cost_per_month ?? null,
    o.amount ?? null,
    o.frequency ?? null,
    o.input_price ?? null,
    o.output_price ?? null,
    o.base_price ?? null
  ];
}

/** True when every overridable field is null/undefined — i.e. "no override". */
function isEmpty(o: EntityOverride): boolean {
  return overrideValues(o).every(v => v === null || v === undefined);
}

export const entityOverridesRepository = {
  /** All overrides for a scenario, keyed by `${entity_type}:${entity_id}`. */
  getScenarioOverrideMap(scenarioId: string): Map<string, EntityOverride> {
    const rows = db.prepare(`SELECT ${SELECT_COLUMNS} FROM scenario_entity_overrides WHERE scenario_id = ?`).all(scenarioId) as any[];
    const map = new Map<string, EntityOverride>();
    for (const r of rows) map.set(`${r.entity_type}:${r.entity_id}`, rowToOverride(r));
    return map;
  },

  /** List of a scenario's overrides as records (used by the editor + export). */
  getScenarioOverrides(scenarioId: string): EntityOverrideRecord[] {
    const rows = db.prepare(`SELECT ${SELECT_COLUMNS} FROM scenario_entity_overrides WHERE scenario_id = ?`).all(scenarioId) as any[];
    return rows.map(r => ({
      entity_type: r.entity_type as EntityOverrideType,
      entity_id: r.entity_id,
      ...rowToOverride(r)
    }));
  },

  getForEntity(scenarioId: string, entityType: EntityOverrideType, entityId: string): EntityOverride | null {
    const r = db.prepare(`SELECT ${SELECT_COLUMNS} FROM scenario_entity_overrides WHERE scenario_id = ? AND entity_type = ? AND entity_id = ?`)
      .get(scenarioId, entityType, entityId);
    return r ? rowToOverride(r) : null;
  },

  /**
   * Insert or update an override for one entity in one scenario.
   * An all-null override means "clear" — the stored row is removed so resolution
   * falls back to the catalog value (mirrors monetization's 'none' short-circuit).
   */
  upsert(scenarioId: string, entityType: EntityOverrideType, entityId: string, override: EntityOverride): void {
    if (isEmpty(override)) {
      this.delete(scenarioId, entityType, entityId);
      return;
    }

    const existing = db.prepare(`SELECT id FROM scenario_entity_overrides WHERE scenario_id = ? AND entity_type = ? AND entity_id = ?`)
      .get(scenarioId, entityType, entityId) as { id: string } | undefined;

    const values = overrideValues(override);

    if (existing) {
      const setClause = VALUE_COLUMNS.map(c => `${c} = ?`).join(', ');
      db.prepare(`UPDATE scenario_entity_overrides SET ${setClause} WHERE id = ?`).run(...values, existing.id);
    } else {
      const cols = VALUE_COLUMNS.join(', ');
      const placeholders = VALUE_COLUMNS.map(() => '?').join(', ');
      db.prepare(`
        INSERT INTO scenario_entity_overrides (id, scenario_id, entity_type, entity_id, ${cols})
        VALUES (?, ?, ?, ?, ${placeholders})
      `).run(uuidv4(), scenarioId, entityType, entityId, ...values);
    }
  },

  delete(scenarioId: string, entityType: EntityOverrideType, entityId: string): void {
    db.prepare(`DELETE FROM scenario_entity_overrides WHERE scenario_id = ? AND entity_type = ? AND entity_id = ?`)
      .run(scenarioId, entityType, entityId);
  },

  /** Remove every override pointing at a catalog entity (call when that entity is deleted). */
  deleteByEntity(entityType: EntityOverrideType, entityId: string): void {
    db.prepare(`DELETE FROM scenario_entity_overrides WHERE entity_type = ? AND entity_id = ?`)
      .run(entityType, entityId);
  }
};
