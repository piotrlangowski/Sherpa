import type { PageServerLoad, Actions } from './$types';
import { servicesRepository } from '$lib/server/repositories/services';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
  const services = servicesRepository.getAll();
  return {
    services
  };
};

export const actions: Actions = {
  deleteService: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get('id') as string;

    if (!id) {
      return fail(400, { error: 'Service ID is required' });
    }

    try {
      servicesRepository.delete(id);
      return { success: true };
    } catch (err: any) {
      return fail(500, { error: err.message });
    }
  }
};
