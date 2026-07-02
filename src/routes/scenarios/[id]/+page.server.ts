import type { PageServerLoad, Actions } from './$types';
import { scenariosRepository } from '$lib/server/repositories/scenarios';
import { runAndSaveScenario, calculateScenario, resolveScenarioCohorts, attachMonetization } from '$lib/server/services/financial-engine';
import { providersRepository } from '$lib/server/repositories/providers';
import { settingsRepository } from '$lib/server/repositories/settings';
import { validateScenarioConfig } from '$lib/shared/financial-math';
import type { ScenarioDiagnostic } from '$lib/shared/types';
import { error, fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
  const scenario = scenariosRepository.getById(params.id);
  if (!scenario) {
    throw error(404, 'Scenario not found');
  }

  let results = scenariosRepository.getResults(params.id);
  if (!results) {
    try {
      // Calculate and save results on the fly if not cached
      runAndSaveScenario(params.id);
      results = scenariosRepository.getResults(params.id);
    } catch (err: any) {
      results = null;
    }
  }

  let timeline: any[] = [];
  let detailedResult: any = null;
  try {
    const detailed = calculateScenario(scenario);
    timeline = detailed.timeline;
    detailedResult = detailed;
  } catch (err) {
    timeline = [];
  }

  const resolvedConfigs = resolveScenarioCohorts(scenario);
  const scopeSummary = {
    cohortsCount: resolvedConfigs.length,
    totalUsers: resolvedConfigs.reduce((acc, cc) => acc + (cc.current_users || 0), 0)
  };

  // Advisory configuration diagnostics (non-blocking dead-end checks).
  let diagnostics: ScenarioDiagnostic[] = [];
  try {
    const validationScenario = { ...attachMonetization(scenario), scope_cohorts: resolvedConfigs };
    diagnostics = validateScenarioConfig(
      validationScenario,
      settingsRepository.get(),
      providersRepository.getAll(),
      undefined,
      detailedResult ?? undefined
    );
  } catch (err) {
    diagnostics = [];
  }

  const captureCurve = results?.evc?.captureCurve ?? null;
  const pricingCorridor = detailedResult?.evc?.pricingCorridor ?? null;
  const pocketMarginWaterfall = detailedResult?.evc?.pocketMarginWaterfall ?? null;
  const driverProfile = detailedResult?.driverProfile ?? null;
  const streamMargins = detailedResult?.streamMargins ?? null;
  const poolEconomics = detailedResult?.poolEconomics ?? null;
  const agentDeflectionCorridor = detailedResult?.agentDeflectionCorridor ?? null;

  return {
    scenario,
    results,
    timeline,
    scopeSummary,
    resolvedConfigs,
    diagnostics,
    captureCurve,
    pricingCorridor,
    pocketMarginWaterfall,
    driverProfile,
    streamMargins,
    poolEconomics,
    agentDeflectionCorridor
  };
};

export const actions: Actions = {
  deleteScenario: async ({ params }) => {
    try {
      scenariosRepository.delete(params.id);
    } catch (err: any) {
      return fail(500, { error: err.message });
    }

    throw redirect(303, '/scenarios');
  }
};
