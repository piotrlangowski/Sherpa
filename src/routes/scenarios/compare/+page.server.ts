import type { PageServerLoad } from './$types';
import { scenariosRepository } from '$lib/server/repositories/scenarios';
import { resolveScenarioCohorts } from '$lib/server/services/financial-engine';

export const load: PageServerLoad = async () => {
  const scenarios = scenariosRepository.getAll();
  
  // Load detailed cached results for all scenarios to enable overlaid charts
  const scenariosWithResults = scenarios.map(s => {
    const results = scenariosRepository.getResults(s.id);
    const fullScenario = scenariosRepository.getById(s.id);
    let scopeSummary = { cohortsCount: 0, totalUsers: 0 };
    
    if (fullScenario) {
      const resolvedConfigs = resolveScenarioCohorts(fullScenario);
      scopeSummary = {
        cohortsCount: resolvedConfigs.length,
        totalUsers: resolvedConfigs.reduce((acc, cc) => acc + (cc.current_users || 0), 0)
      };
    }

    return {
      id: s.id,
      name: s.name,
      description: s.description,
      projection_months: s.projection_months,
      discount_rate: s.discount_rate,
      modeling_type: s.modeling_type,
      revenue_carrier: s.revenue_carrier,
      scope_type: s.scope_type,
      scope_verticals: s.scope_verticals,
      scope_cohorts: s.scope_cohorts,
      results: results || null,
      scopeSummary
    };
  });

  return {
    scenarios: scenariosWithResults
  };
};
