import type { PageServerLoad } from './$types';
import { scenariosRepository } from '$lib/server/repositories/scenarios';
import { runSensitivityAnalysis } from '$lib/server/services/sensitivity';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, url }) => {
  const scenario = scenariosRepository.getById(params.id);
  if (!scenario) {
    throw error(404, 'Scenario not found');
  }

  // Allow custom variation pct from query param (default 10%)
  const variationPctStr = url.searchParams.get('variation') || '10';
  const variationPct = parseFloat(variationPctStr) / 100;

  let sensitivityData = null;
  try {
    sensitivityData = runSensitivityAnalysis(scenario, variationPct);
  } catch (err: any) {
    console.error('Error running sensitivity analysis for route:', err);
    sensitivityData = null;
  }

  return {
    scenario,
    sensitivityData,
    variationPct: variationPct * 100
  };
};
