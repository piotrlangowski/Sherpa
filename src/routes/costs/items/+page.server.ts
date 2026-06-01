import type { PageServerLoad, Actions } from './$types';
import { costsRepository } from '$lib/server/repositories/costs';
import { servicesRepository } from '$lib/server/repositories/services';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
  const costs = costsRepository.getAll();
  const services = servicesRepository.getAll();
  return {
    costs,
    services
  };
};

export const actions: Actions = {
  saveCost: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get('id') as string;
    const name = formData.get('name') as string;
    const category = formData.get('category') as any;
    const subcategory = formData.get('subcategory') as string;
    const amount = parseFloat(formData.get('amount') as string);
    const frequency = formData.get('frequency') as any;
    const serviceId = formData.get('serviceId') as string;

    if (!name || !category || !subcategory || !frequency) {
      return fail(400, { error: 'Required fields are missing' });
    }

    if (isNaN(amount) || amount <= 0) {
      return fail(400, { error: 'Amount must be a positive number' });
    }

    try {
      const data = {
        name,
        category,
        subcategory,
        amount,
        frequency,
        service_id: serviceId || null
      };

      if (id) {
        costsRepository.update(id, data);
      } else {
        costsRepository.create(data);
      }
      return { success: true };
    } catch (err: any) {
      return fail(500, { error: err.message });
    }
  },

  deleteCost: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get('id') as string;

    if (!id) {
      return fail(400, { error: 'ID is required' });
    }

    try {
      costsRepository.delete(id);
      return { success: true };
    } catch (err: any) {
      return fail(500, { error: err.message });
    }
  }
};
