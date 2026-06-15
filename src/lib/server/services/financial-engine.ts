import type { Scenario, ScenarioResult, CohortConfig, ScopeOverride, CreditSettings, MonetizationConfig, Settings } from '../../types';
import {
  calculateNPV,
  calculatePaybackPeriod,
  calculateIRR,
  calculateTCO,
  calculateScenario as pureCalculateScenario,
  applyScopeOverrides
} from '../../shared/financial-math.js';
import { scenariosRepository } from '../repositories/scenarios';
import { providersRepository } from '../repositories/providers';
import { cohortsRepository } from '../repositories/cohorts';
import { settingsRepository } from '../repositories/settings';
import { monetizationRepository } from '../repositories/monetization';
import db from '../db';

import { normalizeScenarioCurrency } from '../../shared/currency.js';
import type { CalculationResult, MonthlyBreakdown } from '../../shared/types';

export function buildCreditSettings(settings: Settings): CreditSettings {
  return {
    defaultPricePerCredit: settings.default_price_per_credit,
    defaultOverchargeMarkup: settings.default_overcharge_markup,
    defaultOverchargeUserPct: settings.default_overcharge_user_pct,
    defaultAvgOverchargePct: settings.default_avg_overcharge_pct,
    defaultInputTokensPerCredit: settings.default_input_tokens_per_credit,
    defaultOutputTokensPerCredit: settings.default_output_tokens_per_credit
  };
}

/**
 * Resolves the effective monetization config for every service in a scenario.
 * For each entity, a scenario override (if non-'none') wins over its catalog config.
 * A service then inherits its config in order: Service → Pack → Plan (most specific first),
 * scoped to the packs/plans actually present in the scenario.
 */
