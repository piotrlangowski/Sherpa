import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { clientBaseRepository } from '$lib/server/repositories/client-base';

export const load: PageServerLoad = () => {
  const clientBase = clientBaseRepository.get();
  return {
    clientBase
  };
};

export const actions: Actions = {
  save: async ({ request }) => {
    const data = await request.formData();
    
    const total_users = Number(data.get('total_users'));
    const default_arpu = Number(data.get('default_arpu'));
    const default_monthly_churn_rate = Number(data.get('default_monthly_churn_rate')) / 100;
    const default_monthly_acquisition = Number(data.get('default_monthly_acquisition'));
    const default_acquisition_growth_rate = Number(data.get('default_acquisition_growth_rate')) / 100;
    const default_ai_adoption_rate = Number(data.get('default_ai_adoption_rate')) / 100;
    const default_retention_floor = Number(data.get('default_retention_floor')) / 100;
    const default_expansion_rate = Number(data.get('default_expansion_rate')) / 100;

    if (isNaN(total_users) || total_users < 0) return fail(400, { error: 'Invalid total users' });

    try {
      clientBaseRepository.update({
        total_users,
        default_arpu,
        default_monthly_churn_rate,
        default_monthly_acquisition,
        default_acquisition_growth_rate,
        default_ai_adoption_rate,
        default_retention_floor,
        default_expansion_rate
      });
    } catch (err: any) {
      return fail(500, { error: err.message });
    }

    return { success: true };
  }
};
