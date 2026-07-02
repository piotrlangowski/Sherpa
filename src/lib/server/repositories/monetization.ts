import db from '../db';
import type { MonetizationConfig, MonetizationType, OverchargePolicy, UsageVariant } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { scenariosRepository } from './scenarios';

export type MonetizationEntityType = 'service' | 'pack' | 'plan';

export interface MonetizationConfigRecord extends MonetizationConfig {
  entity_type: MonetizationEntityType;
  entity_id: string;
}

const SELECT_COLUMNS = `
  id, entity_type, entity_id, scenario_id, monetization_type,
  addon_monthly_fee, addon_has_usage_limit, addon_usage_limit, addon_overcharge_policy,
  usage_variant, price_per_credit,
  hybrid_monthly_fee, hybrid_included_credits, hybrid_overcharge_policy,
  overcharge_markup, overcharge_user_pct, avg_overcharge_pct,
  outcome_basis, price_per_outcome, outcomes_per_user_month
`;

function rowToConfig(r: any): MonetizationConfig {
  return {
    monetization_type: (r.monetization_type as MonetizationType) || 'none',
    addon_monthly_fee: r.addon_monthly_fee,
    addon_has_usage_limit: r.addon_has_usage_limit === 1,
    addon_usage_limit: r.addon_usage_limit,
    addon_overcharge_policy: (r.addon_overcharge_policy as OverchargePolicy) ?? null,
    usage_variant: (r.usage_variant as UsageVariant) ?? null,
    price_per_credit: r.price_per_credit,
    hybrid_monthly_fee: r.hybrid_monthly_fee,
    hybrid_included_credits: r.hybrid_included_credits,
    hybrid_overcharge_policy: (r.hybrid_overcharge_policy as OverchargePolicy) ?? null,
    overcharge_markup: r.overcharge_markup,
    overcharge_user_pct: r.overcharge_user_pct,
    avg_overcharge_pct: r.avg_overcharge_pct,
    outcome_basis: r.outcome_basis ?? null,
    price_per_outcome: r.price_per_outcome ?? null,
    outcomes_per_user_month: r.outcomes_per_user_month ?? null
  };
}

/** A column-ordered tuple of the monetization value fields for INSERT/UPDATE. */
function configValues(config: MonetizationConfig): any[] {
  return [
    config.monetization_type || 'none',
    config.addon_monthly_fee ?? null,
    config.addon_has_usage_limit ? 1 : 0,
    config.addon_usage_limit ?? null,
    config.addon_overcharge_policy ?? null,
    config.usage_variant ?? null,
    config.price_per_credit ?? null,
    config.hybrid_monthly_fee ?? null,
    config.hybrid_included_credits ?? null,
    config.hybrid_overcharge_policy ?? null,
    config.overcharge_markup ?? null,
    config.overcharge_user_pct ?? null,
    config.avg_overcharge_pct ?? null,
    config.outcome_basis ?? null,
    config.price_per_outcome ?? null,
    config.outcomes_per_user_month ?? null
  ];
}

function invalidateMonetization(entityType: MonetizationEntityType, entityId: string, scenarioId: string | null): void {
  if (scenarioId) {
    scenariosRepository.invalidateResults([scenarioId]);
  } else {
    let affected: string[] = [];
    if (entityType === 'service') {
      affected = scenariosRepository.findScenarioIdsByServiceId(entityId);
    } else if (entityType === 'pack') {
      affected = scenariosRepository.findScenarioIdsByPackId(entityId);
    } else if (entityType === 'plan') {
      affected = scenariosRepository.findScenarioIdsByPlanId(entityId);
    }
    scenariosRepository.invalidateResults(affected);
  }
}

