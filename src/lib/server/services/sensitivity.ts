import type { Scenario } from '../../types';
import { runSensitivityAnalysis as pureRunSensitivityAnalysis } from '../../shared/financial-math';
import { providersRepository } from '../repositories/providers';
import { resolveScenarioCohorts } from './financial-engine';
import type { SensitivityAnalysisResult } from '../../shared/types';

export type { SensitivityParamResult, SensitivityAnalysisResult } from '../../shared/types';

export function runSensitivityAnalysis(
  scenario: Scenario,
  variationPercent: number = 0.1
): SensitivityAnalysisResult {
  const allProviders = providersRepository.getAll();
  const resolvedConfigs = resolveScenarioCohorts(scenario);
  
  const runtimeScenario = {
    ...scenario,
    scope_cohorts: resolvedConfigs
  };

  return pureRunSensitivityAnalysis(runtimeScenario, allProviders, variationPercent);
}
