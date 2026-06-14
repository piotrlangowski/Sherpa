import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { scenariosRepository } from '$lib/server/repositories/scenarios';
import { resolveScenarioMonetization } from '$lib/server/services/financial-engine';

// GET /api/monetization/resolve?scenario_id=...
// Returns the effective monetization config per service after Service→Pack→Plan
// inheritance and scenario overrides are applied.
export const GET: RequestHandler = async ({ url }) => {
  const scenarioId = url.searchParams.get('scenario_id');
  if (!scenarioId) throw error(400, 'scenario_id is required');

  const scenario = scenariosRepository.getById(scenarioId);
  if (!scenario) throw error(404, 'Scenario not found');

  const map = resolveScenarioMonetization(scenario);
  const resolved: Record<string, unknown> = {};
  for (const [serviceId, config] of map) resolved[serviceId] = config;

  return json({ scenarioId, resolved });
};
