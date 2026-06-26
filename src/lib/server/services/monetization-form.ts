import type { MonetizationConfig, MonetizationType, OverchargePolicy, UsageVariant } from '../../types';
import { monetizationRepository, type MonetizationEntityType } from '../repositories/monetization';
import { scenariosRepository } from '../repositories/scenarios';

function numField(formData: FormData, key: string): number | null {
  const v = formData.get(key);
  if (v === null || v === '') return null;
  const n = parseFloat(v as string);
  return Number.isNaN(n) ? null : n;
}

function intField(formData: FormData, key: string): number | null {
  const v = formData.get(key);
  if (v === null || v === '') return null;
  const n = parseInt(v as string, 10);
  return Number.isNaN(n) ? null : n;
}

function strField(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  return v && v !== '' ? (v as string) : null;
}

/** Parses the fields emitted by MonetizationFields.svelte into a MonetizationConfig. */
export function parseMonetizationFromForm(formData: FormData): MonetizationConfig {
  const monetization_type = (strField(formData, 'monetization_type') as MonetizationType) ?? 'none';
  const rawLimit = formData.get('addon_has_usage_limit');
  const addon_has_usage_limit = rawLimit === 'on' || rawLimit === 'true' || rawLimit === '1';

  return {
    monetization_type,
    addon_monthly_fee: numField(formData, 'addon_monthly_fee'),
    addon_has_usage_limit,
    addon_usage_limit: intField(formData, 'addon_usage_limit'),
    addon_overcharge_policy: strField(formData, 'addon_overcharge_policy') as OverchargePolicy | null,
    usage_variant: strField(formData, 'usage_variant') as UsageVariant | null,
    price_per_credit: numField(formData, 'price_per_credit'),
    hybrid_monthly_fee: numField(formData, 'hybrid_monthly_fee'),
    hybrid_included_credits: intField(formData, 'hybrid_included_credits'),
    hybrid_overcharge_policy: strField(formData, 'hybrid_overcharge_policy') as OverchargePolicy | null,
    overcharge_markup: numField(formData, 'overcharge_markup'),
    overcharge_user_pct: numField(formData, 'overcharge_user_pct'),
    avg_overcharge_pct: numField(formData, 'avg_overcharge_pct'),
    outcome_basis: strField(formData, 'outcome_basis') as any,
    price_per_outcome: numField(formData, 'price_per_outcome'),
    outcomes_per_user_month: numField(formData, 'outcomes_per_user_month')
  };
}

/**
 * Parses + persists a monetization config submitted alongside a catalog entity form,
 * then invalidates cached scenario results (a config change can move any scenario whose
 * revenue_source includes monetization). `scenarioId` set = scenario-level override.
 */
export function saveMonetizationFromForm(
  entityType: MonetizationEntityType,
  entityId: string,
  formData: FormData,
  scenarioId: string | null = null
): void {
  const config = parseMonetizationFromForm(formData);
  monetizationRepository.upsert(entityType, entityId, config, scenarioId);
  // Only invalidate when an actual monetization config was set — 'none' means
  // nothing was written, so no cached results are stale from this path.
  // (The catalog entity's own repository.update already handles targeted invalidation
  // for non-monetization field changes like token counts.)
  if (config.monetization_type !== 'none') {
    scenariosRepository.invalidateAllResults();
  }
}
