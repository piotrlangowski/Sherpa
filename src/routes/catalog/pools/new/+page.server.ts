import type { PageServerLoad, Actions } from './$types';
import { servicesRepository } from '$lib/server/repositories/services';
import { poolTiersRepository } from '$lib/server/repositories/pool-tiers';
import type { PoolFeeBasis, PoolSizeBasis } from '$lib/shared/types';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
  const services = servicesRepository.getAll();
  return {
    services
  };
};

export const actions: Actions = {
  createPoolTier: async ({ request }) => {
    const formData = await request.formData();
    const name = formData.get('name') as string;
    const monthlyFee = parseFloat(formData.get('monthlyFee') as string || '0');
    // Fractional allowances are the norm for per-member pools (e.g. 2.5 credits/user) — parseInt
    // would silently truncate them.
    const creditPoolSize = parseFloat(formData.get('creditPoolSize') as string || '0');
    const captureVal = formData.get('capture') as string;
    const capture = captureVal !== '' && captureVal !== null ? parseFloat(captureVal) / 100 : null;
    const feeBasisRaw = formData.get('feeBasis') as string;
    const feeBasis: PoolFeeBasis = feeBasisRaw === 'per_member' || feeBasisRaw === 'per_customer' ? feeBasisRaw : 'flat';
    const poolSizeBasisRaw = formData.get('poolSizeBasis') as string;
    const poolSizeBasis: PoolSizeBasis = poolSizeBasisRaw === 'per_member' ? 'per_member' : 'absolute';

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
      poolTiersRepository.create({
        name,
        monthly_fee: monthlyFee,
        credit_pool_size: creditPoolSize,
        capture,
        fee_basis: feeBasis,
        pool_size_basis: poolSizeBasis,
        burn_rates: burnRates
      });
    } catch (err: any) {
      return fail(500, { error: err.message });
    }

    throw redirect(303, '/catalog/pools');
  }
};
