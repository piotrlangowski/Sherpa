import type { PageServerLoad, Actions } from './$types';
import { settingsRepository } from '$lib/server/repositories/settings';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
  const settings = settingsRepository.get();
  return {
    settings: {
      companyName: settings.company_name,
      currency: settings.currency,
      defaultDiscountRate: settings.default_discount_rate,
      setupCompleted: settings.setup_completed,
      projectionHorizonMonths: settings.projection_horizon_months
    }
  };
};

export const actions: Actions = {
  updateSettings: async ({ request }) => {
    const formData = await request.formData();
    const companyName = formData.get('companyName') as string;
    const currency = formData.get('currency') as any;
    const defaultDiscountRate = parseFloat(formData.get('defaultDiscountRate') as string);
    const projectionHorizonMonths = parseInt(formData.get('projectionHorizonMonths') as string, 10);

    if (!companyName) {
      return fail(400, { error: 'Company name is required' });
    }

    try {
      settingsRepository.update({
        company_name: companyName,
        currency,
        default_discount_rate: defaultDiscountRate,
        projection_horizon_months: projectionHorizonMonths
      });
      return { success: true };
    } catch (err: any) {
      return fail(500, { error: err.message });
    }
  },

  resetWorkspace: async () => {
    try {
      await settingsRepository.reset();
      // Redirect to home which triggers setup wizard reload
      throw redirect(303, '/');
    } catch (err) {
      if (err instanceof Response) throw err; // rethrow SvelteKit redirect
      return fail(500, { error: 'Failed to reset workspace.' });
    }
  }
};
