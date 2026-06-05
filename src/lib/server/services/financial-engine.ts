import type { Scenario, ScenarioResult, CohortConfig, ScopeOverride } from '../../types';
import { 
  calculateNPV, 
  calculatePaybackPeriod, 
  calculateIRR, 
  calculateTCO,
  calculateScenario as pureCalculateScenario 
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
  } else {
    // If scope_type is cohorts but scope_cohorts is missing, fallback to empty
    resolvedCohorts = [];
  }

  if (resolvedCohorts.length === 0) {
    return [];
  }
  
  const overrides = scenario.scope_overrides || [];
  const globalOverride = overrides.find(o => o.target_type === 'all_clients');
  const verticalOverrides = new Map(overrides.filter(o => o.target_type === 'vertical').map(o => [o.target_id, o]));
  const cohortOverrides = new Map(overrides.filter(o => o.target_type === 'cohort').map(o => [o.target_id, o]));
  
  const applyOverride = (config: CohortConfig, override: ScopeOverride | undefined): CohortConfig => {
    if (!override) return config;
    const newConfig = { ...config };
    if (override.monthly_churn_rate !== null && override.monthly_churn_rate !== undefined) newConfig.monthly_churn_rate = override.monthly_churn_rate;
    if (override.monthly_acquisition !== null && override.monthly_acquisition !== undefined) newConfig.monthly_acquisition = override.monthly_acquisition;
    if (override.acquisition_growth_rate !== null && override.acquisition_growth_rate !== undefined) newConfig.acquisition_growth_rate = override.acquisition_growth_rate;
    if (override.ai_adoption_rate !== null && override.ai_adoption_rate !== undefined) newConfig.ai_adoption_rate = override.ai_adoption_rate;
    if (override.retention_floor !== null && override.retention_floor !== undefined) newConfig.retention_floor = override.retention_floor;
    if (override.expansion_rate !== null && override.expansion_rate !== undefined) newConfig.monthly_expansion_rate = override.expansion_rate;
    if (override.arpu_override !== null && override.arpu_override !== undefined) newConfig.base_arpu = override.arpu_override;
    return newConfig;
  };

  return resolvedCohorts.map(cohort => {
    let configClone = { ...cohort };
    
    // 1. Apply global override
    configClone = applyOverride(configClone, globalOverride);
    
    // 2. Apply vertical override
    if (configClone.vertical_id) {
      configClone = applyOverride(configClone, verticalOverrides.get(configClone.vertical_id));
    }
    
    // 3. Apply cohort-specific override
    configClone = applyOverride(configClone, cohortOverrides.get(configClone.id));
    
    return configClone;
  });
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
