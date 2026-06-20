import { describe, it, expect } from 'vitest';
import {
  calculateNPV,
  calculatePaybackPeriod,
  calculateIRR,
  calculateTCO,
  buildCohortModel,
  calculateScenario,
  runSensitivityAnalysis,
  applyScopeOverrides,
  splitCohortForAi,
  calculateMonetizationRevenue,
  calculateCreditsPerUserMonth,
  DEFAULT_CREDIT_SETTINGS,
  calculateIRRGuarded,
  validateRevenueIntegrity,
  computeImpliedPopulation,
  resolveCarrier
} from './financial-math.js';
import type { Provider, Scenario, CohortConfig, CostItem, Service, ScopeOverride, MonetizationConfig } from './types.js';

describe('Financial Math Module Tests', () => {
  describe('calculateNPV', () => {
    it('should calculate NPV with zero discount rate', () => {
      const cashFlows = [-100, 50, 50, 50];
      const npv = calculateNPV(cashFlows, 0);
      expect(npv).toBe(50);
    });

    it('should calculate NPV with a standard discount rate', () => {
      const cashFlows = [-100, 50, 50];
      const npv = calculateNPV(cashFlows, 0.10);
      expect(npv).toBeCloseTo(-1.18, 1);
    });

    it('should handle empty cash flows', () => {
      expect(calculateNPV([], 0.10)).toBe(0);
    });
  });

  describe('calculatePaybackPeriod', () => {
    it('should calculate payback in an exact month', () => {
      const cashFlows = [-100, 50, 50];
      const payback = calculatePaybackPeriod(cashFlows, 0);
      expect(payback).toBe(2.0);
    });

    it('should calculate payback with interpolation', () => {
      const cashFlows = [-100, 60, 80];
      const payback = calculatePaybackPeriod(cashFlows, 0);
      expect(payback).toBe(1.5);
    });

    it('should return null when it never pays back', () => {
      const cashFlows = [-100, 10, 20];
      const payback = calculatePaybackPeriod(cashFlows, 0);
      expect(payback).toBeNull();
    });
  });

  describe('calculateIRR', () => {
    it('should calculate IRR for standard cash flows (Newton-Raphson)', () => {
      const cashFlows = [-100, 60, 60];
      const irr = calculateIRR(cashFlows);
      expect(irr).not.toBeNull();
      const rMonthly = Math.pow(1 + irr!, 1 / 12) - 1;
      const npv = cashFlows[0] + cashFlows[1] / (1 + rMonthly) + cashFlows[2] / Math.pow(1 + rMonthly, 2);
      expect(npv).toBeCloseTo(0, 1);
    });

    it('should calculate IRR using Bisection fallback', () => {
      // Newton-Raphson starts at r = 0.01. fDeriv at r = 0.01 is 0 for these cash flows, triggering fallback.
      const cashFlows = [-100, -198.019801980198, 100];
      const irr = calculateIRR(cashFlows);
      expect(irr).not.toBeNull();
    });

    it('should return null when same sign', () => {
      expect(calculateIRR([100, 100, 100])).toBeNull();
      expect(calculateIRR([-100, -100])).toBeNull();
    });

    it('should return null when IRR fails to converge and has no root in range', () => {
      const cashFlows = [-100, 0.0001, 0.0001];
      const irr = calculateIRR(cashFlows);
      expect(irr).toBeNull();
    });
  });

  describe('calculateTCO', () => {
    it('should sum total costs correctly', () => {
      const timeline = [
        { totalCosts: 10 } as any,
        { totalCosts: 15 } as any,
        { totalCosts: 25.5 } as any
      ];
      expect(calculateTCO(timeline)).toBe(50.5);
    });
  });

  describe('buildCohortModel', () => {
    const config: CohortConfig = {
      id: 'c1',
      name: 'Test Cohort',
      current_users: 1000,
      monthly_acquisition: 100,
      acquisition_growth_rate: 0.05,
      monthly_churn_rate: 0.02,
      retention_floor: 0.20,
      monthly_expansion_rate: 0.01,
      ai_adoption_rate: 0.50,
      base_arpu: 100
    };

    it('should project users and MRR with churn and expansion', () => {
      const result = buildCohortModel(config, 12);
      expect(result.timeline.length).toBe(12);
      expect(result.totalRevenue).toBeGreaterThan(0);
      expect(result.endingCustomers).toBeGreaterThan(0);
      expect(result.endingMrr).toBeGreaterThan(0);
    });

    it('should respect retention floor', () => {
      const highChurnConfig = { ...config, monthly_churn_rate: 0.99, retention_floor: 0.10 };
      const result = buildCohortModel(highChurnConfig, 12);
      const lastMonth = result.timeline[11];
      expect(lastMonth.activeCustomers).toBeGreaterThan(0);
    });
  });

  describe('calculateScenario', () => {
    const provider: Provider = {
      id: 'p1',
      name: 'OpenAI',
      model_name: 'gpt-4',
      input_price: 5.0,
      output_price: 15.0,
      is_predefined: true,
      currency: 'USD',
      input_tokens_per_credit: 1000000,
      output_tokens_per_credit: 333333,
      updated_at: ''
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
      base_arpu: 100
    };

    const serviceWithProvider: Service & { rollout_month: number } = {
      id: 's1',
      name: 'Summarization',
      status: 'planned',
      provider_id: 'p1',
      avg_input_tokens: 2000,
      avg_output_tokens: 1000,
      avg_requests_per_user_month: 20,
      fixed_cost_per_month: 500,
      rollout_month: 2
    };

    const serviceWithoutProviderId: Service & { rollout_month: number } = {
      id: 's2',
      name: 'Local Model',
      status: 'planned',
      provider_id: null,
      avg_input_tokens: 0,
      avg_output_tokens: 0,
      avg_requests_per_user_month: 0,
      fixed_cost_per_month: 100,
      rollout_month: 0
    };

    const serviceWithUnknownProvider: Service & { rollout_month: number } = {
      id: 's3',
      name: 'Future Model',
      status: 'planned',
      provider_id: 'unknown_provider_id',
      avg_input_tokens: 1000,
      avg_output_tokens: 1000,
      avg_requests_per_user_month: 10,
      fixed_cost_per_month: 200,
      rollout_month: 0
    };

    const costCapex: CostItem = {
      id: 'cost1',
      name: 'Setup Fee',
      category: 'capex',
      amount: 10000,
      frequency: 'one_time',
      currency: 'USD'
    };

    const costOpexMonthly: CostItem = {
      id: 'cost2',
      name: 'Support',
      category: 'opex',
      amount: 500,
      frequency: 'monthly',
      currency: 'USD'
    };

    const costOpexYearly: CostItem = {
      id: 'cost3',
      name: 'License Renewal',
      category: 'opex',
      amount: 2000,
      frequency: 'yearly',
      currency: 'USD'
    };

    const scenario: Scenario = {
      id: 'sc1',
      name: 'Test Scenario',
      projection_months: 12,
      discount_rate: 0.10,
      scope_type: 'cohorts',
      scope_cohorts: [cohort],
      services: [serviceWithProvider, serviceWithoutProviderId, serviceWithUnknownProvider],
      costs: [costCapex, costOpexMonthly, costOpexYearly]
    };

    it('should calculate scenario results successfully', () => {
      const results = calculateScenario(scenario, [provider]);
      expect(results.npvUpper).toBeDefined();
      expect(results.npvLower).toBeDefined();
      expect(results.tco).toBeDefined();
      expect(results.timeline.length).toBe(12);
      expect(results.timeline[0].capex).toBe(10000);
      expect(results.timeline[0].opex).toBe(2500); // monthly + yearly license
      expect(results.timeline[1].capex).toBe(0);
      expect(results.timeline[1].opex).toBe(500);
    });

    it('should throw error if scenario lacks cohort config', () => {
      const invalidScenario = { ...scenario, scope_cohorts: [] as any };
      expect(() => calculateScenario(invalidScenario, [provider])).toThrow();
    });
  });

  describe('AI Monetization', () => {
    // 1 credit = 1000 input tokens OR 500 output tokens for this provider.
    const creditProvider: Provider = {
      id: 'p1', name: 'OpenAI', model_name: 'gpt-4', input_price: 5, output_price: 15,
      is_predefined: true, currency: 'USD',
      input_tokens_per_credit: 1000, output_tokens_per_credit: 500, updated_at: ''
    };

    // 2000/1000 + 1000/500 = 4 credits/request × 10 requests = 40 credits/user/month.
    const creditService: Service & { rollout_month: number } = {
      id: 's1', name: 'Summarization', status: 'planned', provider_id: 'p1',
      avg_input_tokens: 2000, avg_output_tokens: 1000, avg_requests_per_user_month: 10,
      fixed_cost_per_month: 0, rollout_month: 0
    };

    describe('calculateCreditsPerUserMonth', () => {
      it('sums input and output credits across monthly requests', () => {
        expect(calculateCreditsPerUserMonth(creditService, creditProvider)).toBe(40);
      });
      it('returns 0 when no provider is supplied', () => {
        expect(calculateCreditsPerUserMonth(creditService, undefined)).toBe(0);
      });
    });

    describe('calculateMonetizationRevenue', () => {
      const providersMap = new Map([[creditProvider.id, creditProvider]]);
      const cs = DEFAULT_CREDIT_SETTINGS;
      const withMon = (m: MonetizationConfig): Service & { monetization?: MonetizationConfig } => ({ ...creditService, monetization: m });

      it('charges a flat add-on fee per AI user', () => {
        const r = calculateMonetizationRevenue(100, [withMon({ monetization_type: 'addon', addon_monthly_fee: 10 })], cs, providersMap);
        expect(r.addonRevenue).toBe(1000);
        expect(r.totalRevenue).toBe(1000);
      });

      it('charges usage by consumed credits times price (payg)', () => {
        const r = calculateMonetizationRevenue(100, [withMon({ monetization_type: 'usage', usage_variant: 'payg', price_per_credit: 0.5 })], cs, providersMap);
        // 40 credits/user × 100 users × $0.5 = 2000
        expect(r.usageRevenue).toBe(2000);
        expect(r.totalRevenue).toBe(2000);
      });

      it('charges usage in prepaid blocks of 100 credits', () => {
        const r = calculateMonetizationRevenue(100, [withMon({ monetization_type: 'usage', usage_variant: 'prepaid', price_per_credit: 0.5 })], cs, providersMap);
        // 40 credits rounded up to 100 credits block = 100 credits/user × 100 users × $0.5 = 5000
        expect(r.usageRevenue).toBe(5000);
        expect(r.totalRevenue).toBe(5000);
      });

      it('adds overcharge revenue for hybrid with pay-as-you-go overage', () => {
        const r = calculateMonetizationRevenue(100, [withMon({
          monetization_type: 'hybrid', hybrid_monthly_fee: 20, hybrid_included_credits: 40,
          hybrid_overcharge_policy: 'payg', price_per_credit: 0.5,
          overcharge_user_pct: 0.5, avg_overcharge_pct: 0.5, overcharge_markup: 2
        })], cs, providersMap);
        expect(r.hybridBaseRevenue).toBe(2000); // 20 × 100
        // overcharge: 50 users × (40 × 1.5 = 60 credits - 40 pool = 20 extra credits) × $0.5 × 2 = 1000
        expect(r.overchargeRevenue).toBe(1000);
        expect(r.totalRevenue).toBe(3000);
      });

      it('adds overcharge revenue for hybrid with credit_pack overage policy', () => {
        const r = calculateMonetizationRevenue(100, [withMon({
          monetization_type: 'hybrid', hybrid_monthly_fee: 20, hybrid_included_credits: 40,
          hybrid_overcharge_policy: 'credit_pack', price_per_credit: 0.5,
          overcharge_user_pct: 0.5, avg_overcharge_pct: 0.5, overcharge_markup: 2
        })], cs, providersMap);
        expect(r.hybridBaseRevenue).toBe(2000); // 20 × 100
        // overcharge: 50 users × (40 × 1.5 = 60 credits - 40 pool = 20 extra credits)
        // 20 extra credits rounded up to 100 credits pack = 100 extra credits/user × 50 users × $0.5 × 2 = 5000
        expect(r.overchargeRevenue).toBe(5000);
        expect(r.totalRevenue).toBe(7000);
      });

      it('does not add overcharge for a hard_stop hybrid', () => {
        const r = calculateMonetizationRevenue(100, [withMon({
          monetization_type: 'hybrid', hybrid_monthly_fee: 20, hybrid_overcharge_policy: 'hard_stop',
          price_per_credit: 0.5, overcharge_user_pct: 0.5, avg_overcharge_pct: 0.5, overcharge_markup: 2
        })], cs, providersMap);
        expect(r.overchargeRevenue).toBe(0);
        expect(r.totalRevenue).toBe(2000);
      });

      it('ignores services with no monetization', () => {
        const r = calculateMonetizationRevenue(100, [withMon({ monetization_type: 'none' })], cs, providersMap);
        expect(r.totalRevenue).toBe(0);
      });
    });

    describe('calculateScenario modeling_type and revenue_carrier (ADR 0001–0004)', () => {
      // Static cohort (no churn/acquisition) so months are easy to reason about.
      const cohort: CohortConfig = {
        id: 'c1', name: 'Cohort', current_users: 1000, monthly_acquisition: 0,
        acquisition_growth_rate: 0, monthly_churn_rate: 0, retention_floor: 1,
        monthly_expansion_rate: 0, ai_adoption_rate: 0.30, base_arpu: 100,
        arpu_uplift_percent: 0.10
      };

      const makeScenario = (
        modeling_type: Scenario['modeling_type'],
        revenue_carrier: Scenario['revenue_carrier'],
        revenue_bridge: Scenario['revenue_bridge'] = null,
        seats = 0
      ): Scenario => ({
        id: 'sc1', name: 'S', projection_months: 3, discount_rate: 0.10,
        scope_type: 'cohorts', modeling_type, revenue_carrier, revenue_bridge, scope_cohorts: [cohort],
        services: [{ ...creditService, monetization: { monetization_type: 'addon', addon_monthly_fee: 10 } }],
        plans: seats > 0 ? [{ id: 'p1', name: 'Pro', rollout_month: 0, base_price: 99, seats }] : [],
        costs: []
      });

      it('keeps monetization revenue at zero for incremental (cohort carrier) source', () => {
        const r = calculateScenario(makeScenario('incremental', 'cohort'), [creditProvider]);
        expect(r.timeline[0].monetizationRevenue).toBe(0);
        // Revenue is cohort ARPU uplift: 300 active users * 10% uplift of 100 base_arpu = 3000
        expect(r.timeline[0].revenue).toBeCloseTo(3000, 2);
      });

      it('uses only monetization revenue for appraisal with feature carrier', () => {
        const r = calculateScenario(makeScenario('appraisal', 'feature'), [creditProvider]);
        // Monetization is active. Cohort uplift (3000) is ignored.
        expect(r.timeline[0].monetizationRevenue).toBeGreaterThan(0);
        expect(r.timeline[0].revenue).toBeCloseTo(r.timeline[0].monetizationRevenue, 2);
      });

      it('uses plan seats + monetization for GTM modeling (plan carrier)', () => {
        const r = calculateScenario(makeScenario('gtm', 'plan', null, 100), [creditProvider]);
        // GTM resolves to plan carrier, so we have plan seats (100 * 99 = 9900) + monetization.
        expect(r.timeline[0].monetizationRevenue).toBeGreaterThan(0);
        expect(r.timeline[0].revenue).toBeCloseTo(9900 + r.timeline[0].monetizationRevenue, 2);
      });

      it('ignores plan seats for cohort carrier under upsell_on_cohort bridge', () => {
        const r = calculateScenario(makeScenario('appraisal', 'cohort', 'upsell_on_cohort', 100), [creditProvider]);
        // Revenue is only cohort uplift (3000). Seats (100) are informational only.
        expect(r.timeline[0].revenue).toBeCloseTo(3000, 2);
      });

      it('adds plan seats for cohort carrier under separate_market bridge', () => {
        const r = calculateScenario(makeScenario('appraisal', 'cohort', 'separate_market', 100), [creditProvider]);
        // Revenue is cohort uplift (3000) + plan seats (100 * 99 = 9900) = 12900
        expect(r.timeline[0].revenue).toBeCloseTo(12900, 2);
      });
    });

    describe('validateRevenueIntegrity (ADR 0001–0004)', () => {
      const cohort: CohortConfig = {
        id: 'c1', name: 'Cohort', current_users: 1000, monthly_acquisition: 0,
        acquisition_growth_rate: 0, monthly_churn_rate: 0, retention_floor: 1,
        monthly_expansion_rate: 0, ai_adoption_rate: 0.30, base_arpu: 100,
        arpu_uplift_percent: 0.10
      };

      it('blocks incremental scenarios with monetization', () => {
        const sc: Scenario = {
          id: 'sc1', name: 'S', projection_months: 3, discount_rate: 0.1, scope_type: 'cohorts',
          modeling_type: 'incremental', revenue_carrier: 'cohort', scope_cohorts: [cohort],
          services: [{ ...creditService, monetization: { monetization_type: 'addon', addon_monthly_fee: 10 } }],
          costs: []
        };
        const res = validateRevenueIntegrity(sc);
        expect(res.status).toBe('block');
        expect(res.message).toContain('Incremental scenarios cannot have monetization overrides');
      });

      it('blocks incremental scenarios with plan seats', () => {
        const sc: Scenario = {
          id: 'sc1', name: 'S', projection_months: 3, discount_rate: 0.1, scope_type: 'cohorts',
          modeling_type: 'incremental', revenue_carrier: 'cohort', scope_cohorts: [cohort],
          plans: [{ id: 'p1', name: 'Pro', rollout_month: 0, base_price: 99, seats: 10 }],
          costs: []
        };
        const res = validateRevenueIntegrity(sc);
        expect(res.status).toBe('block');
        expect(res.message).toContain('Incremental scenarios cannot use plan seats');
      });

      it('blocks cohort carrier with seats and no bridge', () => {
        const sc: Scenario = {
          id: 'sc1', name: 'S', projection_months: 3, discount_rate: 0.1, scope_type: 'cohorts',
          modeling_type: 'appraisal', revenue_carrier: 'cohort', revenue_bridge: null, scope_cohorts: [cohort],
          plans: [{ id: 'p1', name: 'Pro', rollout_month: 0, base_price: 99, seats: 10 }],
          costs: []
        };
        const res = validateRevenueIntegrity(sc);
        expect(res.status).toBe('block');
        expect(res.message).toContain('Choose \'Upsell on Cohort\' or \'Separate Market\'');
      });

      it('blocks cohort carrier with seats exceeding implied population * tolerance', () => {
        const sc: Scenario = {
          id: 'sc1', name: 'S', projection_months: 3, discount_rate: 0.1, scope_type: 'cohorts',
          modeling_type: 'appraisal', revenue_carrier: 'cohort', revenue_bridge: 'upsell_on_cohort', scope_cohorts: [cohort],
          plans: [{ id: 'p1', name: 'Pro', rollout_month: 0, base_price: 99, seats: 500 }], // 500 seats > 1000 * 0.3 * 1.2 = 360
          costs: []
        };
        const res = validateRevenueIntegrity(sc);
        expect(res.status).toBe('block');
        expect(res.message).toContain('exceed implied population');
      });

      it('warns cohort carrier with seats within tolerance', () => {
        const sc: Scenario = {
          id: 'sc1', name: 'S', projection_months: 3, discount_rate: 0.1, scope_type: 'cohorts',
          modeling_type: 'appraisal', revenue_carrier: 'cohort', revenue_bridge: 'upsell_on_cohort', scope_cohorts: [cohort],
          plans: [{ id: 'p1', name: 'Pro', rollout_month: 0, base_price: 99, seats: 200 }], // 200 seats <= 360
          costs: []
        };
        const res = validateRevenueIntegrity(sc);
        expect(res.status).toBe('warn');
        expect(res.message).toContain('overlap with cohort population');
      });

      it('passes cohort carrier with separate_market bridge and high seats', () => {
        const sc: Scenario = {
          id: 'sc1', name: 'S', projection_months: 3, discount_rate: 0.1, scope_type: 'cohorts',
          modeling_type: 'appraisal', revenue_carrier: 'cohort', revenue_bridge: 'separate_market', scope_cohorts: [cohort],
          plans: [{ id: 'p1', name: 'Pro', rollout_month: 0, base_price: 99, seats: 500 }],
          costs: []
        };
        const res = validateRevenueIntegrity(sc);
        expect(res.status).toBe('ok');
        expect(res.message).toBeNull();
      });
    });

  });

  describe('runSensitivityAnalysis', () => {
    const provider: Provider = {
      id: 'p1',
      name: 'OpenAI',
      model_name: 'gpt-4',
      input_price: 5.0,
      output_price: 15.0,
      is_predefined: true,
      currency: 'USD',
      input_tokens_per_credit: 1000000,
      output_tokens_per_credit: 333333,
      updated_at: ''
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
      base_arpu: 100
    };

    const service: Service & { rollout_month: number } = {
      id: 's1',
      name: 'Summarization',
      status: 'planned',
      provider_id: 'p1',
      avg_input_tokens: 2000,
      avg_output_tokens: 1000,
      avg_requests_per_user_month: 20,
      fixed_cost_per_month: 500,
      rollout_month: 2
    };

    const costCapex: CostItem = {
      id: 'cost1',
      name: 'Setup Fee',
      category: 'capex',
      amount: 10000,
      frequency: 'one_time',
      currency: 'USD'
    };

    const scenario: Scenario = {
      id: 'sc1',
      name: 'Test Scenario',
      projection_months: 12,
      discount_rate: 0.10,
      scope_type: 'cohorts',
      scope_cohorts: [cohort],
      services: [service],
      costs: [costCapex]
    };

    it('should run sensitivity analysis and output sorted results', () => {
      const results = runSensitivityAnalysis(scenario, [provider], 0.10);
      expect(results.scenarioId).toBe(scenario.id);
      expect(results.results.length).toBeGreaterThan(0);
      const parameters = results.results.map(r => r.parameter);
      expect(parameters).toContain('Operating & Capital Expenses');
      expect(parameters).toContain('AI Token Costs');
      
      for (let i = 1; i < results.results.length; i++) {
        expect(results.results[i-1].impactRange).toBeGreaterThanOrEqual(results.results[i].impactRange);
      }
    });

    it('should handle empty cohort config', () => {
      const invalidScenario = { ...scenario, scope_cohorts: [] as any };
      const results = runSensitivityAnalysis(invalidScenario, [provider]);
      expect(results.results.length).toBe(0);
    });
  });

  describe('applyScopeOverrides', () => {
    const baseCohort: CohortConfig = {
      id: 'c1',
      name: 'Base',
      vertical_id: 'v1',
      current_users: 1000,
      monthly_acquisition: 100,
      acquisition_growth_rate: 0.01,
      monthly_churn_rate: 0.05,
      retention_floor: 0.60,
      monthly_expansion_rate: 0.02,
      ai_adoption_rate: 0.30,
      base_arpu: 100
    };

    it('should return cohorts unchanged when no overrides', () => {
      const result = applyScopeOverrides([baseCohort], []);
      expect(result[0]).toEqual(baseCohort);
    });

    it('should return empty array when cohorts empty', () => {
      expect(applyScopeOverrides([], [])).toEqual([]);
    });

    it('should apply global override', () => {
      const override: ScopeOverride = {
        id: 'o1', scenario_id: 's1', target_type: 'all_clients', target_id: null,
        monthly_churn_rate: 0.02, monthly_acquisition: null, acquisition_growth_rate: null,
        ai_adoption_rate: null, retention_floor: null, expansion_rate: null, arpu_override: null
      };
      const result = applyScopeOverrides([baseCohort], [override]);
      expect(result[0].monthly_churn_rate).toBe(0.02);
      expect(result[0].base_arpu).toBe(100); // unchanged
    });

    it('should apply vertical override after global', () => {
      const global: ScopeOverride = {
        id: 'o1', scenario_id: 's1', target_type: 'all_clients', target_id: null,
        monthly_churn_rate: 0.02, monthly_acquisition: null, acquisition_growth_rate: null,
        ai_adoption_rate: null, retention_floor: null, expansion_rate: null, arpu_override: null
      };
      const vertical: ScopeOverride = {
        id: 'o2', scenario_id: 's1', target_type: 'vertical', target_id: 'v1',
        monthly_churn_rate: 0.03, monthly_acquisition: null, acquisition_growth_rate: null,
        ai_adoption_rate: null, retention_floor: null, expansion_rate: null, arpu_override: null
      };
      const result = applyScopeOverrides([baseCohort], [global, vertical]);
      // vertical wins over global for this cohort
      expect(result[0].monthly_churn_rate).toBe(0.03);
    });

    it('should apply cohort override last, overriding global and vertical', () => {
      const global: ScopeOverride = {
        id: 'o1', scenario_id: 's1', target_type: 'all_clients', target_id: null,
        monthly_churn_rate: 0.02, monthly_acquisition: null, acquisition_growth_rate: null,
        ai_adoption_rate: null, retention_floor: null, expansion_rate: null, arpu_override: null
      };
      const cohortLevel: ScopeOverride = {
        id: 'o2', scenario_id: 's1', target_type: 'cohort', target_id: 'c1',
        monthly_churn_rate: 0.01, monthly_acquisition: 200, acquisition_growth_rate: null,
        ai_adoption_rate: 0.5, retention_floor: null, expansion_rate: 0.03, arpu_override: 150
      };
      const result = applyScopeOverrides([baseCohort], [global, cohortLevel]);
      expect(result[0].monthly_churn_rate).toBe(0.01);
      expect(result[0].monthly_acquisition).toBe(200);
      expect(result[0].ai_adoption_rate).toBe(0.5);
      expect(result[0].monthly_expansion_rate).toBe(0.03);
      expect(result[0].base_arpu).toBe(150);
    });

    it('should not mutate the original cohort objects', () => {
      const override: ScopeOverride = {
        id: 'o1', scenario_id: 's1', target_type: 'all_clients', target_id: null,
        monthly_churn_rate: 0.01, monthly_acquisition: null, acquisition_growth_rate: null,
        ai_adoption_rate: null, retention_floor: null, expansion_rate: null, arpu_override: null
      };
      applyScopeOverrides([baseCohort], [override]);
      expect(baseCohort.monthly_churn_rate).toBe(0.05); // original unchanged
    });
  });

  describe('Incremental ROI and splitCohortForAi tests', () => {
    const provider: Provider = {
      id: 'p1', name: 'OpenAI', model_name: 'gpt-4', input_price: 5.0, output_price: 15.0, is_predefined: true, currency: 'USD', input_tokens_per_credit: 1000000, output_tokens_per_credit: 333333, updated_at: ''
    };

    const cohort: CohortConfig = {
      id: 'c1',
      name: 'Test Cohort',
      current_users: 1000,
      monthly_acquisition: 100,
      acquisition_growth_rate: 0,
      monthly_churn_rate: 0.05,
      retention_floor: 0,
      monthly_expansion_rate: 0,
      ai_adoption_rate: 0.50,
      base_arpu: 100,
      arpu_uplift: 5.0,
      arpu_uplift_percent: 0.10,
      churn_reduction: 0.20,
      acquisition_uplift: 0.30
    };

    const scenario: Scenario = {
      id: 'sc1',
      name: 'Test Scenario',
      projection_months: 12,
      discount_rate: 0.10,
      scope_type: 'cohorts',
      scope_cohorts: [cohort],
      services: [],
      costs: []
    };

    it('splitCohortForAi: formula correctness', () => {
      const { adopter, nonAdopter } = splitCohortForAi(cohort);
      
      // Adopters:
      // current_users = 1000 * 0.5 = 500
      expect(adopter.current_users).toBe(500);
      // acquisition = 100 * (1 + 0.3) * 0.5 = 65
      expect(adopter.monthly_acquisition).toBeCloseTo(65, 4);
      // churnRate = 0.05 * (1 - 0.2) = 0.04
      expect(adopter.monthly_churn_rate).toBeCloseTo(0.04, 4);
      // arpu = 100 * (1 + 0.1) + 5 = 115
      expect(adopter.base_arpu).toBeCloseTo(115, 4);
      // ai_adoption_rate = 1.0
      expect(adopter.ai_adoption_rate).toBe(1.0);

      // Non-Adopters:
      // current_users = 1000 * (1 - 0.5) = 500
      expect(nonAdopter.current_users).toBe(500);
      // acquisition = 100 * (1 + 0.3) * (1 - 0.5) = 65
      expect(nonAdopter.monthly_acquisition).toBeCloseTo(65, 4);
      // churnRate = 0.05
      expect(nonAdopter.monthly_churn_rate).toBeCloseTo(0.05, 4);
      // arpu = 100
      expect(nonAdopter.base_arpu).toBeCloseTo(100, 4);
      // ai_adoption_rate = 0.0
      expect(nonAdopter.ai_adoption_rate).toBe(0.0);
    });

    it('Zero uplifts → ΔRevenue = 0 every month, netCashFlow = -costs, NPV < 0, IRR null, payback null', () => {
      const zeroUpliftCohort = {
        ...cohort,
        arpu_uplift: 0,
        arpu_uplift_percent: 0,
        churn_reduction: 0,
        acquisition_uplift: 0
      };
      const costCapex: CostItem = {
        id: 'cost1', name: 'Setup Fee', category: 'capex', amount: 1000, frequency: 'one_time', currency: 'USD'
      };
      const zeroUpliftScenario = {
        ...scenario,
        scope_cohorts: [zeroUpliftCohort],
        costs: [costCapex]
      };
      const results = calculateScenario(zeroUpliftScenario, [provider]);
      expect(results.npvUpper).toBeLessThan(0);
      expect(results.irr.annualNominal).toBeNull();
      expect(results.paybackUpper).toBeNull();
      results.timeline.forEach(t => {
        expect(t.revenue).toBeCloseTo(0, 2);
        expect(t.netCashFlow).toBeLessThanOrEqual(0);
      });
    });

    it('Positive uplifts + one-time CAPEX → IRR and payback defined', () => {
      const costCapex: CostItem = {
        id: 'cost1', name: 'Setup Fee', category: 'capex', amount: 120000, frequency: 'one_time', currency: 'USD'
      };
      const testScenario = {
        ...scenario,
        costs: [costCapex]
      };
      const results = calculateScenario(testScenario, [provider]);
      expect(results.npvUpper).toBeGreaterThan(0);
      expect(results.irr.annualNominal).not.toBeNull();
      expect(results.paybackUpper).not.toBeNull();
      expect(results.paybackUpper).toBeGreaterThan(0);
    });

    it('No CAPEX + immediate positive delta → payback 0, IRR null', () => {
      const testScenario = {
        ...scenario,
        costs: []
      };
      const results = calculateScenario(testScenario, [provider]);
      expect(results.npvUpper).toBeGreaterThan(0);
      expect(results.irr.annualNominal).toBeNull();
      expect(results.paybackUpper).toBe(0);
    });

    it('Churn reduction ↑ ⇒ NPV ↑; retention floor binding ⇒ churn reduction delta → 0', () => {
      const baseRes = calculateScenario(scenario, [provider]);
      
      const higherChurnReductionCohort = { ...cohort, churn_reduction: 0.90 };
      const testScenarioHigher = { ...scenario, scope_cohorts: [higherChurnReductionCohort] };
      const higherRes = calculateScenario(testScenarioHigher, [provider]);
      expect(higherRes.npvUpper).toBeGreaterThan(baseRes.npvUpper);

      // floor binding: if retention floor is 100% (floor=1.0) and current users = 1000, no one churns regardless of rate.
      const floorCohort = { ...cohort, retention_floor: 1.0, current_users: 1000, monthly_acquisition: 0 };
      const lowUpliftCohort = { ...floorCohort, churn_reduction: 0.1 };
      const highUpliftCohort = { ...floorCohort, churn_reduction: 0.9 };

      const lowRes = calculateScenario({ ...scenario, scope_cohorts: [lowUpliftCohort] }, [provider]);
      const highRes = calculateScenario({ ...scenario, scope_cohorts: [highUpliftCohort] }, [provider]);
      expect(lowRes.npvUpper).toBeCloseTo(highRes.npvUpper, 2);
    });

    it('Sensitivity: result set contains uplift dimensions and impact ordering is sane', () => {
      const results = runSensitivityAnalysis(scenario, [provider]);
      expect(results.results.length).toBeGreaterThan(0);
      const params = results.results.map(r => r.parameter);
      expect(params).toContain('AI Adoption Rate');
      expect(params).toContain('Discount Rate');
      expect(params).toContain('Churn Reduction Uplift');
      expect(params).toContain('Acquisition Uplift');
      expect(params).toContain('ARPU Uplift');

      for (let i = 1; i < results.results.length; i++) {
        expect(results.results[i-1].impactRange).toBeGreaterThanOrEqual(results.results[i].impactRange);
      }
    });

    describe('Methodology Realism Overhaul Tests', () => {
      it('should scale incremental margins with gross_margin', () => {
        const cohort100 = { ...cohort, gross_margin: 1.0 };
        const cohort50 = { ...cohort, gross_margin: 0.5 };

        const scenario100 = { ...scenario, scope_cohorts: [cohort100] };
        const scenario50 = { ...scenario, scope_cohorts: [cohort50] };

        const res100 = calculateScenario(scenario100, [provider]);
        const res50 = calculateScenario(scenario50, [provider]);

        // With no costs, NPV and ROI should be scaled exactly by the gross margin
        expect(res50.npvUpper).toBeCloseTo(res100.npvUpper * 0.5, 1);
        expect(res50.npvLower).toBeCloseTo(res100.npvLower * 0.5, 1);
        expect(res50.piUpper).toBe(0);
      });

      it('should apply time-varying linear adoption ramps', () => {
        const rampCohort = {
          ...cohort,
          ai_adoption_rate: 0.60,
          adoption_ramp_months: 6
        };
        const rampScenario = { ...scenario, scope_cohorts: [rampCohort] };
        const results = calculateScenario(rampScenario, [provider]);

        const m0 = results.timeline[0];
        const m2 = results.timeline[2];

        // Month 0 ramp factor: (0+1)/6 = 1/6. Effective adoption = 1/6 * 0.60 = 0.10
        // M0 aiUsers = 0.10 * 1000 = 100
        expect(m0.aiUsers).toBeCloseTo(100, 1);

        // Month 2 ramp factor: (2+1)/6 = 3/6 = 0.5. Effective adoption = 0.5 * 0.60 = 0.30
        // Adopters base is 1000 * 0.5 = 500. With 30% effective adoption:
        // blending is: fullAdoptModel has adoption=1.0. baselineModel has adoption=0.0.
        // fullAdoptModel timeline[2] activeCustomers is ~1176.4
        // M2 aiUsers = a(2) * fullAdoptModel.timeline[2].activeCustomers = 0.30 * 1176.4 = ~352.92
        expect(m2.aiUsers).toBeCloseTo(352.9, 0);
      });

      it('should scale CAPEX with capex_contingency_pct', () => {
        const costCapex: CostItem = {
          id: 'cost1', name: 'Setup Fee', category: 'capex', amount: 10000, frequency: 'one_time', currency: 'USD'
        };
        const scenarioWithContingency = {
          ...scenario,
          costs: [costCapex],
          capex_contingency_pct: 0.25
        };

        const results = calculateScenario(scenarioWithContingency, [provider]);
        expect(results.timeline[0].capex).toBe(12500);
      });

      it('should guard IRR with appropriate status checks', () => {
        // 1. unstable_short_payback: payback < 12 months (e.g. payback = ~2 months)
        const costCapexShort: CostItem = {
          id: 'cost1', name: 'Setup Fee', category: 'capex', amount: 80000, frequency: 'one_time', currency: 'USD'
        };
        const resShortPayback = calculateScenario({
          ...scenario,
          costs: [costCapexShort]
        }, [provider]);
        expect(resShortPayback.paybackUpper).toBeLessThan(12);
        expect(resShortPayback.irr.status).toBe('unstable_short_payback');
        expect(resShortPayback.irr.displayable).toBe(false);
        expect(resShortPayback.irr.annualNominal).not.toBeNull();

        // 2. undefined_no_sign_change: no CAPEX, all net cash flows are positive or all negative
        const resNoSignChange = calculateScenario({
          ...scenario,
          costs: []
        }, [provider]);
        expect(resNoSignChange.irr.status).toBe('undefined_no_sign_change');
        expect(resNoSignChange.irr.displayable).toBe(false);
        expect(resNoSignChange.irr.annualNominal).toBeNull();

        // 3. ambiguous_multiple_roots: multiple sign changes in cumulative cash flows
        const resAmbiguous = calculateIRRGuarded([-100, 300, -250, 400], 12);
        expect(resAmbiguous.status).toBe('ambiguous_multiple_roots');
        expect(resAmbiguous.annualNominal).toBeNull();

        // 4. non_converged: monthly IRR rate fails to converge or monthly IRR > 1.0
        const resNonConverged = calculateIRRGuarded([-100, 1000], 12);
        expect(resNonConverged.status).toBe('non_converged');
        expect(resNonConverged.annualNominal).toBeNull();
      });

      it('should calculate Profitability Index (PI) correctly', () => {
        const costCapex: CostItem = {
          id: 'cost1', name: 'Setup Fee', category: 'capex', amount: 10000, frequency: 'one_time', currency: 'USD'
        };
        const testScenario = {
          ...scenario,
          costs: [costCapex]
        };

        const results = calculateScenario(testScenario, [provider]);
        const rMonthly = Math.pow(1 + scenario.discount_rate, 1 / 12) - 1;
        const computedPvCosts = results.timeline.reduce((acc, curr) => acc + curr.totalCosts / Math.pow(1 + rMonthly, curr.month), 0);

        expect(results.piUpper).toBeCloseTo(results.npvUpper / computedPvCosts + 1, 4);
        expect(results.piLower).toBeCloseTo(results.npvLower / computedPvCosts + 1, 4);
      });
    });
  });

  describe('Platform AI Agent archetype calculations', () => {
    const provider: Provider = {
      id: 'p_agent',
      name: 'OpenAI',
      model_name: 'gpt-4o',
      input_price: 5.0,
      output_price: 15.0,
      is_predefined: true,
      currency: 'USD',
      input_tokens_per_credit: 1000000,
      output_tokens_per_credit: 333333,
      updated_at: ''
    };

    const cohort: CohortConfig = {
      id: 'c1',
      name: 'Test Cohort',
      current_users: 1000,
      monthly_acquisition: 0,
      acquisition_growth_rate: 0,
      monthly_churn_rate: 0.05,
      retention_floor: 0,
      monthly_expansion_rate: 0,
      ai_adoption_rate: 1.0,
      base_arpu: 100
    };

    const agentService: Service & { rollout_month: number } = {
      id: 's_agent',
      name: 'Support Agent',
      status: 'planned',
      service_type: 'agent',
      interaction_driver_type: 'flat',
      monthly_volume: 12000,
      volume_growth_rate: 0.0,
      interactions_per_customer_month: 0,
      fully_loaded_cost_per_fte_month: 5000,
      productive_hours_per_fte_month: 100,
      average_handle_time_seconds: 300,
      baseline_fte: 0,
      staffing_realization_lag_months: 2,
      containment_rate: 0.8,
      containment_start_rate: 0.2,
      containment_ramp_months: 6,
      escalation_rate: 0.1,
      failed_deflection_penalty: 10,
      churn_rate_uplift: 0.01,
      rollout_month: 0,
      provider_id: 'p_agent',
      avg_input_tokens: 1000,
      avg_output_tokens: 1000,
      avg_requests_per_user_month: 0
    };

    const scenario: Scenario = {
      id: 'scen_agent',
      name: 'Agent Scenario',
      projection_months: 12,
      discount_rate: 0.10,
      scope_type: 'cohorts',
      scope_cohorts: [cohort],
      services: [agentService],
      costs: []
    };

    it('should correctly calculate flat interaction volume, containment ramp, labor offsets, failed penalty, and lag', () => {
      const results = calculateScenario(scenario, [provider]);
      expect(results.timeline.length).toBe(12);

      const m0 = results.timeline[0];
      expect(m0.totalInteractions).toBeCloseTo(12000, 1);
      expect(m0.deflectedInteractions).toBeCloseTo(3600, 1);
      // staffing_realization_lag_months = 2: no headcount is cut yet, so the
      // freed 3.0 FTE (3600 × 300s / 3600 / 100h × $5000) is all capacity, no cash.
      expect(m0.laborSavingsCash).toBeCloseTo(0, 1);
      expect(m0.laborSavingsCapacity).toBeCloseTo(15000, 1);
      expect(m0.failedDeflectionCost).toBeCloseTo(12000, 1);

      // Cash recognition is deferred by the 2-month lag: month 0's realizable
      // FTE (floor(3.0) = 3 → $15000) only turns into cash at month 2.
      const m2 = results.timeline[2];
      expect(m2.laborSavingsCash).toBeCloseTo(15000, 1);

      const m5 = results.timeline[5];
      expect(m5.deflectedInteractions).toBeCloseTo(9600, 1);
      expect(m5.laborSavingsCash).toBeCloseTo(30000, 1);
      expect(m5.laborSavingsCapacity).toBeCloseTo(10000, 1);
    });

    it('should respect FTE caps when baseline_fte is set', () => {
      const cappedService = {
        ...agentService,
        baseline_fte: 4.5,
        staffing_realization_lag_months: 0
      };
      const cappedScenario = {
        ...scenario,
        services: [cappedService]
      };
      
      const results = calculateScenario(cappedScenario, [provider]);
      const m5 = results.timeline[5];
      expect(m5.laborSavingsCash).toBeCloseTo(20000, 1);
      expect(m5.laborSavingsCapacity).toBeCloseTo(2500, 1);
    });

    it('should calculate per-customer volume driver correctly', () => {
      const perCustomerService = {
        ...agentService,
        interaction_driver_type: 'per_customer' as const,
        interactions_per_customer_month: 10,
        staffing_realization_lag_months: 0,
        containment_ramp_months: 0
      };
      const perCustomerScenario = {
        ...scenario,
        services: [perCustomerService]
      };
      
      const results = calculateScenario(perCustomerScenario, [provider]);
      const m0 = results.timeline[0];
      expect(m0.totalInteractions).toBeCloseTo(10000, 1);
      expect(m0.laborSavingsCash).toBeCloseTo(30000, 1);
      expect(m0.laborSavingsCapacity).toBeCloseTo(3333.33, 1);
    });

    it('should apply additive churn rate uplift to cohort projections', () => {
      const results = calculateScenario(scenario, [provider]);
      expect(results.timeline[1].customers).toBeCloseTo(940, 1);
    });
  });
});
