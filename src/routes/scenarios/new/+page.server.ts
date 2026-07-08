import type { PageServerLoad, Actions } from './$types';
import { clientBaseRepository } from '$lib/server/repositories/client-base';
import { verticalsRepository } from '$lib/server/repositories/verticals';
import { cohortsRepository } from '$lib/server/repositories/cohorts';
import { servicesRepository } from '$lib/server/repositories/services';
import { packsRepository } from '$lib/server/repositories/packs';
import { plansRepository } from '$lib/server/repositories/plans';
import { costsRepository } from '$lib/server/repositories/costs';
import { scenariosRepository } from '$lib/server/repositories/scenarios';
import { providersRepository } from '$lib/server/repositories/providers';
import { settingsRepository } from '$lib/server/repositories/settings';
import { poolTiersRepository } from '$lib/server/repositories/pool-tiers';
import { monetizationRepository } from '$lib/server/repositories/monetization';
import { runAndSaveScenario } from '$lib/server/services/financial-engine';
import { validateRevenueIntegrity } from '$lib/shared/financial-math';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
  const clientBase = clientBaseRepository.get();
  const verticals = verticalsRepository.getAll();
  const cohorts = cohortsRepository.getAll();
  const services = servicesRepository.getAll();
  const packs = packsRepository.getAll();
  const plans = plansRepository.getAll();
  const costs = costsRepository.getAll();
  const providers = providersRepository.getAll();
  const settings = settingsRepository.get();
  const poolTiers = poolTiersRepository.getAll();
  const monetizationCatalog = Object.fromEntries(monetizationRepository.getCatalogMap());

  return {
    clientBase,
    verticals,
    cohorts,
    services,
    packs,
    plans,
    costs,
    providers,
    settings,
    poolTiers,
    monetizationCatalog
  };
};

