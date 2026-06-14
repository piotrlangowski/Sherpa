import { describe, it, expect } from 'vitest';
import { convertAmount, normalizeScenarioCurrency, FALLBACK_EXCHANGE_RATES } from './currency.js';
import type { Provider, Scenario, CostItem, Service, CohortConfig } from './types.js';

describe('Currency Module Tests', () => {
  describe('convertAmount', () => {
    const rates = {
      USD: 1.0,
      EUR: 0.9,
      PLN: 4.0,
      GBP: 0.8,
    };

    it('should return the original amount when converting to the same currency', () => {
      expect(convertAmount(100, 'USD', 'USD', rates)).toBe(100);
      expect(convertAmount(250, 'PLN', 'PLN', rates)).toBe(250);
    });

    it('should convert correctly using the rates provided', () => {
      // 100 USD to PLN -> 100 * 4.0 / 1.0 = 400
      expect(convertAmount(100, 'USD', 'PLN', rates)).toBe(400);

      // 400 PLN to USD -> 400 * 1.0 / 4.0 = 100
      expect(convertAmount(400, 'PLN', 'USD', rates)).toBe(100);

      // 90 EUR to PLN -> 90 * 4.0 / 0.9 = 400
      expect(convertAmount(90, 'EUR', 'PLN', rates)).toBe(400);
    });

    it('should use fallback rates if a currency is missing from provided rates', () => {
      const incompleteRates = { USD: 1.0 } as any;
      const fallbackRatePLN = FALLBACK_EXCHANGE_RATES.PLN; // 4.05
      // 100 USD to PLN -> 100 * 4.05 / 1.0 = 405
      expect(convertAmount(100, 'USD', 'PLN', incompleteRates)).toBe(100 * fallbackRatePLN);
    });
  });

  describe('normalizeScenarioCurrency', () => {
    const providerUsd: Provider = {
      id: 'p1',
      name: 'OpenAI',
      model_name: 'gpt-4',
      input_price: 5.0,
      output_price: 15.0,
      is_predefined: true,
      currency: 'USD',
      input_tokens_per_credit: 1000000,
      output_tokens_per_credit: 333333,
      updated_at: '',
    };

    const providerEur: Provider = {
      id: 'p2',
      name: 'Custom Provider',
      model_name: 'llama-3',
      input_price: 10.0,
      output_price: 20.0,
      is_predefined: false,
      currency: 'EUR',
      input_tokens_per_credit: 1000000,
      output_tokens_per_credit: 333333,
      updated_at: '',
    };

    const cohort: CohortConfig = {
      id: 'c1',
      name: 'Test Cohort',
      current_users: 1000,
      monthly_acquisition: 100,
      acquisition_growth_rate: 0.02,
      monthly_churn_rate: 0.05,
      retention_floor: 0.50,
      monthly_expansion_rate: 0.02,
      ai_adoption_rate: 0.30,
      base_arpu: 100,
    };

    const serviceEur: Service & { rollout_month: number } = {
      id: 's1',
      name: 'Service EUR',
      status: 'planned',
      provider_id: 'p2',
      avg_input_tokens: 1000,
      avg_output_tokens: 1000,
      avg_requests_per_user_month: 10,
      fixed_cost_per_month: 90,
      fixed_cost_currency: 'EUR',
      rollout_month: 0,
    };

    const costPln: CostItem = {
      id: 'cost1',
      name: 'Setup Fee PLN',
      category: 'capex',
      amount: 400,
      frequency: 'one_time',
      currency: 'PLN',
    };

    const scenario: Scenario = {
      id: 'sc1',
      name: 'Multi-currency scenario',
      projection_months: 12,
      discount_rate: 0.1,
      scope_type: 'cohorts',
      scope_cohorts: [cohort],
      services: [serviceEur],
      costs: [costPln],
    };

    const rates = {
      USD: 1.0,
      EUR: 0.9,
      PLN: 4.0,
      GBP: 0.8,
    };

    it('should normalize everything to base currency (e.g. PLN) and leave originals intact', () => {
      const { scenario: normalizedScenario, providers: normalizedProviders } =
        normalizeScenarioCurrency(scenario, [providerUsd, providerEur], 'PLN', rates);

      // Verify Provider token price normalizations
      // p1: 5 USD -> 5 * 4 / 1 = 20 PLN
      // p2: 10 EUR -> 10 * 4 / 0.9 = 44.444 PLN
      const p1Norm = normalizedProviders.find(p => p.id === 'p1')!;
      const p2Norm = normalizedProviders.find(p => p.id === 'p2')!;

      expect(p1Norm.currency).toBe('PLN');
      expect(p1Norm.input_price).toBeCloseTo(20, 2);
      expect(p1Norm.output_price).toBeCloseTo(60, 2);

      expect(p2Norm.currency).toBe('PLN');
      expect(p2Norm.input_price).toBeCloseTo(44.44, 2);
      expect(p2Norm.output_price).toBeCloseTo(88.89, 2);

      // Verify Scenario cost item normalizations
      // cost1: 400 PLN -> 400 PLN
      const costNorm = normalizedScenario.costs!.find(c => c.id === 'cost1')!;
      expect(costNorm.currency).toBe('PLN');
      expect(costNorm.amount).toBe(400);

      // Verify Scenario service fixed cost normalizations
      // s1: 90 EUR -> 90 * 4 / 0.9 = 400 PLN
      const serviceNorm = normalizedScenario.services!.find(s => s.id === 's1')!;
      expect(serviceNorm.fixed_cost_currency).toBe('PLN');
      expect(serviceNorm.fixed_cost_per_month).toBeCloseTo(400, 2);

      // Verify original objects are unchanged
      expect(providerUsd.currency).toBe('USD');
      expect(providerEur.currency).toBe('EUR');
      expect(costPln.currency).toBe('PLN');
      expect(serviceEur.fixed_cost_currency).toBe('EUR');
    });

    it('should handle missing services or costs fields without throwing', () => {
      const emptyScenario: Scenario = {
        id: 'sc2',
        name: 'Empty scenario',
        projection_months: 12,
        discount_rate: 0.1,
        scope_type: 'cohorts',
        scope_cohorts: [cohort],
      };

      expect(() =>
        normalizeScenarioCurrency(emptyScenario, [], 'PLN', rates)
      ).not.toThrow();
    });
  });
});
