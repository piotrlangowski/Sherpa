import type { PageServerLoad, Actions } from './$types';
import { servicesRepository } from '$lib/server/repositories/services';
import { packsRepository } from '$lib/server/repositories/packs';
import { saveMonetizationFromForm } from '$lib/server/services/monetization-form';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
  const services = servicesRepository.getAll();
  return {
    services
  };
};

export const actions: Actions = {
  createPack: async ({ request }) => {
    const formData = await request.formData();
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const serviceIds = formData.getAll('service_ids') as string[];

    if (!name) {
      return fail(400, { error: 'Name is a required field' });
    }

    try {
      const created = packsRepository.create({
        name,
        description,
        service_ids: serviceIds
      });
      saveMonetizationFromForm('pack', created.id, formData);
    } catch (err: any) {
      return fail(500, { error: err.message });
    }

    throw redirect(303, '/catalog/packs');
  }
};
