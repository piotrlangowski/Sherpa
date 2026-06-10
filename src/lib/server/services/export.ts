import { scenariosRepository } from '../repositories/scenarios';
import { cohortsRepository } from '../repositories/cohorts';
import { verticalsRepository } from '../repositories/verticals';
import { servicesRepository } from '../repositories/services';
import { packsRepository } from '../repositories/packs';
import { plansRepository } from '../repositories/plans';
import { calculateScenario } from './financial-engine';

import type { Vertical, CohortConfig, ScopeOverride, Service, Pack, Plan, CostItem, Provider } from '$lib/types';

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
    plans: (Plan & { rollout_month?: number })[];
    costs: CostItem[];
    providers: Provider[];
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
          rollout_month: s.rollout_month
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
          rollout_month: p.rollout_month
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
          rollout_month: pl.rollout_month
        });
      }
    }
  }

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
      providers: Array.from(providersSet.values())
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
  lines.push(`NPV,${results.npv}`);
  lines.push(`IRR (Annual),${results.irrAnnual !== null ? (results.irrAnnual * 100).toFixed(2) + '%' : 'N/A'}`);
  lines.push(`Payback Period (Months),${results.paybackMonths !== null ? results.paybackMonths : 'N/A'}`);
  lines.push(`TCO,${results.tco}`);
  lines.push(`ROI,${(results.roiPercent * 100).toFixed(2)}%`);
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
    'Cumulative Cash Flow'
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
      m.cumulativeCashFlow.toFixed(2)
    ];
    lines.push(row.join(','));
  }

  return lines.join('\n');
}
