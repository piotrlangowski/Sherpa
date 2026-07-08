import type { PageServerLoad, Actions } from './$types';
import { scenariosRepository } from '$lib/server/repositories/scenarios';
import { runAndSaveScenario, calculateScenario, resolveScenarioCohorts, attachMonetization, computeScenarioPerspectives } from '$lib/server/services/financial-engine';
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

  let detailedResult: any = null;
  try {
    detailedResult = runAndSaveScenario(params.id);
  } catch (err) {
    // A broken scenario config (bad linked data, a hard revenue-integrity block, etc.) must
    // still render — this page has the delete action, so a calc failure can't strand the
    // scenario behind a hard error. Fall back to whatever was last cached (possibly null on
    // a scenario that has never calculated successfully), same as before this page had a
    // single compute path.
    detailedResult = null;
  }

  const results = scenariosRepository.getResults(params.id);
  const timeline = detailedResult ? detailedResult.timeline : [];

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

  let perspectives: any = null;
  try {
    perspectives = computeScenarioPerspectives(scenario);
  } catch (err) {
    perspectives = null;
  }

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
    agentDeflectionCorridor,
    perspectives
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
  },
  duplicateScenario: async ({ params }) => {
    try {
      const cloned = scenariosRepository.duplicate(params.id);
      try {
        runAndSaveScenario(cloned.id);
      } catch (err) {
        // tolerować błąd
      }
      throw redirect(303, `/scenarios/${cloned.id}`);
    } catch (err: any) {
      if (err.status === 303 || err.status === 307 || err.status === 302) throw err;
      return fail(500, { error: err.message });
    }
  }
};
