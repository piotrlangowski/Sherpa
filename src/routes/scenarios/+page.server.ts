import type { PageServerLoad } from './$types';
import { scenariosRepository } from '$lib/server/repositories/scenarios';
import { runAndSaveScenario } from '$lib/server/services/financial-engine';

export const load: PageServerLoad = async () => {
  const scenarios = scenariosRepository.getAll();

  // Compute & cache KPIs for any scenario whose results aren't cached yet, so the
  // list view shows the same numbers as the detail view (no "open it first to see KPIs" gap).
  // This mirrors what /scenarios/[id] already does on demand; results are persisted so this
  // is a one-time cost per scenario until its inputs change and the cache is invalidated.
  for (const scenario of scenarios) {
    if (scenario.results) continue;
    try {
      const result = runAndSaveScenario(scenario.id);
      scenario.results = {
        payback_months: result.paybackUpper,
        npv: result.npvUpper,
        irr_annual: result.irr.annualNominal,
        tco: result.tco,
        profitability_index: result.piUpper,
        payback_months_lower: result.paybackLower,
        npv_lower: result.npvLower,
        profitability_index_lower: result.piLower,
        irr_monthly: result.irr.monthly,
        irr_annual_nominal: result.irr.annualNominal,
        irr_status: result.irr.status
      };
    } catch {
      // Leave results undefined; the UI shows a "pending" hint for scenarios that
      // can't be computed yet (e.g. no services/cohorts configured).
    }
  }

  return {
    scenarios
  };
};
