import type { PageServerLoad, Actions } from './$types';
import { servicesRepository } from '$lib/server/repositories/services';
import { dependenciesRepository } from '$lib/server/repositories/dependencies';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
  const services = servicesRepository.getAll();
  const dependencies = dependenciesRepository.getAll();
  return {
    services,
    dependencies
  };
};

export const actions: Actions = {
  addDependency: async ({ request }) => {
    const formData = await request.formData();
    const sourceId = formData.get('sourceId') as string;
    const targetId = formData.get('targetId') as string;
    const dependencyType = formData.get('dependencyType') as any;

    if (!sourceId || !targetId || !dependencyType) {
      return fail(400, { error: 'Required fields are missing' });
    }

    if (sourceId === targetId) {
      return fail(400, { error: 'A service cannot depend on itself' });
    }

    try {
      dependenciesRepository.create({
        source_id: sourceId,
        target_id: targetId,
        dependency_type: dependencyType
      });
      return { success: true };
    } catch (err: any) {
      return fail(400, { error: err.message });
    }
  },

  deleteDependency: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get('id') as string;

    if (!id) {
      return fail(400, { error: 'ID is required' });
    }

    try {
      dependenciesRepository.delete(id);
      return { success: true };
    } catch (err: any) {
      return fail(500, { error: err.message });
    }
  }
};