export const monetizationRepository = {
  /**
   * Fetch a single config. `scenarioId = null` returns the catalog config;
   * a string returns that scenario's override (if any).
   */
  getForEntity(
    entityType: MonetizationEntityType,
    entityId: string,
    scenarioId: string | null = null
  ): MonetizationConfig | null {
    const r = scenarioId
      ? db.prepare(`SELECT ${SELECT_COLUMNS} FROM monetization_configs WHERE entity_type = ? AND entity_id = ? AND scenario_id = ?`).get(entityType, entityId, scenarioId)
      : db.prepare(`SELECT ${SELECT_COLUMNS} FROM monetization_configs WHERE entity_type = ? AND entity_id = ? AND scenario_id IS NULL`).get(entityType, entityId);
    return r ? rowToConfig(r) : null;
  },

  /** All catalog configs (scenario_id IS NULL), keyed by `${entity_type}:${entity_id}`. */
  getCatalogMap(): Map<string, MonetizationConfig> {
    const rows = db.prepare(`SELECT ${SELECT_COLUMNS} FROM monetization_configs WHERE scenario_id IS NULL`).all() as any[];
    const map = new Map<string, MonetizationConfig>();
    for (const r of rows) map.set(`${r.entity_type}:${r.entity_id}`, rowToConfig(r));
    return map;
  },

  /** All overrides for a scenario, keyed by `${entity_type}:${entity_id}`. */
  getScenarioOverrideMap(scenarioId: string): Map<string, MonetizationConfig> {
    const rows = db.prepare(`SELECT ${SELECT_COLUMNS} FROM monetization_configs WHERE scenario_id = ?`).all(scenarioId) as any[];
    const map = new Map<string, MonetizationConfig>();
    for (const r of rows) map.set(`${r.entity_type}:${r.entity_id}`, rowToConfig(r));
    return map;
  },

  /** List of scenario overrides as records (used by the scenario editor). */
  getScenarioOverrides(scenarioId: string): MonetizationConfigRecord[] {
    const rows = db.prepare(`SELECT ${SELECT_COLUMNS} FROM monetization_configs WHERE scenario_id = ?`).all(scenarioId) as any[];
    return rows.map(r => ({
      entity_type: r.entity_type as MonetizationEntityType,
      entity_id: r.entity_id,
      ...rowToConfig(r)
    }));
  },

  /**
   * Insert or update a config for an entity (catalog when scenarioId is null,
   * otherwise a scenario override). A `monetization_type` of 'none' deletes the row.
   */
  upsert(
    entityType: MonetizationEntityType,
    entityId: string,
    config: MonetizationConfig,
    scenarioId: string | null = null
  ): void {
    // 'none' means "no explicit config" — clear any stored row so resolution falls through.
    if (!config.monetization_type || config.monetization_type === 'none') {
      this.delete(entityType, entityId, scenarioId);
      return;
    }

    const existing = scenarioId
      ? db.prepare(`SELECT id FROM monetization_configs WHERE entity_type = ? AND entity_id = ? AND scenario_id = ?`).get(entityType, entityId, scenarioId) as { id: string } | undefined
      : db.prepare(`SELECT id FROM monetization_configs WHERE entity_type = ? AND entity_id = ? AND scenario_id IS NULL`).get(entityType, entityId) as { id: string } | undefined;

    const values = configValues(config);

    db.transaction(() => {
      if (existing) {
        db.prepare(`
          UPDATE monetization_configs SET
            monetization_type = ?, addon_monthly_fee = ?, addon_has_usage_limit = ?, addon_usage_limit = ?, addon_overcharge_policy = ?,
            usage_variant = ?, price_per_credit = ?,
            hybrid_monthly_fee = ?, hybrid_included_credits = ?, hybrid_overcharge_policy = ?,
            overcharge_markup = ?, overcharge_user_pct = ?, avg_overcharge_pct = ?,
            outcome_basis = ?, price_per_outcome = ?, outcomes_per_user_month = ?
          WHERE id = ?
        `).run(...values, existing.id);
      } else {
        db.prepare(`
          INSERT INTO monetization_configs (
            id, entity_type, entity_id, scenario_id, monetization_type,
            addon_monthly_fee, addon_has_usage_limit, addon_usage_limit, addon_overcharge_policy,
            usage_variant, price_per_credit,
            hybrid_monthly_fee, hybrid_included_credits, hybrid_overcharge_policy,
            overcharge_markup, overcharge_user_pct, avg_overcharge_pct,
            outcome_basis, price_per_outcome, outcomes_per_user_month
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(uuidv4(), entityType, entityId, scenarioId, ...values);
      }
    })();

    invalidateMonetization(entityType, entityId, scenarioId);
  },

  delete(
    entityType: MonetizationEntityType,
    entityId: string,
    scenarioId: string | null = null
  ): void {
    db.transaction(() => {
      if (scenarioId) {
        db.prepare(`DELETE FROM monetization_configs WHERE entity_type = ? AND entity_id = ? AND scenario_id = ?`).run(entityType, entityId, scenarioId);
      } else {
        db.prepare(`DELETE FROM monetization_configs WHERE entity_type = ? AND entity_id = ? AND scenario_id IS NULL`).run(entityType, entityId);
      }
    })();
    invalidateMonetization(entityType, entityId, scenarioId);
  }
};
