import type { PageServerLoad, Actions } from './$types';
import { servicesRepository } from '$lib/server/repositories/services';
import { packsRepository } from '$lib/server/repositories/packs';
import { plansRepository } from '$lib/server/repositories/plans';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
  const services = servicesRepository.getAll();
  const packs = packsRepository.getAll();
  const plan = plansRepository.getById(params.id);
  
  if (!plan) {
    throw redirect(303, '/catalog/plans');
  }

  return {
    services,
    packs,
    plan
  };
};

export const actions: Actions = {
  updatePlan: async ({ request, params }) => {
    const formData = await request.formData();
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const basePrice = parseFloat(formData.get('basePrice') as string || '0');
    const serviceIds = formData.getAll('service_ids') as string[];
    const packIds = formData.getAll('pack_ids') as string[];

    if (!name) {
      return fail(400, { error: 'Name is a required field' });
    }

    try {
      plansRepository.update(params.id, {
        name,
        description,
        base_price: basePrice,
        service_ids: serviceIds,
        pack_ids: packIds
      });
    } catch (err: any) {
      return fail(500, { error: err.message });
    }

    throw redirect(303, '/catalog/plans');
  }
};
