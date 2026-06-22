import type { PageServerLoad, Actions } from './$types';
import { clientBaseRepository } from '$lib/server/repositories/client-base';
import { verticalsRepository } from '$lib/server/repositories/verticals';
import { cohortsRepository } from '$lib/server/repositories/cohorts';
import { servicesRepository } from '$lib/server/repositories/services';
import { packsRepository } from '$lib/server/repositories/packs';
import { plansRepository } from '$lib/server/repositories/plans';
import { costsRepository } from '$lib/server/repositories/costs';
import { providersRepository } from '$lib/server/repositories/providers';
import { settingsRepository } from '$lib/server/repositories/settings';
import { scenariosRepository } from '$lib/server/repositories/scenarios';
import { monetizationRepository } from '$lib/server/repositories/monetization';
import { entityOverridesRepository } from '$lib/server/repositories/entity-overrides';
import { runAndSaveScenario } from '$lib/server/services/financial-engine';
import { error, fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
  const scenario = scenariosRepository.getById(params.id);
  if (!scenario) {
    throw error(404, 'Scenario not found');
  }

  const clientBase = clientBaseRepository.get();
  const verticals = verticalsRepository.getAll();
  const cohorts = cohortsRepository.getAll();
  const services = servicesRepository.getAll();
  const packs = packsRepository.getAll();
  const plans = plansRepository.getAll();
  const costs = costsRepository.getAll();
  const providers = providersRepository.getAll();
  const settings = settingsRepository.get();

  // Monetization: catalog configs (all) + this scenario's overrides, keyed `${type}:${id}`.
  const monetizationCatalog = Object.fromEntries(monetizationRepository.getCatalogMap());
  const monetizationOverrides = Object.fromEntries(monetizationRepository.getScenarioOverrideMap(params.id));

  // Per-entity financial overrides for this scenario, keyed `${entity_type}:${entity_id}`.
  const entityOverrides = Object.fromEntries(
    entityOverridesRepository.getScenarioOverrides(params.id).map(r => [`${r.entity_type}:${r.entity_id}`, r])
  );

  return {
    scenario,
    clientBase,
    verticals,
    cohorts,
    services,
    packs,
    plans,
    costs,
    providers,
    settings,
    monetizationCatalog,
    monetizationOverrides,
    entityOverrides
  };
};

export const actions: Actions = {
  updateScenario: async ({ params, request }) => {
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

    try {
      scenariosRepository.update(params.id, {
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
        vertical_ids: verticalIds,
        cohort_config_ids: cohortConfigIds,
        scope_overrides: scopeOverrides,
        services,
        packs,
        plans,
        cost_ids: costIds
      });

      // Immediately run calculations and cache results
      runAndSaveScenario(params.id);
    } catch (err: any) {
      return fail(500, { error: err.message });
    }

    throw redirect(303, `/scenarios/${params.id}`);
  }
};
