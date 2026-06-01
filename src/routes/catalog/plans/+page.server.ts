import type { PageServerLoad, Actions } from './$types';
import { plansRepository } from '$lib/server/repositories/plans';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
  const plans = plansRepository.getAll();
  return {
    plans
  };
};

export const actions: Actions = {
  deletePlan: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get('id') as string;

    if (!id) {
      return fail(400, { error: 'Plan ID is required' });
    }

    try {
      plansRepository.delete(id);
      return { success: true };
    } catch (err: any) {
      return fail(500, { error: err.message });
    }
  }
};
