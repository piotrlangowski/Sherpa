import type { Currency, Scenario, Provider, ExchangeRates } from './types.js';

export const EXCHANGE_RATES_AS_OF = '2026-06-11';

export const FALLBACK_EXCHANGE_RATES: ExchangeRates = {
  USD: 1.0,
  EUR: 0.92,
  PLN: 4.05,
  GBP: 0.78,
};

/**
 * Converts an amount from one currency to another using the provided exchange rates.
 * Rates are units of currency per 1 USD (e.g. USD: 1.0, EUR: 0.92, PLN: 4.05).
 */
export function convertAmount(
  amount: number,
  from: Currency,
  to: Currency,
  rates: ExchangeRates
): number {
  if (from === to) return amount;
  const rateFrom = rates[from] ?? FALLBACK_EXCHANGE_RATES[from] ?? 1;
  const rateTo = rates[to] ?? FALLBACK_EXCHANGE_RATES[to] ?? 1;
  return (amount * rateTo) / rateFrom;
}

/**
 * Creates a deep copy of a scenario and a list of providers, and normalizes
 * all currency fields to the base workspace currency.
 * This function is idempotent and has zero side-effects.
 */
export function normalizeScenarioCurrency(
  scenario: Scenario,
  providers: Provider[],
  base: Currency,
  rates: ExchangeRates
): { scenario: Scenario; providers: Provider[] } {
  // Deep clone scenario and providers
  const clonedScenario = JSON.parse(JSON.stringify(scenario)) as Scenario;
  const clonedProviders = JSON.parse(JSON.stringify(providers)) as Provider[];

  // 1. Normalize provider token prices (USD by default for predefined, but custom models can vary)
  for (const provider of clonedProviders) {
    const fromCurrency = (provider as any).currency || 'USD';
    provider.input_price = convertAmount(provider.input_price, fromCurrency, base, rates);
    provider.output_price = convertAmount(provider.output_price, fromCurrency, base, rates);
    (provider as any).currency = base;
  }

  // 2. Normalize scenario cost items
  if (clonedScenario.costs) {
    for (const cost of clonedScenario.costs) {
      const fromCurrency = (cost as any).currency || 'USD';
      cost.amount = convertAmount(cost.amount, fromCurrency, base, rates);
      (cost as any).currency = base;
    }
  }

  // 3. Normalize scenario services fixed costs
  if (clonedScenario.services) {
    for (const service of clonedScenario.services) {
      const fromCurrency = (service as any).fixed_cost_currency || 'USD';
      if (service.fixed_cost_per_month !== null && service.fixed_cost_per_month !== undefined) {
        service.fixed_cost_per_month = convertAmount(
          service.fixed_cost_per_month,
          fromCurrency,
          base,
          rates
        );
      }
      (service as any).fixed_cost_currency = base;
    }
  }

  return {
    scenario: clonedScenario,
    providers: clonedProviders,
  };
}
