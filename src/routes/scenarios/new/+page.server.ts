import type { PageServerLoad, Actions } from './$types';
import { clientBaseRepository } from '$lib/server/repositories/client-base';
import { verticalsRepository } from '$lib/server/repositories/verticals';
import { cohortsRepository } from '$lib/server/repositories/cohorts';
import { servicesRepository } from '$lib/server/repositories/services';
import { packsRepository } from '$lib/server/repositories/packs';
import { plansRepository } from '$lib/server/repositories/plans';
import { costsRepository } from '$lib/server/repositories/costs';
import { scenariosRepository } from '$lib/server/repositories/scenarios';
import { runAndSaveScenario } from '$lib/server/services/financial-engine';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
  const clientBase = clientBaseRepository.get();
  const verticals = verticalsRepository.getAll();
  const cohorts = cohortsRepository.getAll();
  const services = servicesRepository.getAll();
  const packs = packsRepository.getAll();
  const plans = plansRepository.getAll();
  const costs = costsRepository.getAll();

  return {
    clientBase,
    verticals,
    cohorts,
    services,
    packs,
    plans,
    costs
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

    // Parse rollout schedules for Plans
    const planIds = formData.getAll('planIds') as string[];
    const plans = planIds.map(id => {
      const rolloutMonth = parseInt(formData.get(`rollout_month_plan_${id}`) as string || '0', 10);
      return { id, rollout_month: rolloutMonth };
    });

    if (!name) {
      return fail(400, { error: 'Scenario name is required' });
    }

    if (!scopeType) {
      return fail(400, { error: 'Scope type is required' });
    }

    let scenarioId = '';

    try {
      const scenario = scenariosRepository.create({
        name,
        description: description || '',
        projection_months: projectionMonths,
        discount_rate: discountRate,
        scope_type: scopeType,
        vertical_ids: verticalIds,
        cohort_config_ids: cohortConfigIds,
        scope_overrides: scopeOverrides,
        services,
        packs,
        plans,
        cost_ids: costIds
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
