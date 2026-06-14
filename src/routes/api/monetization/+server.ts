import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { monetizationRepository, type MonetizationEntityType } from '$lib/server/repositories/monetization';
import { scenariosRepository } from '$lib/server/repositories/scenarios';
import { MonetizationConfigSchema } from '$lib/types/schemas';
import type { MonetizationConfig } from '$lib/types';

const ENTITY_TYPES = ['service', 'pack', 'plan'];

function requireEntity(entityType: string | null, entityId: string | null): MonetizationEntityType {
  if (!entityType || !entityId || !ENTITY_TYPES.includes(entityType)) {
    throw error(400, 'entity_type (service|pack|plan) and entity_id are required');
  }
  return entityType as MonetizationEntityType;
}

// GET /api/monetization?entity_type=plan&entity_id=...&scenario_id=...(optional)
export const GET: RequestHandler = async ({ url }) => {
  const entityType = requireEntity(url.searchParams.get('entity_type'), url.searchParams.get('entity_id'));
  const entityId = url.searchParams.get('entity_id')!;
  const scenarioId = url.searchParams.get('scenario_id');
  const config = monetizationRepository.getForEntity(entityType, entityId, scenarioId || null);
  return json({ config });
};

// POST /api/monetization  { entity_type, entity_id, scenario_id?, config }
export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => null);
  if (!body) throw error(400, 'Invalid JSON body');
  const entityType = requireEntity(body.entity_type, body.entity_id);
  const parsed = MonetizationConfigSchema.safeParse(body.config ?? {});
  if (!parsed.success) {
    return json({ success: false, errors: parsed.error.flatten() }, { status: 400 });
  }
  monetizationRepository.upsert(entityType, body.entity_id, parsed.data as MonetizationConfig, body.scenario_id || null);
  scenariosRepository.invalidateAllResults();
  return json({ success: true });
};

// DELETE /api/monetization?entity_type=plan&entity_id=...&scenario_id=...(optional)
export const DELETE: RequestHandler = async ({ url }) => {
  const entityType = requireEntity(url.searchParams.get('entity_type'), url.searchParams.get('entity_id'));
  const entityId = url.searchParams.get('entity_id')!;
  const scenarioId = url.searchParams.get('scenario_id');
  monetizationRepository.delete(entityType, entityId, scenarioId || null);
  scenariosRepository.invalidateAllResults();
  return json({ success: true });
};
