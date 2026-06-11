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
      projectionHorizonMonths: settings.projection_horizon_months,
      exchangeRates: settings.exchange_rates,
      exchangeRatesAsOf: settings.exchange_rates_as_of
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
    
    const rateUSD = parseFloat(formData.get('rate_USD') as string || '1.0');
    const rateEUR = parseFloat(formData.get('rate_EUR') as string || '0.92');
    const ratePLN = parseFloat(formData.get('rate_PLN') as string || '4.05');
    const rateGBP = parseFloat(formData.get('rate_GBP') as string || '0.78');
    const exchangeRatesAsOf = formData.get('exchangeRatesAsOf') as string || new Date().toISOString().slice(0, 10);

    if (!companyName) {
      return fail(400, { error: 'Company name is required' });
    }

    try {
      settingsRepository.update({
        company_name: companyName,
        currency,
        default_discount_rate: defaultDiscountRate,
        projection_horizon_months: projectionHorizonMonths,
        exchange_rates: {
          USD: rateUSD,
          EUR: rateEUR,
          PLN: ratePLN,
          GBP: rateGBP
        },
        exchange_rates_as_of: exchangeRatesAsOf
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
