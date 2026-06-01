import type { PageServerLoad, Actions } from './$types';
import { servicesRepository } from '$lib/server/repositories/services';
import { packsRepository } from '$lib/server/repositories/packs';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
  const services = servicesRepository.getAll();
  const pack = packsRepository.getById(params.id);
  
  if (!pack) {
    throw redirect(303, '/catalog/packs');
  }

  return {
    services,
    pack
  };
};

export const actions: Actions = {
  updatePack: async ({ request, params }) => {
    const formData = await request.formData();
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const serviceIds = formData.getAll('service_ids') as string[];

    if (!name) {
      return fail(400, { error: 'Name is a required field' });
    }

    try {
      packsRepository.update(params.id, {
        name,
        description,
        service_ids: serviceIds
      });
    } catch (err: any) {
      return fail(500, { error: err.message });
    }

    throw redirect(303, '/catalog/packs');
  }
};
