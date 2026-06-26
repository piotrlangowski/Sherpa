import { scenariosRepository } from '../repositories/scenarios';
import { cohortsRepository } from '../repositories/cohorts';
import { verticalsRepository } from '../repositories/verticals';
import { servicesRepository } from '../repositories/services';
import { packsRepository } from '../repositories/packs';
import { plansRepository } from '../repositories/plans';
import { costsRepository } from '../repositories/costs';
import { providersRepository } from '../repositories/providers';
import { calculateScenario } from './financial-engine';
import { monetizationRepository } from '../repositories/monetization';
import { entityOverridesRepository } from '../repositories/entity-overrides';

import type { Vertical, CohortConfig, ScopeOverride, Service, Pack, Plan, CostItem, Provider, MonetizationConfig, EntityOverride } from '$lib/types';

export interface ScenarioExportSnapshot {
  version: string;
  exportedAt: string;
  scenario: {
    name: string;
    description: string;
    projection_months: number;
    discount_rate: number;
    scope_type: string;
    scope_verticals: Vertical[];
    scope_cohorts: CohortConfig[];
    scope_overrides: ScopeOverride[];
    services: (Service & { rollout_month?: number })[];
    packs: (Pack & { rollout_month?: number })[];
    plans: (Plan & { rollout_month?: number; seats?: number })[];
    costs: CostItem[];
    providers: Provider[];
    monetization_overrides: { entity_type: 'service' | 'pack' | 'plan'; entity_name: string; config: MonetizationConfig }[];
    entity_overrides: { entity_type: 'service' | 'cost' | 'provider' | 'plan'; entity_name: string; entity_model_name?: string; override: EntityOverride }[];
    evc_nba_annual_value?: number | null;
    evc_extra_positive_value?: number | null;
    evc_negative_value?: number | null;
    evc_capture_ceiling_pct?: number | null;
    evc_capture_target_pct?: number | null;
    evc_capture_floor_pct?: number | null;
  };
}

/**
 * Creates a self-contained JSON snapshot of a scenario and its dependencies.
 */
export function exportScenarioToJSON(scenarioId: string): string {
  const scenario = scenariosRepository.getById(scenarioId);
  if (!scenario) {
    throw new Error(`Scenario not found: ${scenarioId}`);
  }

  // No longer fetching legacy cohortConfig.
  // The new model fetches scope_verticals, scope_cohorts, and scope_overrides automatically via repository.

  // Fetch full services & providers
  const services = [];
  const providersSet = new Map<string, any>();
  if (scenario.services) {
    for (const s of scenario.services) {
      const fullService = servicesRepository.getById(s.id);
      if (fullService) {
        services.push({
          ...fullService,
          rollout_month: s.rollout_month,
          monetization: monetizationRepository.getForEntity('service', s.id) ?? undefined
        });
        if (fullService.provider) {
          providersSet.set(fullService.provider.id, fullService.provider);
        }
      }
    }
  }

  // Fetch full packs
  const packs = [];
  if (scenario.packs) {
    for (const p of scenario.packs) {
      const fullPack = packsRepository.getById(p.id);
      if (fullPack) {
        packs.push({
          ...fullPack,
          rollout_month: p.rollout_month,
          monetization: monetizationRepository.getForEntity('pack', p.id) ?? undefined
        });
      }
    }
  }

  // Fetch plans
  const plans = [];
  if (scenario.plans) {
    for (const pl of scenario.plans) {
      const fullPlan = plansRepository.getById(pl.id);
      if (fullPlan) {
        plans.push({
          ...fullPlan,
          rollout_month: pl.rollout_month,
          seats: pl.seats ?? 0,
          monetization: monetizationRepository.getForEntity('plan', pl.id) ?? undefined
        });
      }
    }
  }

  // Scenario-level monetization overrides, keyed by entity NAME so they survive re-import (ids change).
  const monetization_overrides = monetizationRepository.getScenarioOverrides(scenarioId)
    .map((r) => {
      const { entity_type, entity_id, ...config } = r;
      let entity_name = '';
      if (entity_type === 'service') entity_name = servicesRepository.getById(entity_id)?.name ?? '';
      else if (entity_type === 'pack') entity_name = packsRepository.getById(entity_id)?.name ?? '';
      else if (entity_type === 'plan') entity_name = plansRepository.getById(entity_id)?.name ?? '';
      return { entity_type, entity_name, config };
    })
    .filter((o) => o.entity_name);

  // Scenario-level entity overrides, keyed by entity NAME (+ provider model) so they survive re-import.
  const entity_overrides = entityOverridesRepository.getScenarioOverrides(scenarioId)
    .map((r) => {
      const { entity_type, entity_id, ...override } = r;
      let entity_name = '';
      let entity_model_name: string | undefined;
      if (entity_type === 'service') entity_name = servicesRepository.getById(entity_id)?.name ?? '';
      else if (entity_type === 'plan') entity_name = plansRepository.getById(entity_id)?.name ?? '';
      else if (entity_type === 'cost') entity_name = costsRepository.getById(entity_id)?.name ?? '';
      else if (entity_type === 'provider') {
        const p = providersRepository.getById(entity_id);
        entity_name = p?.name ?? '';
        entity_model_name = p?.model_name;
      }
      return { entity_type, entity_name, entity_model_name, override: override as EntityOverride };
    })
    .filter((o) => o.entity_name);

  const snapshot: ScenarioExportSnapshot = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    scenario: {
      name: scenario.name,
      description: scenario.description || '',
      projection_months: scenario.projection_months,
      discount_rate: scenario.discount_rate,
      scope_type: scenario.scope_type,
      scope_verticals: scenario.scope_verticals || [],
      scope_cohorts: scenario.scope_cohorts || [],
      scope_overrides: scenario.scope_overrides || [],
      services,
      packs,
      plans,
      costs: scenario.costs || [],
      providers: Array.from(providersSet.values()),
      monetization_overrides,
      entity_overrides,
      evc_nba_annual_value: scenario.evc_nba_annual_value,
      evc_extra_positive_value: scenario.evc_extra_positive_value,
      evc_negative_value: scenario.evc_negative_value,
      evc_capture_ceiling_pct: scenario.evc_capture_ceiling_pct,
      evc_capture_target_pct: scenario.evc_capture_target_pct,
      evc_capture_floor_pct: scenario.evc_capture_floor_pct
    }
  };

  return JSON.stringify(snapshot, null, 2);
}

