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
  id, entity_type, entity_id, cohort_id,
  avg_input_tokens, avg_output_tokens, avg_requests_per_user_month, fixed_cost_per_month,
  amount, frequency,
  input_price, output_price,
  base_price,
  monthly_volume, interactions_per_customer_month, containment_rate, average_handle_time_seconds,
  fully_loaded_cost_per_fte_month, baseline_fte, churn_rate_uplift
`;

/** The override value columns, in INSERT/UPDATE order. */
const VALUE_COLUMNS = [
  'avg_input_tokens', 'avg_output_tokens', 'avg_requests_per_user_month', 'fixed_cost_per_month',
  'amount', 'frequency',
  'input_price', 'output_price',
  'base_price',
  'monthly_volume', 'interactions_per_customer_month', 'containment_rate', 'average_handle_time_seconds',
  'fully_loaded_cost_per_fte_month', 'baseline_fte', 'churn_rate_uplift'
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
    base_price: r.base_price,
    monthly_volume: r.monthly_volume,
    interactions_per_customer_month: r.interactions_per_customer_month,
    containment_rate: r.containment_rate,
    average_handle_time_seconds: r.average_handle_time_seconds,
    fully_loaded_cost_per_fte_month: r.fully_loaded_cost_per_fte_month,
    baseline_fte: r.baseline_fte,
    churn_rate_uplift: r.churn_rate_uplift
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
    o.base_price ?? null,
    o.monthly_volume ?? null,
    o.interactions_per_customer_month ?? null,
    o.containment_rate ?? null,
    o.average_handle_time_seconds ?? null,
    o.fully_loaded_cost_per_fte_month ?? null,
    o.baseline_fte ?? null,
    o.churn_rate_uplift ?? null
  ];
}

/** True when every overridable field is null/undefined — i.e. "no override". */
function isEmpty(o: EntityOverride): boolean {
  return overrideValues(o).every(v => v === null || v === undefined);
}

export const entityOverridesRepository = {
  /**
   * Scenario-wide overrides only (`cohort_id IS NULL`), keyed by `${entity_type}:${entity_id}`.
   * This is the pre-mutation map consumed by `applyEntityOverrides` — cohort-scoped rows are
   * deliberately excluded here (ADR 0009 Track B); use `getScenarioCohortOverrideMap` for those.
   */
  getScenarioOverrideMap(scenarioId: string): Map<string, EntityOverride> {
    const rows = db.prepare(`SELECT ${SELECT_COLUMNS} FROM scenario_entity_overrides WHERE scenario_id = ? AND cohort_id IS NULL`).all(scenarioId) as any[];
    const map = new Map<string, EntityOverride>();
    for (const r of rows) map.set(`${r.entity_type}:${r.entity_id}`, rowToOverride(r));
    return map;
  },

  /**
   * Cohort-scoped overrides only (`cohort_id IS NOT NULL`), keyed
   * `${entity_type}:${entity_id}:${cohort_id}` — matches `Scenario.cohort_entity_overrides`,
   * resolved inside the pure engine's agent `per_customer` branch, not pre-mutated.
   */
  getScenarioCohortOverrideMap(scenarioId: string): Record<string, EntityOverride> {
    const rows = db.prepare(`SELECT ${SELECT_COLUMNS} FROM scenario_entity_overrides WHERE scenario_id = ? AND cohort_id IS NOT NULL`).all(scenarioId) as any[];
    const map: Record<string, EntityOverride> = {};
    for (const r of rows) map[`${r.entity_type}:${r.entity_id}:${r.cohort_id}`] = rowToOverride(r);
    return map;
  },

  /** List of a scenario's overrides (scenario-wide + cohort-scoped) as records (used by the editor + export). */
  getScenarioOverrides(scenarioId: string): EntityOverrideRecord[] {
    const rows = db.prepare(`SELECT ${SELECT_COLUMNS} FROM scenario_entity_overrides WHERE scenario_id = ?`).all(scenarioId) as any[];
    return rows.map(r => ({
      entity_type: r.entity_type as EntityOverrideType,
      entity_id: r.entity_id,
      cohort_id: r.cohort_id ?? null,
      ...rowToOverride(r)
    }));
  },

  /** `cohortId` omitted/null = scenario-wide row (unchanged default behavior). */
  getForEntity(scenarioId: string, entityType: EntityOverrideType, entityId: string, cohortId?: string | null): EntityOverride | null {
    const r = db.prepare(`SELECT ${SELECT_COLUMNS} FROM scenario_entity_overrides WHERE scenario_id = ? AND entity_type = ? AND entity_id = ? AND cohort_id IS ?`)
      .get(scenarioId, entityType, entityId, cohortId ?? null);
    return r ? rowToOverride(r) : null;
  },

  /**
   * Insert or update an override for one entity in one scenario, optionally scoped to one
   * cohort (ADR 0009 Track B). `cohortId` omitted/null = scenario-wide (unchanged behavior).
   * An all-null override means "clear" — the stored row is removed so resolution falls back
   * to the catalog value (mirrors monetization's 'none' short-circuit).
   */
  upsert(scenarioId: string, entityType: EntityOverrideType, entityId: string, override: EntityOverride, cohortId?: string | null): void {
    if (isEmpty(override)) {
      this.delete(scenarioId, entityType, entityId, cohortId);
      return;
    }

    if (cohortId) {
      if (entityType !== 'service') {
        throw new Error(`Cohort-scoped overrides are only allowed for entity_type 'service'.`);
      }
      const allowedCohortFields = new Set([
        'interactions_per_customer_month',
        'containment_rate',
        'average_handle_time_seconds',
        'fully_loaded_cost_per_fte_month',
        'churn_rate_uplift'
      ]);
      for (const k of Object.keys(override)) {
        const val = (override as any)[k];
        if (val !== undefined && val !== null) {
          if (!allowedCohortFields.has(k)) {
            throw new Error(`Field '${k}' is not allowed for cohort-scoped overrides (cohort scope restricts overrides to key segment-level variables; org-wide constants / flat-driver aggregates are rejected).`);
          }
        }
      }
    }

    const existing = db.prepare(`SELECT id FROM scenario_entity_overrides WHERE scenario_id = ? AND entity_type = ? AND entity_id = ? AND cohort_id IS ?`)
      .get(scenarioId, entityType, entityId, cohortId ?? null) as { id: string } | undefined;

    const values = overrideValues(override);

    if (existing) {
      const setClause = VALUE_COLUMNS.map(c => `${c} = ?`).join(', ');
      db.prepare(`UPDATE scenario_entity_overrides SET ${setClause} WHERE id = ?`).run(...values, existing.id);
    } else {
      const cols = VALUE_COLUMNS.join(', ');
      const placeholders = VALUE_COLUMNS.map(() => '?').join(', ');
      db.prepare(`
        INSERT INTO scenario_entity_overrides (id, scenario_id, entity_type, entity_id, cohort_id, ${cols})
        VALUES (?, ?, ?, ?, ?, ${placeholders})
      `).run(uuidv4(), scenarioId, entityType, entityId, cohortId ?? null, ...values);
    }
  },

  delete(scenarioId: string, entityType: EntityOverrideType, entityId: string, cohortId?: string | null): void {
    db.prepare(`DELETE FROM scenario_entity_overrides WHERE scenario_id = ? AND entity_type = ? AND entity_id = ? AND cohort_id IS ?`)
      .run(scenarioId, entityType, entityId, cohortId ?? null);
  },

  /** Remove every override pointing at a catalog entity (call when that entity is deleted). */
  deleteByEntity(entityType: EntityOverrideType, entityId: string): void {
    db.prepare(`DELETE FROM scenario_entity_overrides WHERE entity_type = ? AND entity_id = ?`)
      .run(entityType, entityId);
  }
};
