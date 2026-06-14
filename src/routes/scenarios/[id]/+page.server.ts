import type { PageServerLoad, Actions } from './$types';
import { scenariosRepository } from '$lib/server/repositories/scenarios';
import { runAndSaveScenario, calculateScenario, resolveScenarioCohorts } from '$lib/server/services/financial-engine';
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
  try {
    const detailed = calculateScenario(scenario);
    timeline = detailed.timeline;
  } catch (err) {
    timeline = [];
  }

  const resolvedConfigs = resolveScenarioCohorts(scenario);
  const scopeSummary = {
    cohortsCount: resolvedConfigs.length,
    totalUsers: resolvedConfigs.reduce((acc, cc) => acc + (cc.current_users || 0), 0)
  };

  return {
    scenario,
    results,
    timeline,
    scopeSummary,
    resolvedConfigs
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
