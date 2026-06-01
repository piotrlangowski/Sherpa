import type { PageServerLoad } from './$types';
import { scenariosRepository } from '$lib/server/repositories/scenarios';

export const load: PageServerLoad = async () => {
  const scenarios = scenariosRepository.getAll();
  return {
    scenarios
  };
};
