import type { PageServerLoad, Actions } from './$types';
import { plansRepository } from '$lib/server/repositories/plans';
import { packsRepository } from '$lib/server/repositories/packs';
import { verticalsRepository } from '$lib/server/repositories/verticals';
import { error, fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
  const vertical = verticalsRepository.getById(params.id);
  if (!vertical) {
    throw error(404, 'Market vertical not found');
  }

  const plans = plansRepository.getAll();
  const packs = packsRepository.getAll();
  return {
    vertical,
    plans,
    packs
  };
};

export const actions: Actions = {
  updateVertical: async ({ params, request }) => {
    const formData = await request.formData();
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const tamUsers = parseInt(formData.get('tamUsers') as string || '0', 10);
    const samUsers = parseInt(formData.get('samUsers') as string || '0', 10);
    const somUsers = parseInt(formData.get('somUsers') as string || '0', 10);
    
    // Retrieve array fields from checkboxes
    const planIds = formData.getAll('planIds') as string[];
    const packIds = formData.getAll('packIds') as string[];

    if (!name) {
      return fail(400, { error: 'Vertical name is required' });
    }

    try {
      verticalsRepository.update(params.id, {
        name,
        description: description || '',
        tam_users: tamUsers,
        sam_users: samUsers,
        som_users: somUsers,
        plan_ids: planIds,
        pack_ids: packIds
      });
    } catch (err: any) {
      return fail(500, { error: err.message });
    }

    throw redirect(303, '/market/verticals');
  }
};
