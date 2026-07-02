import type { PageServerLoad, Actions } from './$types';
import { servicesRepository } from '$lib/server/repositories/services';
import { poolTiersRepository } from '$lib/server/repositories/pool-tiers';
import { error, fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
  const pool = poolTiersRepository.getById(params.id);
  if (!pool) {
    throw error(404, 'Credit Pool not found');
  }

  const burnRates = poolTiersRepository.getBurnRates(params.id);
  const poolWithRates = {
    ...pool,
    burn_rates: burnRates
  };

  const services = servicesRepository.getAll();

  return {
    pool: poolWithRates,
    services
  };
};

export const actions: Actions = {
  updatePoolTier: async ({ params, request }) => {
    const formData = await request.formData();
    const name = formData.get('name') as string;
    const monthlyFee = parseFloat(formData.get('monthlyFee') as string || '0');
    const creditPoolSize = parseInt(formData.get('creditPoolSize') as string || '0', 10);
    const captureVal = formData.get('capture') as string;
    const capture = captureVal !== '' && captureVal !== null ? parseFloat(captureVal) / 100 : null;
    const feeBasis = (formData.get('feeBasis') as string) === 'per_member' ? 'per_member' : 'flat';

    const burnRatesJSON = formData.get('burn_rates_json') as string;
    let burnRates = [];
    if (burnRatesJSON) {
      try {
        burnRates = JSON.parse(burnRatesJSON);
      } catch (e) {}
    }

    if (!name) {
      return fail(400, { error: 'Pool name is required' });
    }

    try {
      poolTiersRepository.update(params.id, {
        name,
        monthly_fee: monthlyFee,
        credit_pool_size: creditPoolSize,
        capture,
        fee_basis: feeBasis,
        burn_rates: burnRates
      });
    } catch (err: any) {
      return fail(500, { error: err.message });
    }

    throw redirect(303, '/catalog/pools');
  }
};
