import type { Scenario, ScenarioResult } from '../../types';
import { 
  calculateNPV, 
  calculatePaybackPeriod, 
  calculateIRR, 
  calculateTCO,
  calculateScenario as pureCalculateScenario 
} from '../../shared/financial-math';
import { scenariosRepository } from '../repositories/scenarios';
import { providersRepository } from '../repositories/providers';
import type { CalculationResult, MonthlyBreakdown } from '../../shared/types';

export { calculateNPV, calculatePaybackPeriod, calculateIRR, calculateTCO };
export type { CalculationResult, MonthlyBreakdown };

export function calculateScenario(scenario: Scenario): CalculationResult {
  const allProviders = providersRepository.getAll();
  return pureCalculateScenario(scenario, allProviders);
}

export function runAndSaveScenario(scenarioId: string): CalculationResult {
  const scenario = scenariosRepository.getById(scenarioId);
  if (!scenario) {
    throw new Error(`Scenario not found: ${scenarioId}`);
  }

  const result = calculateScenario(scenario);

  scenariosRepository.saveResults({
    id: '', // repo will generate UUID or replace existing
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

