import type { PageServerLoad } from './$types';
import { scenariosRepository } from '$lib/server/repositories/scenarios';

export const load: PageServerLoad = async () => {
  const scenarios = scenariosRepository.getAll();
  
  // Load detailed cached results for all scenarios to enable overlaid charts
  const scenariosWithResults = scenarios.map(s => {
    const results = scenariosRepository.getResults(s.id);
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      projection_months: s.projection_months,
      discount_rate: s.discount_rate,
      cohort_config: s.cohort_config,
      results: results || null
    };
  });

  return {
    scenarios: scenariosWithResults
  };
};
