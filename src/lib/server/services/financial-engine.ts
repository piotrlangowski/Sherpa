import type { Scenario, ScenarioResult, CohortConfig, ScopeOverride } from '../../types';
import {
  calculateNPV,
  calculatePaybackPeriod,
  calculateIRR,
  calculateTCO,
  calculateScenario as pureCalculateScenario,
  applyScopeOverrides
} from '../../shared/financial-math';
import { scenariosRepository } from '../repositories/scenarios';
import { providersRepository } from '../repositories/providers';
import { cohortsRepository } from '../repositories/cohorts';
import type { CalculationResult, MonthlyBreakdown } from '../../shared/types';

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
    ...scenario,
    scope_cohorts: resolvedConfigs
  };
  
  return pureCalculateScenario(runtimeScenario, allProviders);
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
    payback_months: result.paybackMonths,
    npv: result.npv,
    irr_annual: result.irrAnnual,
    tco: result.tco,
    roi_percent: result.roiPercent,
    monthly_cashflows: result.timeline.map(t => t.netCashFlow),
    monthly_mrr: result.timeline.map(t => t.revenue),
    monthly_customers: result.timeline.map(t => t.customers),
    calculated_at: new Date().toISOString()
  });

  return result;
}