export function resolveScenarioMonetization(scenario: Scenario): Map<string, MonetizationConfig> {
  const result = new Map<string, MonetizationConfig>();
  const services = scenario.services ?? [];
  if (services.length === 0) return result;

  const catalog = monetizationRepository.getCatalogMap();
  const overrides = scenario.id ? monetizationRepository.getScenarioOverrideMap(scenario.id) : new Map<string, MonetizationConfig>();

  // Effective config for one entity: override beats catalog; 'none' falls through.
  const effective = (entityType: 'service' | 'pack' | 'plan', entityId: string): MonetizationConfig | undefined => {
    const key = `${entityType}:${entityId}`;
    const ov = overrides.get(key);
    if (ov && ov.monetization_type !== 'none') return { ...ov, is_scenario_override: true };
    const cat = catalog.get(key);
    if (cat && cat.monetization_type !== 'none') return { ...cat, is_scenario_override: false };
    return undefined;
  };

  // Fetch all pack services for the packs in the scenario using one query
  const packIds = (scenario.packs ?? []).map(p => p.id);
  const packServicesMap = new Map<string, string[]>();
  if (packIds.length > 0) {
    const placeholders = packIds.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT pack_id, service_id FROM pack_services WHERE pack_id IN (${placeholders})
    `).all(...packIds) as any[];
    for (const r of rows) {
      if (!packServicesMap.has(r.pack_id)) packServicesMap.set(r.pack_id, []);
      packServicesMap.get(r.pack_id)!.push(r.service_id);
    }
  }

  // Packs present in the scenario, with their service membership + effective config.
  const packInfos = (scenario.packs ?? []).map(p => {
    const serviceIds = packServicesMap.get(p.id) ?? [];
    return {
      name: p.name ?? '',
      serviceIds: new Set(serviceIds),
      config: effective('pack', p.id)
    };
  });

  // Fetch all plan services and plan pack services for the plans in the scenario using bulk queries
  const planIds = (scenario.plans ?? []).map(p => p.id);
  const planServicesMap = new Map<string, Set<string>>();
  if (planIds.length > 0) {
    const placeholders = planIds.map(() => '?').join(',');
    // 1. Direct services on plans
    const directRows = db.prepare(`
      SELECT plan_id, service_id FROM plan_services WHERE plan_id IN (${placeholders})
    `).all(...planIds) as any[];
    for (const r of directRows) {
      if (!planServicesMap.has(r.plan_id)) planServicesMap.set(r.plan_id, new Set());
      planServicesMap.get(r.plan_id)!.add(r.service_id);
    }
    // 2. Services via packs on plans
    const packRows = db.prepare(`
      SELECT pp.plan_id, ps.service_id
      FROM plan_packs pp
      JOIN pack_services ps ON pp.pack_id = ps.pack_id
      WHERE pp.plan_id IN (${placeholders})
    `).all(...planIds) as any[];
    for (const r of packRows) {
      if (!planServicesMap.has(r.plan_id)) planServicesMap.set(r.plan_id, new Set());
      planServicesMap.get(r.plan_id)!.add(r.service_id);
    }
  }

  // Plans present in the scenario, with membership (direct + via their packs) + effective config.
  const planInfos = (scenario.plans ?? []).map(p => {
    const serviceIds = planServicesMap.get(p.id) ?? new Set<string>();
    return { name: p.name ?? '', serviceIds, config: effective('plan', p.id) };
  });

  for (const service of services) {
    const own = effective('service', service.id);
    if (own) {
      result.set(service.id, { ...own, inherited_from: 'service', inherited_from_name: service.name });
      continue;
    }
    const pack = packInfos.find(p => p.config && p.serviceIds.has(service.id));
    if (pack) {
      result.set(service.id, { ...pack.config!, inherited_from: 'pack', inherited_from_name: pack.name });
      continue;
    }
    const plan = planInfos.find(p => p.config && p.serviceIds.has(service.id));
    if (plan) {
      result.set(service.id, { ...plan.config!, inherited_from: 'plan', inherited_from_name: plan.name });
    }
  }

  return result;
}

/** Returns a copy of the scenario with each service's effective monetization config attached. */
export function attachMonetization(scenario: Scenario): Scenario {
  const map = resolveScenarioMonetization(scenario);
  return {
    ...scenario,
    services: (scenario.services ?? []).map(s => ({ ...s, monetization: map.get(s.id) })) as Scenario['services']
  };
}

export { calculateNPV, calculatePaybackPeriod, calculateIRR, calculateTCO };
export type { CalculationResult, MonthlyBreakdown };

export function resolveScenarioCohorts(scenario: Scenario): CohortConfig[] {
  let resolvedCohorts: CohortConfig[] = [];

  if (scenario.scope_type === 'all_clients') {
    resolvedCohorts = cohortsRepository.getAll();
  } else if (scenario.scope_type === 'verticals' && scenario.scope_verticals) {
    const verticalIds = scenario.scope_verticals.map(v => v.id);
    resolvedCohorts = cohortsRepository.getByVerticalIds(verticalIds);
  } else if (scenario.scope_type === 'cohorts' && scenario.scope_cohorts) {
    resolvedCohorts = [...scenario.scope_cohorts];
  }

  return applyScopeOverrides(resolvedCohorts, scenario.scope_overrides ?? []);
}

export function calculateScenario(scenario: Scenario): CalculationResult {
  const allProviders = providersRepository.getAll();
  const resolvedConfigs = resolveScenarioCohorts(scenario);

  const runtimeScenario = {
    ...attachMonetization(scenario),
    scope_cohorts: resolvedConfigs
  };

  const settings = settingsRepository.get();
  const { scenario: normalizedScenario, providers: normalizedProviders } = normalizeScenarioCurrency(
    runtimeScenario,
    allProviders,
    settings.currency,
    settings.exchange_rates
  );

  return pureCalculateScenario(normalizedScenario, normalizedProviders, buildCreditSettings(settings));
}

export function runAndSaveScenario(scenarioId: string): CalculationResult {
  const scenario = scenariosRepository.getById(scenarioId);
  if (!scenario) {
    throw new Error(`Scenario not found: ${scenarioId}`);
  }

  const result = calculateScenario(scenario);

  scenariosRepository.saveResults({
    id: '', 
    scenario_id: scenarioId,
    payback_months: result.paybackUpper,
    npv: result.npvUpper,
    irr_annual: result.irr.annualNominal,
    tco: result.tco,
    profitability_index: result.piUpper,
    monthly_cashflows: result.timeline.map(t => t.netCashFlow),
    monthly_mrr: result.timeline.map(t => t.revenue),
    monthly_customers: result.timeline.map(t => t.customers),
    calculated_at: new Date().toISOString(),
    payback_months_lower: result.paybackLower,
    npv_lower: result.npvLower,
    profitability_index_lower: result.piLower,
    irr_monthly: result.irr.monthly,
    irr_annual_nominal: result.irr.annualNominal,
    irr_status: result.irr.status
  });

  return result;
}