/**
 * Formats scenario calculation results into a tabular CSV structure.
 */
export function exportScenarioToCSV(scenarioId: string): string {
  const scenario = scenariosRepository.getById(scenarioId);
  if (!scenario) {
    throw new Error(`Scenario not found: ${scenarioId}`);
  }

  const results = calculateScenario(scenario);
  const lines: string[] = [];

  // Metadata headers
  lines.push(`Scenario Name,"${scenario.name.replace(/"/g, '""')}"`);
  lines.push(`Projection Horizon (Months),${scenario.projection_months}`);
  lines.push(`Discount Rate (Annual),${(scenario.discount_rate * 100).toFixed(1)}%`);
  lines.push(`NPV Upper,${results.npvUpper}`);
  lines.push(`NPV Lower,${results.npvLower}`);
  lines.push(`IRR Status,${results.irr.status}`);
  lines.push(`IRR (Annual Nominal),${results.irr.annualNominal !== null ? (results.irr.annualNominal * 100).toFixed(2) + '%' : 'N/A'}`);
  lines.push(`Payback Period Upper (Months),${results.paybackUpper !== null ? results.paybackUpper : 'N/A'}`);
  lines.push(`Payback Period Lower (Months),${results.paybackLower !== null ? results.paybackLower : 'N/A'}`);
  lines.push(`TCO,${results.tco}`);
  lines.push(`Profitability Index Upper,${results.piUpper.toFixed(2)}`);
  lines.push(`Profitability Index Lower,${results.piLower.toFixed(2)}`);
  if (results.evc) {
    lines.push(`EVC reference (NBA),${results.evc.referenceValue}`);
    lines.push(`EVC net created value,${results.evc.netCreatedValue}`);
    lines.push(`EVC total value,${results.evc.evc}`);
    lines.push(`EVC Price Floor,${results.evc.priceFloor}`);
    lines.push(`EVC Price Target,${results.evc.priceTarget}`);
    lines.push(`EVC Price Ceiling,${results.evc.priceCeiling}`);
  }
  lines.push(''); // spacing row

  // Column headers
  const headers = [
    'Month',
    'MRR',
    'Active Customers',
    'Active AI Users',
    'OPEX',
    'CAPEX',
    'Token Costs',
    'Total Costs',
    'Net Cash Flow',
    'Cumulative Cash Flow',
    'Gross MRR',
    'Baseline MRR',
    'Baseline Customers',
    'Outcome Revenue'
  ];
  lines.push(headers.join(','));

  // Data rows
  for (const m of results.timeline) {
    const row = [
      m.month,
      m.revenue.toFixed(2),
      m.customers,
      m.aiUsers,
      m.opex.toFixed(2),
      m.capex.toFixed(2),
      m.tokenCosts.toFixed(2),
      m.totalCosts.toFixed(2),
      m.netCashFlow.toFixed(2),
      m.cumulativeCashFlow.toFixed(2),
      m.grossRevenue.toFixed(2),
      m.baselineRevenue.toFixed(2),
      m.baselineCustomers,
      m.outcomeRevenue.toFixed(2)
    ];
    lines.push(row.join(','));
  }

  return lines.join('\n');
}
