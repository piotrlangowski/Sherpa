import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { settingsRepository } from '$lib/server/repositories/settings';
import type { ExchangeRates } from '$lib/shared/types';

export const POST: RequestHandler = async () => {
  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP,PLN');
    if (!res.ok) {
      throw new Error(`Frankfurter API returned status: ${res.status}`);
    }
    
    const data = await res.json();
    if (!data.rates || typeof data.rates !== 'object') {
      throw new Error('Invalid response structure from Frankfurter API');
    }

    const { EUR, PLN, GBP } = data.rates;
    if (
      typeof EUR !== 'number' || EUR <= 0 ||
      typeof PLN !== 'number' || PLN <= 0 ||
      typeof GBP !== 'number' || GBP <= 0
    ) {
      throw new Error('Missing or invalid currency rates in Frankfurter response');
    }

    const exchange_rates: ExchangeRates = {
      USD: 1.0,
      EUR,
      PLN,
      GBP
    };
    const exchange_rates_as_of = data.date || new Date().toISOString().slice(0, 10);

    settingsRepository.update({
      exchange_rates,
      exchange_rates_as_of
    });

    return json({
      success: true,
      rates: exchange_rates,
      asOf: exchange_rates_as_of
    });
  } catch (err: any) {
    console.error('Error refreshing exchange rates:', err);
    return json(
      { success: false, error: `Failed to refresh exchange rates: ${err.message}` },
      { status: 502 }
    );
  }
};
