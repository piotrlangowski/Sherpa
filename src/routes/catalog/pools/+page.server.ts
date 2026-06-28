import type { PageServerLoad, Actions } from './$types';
import { poolTiersRepository } from '$lib/server/repositories/pool-tiers';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
  const pools = poolTiersRepository.getAll();
  const poolsWithRates = pools.map(pool => ({
    ...pool,
    burn_rates: poolTiersRepository.getBurnRates(pool.id)
  }));
  return {
    pools: poolsWithRates
  };
};

export const actions: Actions = {
  deletePoolTier: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get('id') as string;

    if (!id) {
      return fail(400, { error: 'Pool Tier ID is required' });
    }

    try {
      poolTiersRepository.delete(id);
      return { success: true };
    } catch (err: any) {
      return fail(500, { error: err.message });
    }
  }
};
