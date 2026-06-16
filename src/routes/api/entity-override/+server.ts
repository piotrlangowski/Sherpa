import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { entityOverridesRepository } from '$lib/server/repositories/entity-overrides';
import { scenariosRepository } from '$lib/server/repositories/scenarios';
import type { EntityOverride, EntityOverrideType } from '$lib/types';

const ENTITY_TYPES = ['service', 'cost', 'provider', 'plan'];

/** Per-scenario entity override payload. Only the fields relevant to entity_type are used. */
const EntityOverrideSchema = z.object({
  avg_input_tokens: z.number().nullable().optional(),
  avg_output_tokens: z.number().nullable().optional(),
  avg_requests_per_user_month: z.number().nullable().optional(),
  fixed_cost_per_month: z.number().nullable().optional(),
  amount: z.number().nullable().optional(),
  frequency: z.enum(['one_time', 'monthly', 'yearly']).nullable().optional(),
  input_price: z.number().nullable().optional(),
  output_price: z.number().nullable().optional(),
  base_price: z.number().nullable().optional()
});

function requireParams(scenarioId: string | null, entityType: string | null, entityId: string | null): {
  scenarioId: string;
  entityType: EntityOverrideType;
  entityId: string;
} {
  if (!scenarioId || !entityType || !entityId || !ENTITY_TYPES.includes(entityType)) {
    throw error(400, 'scenario_id, entity_type (service|cost|provider|plan) and entity_id are required');
  }
  return { scenarioId, entityType: entityType as EntityOverrideType, entityId };
}

// GET /api/entity-override?scenario_id=...&entity_type=service&entity_id=...
export const GET: RequestHandler = async ({ url }) => {
  const { scenarioId, entityType, entityId } = requireParams(
    url.searchParams.get('scenario_id'),
    url.searchParams.get('entity_type'),
    url.searchParams.get('entity_id')
  );
  const override = entityOverridesRepository.getForEntity(scenarioId, entityType, entityId);
  return json({ override });
};

// POST /api/entity-override  { scenario_id, entity_type, entity_id, override }
export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => null);
  if (!body) throw error(400, 'Invalid JSON body');
  const { scenarioId, entityType, entityId } = requireParams(body.scenario_id, body.entity_type, body.entity_id);
  const parsed = EntityOverrideSchema.safeParse(body.override ?? {});
  if (!parsed.success) {
    return json({ success: false, errors: parsed.error.flatten() }, { status: 400 });
  }
  entityOverridesRepository.upsert(scenarioId, entityType, entityId, parsed.data as EntityOverride);
  scenariosRepository.invalidateResults([scenarioId]);
  return json({ success: true });
};

// DELETE /api/entity-override?scenario_id=...&entity_type=service&entity_id=...
export const DELETE: RequestHandler = async ({ url }) => {
  const { scenarioId, entityType, entityId } = requireParams(
    url.searchParams.get('scenario_id'),
    url.searchParams.get('entity_type'),
    url.searchParams.get('entity_id')
  );
  entityOverridesRepository.delete(scenarioId, entityType, entityId);
  scenariosRepository.invalidateResults([scenarioId]);
  return json({ success: true });
};
