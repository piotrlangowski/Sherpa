import type { PageServerLoad, Actions } from './$types';
import { verticalsRepository } from '$lib/server/repositories/verticals';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
  const verticals = verticalsRepository.getAll();
  return {
    verticals
  };
};

export const actions: Actions = {
  deleteVertical: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get('id') as string;

    if (!id) {
      return fail(400, { error: 'Vertical ID is required' });
    }

    try {
      verticalsRepository.delete(id);
      return { success: true };
    } catch (err: any) {
      return fail(500, { error: err.message });
    }
  }
};
