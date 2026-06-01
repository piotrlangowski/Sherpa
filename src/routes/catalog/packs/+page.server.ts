import type { PageServerLoad, Actions } from './$types';
import { packsRepository } from '$lib/server/repositories/packs';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
  const packs = packsRepository.getAll();
  return {
    packs
  };
};

export const actions: Actions = {
  deletePack: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get('id') as string;

    if (!id) {
      return fail(400, { error: 'Pack ID is required' });
    }

    try {
      packsRepository.delete(id);
      return { success: true };
    } catch (err: any) {
      return fail(500, { error: err.message });
    }
  }
};