export const actions: Actions = {
  createScenario: async ({ request }) => {
    const formData = await request.formData();
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const projectionMonths = parseInt(formData.get('projectionMonths') as string || '36', 10);
    const discountRate = parseFloat(formData.get('discountRate') as string || '10') / 100;
    const scopeType = formData.get('scopeType') as 'all_clients' | 'verticals' | 'cohorts';
    const revenueSource = (formData.get('revenueSource') as 'cohort' | 'monetization' | 'both') || 'cohort';
    const capexContingencyPct = parseFloat(formData.get('capexContingencyPct') as string || '0');
    const modelingType = (formData.get('modelingType') as string) || 'appraisal';
    const revenueCarrier = (formData.get('revenueCarrier') as string) || null;
    const revenueBridge = (formData.get('revenueBridge') as string) || null;
    const pool_tier_id = (formData.get('pool_tier_id') as string) || null;

    // S-curve Expansion (Phase 3)
    const expansion_vertical_id = (formData.get('expansion_vertical_id') as string) || null;
    const penetration_baseline_months = parseFloat(formData.get('penetration_baseline_months') as string || '12');
    const ai_acceleration_factor = parseFloat(formData.get('ai_acceleration_factor') as string || '0.6');
    const ai_som_lift_pct = parseFloat(formData.get('ai_som_lift_pct') as string || '0.25');

    // EVC inputs (Gap B)
    const getFloatOrNull = (key: string) => {
      const val = formData.get(key);
      if (val === null || val === undefined || val === '') return null;
      return parseFloat(val as string);
    };
    const evc_nba_annual_value = getFloatOrNull('evc_nba_annual_value');
    const evc_extra_positive_value = getFloatOrNull('evc_extra_positive_value');
    const evc_negative_value = getFloatOrNull('evc_negative_value');
    const evc_capture_ceiling_pct = getFloatOrNull('evc_capture_ceiling_pct');
    const evc_capture_target_pct = getFloatOrNull('evc_capture_target_pct');
    const evc_capture_floor_pct = getFloatOrNull('evc_capture_floor_pct');
    const price_from_evc = formData.get('price_from_evc') === '1';
    const adoption_elasticity = parseFloat(formData.get('adoption_elasticity') as string || '0');
    const arpu_uplift_includes_monetization = formData.get('arpu_uplift_includes_monetization') !== '0';

    const monetizationConfigsJSON = formData.get('monetizationConfigsJSON') as string;
    let monetizationConfigs: Array<{ entity_type: 'service' | 'pack' | 'plan', entity_id: string, config: any }> = [];
    if (monetizationConfigsJSON) {
      try {
        const rawMap = JSON.parse(monetizationConfigsJSON);
        for (const [key, val] of Object.entries(rawMap)) {
          if (val) {
            const [type, id] = key.split(':');
            monetizationConfigs.push({
              entity_type: type as any,
              entity_id: id,
              config: val
            });
          }
        }
      } catch (e) {}
    }

    let verticalIds: string[] = [];
    if (scopeType === 'verticals') {
      verticalIds = formData.getAll('verticalIds') as string[];
    }
    
    let cohortConfigIds: string[] = [];
    if (scopeType === 'cohorts') {
      cohortConfigIds = formData.getAll('cohortConfigIds') as string[];
    }

    const scopeOverridesJSON = formData.get('scopeOverridesJSON') as string;
    let scopeOverrides = [];
    if (scopeOverridesJSON) {
      try {
        scopeOverrides = JSON.parse(scopeOverridesJSON);
      } catch (e) {}
    }

    const costIds = formData.getAll('costIds') as string[];

    // Parse rollout schedules for Services
    const serviceIds = formData.getAll('serviceIds') as string[];
    const services = serviceIds.map(id => {
      const rolloutMonth = parseInt(formData.get(`rollout_month_service_${id}`) as string || '0', 10);
      return { id, rollout_month: rolloutMonth };
    });

    // Parse rollout schedules for Packs
    const packIds = formData.getAll('packIds') as string[];
    const packs = packIds.map(id => {
      const rolloutMonth = parseInt(formData.get(`rollout_month_pack_${id}`) as string || '0', 10);
      return { id, rollout_month: rolloutMonth };
    });

    // Parse rollout schedules + seats for Plans
    const planIds = formData.getAll('planIds') as string[];
    const plans = planIds.map(id => {
      const rolloutMonth = parseInt(formData.get(`rollout_month_plan_${id}`) as string || '0', 10);
      const seats = parseInt(formData.get(`seats_plan_${id}`) as string || '0', 10);
      return { id, rollout_month: rolloutMonth, seats };
    });

    if (!name) {
      return fail(400, { error: 'Scenario name is required' });
    }

    if (!scopeType) {
      return fail(400, { error: 'Scope type is required' });
    }

    // Resolve cohorts for validation
    const allCohorts = cohortsRepository.getAll();
    const scope_cohorts = scopeType === 'all_clients'
      ? allCohorts
      : allCohorts.filter(c => cohortConfigIds.includes(c.id));

    // Revenue integrity validation (ADR 0001-0004)
    const draftScenario = {
      modeling_type: modelingType as any,
      revenue_carrier: revenueCarrier as any,
      revenue_bridge: revenueBridge as any,
      arpu_uplift_includes_monetization,
      pool_tier_id,
      plans,
      services,
      scope_cohorts
    };
    const integrity = validateRevenueIntegrity(draftScenario as any);
    if (integrity.status === 'block') {
      return fail(400, { error: integrity.message || 'Revenue integrity validation failed.' });
    }

    let scenarioId = '';

    try {
      const scenario = scenariosRepository.create({
        name,
        description: description || '',
        projection_months: projectionMonths,
        discount_rate: discountRate,
        scope_type: scopeType,
        revenue_source: revenueSource,
        capex_contingency_pct: capexContingencyPct,
        modeling_type: modelingType as any,
        revenue_carrier: revenueCarrier as any,
        revenue_bridge: revenueBridge as any,
        arpu_uplift_includes_monetization,
        pool_tier_id,
        vertical_ids: verticalIds,
        cohort_config_ids: cohortConfigIds,
        scope_overrides: scopeOverrides,
        services,
        packs,
        plans,
        cost_ids: costIds,
        expansion_vertical_id,
        penetration_baseline_months,
        ai_acceleration_factor,
        ai_som_lift_pct,
        evc_nba_annual_value,
        evc_extra_positive_value,
        evc_negative_value,
        evc_capture_ceiling_pct,
        evc_capture_target_pct,
        evc_capture_floor_pct,
        price_from_evc,
        adoption_elasticity,
        monetization_configs: monetizationConfigs
      });

      scenarioId = scenario.id;

      // Immediately run calculations and cache results
      runAndSaveScenario(scenario.id);
    } catch (err: any) {
      return fail(500, { error: err.message });
    }

    throw redirect(303, `/scenarios/${scenarioId}`);
  }
};
