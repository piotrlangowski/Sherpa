import type { Scenario } from '../../types';
import { runSensitivityAnalysis as pureRunSensitivityAnalysis } from '../../shared/financial-math.js';
import { providersRepository } from '../repositories/providers';
import { settingsRepository } from '../repositories/settings';
import { normalizeScenarioCurrency } from '../../shared/currency.js';
import { resolveScenarioCohorts, attachMonetization, buildCreditSettings } from './financial-engine';
import type { SensitivityAnalysisResult } from '../../shared/types';

export type { SensitivityParamResult, SensitivityAnalysisResult } from '../../shared/types';

export function runSensitivityAnalysis(
  scenario: Scenario,
  variationPercent: number = 0.1
): SensitivityAnalysisResult {
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

  return pureRunSensitivityAnalysis(normalizedScenario, normalizedProviders, variationPercent, buildCreditSettings(settings));
}
