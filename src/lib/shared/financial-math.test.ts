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
  resolveCarrier,
  resolveRevenueModel,
  deriveModelingType,
  validateScenarioConfig,
  buildPenetrationCurve,
  calculateEVC,
  runCaptureCurve,
  calculateAnalyticalLaborSavings,
  buildPricingCorridor,
  buildPocketMarginWaterfall,
  streamsDisjoint,
  detectDriverProfile,
  DEFAULT_COPILOT_MARGIN_THRESHOLD,
  DEFAULT_AGENT_MARGIN_THRESHOLD,
  HYBRID_OVERAGE_MARKUP
} from './financial-math.js';
import type { Provider, Scenario, CohortConfig, CostItem, Service, ScopeOverride, MonetizationConfig, Settings, Plan, EvcResult } from './types.js';

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
        expect(res.message).toContain('Incremental scenarios cannot have copilot monetization overrides');
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

  describe('validateScenarioConfig (dead-end diagnostics)', () => {
    const baseSettings = {
      company_name: 'Acme', currency: 'USD', default_discount_rate: 0.1, setup_completed: true,
      projection_horizon_months: 36, exchange_rates: { USD: 1, EUR: 1.1, PLN: 4, GBP: 0.8 },
      exchange_rates_as_of: '2026-01-01', default_price_per_credit: 0.02,
      default_input_tokens_per_credit: 1000000, default_output_tokens_per_credit: 333333,
      default_overcharge_markup: 1.5, default_overcharge_user_pct: 0.2, default_avg_overcharge_pct: 0.5
    } as Settings;

    const healthyCohort: CohortConfig = {
      id: 'c1', name: 'Core', current_users: 1000, monthly_acquisition: 50,
      acquisition_growth_rate: 0, monthly_churn_rate: 0.05, retention_floor: 0.6,
      monthly_expansion_rate: 0.02, ai_adoption_rate: 0.30, base_arpu: 100,
      arpu_uplift_percent: 0.10, churn_reduction: 0.2, adoption_ramp_months: 6
    };

    const makeScenario = (overrides: Partial<Scenario> = {}): Scenario => ({
      id: 'sc1', name: 'S', projection_months: 36, discount_rate: 0.10, scope_type: 'cohorts',
      modeling_type: 'appraisal', revenue_carrier: 'cohort', revenue_bridge: null,
      scope_cohorts: [healthyCohort], services: [], plans: [], costs: [], ...overrides
    });

    const codes = (s: Scenario, result?: any) =>
      validateScenarioConfig(s, baseSettings, [], undefined, result).map(d => d.code);

    it('returns no diagnostics for a healthy scenario', () => {
      expect(codes(makeScenario())).toEqual([]);
    });

    // #1 dead ARPU uplift
    it('flags a percentage ARPU uplift on a $0 base', () => {
      const s = makeScenario({ scope_cohorts: [{ ...healthyCohort, base_arpu: 0, arpu_uplift_percent: 0.3 }] });
      expect(codes(s)).toContain('dead_arpu_uplift');
    });
    it('does not flag a percentage uplift when base ARPU is non-zero', () => {
      expect(codes(makeScenario())).not.toContain('dead_arpu_uplift');
    });

    // #2 plan carrier with no seats
    it('flags a plan carrier with zero total seats', () => {
      const s = makeScenario({ modeling_type: 'gtm', revenue_carrier: 'plan', plans: [{ id: 'p1', name: 'Pro', rollout_month: 0, base_price: 99, seats: 0 }] });
      expect(codes(s)).toContain('carrier_no_revenue');
    });
    it('does not flag a plan carrier that has seats', () => {
      const s = makeScenario({ modeling_type: 'gtm', revenue_carrier: 'plan', scope_cohorts: [{ ...healthyCohort, base_arpu: 0 }], plans: [{ id: 'p1', name: 'Pro', rollout_month: 0, base_price: 99, seats: 100 }] });
      expect(codes(s)).not.toContain('carrier_no_revenue');
    });

    // #3 cohort revenue dropped under a non-cohort carrier
    it('flags cohort ARPU dropped when the carrier is a plan', () => {
      const s = makeScenario({ modeling_type: 'gtm', revenue_carrier: 'plan', plans: [{ id: 'p1', name: 'Pro', rollout_month: 0, base_price: 99, seats: 100 }] });
      expect(codes(s)).toContain('cohort_revenue_dropped');
    });
    it('does not flag cohort revenue under a cohort carrier', () => {
      expect(codes(makeScenario())).not.toContain('cohort_revenue_dropped');
    });

    // #4 zero benefit despite uplifts (result-dependent)
    it('flags configured uplifts that produce zero modeled benefit', () => {
      const zeroResult = { timeline: [{ revenue: 0 }, { revenue: 0 }, { revenue: 0 }] };
      expect(codes(makeScenario(), zeroResult)).toContain('zero_benefit_despite_uplifts');
    });
    it('does not flag when modeled benefit is non-zero', () => {
      const goodResult = { timeline: [{ revenue: 0 }, { revenue: 1500 }] };
      expect(codes(makeScenario(), goodResult)).not.toContain('zero_benefit_despite_uplifts');
    });

    // #5 adoption ramp >= horizon
    it('flags an adoption ramp that meets or exceeds the horizon', () => {
      const s = makeScenario({ projection_months: 36, scope_cohorts: [{ ...healthyCohort, adoption_ramp_months: 48 }] });
      expect(codes(s)).toContain('ramp_exceeds_horizon');
    });
    it('does not flag a ramp shorter than the horizon', () => {
      expect(codes(makeScenario())).not.toContain('ramp_exceeds_horizon');
    });

    // #6 churn reduction soft ceiling
    it('flags churn reduction above the soft ceiling', () => {
      const s = makeScenario({ scope_cohorts: [{ ...healthyCohort, churn_reduction: 0.9 }] });
      expect(codes(s)).toContain('churn_reduction_high');
    });
    it('flags churn reduction over 100% with an explicit message', () => {
      const s = makeScenario({ scope_cohorts: [{ ...healthyCohort, churn_reduction: 1.5 }] });
      const diags = validateScenarioConfig(s, baseSettings, [], undefined);
      const d = diags.find(x => x.code === 'churn_reduction_high');
      expect(d?.message).toContain('exceeds 100%');
    });

    // #7 zero discount rate
    it('flags a 0% discount rate', () => {
      expect(codes(makeScenario({ discount_rate: 0 }))).toContain('discount_rate_zero');
    });
    it('does not flag a non-zero discount rate', () => {
      expect(codes(makeScenario())).not.toContain('discount_rate_zero');
    });

    // #9 negative unit margin
    it('flags negative unit economics when price/credit is below token cost', () => {
      const provider: Provider = {
        id: 'pv1', name: 'OpenAI', model_name: 'gpt', input_price: 10, output_price: 30,
        is_predefined: true, currency: 'USD', input_tokens_per_credit: 1000000,
        output_tokens_per_credit: 333333, updated_at: ''
      };
      const service: any = {
        id: 'svc1', name: 'Copilot', status: 'planned', provider_id: 'pv1',
        avg_input_tokens: 2000, avg_output_tokens: 1000, avg_requests_per_user_month: 20,
        fixed_cost_per_month: 0, rollout_month: 0,
        monetization: { monetization_type: 'usage', price_per_credit: 0.02 } as MonetizationConfig
      };
      const s = makeScenario({ services: [service] });
      const diags = validateScenarioConfig(s, baseSettings, [provider], undefined);
      expect(diags.map(d => d.code)).toContain('negative_unit_margin');
    });
    it('does not flag healthy unit economics', () => {
      const provider: Provider = {
        id: 'pv1', name: 'Cheap', model_name: 'mini', input_price: 0.1, output_price: 0.3,
        is_predefined: true, currency: 'USD', input_tokens_per_credit: 1000000,
        output_tokens_per_credit: 333333, updated_at: ''
      };
      const service: any = {
        id: 'svc1', name: 'Copilot', status: 'planned', provider_id: 'pv1',
        avg_input_tokens: 2000, avg_output_tokens: 1000, avg_requests_per_user_month: 20,
        fixed_cost_per_month: 0, rollout_month: 0,
        monetization: { monetization_type: 'usage', price_per_credit: 50 } as MonetizationConfig
      };
      const s = makeScenario({ services: [service] });
      expect(validateScenarioConfig(s, baseSettings, [provider], undefined).map(d => d.code)).not.toContain('negative_unit_margin');
    });

    // #10 mixed currency
    it('notes mixed currencies in one scenario', () => {
      const s = makeScenario({ costs: [{ id: 'k1', name: 'CAPEX', category: 'capex', amount: 1000, frequency: 'one_time', currency: 'EUR' }] });
      const diags = validateScenarioConfig(s, baseSettings, [], undefined);
      const d = diags.find(x => x.code === 'mixed_currency');
      expect(d?.severity).toBe('info');
    });
    it('does not note currency when everything matches the base', () => {
      const s = makeScenario({ costs: [{ id: 'k1', name: 'CAPEX', category: 'capex', amount: 1000, frequency: 'one_time', currency: 'USD' }] });
      expect(codes(s)).not.toContain('mixed_currency');
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

      it('should calculate npvLower without applying churn_reduction', () => {
        const cohortNoChurnRed = {
          ...cohort,
          churn_reduction: 0.0,
          arpu_uplift: 20
        };
        const cohortWithChurnRed = {
          ...cohort,
          churn_reduction: 0.50, // 50% churn reduction
          arpu_uplift: 20
        };

        const scenarioNoChurnRed = { ...scenario, scope_cohorts: [cohortNoChurnRed] };
        const scenarioWithChurnRed = { ...scenario, scope_cohorts: [cohortWithChurnRed] };

        const resNo = calculateScenario(scenarioNoChurnRed, [provider]);
        const resWith = calculateScenario(scenarioWithChurnRed, [provider]);

        // npvUpper should be higher when churn is reduced (more users retained)
        expect(resWith.npvUpper).toBeGreaterThan(resNo.npvUpper);

        // npvLower must be EXACTLY identical because churn_reduction is ignored in Lower Bound
        expect(resWith.npvLower).toBeCloseTo(resNo.npvLower, 2);
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

describe('ADR 0009 — per-archetype revenue streams (Foundation)', () => {
  const provider: Provider = {
    id: 'p1', name: 'Prov', model_name: 'm', input_price: 0, output_price: 0,
    is_predefined: true, currency: 'USD', input_tokens_per_credit: 1000000, output_tokens_per_credit: 333333, updated_at: ''
  };

  // base_arpu = 0 isolates the agent/copilot stream contributions from the cohort/seat economy.
  const cohort: CohortConfig = {
    id: 'c1', name: 'Cohort', current_users: 1000, monthly_acquisition: 0,
    acquisition_growth_rate: 0, monthly_churn_rate: 0, retention_floor: 0,
    monthly_expansion_rate: 0, ai_adoption_rate: 1.0, base_arpu: 0
  };

  function makeAgentService(overrides: Partial<Service> = {}): Service & { rollout_month: number } {
    return {
      id: 's_agent', name: 'Support Agent', status: 'planned', service_type: 'agent',
      interaction_driver_type: 'flat', monthly_volume: 10000, volume_growth_rate: 0,
      interactions_per_customer_month: 0, fully_loaded_cost_per_fte_month: 5000,
      productive_hours_per_fte_month: 100, average_handle_time_seconds: 360,
      baseline_fte: 0, staffing_realization_lag_months: 0,
      containment_rate: 1.0, containment_start_rate: 1.0, containment_ramp_months: 0,
      escalation_rate: 0, failed_deflection_penalty: 0, churn_rate_uplift: 0,
      rollout_month: 0, provider_id: 'p1',
      avg_input_tokens: 0, avg_output_tokens: 0, avg_requests_per_user_month: 0,
      ...overrides
    };
  }

  const monetizedAgentService = makeAgentService({
    id: 's_agent_m',
    monetization: { monetization_type: 'outcome', outcome_basis: 'deflected', price_per_outcome: 8 }
  });

  function makeScenario(services: Array<Service & { rollout_month: number }>, overrides: Partial<Scenario> = {}): Scenario {
    return {
      id: 'scen1', name: 'S', projection_months: 3, discount_rate: 0.10, scope_type: 'cohorts',
      modeling_type: 'incremental', revenue_carrier: 'cohort',
      scope_cohorts: [cohort], services, costs: [],
      ...overrides
    };
  }

  describe('streamsDisjoint', () => {
    it('is disjoint with no monetized services', () => {
      expect(streamsDisjoint(makeScenario([makeAgentService()]))).toBe(true);
    });

    it('is disjoint when every monetized service is an agent', () => {
      expect(streamsDisjoint(makeScenario([monetizedAgentService]))).toBe(true);
    });

    it('is NOT disjoint when a monetized service is a copilot (shares the seat economy)', () => {
      const copilotService = { ...monetizedAgentService, id: 's_copilot', service_type: 'copilot' as const };
      expect(streamsDisjoint(makeScenario([copilotService]))).toBe(false);
    });

    it('is NOT disjoint when monetized services mix agent and copilot', () => {
      const copilotService = { ...monetizedAgentService, id: 's_copilot', service_type: 'copilot' as const };
      expect(streamsDisjoint(makeScenario([monetizedAgentService, copilotService]))).toBe(false);
    });
  });

  describe('validateRevenueIntegrity — disjointness doctrine (Decision 1)', () => {
    it('warns (not blocks) an incremental scenario with a monetized agent service', () => {
      const res = validateRevenueIntegrity(makeScenario([monetizedAgentService]));
      expect(res.status).toBe('warn');
      expect(res.message).toContain('disjoint second stream');
    });

    it('still blocks an incremental scenario with a monetized copilot service', () => {
      const copilotService = { ...monetizedAgentService, id: 's_copilot', service_type: 'copilot' as const };
      const res = validateRevenueIntegrity(makeScenario([copilotService]));
      expect(res.status).toBe('block');
      expect(res.message).toContain('copilot monetization');
    });

    it('blocks when monetized services mix agent and copilot (not fully disjoint)', () => {
      const copilotService = { ...monetizedAgentService, id: 's_copilot', service_type: 'copilot' as const };
      const res = validateRevenueIntegrity(makeScenario([monetizedAgentService, copilotService]));
      expect(res.status).toBe('block');
    });

    it('stays ok for an incremental scenario with no monetization', () => {
      expect(validateRevenueIntegrity(makeScenario([makeAgentService()])).status).toBe('ok');
    });
  });

  describe('per-service value routing (Decision 4)', () => {
    it("unmonetized agent books labor savings as cash revenue (today's behavior)", () => {
      const results = calculateScenario(makeScenario([makeAgentService()]), [provider]);
      const m0 = results.timeline[0];
      expect(m0.laborSavingsCash).toBeCloseTo(50000, 1);
      expect(m0.laborSavingsCapacity).toBeCloseTo(0, 1);
      expect(m0.revenue).toBeCloseTo(50000, 1);
      expect(m0.agentRevenue).toBeCloseTo(50000, 1);
    });

    it('monetized-outcome agent books outcome revenue and excludes its labor savings from cash, regardless of carrier', () => {
      const results = calculateScenario(makeScenario([monetizedAgentService]), [provider]);
      const m0 = results.timeline[0];
      expect(m0.laborSavingsCash).toBeCloseTo(0, 1);
      expect(m0.laborSavingsCapacity).toBeCloseTo(50000, 1);
      expect(m0.outcomeRevenue).toBeCloseTo(80000, 1); // deflected(10000) * price(8)
      expect(m0.revenue).toBeCloseTo(80000, 1); // flows despite the 'cohort' carrier (ADR 0009 Decision 1)
      expect(m0.agentRevenue).toBeCloseTo(80000, 1);
    });

    it('copilot outcome revenue also flows regardless of carrier', () => {
      const copilotService: Service & { rollout_month: number } = {
        id: 's_copilot', name: 'Copilot', status: 'planned', service_type: 'copilot',
        rollout_month: 0, provider_id: 'p1', avg_input_tokens: 0, avg_output_tokens: 0,
        avg_requests_per_user_month: 5,
        monetization: { monetization_type: 'outcome', outcome_basis: 'interactions', price_per_outcome: 2 }
      };
      const results = calculateScenario(makeScenario([copilotService]), [provider]);
      const m0 = results.timeline[0];
      // 1000 users * 1.0 adoption * 5 requests/user * $2 = $10,000
      expect(m0.outcomeRevenue).toBeCloseTo(10000, 1);
      expect(m0.revenue).toBeCloseTo(10000, 1);
      expect(m0.copilotRevenue).toBeCloseTo(10000, 1);
    });
  });

  describe('detectDriverProfile', () => {
    const copilotOnly: Service & { rollout_month: number } = {
      id: 's1', name: 'C', status: 'planned', service_type: 'copilot', rollout_month: 0,
      avg_input_tokens: 0, avg_output_tokens: 0, avg_requests_per_user_month: 0
    };

    it('returns seat_only when there are no agent services', () => {
      expect(detectDriverProfile(makeScenario([copilotOnly]))).toBe('seat_only');
      expect(detectDriverProfile(makeScenario([]))).toBe('seat_only');
      expect(detectDriverProfile(makeScenario([], { services: undefined }))).toBe('seat_only');
    });

    it('returns interaction_only when every service is an agent', () => {
      expect(detectDriverProfile(makeScenario([makeAgentService()]))).toBe('interaction_only');
    });

    it('returns mixed when both archetypes are present', () => {
      expect(detectDriverProfile(makeScenario([makeAgentService(), copilotOnly]))).toBe('mixed');
    });

    it('treats a revenue-booking seat-plan as the copilot signal even with no literal copilot service (Phase A)', () => {
      const planScenario = makeScenario([makeAgentService()], {
        modeling_type: 'gtm',
        revenue_carrier: 'plan',
        plans: [{ id: 'pl1', name: 'Pro', rollout_month: 0, base_price: 50, seats: 100 }]
      });
      expect(detectDriverProfile(planScenario)).toBe('mixed');
    });

    it('does not treat a seat-plan as the copilot signal when its carrier never books the seat revenue', () => {
      // carrier stays 'cohort' with no separate_market bridge, so the plan's seats are dead weight.
      const planScenario = makeScenario([makeAgentService()], {
        plans: [{ id: 'pl1', name: 'Pro', rollout_month: 0, base_price: 50, seats: 100 }]
      });
      expect(detectDriverProfile(planScenario)).toBe('interaction_only');
    });
  });

  describe('calculateScenario — driverProfile on CalculationResult', () => {
    it('surfaces mixed when the scenario has both archetypes', () => {
      const copilotService: Service & { rollout_month: number } = {
        id: 's_copilot', name: 'Copilot', status: 'planned', service_type: 'copilot',
        rollout_month: 0, avg_input_tokens: 0, avg_output_tokens: 0, avg_requests_per_user_month: 0
      };
      const results = calculateScenario(makeScenario([makeAgentService(), copilotService]), [provider]);
      expect(results.driverProfile).toBe('mixed');
    });

    it('surfaces interaction_only / seat_only for single-archetype scenarios', () => {
      expect(calculateScenario(makeScenario([makeAgentService()]), [provider]).driverProfile).toBe('interaction_only');
      expect(calculateScenario(makeScenario([]), [provider]).driverProfile).toBe('seat_only');
    });
  });

  describe('Phase A — two-track hybrid billing (copilot seat-plan + agent per-resolution)', () => {
    // GTM/plan carrier: $50/seat * 100 seats = $5,000/mo copilot stream, alongside the
    // monetized agent's $80,000/mo outcome stream (deflected 10000 * $8).
    function makeTwoTrackScenario() {
      return makeScenario([monetizedAgentService], {
        modeling_type: 'gtm',
        revenue_carrier: 'plan',
        plans: [{ id: 'pl1', name: 'Pro', rollout_month: 0, base_price: 50, seats: 100 }]
      });
    }

    it('is not blocked by revenue integrity', () => {
      const res = validateRevenueIntegrity(makeTwoTrackScenario());
      expect(res.status).not.toBe('block');
    });

    it('sums both streams into the total, attributing seat-plan revenue to copilot and outcome revenue to agent', () => {
      const results = calculateScenario(makeTwoTrackScenario(), [provider]);
      const m0 = results.timeline[0];
      expect(m0.copilotRevenue).toBeCloseTo(5000, 1);
      expect(m0.agentRevenue).toBeCloseTo(80000, 1);
      expect(m0.revenue).toBeCloseTo(85000, 1);
      expect(results.driverProfile).toBe('mixed');
    });
  });

  describe('Phase B — unified credit pool (ADR 0010)', () => {
    const poolProvider: Provider = {
      id: 'p3', name: 'Prov3', model_name: 'm', input_price: 10, output_price: 0,
      is_predefined: true, currency: 'USD', input_tokens_per_credit: 1000000, output_tokens_per_credit: 333333, updated_at: ''
    };
    // agent: monthly_volume=10, fully contained -> deflected=10/mo, burn_rate=300 -> 3,000 credits.
    // token cost: 10 interactions * 10000 input tokens * $10/M = $1.00.
    const poolAgentSvc: Service & { rollout_month: number } = {
      id: 's_pa', name: 'Agent', status: 'planned', service_type: 'agent',
      interaction_driver_type: 'flat', monthly_volume: 10, volume_growth_rate: 0,
      containment_rate: 1.0, containment_start_rate: 1.0, containment_ramp_months: 0,
      escalation_rate: 0, failed_deflection_penalty: 0, fully_loaded_cost_per_fte_month: 0,
      productive_hours_per_fte_month: 100, average_handle_time_seconds: 0, baseline_fte: 0,
      staffing_realization_lag_months: 0, churn_rate_uplift: 0,
      rollout_month: 0, provider_id: 'p3', avg_input_tokens: 10000, avg_output_tokens: 0, avg_requests_per_user_month: 0,
      value_per_outcome: 50,
      monetization: { monetization_type: 'usage' }
    };
    // copilot: 1000 users * 1 req/user/mo = 1,000 requests, burn_rate=10 -> 10,000 credits.
    // token cost: 1000 requests * 1000 input tokens * $10/M = $10.00.
    const poolCopilotSvc: Service & { rollout_month: number } = {
      id: 's_pc', name: 'Copilot', status: 'planned', service_type: 'copilot',
      rollout_month: 0, provider_id: 'p3', avg_input_tokens: 1000, avg_output_tokens: 0,
      avg_requests_per_user_month: 1,
      value_per_outcome: 2,
      monetization: { monetization_type: 'usage' }
    };

    function makePoolScenario(services: Array<Service & { rollout_month: number }>, overrides: Partial<Scenario> = {}) {
      return makeScenario(services, {
        modeling_type: 'appraisal',
        revenue_carrier: 'pool',
        evc_capture_target_pct: 0.30,
        pool_tier: { id: 'tier1', name: 'Gold', monthly_fee: 2000, credit_pool_size: 10000 },
        pool_burn_rates: [
          { id: 'br1', tier_id: 'tier1', service_id: 's_pa', burn_rate: 300 },
          { id: 'br2', tier_id: 'tier1', service_id: 's_pc', burn_rate: 10 }
        ],
        ...overrides
      });
    }

    it('books the full tier fee plus usage-priced overage, and attributes by EVC weight', () => {
      const results = calculateScenario(makePoolScenario([poolAgentSvc, poolCopilotSvc]), [poolProvider]);
      const m0 = results.timeline[0];

      // consumed = 3,000 (agent) + 10,000 (copilot) = 13,000 > pool 10,000 -> overage 3,000.
      // creditValue = max(floor, capture*v): floor = $11/13000 ≈ 0.000846; value = 0.30*2500/13000 ≈ 0.05769.
      // overage revenue (usage, no markup) = 3000 * 0.05769 ≈ $173.08; total revenue ≈ $2173.08.
      expect(m0.revenue).toBeCloseTo(2173.08, 1);
      expect(m0.poolBreakage).toBeCloseTo(0, 2); // fully consumed, nothing left to break

      // EVC weight: agent = 10*50=500, copilot = 1000*2=2000 -> copilot 80%, agent 20%.
      expect(results.poolEconomics?.attribution.method).toBe('evc');
      expect(results.poolEconomics?.attribution.copilotShare).toBeCloseTo(0.8, 2);
      expect(results.poolEconomics?.attribution.agentShare).toBeCloseTo(0.2, 2);
      expect(m0.copilotRevenue).toBeCloseTo(2173.08 * 0.8, 1);
      expect(m0.agentRevenue).toBeCloseTo(2173.08 * 0.2, 1);
    });

    it('books only the flat fee (no overage) for addon billing, with breakage when under-consumed', () => {
      const lowVolumeAgent = { ...poolAgentSvc, monthly_volume: 1, monetization: { monetization_type: 'addon' as const } };
      const lowVolumeCopilot = { ...poolCopilotSvc, avg_requests_per_user_month: 0.1, monetization: { monetization_type: 'addon' as const } };
      const results = calculateScenario(makePoolScenario([lowVolumeAgent, lowVolumeCopilot]), [poolProvider]);
      const m0 = results.timeline[0];

      // consumed = 1*300 + 100*10 = 1,300, well under the 10,000 pool -> no overage regardless of type.
      expect(m0.revenue).toBeCloseTo(2000, 1); // exactly the flat fee
      expect(m0.poolBreakage).toBeGreaterThan(0); // unused credits valued at the cost floor (memo)
    });

    it('caps usage at the pool with no overage revenue for hard-capped addon billing even when over-consumed', () => {
      const addonAgent = { ...poolAgentSvc, monetization: { monetization_type: 'addon' as const } };
      const addonCopilot = { ...poolCopilotSvc, monetization: { monetization_type: 'addon' as const } };
      const results = calculateScenario(makePoolScenario([addonAgent, addonCopilot]), [poolProvider]);
      const m0 = results.timeline[0];
      // Same 13,000 consumed > 10,000 pool as the first test, but addon = hard cap -> no overage.
      expect(m0.revenue).toBeCloseTo(2000, 1);
    });

    it('charges hybrid overage with the >1x markup', () => {
      const hybridAgent = { ...poolAgentSvc, monetization: { monetization_type: 'hybrid' as const } };
      const hybridCopilot = { ...poolCopilotSvc, monetization: { monetization_type: 'hybrid' as const } };
      const usageResult = calculateScenario(
        makePoolScenario([{ ...poolAgentSvc, monetization: { monetization_type: 'usage' as const } }, { ...poolCopilotSvc, monetization: { monetization_type: 'usage' as const } }]),
        [poolProvider]
      );
      const hybridResult = calculateScenario(makePoolScenario([hybridAgent, hybridCopilot]), [poolProvider]);
      const usageOverage = usageResult.timeline[0].revenue - 2000;
      const hybridOverage = hybridResult.timeline[0].revenue - 2000;
      expect(hybridOverage).toBeCloseTo(usageOverage * HYBRID_OVERAGE_MARKUP, 1);
    });

    it('protects margin with the cost floor when token cost exceeds the EVC-derived credit value', () => {
      // Expensive interaction (1M input tokens @ $10/M = $10/interaction), trivial value_per_outcome
      // ($0.001) -> the cost floor, not value, should set the credit price.
      const expensiveAgent: Service & { rollout_month: number } = {
        ...poolAgentSvc, monthly_volume: 2, avg_input_tokens: 1_000_000, value_per_outcome: 0.001
      };
      const tinyPoolScenario = makePoolScenario([expensiveAgent], {
        pool_tier: { id: 'tier1', name: 'Gold', monthly_fee: 2000, credit_pool_size: 1 },
        pool_burn_rates: [{ id: 'br1', tier_id: 'tier1', service_id: 's_pa', burn_rate: 1 }]
      });
      const results = calculateScenario(tinyPoolScenario, [poolProvider]);
      // consumed = 2 credits (deflected=2, burn_rate=1); cost = 2 * $10 = $20 -> floor = $10/credit.
      // value-based component = 0.30 * (2*0.001) / 2 ≈ $0.0003/credit — the floor dominates.
      // overage = 1 credit * $10 = $10 (usage billing, no markup).
      expect(results.timeline[0].revenue).toBeCloseTo(2010, 1);
    });

    it('falls back to an even split when no service sets value_per_outcome', () => {
      const noValueAgent = { ...poolAgentSvc, value_per_outcome: undefined };
      const noValueCopilot = { ...poolCopilotSvc, value_per_outcome: undefined };
      const results = calculateScenario(makePoolScenario([noValueAgent, noValueCopilot]), [poolProvider]);
      expect(results.poolEconomics?.attribution.method).toBe('even_split_fallback');
      expect(results.poolEconomics?.attribution.copilotShare).toBe(0.5);
      expect(results.poolEconomics?.attribution.agentShare).toBe(0.5);
    });

    it('blocks a pool scenario that mixes billing models across services', () => {
      const usageAgent = { ...poolAgentSvc, monetization: { monetization_type: 'usage' as const } };
      const hybridCopilot = { ...poolCopilotSvc, monetization: { monetization_type: 'hybrid' as const } };
      const res = validateRevenueIntegrity(makePoolScenario([usageAgent, hybridCopilot]));
      expect(res.status).toBe('block');
      expect(res.message).toContain('same billing model');
    });

    it('blocks a pool scenario where a service uses outcome pricing', () => {
      const outcomeAgent = { ...poolAgentSvc, monetization: { monetization_type: 'outcome' as const, outcome_basis: 'deflected' as const, price_per_outcome: 10 } };
      const res = validateRevenueIntegrity(makePoolScenario([outcomeAgent]));
      expect(res.status).toBe('block');
    });

    it('does not block a homogeneous pool scenario', () => {
      const res = validateRevenueIntegrity(makePoolScenario([poolAgentSvc, poolCopilotSvc]));
      expect(res.status).not.toBe('block');
    });
  });

  describe('per-stream blended margin (streamMargins)', () => {
    const provider2: Provider = {
      id: 'p2', name: 'Prov2', model_name: 'm', input_price: 10, output_price: 0,
      is_predefined: true, currency: 'USD', input_tokens_per_credit: 1000000, output_tokens_per_credit: 333333, updated_at: ''
    };
    // agent: 1000 interactions/mo fully contained, 100k input tokens/interaction @ $10/M ->
    // $1.00 COGS/interaction = $1,000 COGS; $10/outcome price -> $10,000 revenue, 90% margin.
    const agentSvc: Service & { rollout_month: number } = {
      id: 's_a', name: 'Agent', status: 'planned', service_type: 'agent',
      interaction_driver_type: 'flat', monthly_volume: 1000, volume_growth_rate: 0,
      containment_rate: 1.0, containment_start_rate: 1.0, containment_ramp_months: 0,
      escalation_rate: 0, failed_deflection_penalty: 0, fully_loaded_cost_per_fte_month: 0,
      productive_hours_per_fte_month: 100, average_handle_time_seconds: 0, baseline_fte: 0,
      staffing_realization_lag_months: 0, churn_rate_uplift: 0,
      rollout_month: 0, provider_id: 'p2', avg_input_tokens: 100000, avg_output_tokens: 0, avg_requests_per_user_month: 0,
      monetization: { monetization_type: 'outcome', outcome_basis: 'deflected', price_per_outcome: 10 }
    };
    // copilot: 1000 AI users * 10 req/user/mo, 10k input tokens/request @ $10/M -> $0.10 token
    // cost/request -> $1,000 COGS; $5/outcome price -> $50,000 revenue, 98% margin.
    const copilotSvc: Service & { rollout_month: number } = {
      id: 's_c', name: 'Copilot', status: 'planned', service_type: 'copilot',
      rollout_month: 0, provider_id: 'p2', avg_input_tokens: 10000, avg_output_tokens: 0,
      avg_requests_per_user_month: 10,
      monetization: { monetization_type: 'outcome', outcome_basis: 'interactions', price_per_outcome: 5 }
    };

    it('computes copilot/agent/blended margins from the timeline', () => {
      const results = calculateScenario(makeScenario([agentSvc, copilotSvc]), [provider2]);
      expect(results.streamMargins.agent).toBeCloseTo(0.9, 3);
      expect(results.streamMargins.copilot).toBeCloseTo(0.98, 3);
      expect(results.streamMargins.blended).toBeCloseTo(0.96667, 3);
      expect(results.streamMargins.copilotThreshold).toBeCloseTo(DEFAULT_COPILOT_MARGIN_THRESHOLD, 5);
      expect(results.streamMargins.agentThreshold).toBeCloseTo(DEFAULT_AGENT_MARGIN_THRESHOLD, 5);
    });

    it('returns null for a stream with no revenue, and respects scenario-level threshold overrides', () => {
      const scenario = makeScenario([agentSvc], { copilot_margin_threshold: 0.5, agent_margin_threshold: 0.5 });
      const results = calculateScenario(scenario, [provider2]);
      expect(results.streamMargins.copilot).toBeNull();
      expect(results.streamMargins.agent).toBeCloseTo(0.9, 3);
      expect(results.streamMargins.copilotThreshold).toBe(0.5);
      expect(results.streamMargins.agentThreshold).toBe(0.5);
    });

    it('blended margin reconciles with the per-stream revenue/COGS sums (incl. failed-deflection COGS)', () => {
      // Partial containment + a failed-deflection penalty makes failedDeflectionCost > 0. That cost
      // lives in opex (not tokenCosts), so a scenario-wide token-COGS blended would drop it; the
      // per-stream agentCogs includes it. Blended must tie out to the streams (ADR 0009 Decision 6).
      const agentWithFailures: Service & { rollout_month: number } = {
        ...agentSvc, containment_rate: 0.8, containment_start_rate: 0.8, failed_deflection_penalty: 2
      };
      const results = calculateScenario(makeScenario([agentWithFailures, copilotSvc]), [provider2]);
      const t = results.timeline;
      const copRev = t.reduce((s, m) => s + (m.copilotRevenue ?? 0), 0);
      const agRev = t.reduce((s, m) => s + (m.agentRevenue ?? 0), 0);
      const copCogs = t.reduce((s, m) => s + (m.copilotCogs ?? 0), 0);
      const agCogs = t.reduce((s, m) => s + (m.agentCogs ?? 0), 0);
      const agTokenCogs = t.reduce((s, m) => s + (m.agentTokenCosts ?? 0), 0);
      const streamRev = copRev + agRev;

      // 1) blended = (Σ per-stream contribution) / (Σ per-stream revenue)
      expect(results.streamMargins.blended).toBeCloseTo((streamRev - copCogs - agCogs) / streamRev, 4);
      // 2) equivalently, the revenue-weighted average of the two stream margins
      const weighted = (results.streamMargins.copilot! * copRev + results.streamMargins.agent! * agRev) / streamRev;
      expect(results.streamMargins.blended).toBeCloseTo(weighted, 3);
      // 3) the agent COGS feeding blended includes the failed-deflection penalty (the #1 fix)
      expect(agCogs).toBeGreaterThan(agTokenCogs);
    });
  });

  describe('value_per_outcome -> price_per_outcome derivation (price_from_evc overlay)', () => {
    it('derives price_per_outcome = captureTargetPct * value_per_outcome for an outcome-monetized service', () => {
      const svc = makeAgentService({
        id: 's_out',
        value_per_outcome: 40,
        monetization: { monetization_type: 'outcome', outcome_basis: 'deflected', price_per_outcome: 0 }
      });
      const scenario = makeScenario([svc], {
        price_from_evc: true,
        evc_nba_annual_value: 1200,
        evc_capture_target_pct: 0.25,
        evc_capture_ceiling_pct: 0.5,
        evc_capture_floor_pct: 0.1
      });
      const results = calculateScenario(scenario, [provider]);
      // deflected = 10000 (full containment of monthly_volume); derived price = 0.25 * 40 = $10,
      // so outcome revenue = 10000 * 10 = $100,000/mo, flowing into agentRevenue.
      expect(results.timeline[0].agentRevenue).toBeCloseTo(100000, 1);
    });
  });
});

describe('resolveRevenueModel (carrier-first revenue resolution)', () => {
  it('treats an explicit revenue_carrier as authoritative and derives the label', () => {
    expect(resolveRevenueModel({ revenue_carrier: 'plan' })).toEqual({ modeling_type: 'gtm', revenue_carrier: 'plan' });
    expect(resolveRevenueModel({ revenue_carrier: 'cohort' })).toEqual({ modeling_type: 'incremental', revenue_carrier: 'cohort' });
    expect(resolveRevenueModel({ revenue_carrier: 'feature' })).toEqual({ modeling_type: 'appraisal', revenue_carrier: 'feature' });
  });

  it('keeps a cohort carrier on appraisal when a revenue bridge is present (so the bridge stays permitted)', () => {
    expect(resolveRevenueModel({ revenue_carrier: 'cohort', revenue_bridge: 'separate_market' }))
      .toEqual({ modeling_type: 'appraisal', revenue_carrier: 'cohort' });
  });

  it('lets an explicit carrier win over a conflicting modeling_type (carrier-first)', () => {
    // incremental would normally force cohort, but an explicit carrier wins.
    expect(resolveRevenueModel({ modeling_type: 'incremental', revenue_carrier: 'plan' }))
      .toEqual({ modeling_type: 'gtm', revenue_carrier: 'plan' });
  });

  it('falls back to modeling_type when no carrier is given', () => {
    expect(resolveRevenueModel({ modeling_type: 'incremental' })).toEqual({ modeling_type: 'incremental', revenue_carrier: 'cohort' });
    expect(resolveRevenueModel({ modeling_type: 'gtm' })).toEqual({ modeling_type: 'gtm', revenue_carrier: 'plan' });
    expect(resolveRevenueModel({ modeling_type: 'appraisal' })).toEqual({ modeling_type: 'appraisal', revenue_carrier: 'cohort' });
  });

  it('maps the deprecated revenue_source only as a last resort', () => {
    expect(resolveRevenueModel({ revenue_source: 'cohort' })).toEqual({ modeling_type: 'incremental', revenue_carrier: 'cohort' });
    expect(resolveRevenueModel({ revenue_source: 'monetization' })).toEqual({ modeling_type: 'appraisal', revenue_carrier: 'feature' });
    expect(resolveRevenueModel({ revenue_source: 'both' })).toEqual({ modeling_type: 'appraisal', revenue_carrier: 'cohort' });
  });

  it('defaults to incremental/cohort when nothing is specified', () => {
    expect(resolveRevenueModel({})).toEqual({ modeling_type: 'incremental', revenue_carrier: 'cohort' });
  });

  it('always returns a pair consistent under resolveCarrier (no double-counting drift)', () => {
    const carriers = ['cohort', 'plan', 'pack', 'feature'] as const;
    for (const c of carriers) {
      const r = resolveRevenueModel({ revenue_carrier: c });
      expect(resolveCarrier(r.modeling_type, r.revenue_carrier)).toBe(c);
    }
  });
});

describe('deriveModelingType', () => {
  it('maps a carrier to its back-compat modeling_type label', () => {
    expect(deriveModelingType('plan')).toBe('gtm');
    expect(deriveModelingType('pack')).toBe('appraisal');
    expect(deriveModelingType('feature')).toBe('appraisal');
    expect(deriveModelingType('cohort')).toBe('incremental');
    // ADR 0010 — 'pool' must resolve to 'appraisal' so the ADR 0001 incremental block never
    // fires for pool scenarios (which always carry monetized services by design).
    expect(deriveModelingType('pool')).toBe('appraisal');
  });

  it('keeps a cohort carrier on appraisal when a bridge is present', () => {
    expect(deriveModelingType('cohort', 'separate_market')).toBe('appraisal');
    expect(deriveModelingType('cohort', null)).toBe('incremental');
  });
});

describe('S-Curve Market Expansion (Phase 3)', () => {
  describe('buildPenetrationCurve', () => {
    it('returns monotonic curves starting from 0 and approaching their limits', () => {
      const tam = 10000;
      const sam = 5000;
      const som = 1000;
      const baselineMonths = 12;
      const accelerationFactor = 0.6;
      const somLiftPct = 0.25;
      const projectionMonths = 36;

      const curves = buildPenetrationCurve({
        tam,
        sam,
        som,
        baselineMonths,
        accelerationFactor,
        somLiftPct,
        projectionMonths
      });

      // Monotonicity checks
      for (let t = 1; t < projectionMonths; t++) {
        expect(curves.withoutAi[t]).toBeGreaterThanOrEqual(curves.withoutAi[t - 1]);
        expect(curves.withAiLower[t]).toBeGreaterThanOrEqual(curves.withAiLower[t - 1]);
        expect(curves.withAiUpper[t]).toBeGreaterThanOrEqual(curves.withAiUpper[t - 1]);
      }

      // Check first elements (t=1) are small positive numbers
      expect(curves.withoutAi[0]).toBeGreaterThan(0);
      expect(curves.withAiLower[0]).toBeGreaterThan(0);
      expect(curves.withAiUpper[0]).toBeGreaterThan(0);

      // Check withAiUpper has lift but is clamped to SAM
      const curvesClamped = buildPenetrationCurve({
        tam: 2000,
        sam: 1100, // SAM is close to SOM
        som: 1000,
        baselineMonths: 12,
        accelerationFactor: 0.6,
        somLiftPct: 0.5, // 50% lift on 1000 is 1500, but SAM is 1100
        projectionMonths: 36
      });
      // The limit for withAiUpper should be clamped to SAM (1100)
      const lastVal = curvesClamped.withAiUpper[35];
      expect(lastVal).toBeLessThanOrEqual(1100);
    });

    it('accelerates penetration under AI adoption', () => {
      const curves = buildPenetrationCurve({
        tam: 10000,
        sam: 5000,
        som: 2000,
        baselineMonths: 20,
        accelerationFactor: 0.5,
        somLiftPct: 0,
        projectionMonths: 40
      });

      // AI accelerated curve (midpoint 10 months) should exceed baseline curve (midpoint 20 months) at intermediate steps
      expect(curves.withAiLower[10]).toBeGreaterThan(curves.withoutAi[10]);
      expect(curves.withAiLower[20]).toBeGreaterThan(curves.withoutAi[20]);
    });
  });

  describe('Integration in calculateScenario', () => {
    it('calculates dynamic seats and dual-band token costs per month', () => {
      // Mock scenario with S-curve expansion config
      const provider: Provider = {
        id: 'p1', name: 'OpenAI', model_name: 'gpt-4o',
        input_price: 5.0, output_price: 15.0,
        input_tokens_per_credit: 1000000, output_tokens_per_credit: 1000000,
        is_predefined: false, currency: 'USD', updated_at: ''
      };

      const plan: Plan = {
        id: 'pl1',
        name: 'AI Plan',
        base_price: 100,
        services: [{
          id: 's1',
          name: 'AI Support',
          status: 'existing',
          avg_input_tokens: 1000,
          avg_output_tokens: 2000,
          avg_requests_per_user_month: 100,
          provider_id: 'p1'
        }]
      };

      const scenario: Scenario = {
        id: 'sc_exp',
        name: 'S-curve Expansion Scenario',
        projection_months: 12,
        discount_rate: 0.1,
        scope_type: 'all_clients',
        modeling_type: 'gtm',
        revenue_carrier: 'plan',
        expansion_vertical_id: 'v1',
        penetration_baseline_months: 6,
        ai_acceleration_factor: 0.5,
        ai_som_lift_pct: 0.25,
        expansion: {
          expansion_vertical_id: 'v1',
          penetration_baseline_months: 6,
          ai_acceleration_factor: 0.5,
          ai_som_lift_pct: 0.25,
          tam_users: 10000,
          sam_users: 5000,
          som_users: 2000
        },
        plans: [{ id: 'pl1', name: 'AI Plan', rollout_month: 0, base_price: 100, seats: 0 }],
        services: [],
        scope_cohorts: [{
          id: 'c1',
          name: 'Cohort 1',
          current_users: 100,
          monthly_acquisition: 10,
          acquisition_growth_rate: 0,
          monthly_churn_rate: 0.05,
          retention_floor: 0.5,
          monthly_expansion_rate: 0.02,
          ai_adoption_rate: 0.3,
          base_arpu: 100
        }]
      };

      // Since the vertical resolver attaches vertical metrics, the engine can execute calculateScenario directly.
      const result = calculateScenario(scenario, [provider]);
      expect(result.timeline.length).toBe(12);

      // Verify revenue is derived dynamically and is non-zero after month 0
      const lastMonth = result.timeline[11];
      expect(lastMonth.revenue).toBeGreaterThan(0);
      expect(result.npvUpper).toBeDefined();
      expect(result.npvLower).toBeDefined();

      // Verify dual-band token costs are populated
      expect(lastMonth.tokenCostsLower).toBeDefined();
      expect(lastMonth.tokenCosts).toBeDefined();
      expect(lastMonth.tokenCosts!).toBeGreaterThanOrEqual(lastMonth.tokenCostsLower!);
    });
  });

  describe('Outcome-Based & EVC Modeling Tests', () => {
    it('should calculate EVC and capture bands correctly', () => {
      const timeline = Array.from({ length: 12 }, (_, i) => ({
        month: i,
        grossRevenue: 15000,
        baselineRevenue: 10000,
        laborSavingsCash: 2000,
        laborSavingsCapacity: 1000,
        opex: 500,
        capex: 0,
        tokenCosts: 200,
        netCashFlow: 5000,
        customers: 100,
        aiUsers: 20
      })) as any[];

      const inputs = {
        nbaAnnualValue: 50000,
        extraPositiveValue: 10000,
        negativeValue: 5000,
        captureCeilingPct: 0.50,
        captureTargetPct: 0.30,
        captureFloorPct: 0.15,
        unitLaborSavingsAnnual: 360
      };

      const result = calculateEVC(timeline, inputs);

      expect(result).not.toBeNull();
      // NBA/12 = 50000/12 = 4166.67
      expect(result.referenceValue).toBeCloseTo(4166.67, 1);
      // unitLaborSavingsAnnual = 36000/100 = 360.
      // positiveValueTotal = (10000 + 360)/12 = 863.33
      expect(result.positiveValueTotal).toBeCloseTo(863.33, 1);
      // negativeValueTotal = 5000/12 = 416.67
      expect(result.negativeValueTotal).toBeCloseTo(416.67, 1);
      // Net created = 863.33 - 416.67 = 446.67
      expect(result.netCreatedValue).toBeCloseTo(446.67, 1);
      // EVC = 4166.67 + 446.67 = 4613.33
      expect(result.evc).toBeCloseTo(4613.33, 1);

      // Floor: 4166.67 + 0.15 * 446.67 = 4233.67
      expect(result.priceFloor).toBeCloseTo(4233.67, 1);
      // Target: 4166.67 + 0.30 * 446.67 = 4300.67
      expect(result.priceTarget).toBeCloseTo(4300.67, 1);
      // Ceiling: 4166.67 + 0.50 * 446.67 = 4390.00
      expect(result.priceCeiling).toBeCloseTo(4390.00, 1);

      // Verify the new breakdown fields are returned correctly
      expect(result.laborSavings).toBe(360);
      expect(result.extraPositiveValue).toBe(10000);
      // cogsPerUserMonth = (200 + 500) / 100 = 7
      expect(result.cogsPerUserMonth).toBe(7);
      // vendorGrossProfitPerUserMonth = targetCapturePerUserMonth (134.00) - cogs (7) = 127.00
      expect(result.vendorGrossProfitPerUserMonth).toBeCloseTo(127.00, 1);
    });

    it('should keep EVC and pricing bands invariant when only gross or baseline revenues are changed', () => {
      const baseTimeline = Array.from({ length: 12 }, (_, i) => ({
        month: i,
        grossRevenue: 15000,
        baselineRevenue: 10000,
        laborSavingsCash: 2000,
        laborSavingsCapacity: 1000,
        opex: 500,
        capex: 0,
        tokenCosts: 200,
        netCashFlow: 5000,
        customers: 100,
        aiUsers: 20
      })) as any[];

      const modifiedTimeline = baseTimeline.map(m => ({
        ...m,
        grossRevenue: m.grossRevenue * 2,
        baselineRevenue: m.baselineRevenue + 1000
      }));

      const inputs = {
        nbaAnnualValue: 50000,
        extraPositiveValue: 10000,
        negativeValue: 5000,
        captureCeilingPct: 0.50,
        captureTargetPct: 0.30,
        captureFloorPct: 0.15,
        unitLaborSavingsAnnual: 360
      };

      const baseResult = calculateEVC(baseTimeline, inputs);
      const modifiedResult = calculateEVC(modifiedTimeline, inputs);

      expect(modifiedResult.evc).toBeCloseTo(baseResult.evc, 1);
      expect(modifiedResult.netCreatedValue).toBeCloseTo(baseResult.netCreatedValue, 1);
      expect(modifiedResult.priceFloor).toBeCloseTo(baseResult.priceFloor, 1);
      expect(modifiedResult.priceTarget).toBeCloseTo(baseResult.priceTarget, 1);
      expect(modifiedResult.priceCeiling).toBeCloseTo(baseResult.priceCeiling, 1);
    });

    it('should apply price_from_evc overlay and compute derived price in calculateScenario', () => {
      const scenario: Scenario = {
        id: 's-evc',
        name: 'Test EVC Scenario',
        projection_months: 12,
        discount_rate: 0.10,
        scope_type: 'cohorts',
        modeling_type: 'appraisal',
        revenue_carrier: 'cohort',
        price_from_evc: true,
        evc_nba_annual_value: 12000, // 1000/mo NBA
        evc_extra_positive_value: 2400, // 200/mo extra
        evc_negative_value: 1200, // 100/mo switching
        evc_capture_target_pct: 0.30, // 30% capture target
        scope_cohorts: [
          {
            id: 'c1',
            name: 'Cohort 1',
            current_users: 100,
            monthly_acquisition: 0,
            acquisition_growth_rate: 0,
            monthly_churn_rate: 0,
            base_arpu: 0, // Should be overridden
            arpu_uplift: 0, // Should be overridden
            arpu_uplift_percent: 0,
            ai_adoption_rate: 1.0,
            adoption_ramp_months: 0,
            retention_floor: 0.60,
            monthly_expansion_rate: 0.02
          }
        ]
      };

      const providers: Provider[] = [];
      const result = calculateScenario(scenario, providers);

      expect(result.evc).not.toBeNull();
      // unitLaborSavings = 0 (no agent services)
      // unitNetValue = (2400 + 0 - 1200) / 12 = 100
      // targetCapturePerUserMonth = 0.30 * 100 = 30
      expect(result.evc?.targetCapturePerUserMonth).toBe(30);

      // Verify that the timeline revenue is based on the overridden price (30/mo * 100 customers = 3000 MRR)
      expect(result.timeline[0].revenue).toBe(3000);
    });

    it('should apply adoption elasticity to adoption rate and ramp tempo', () => {
      const baseCohort = {
        id: 'c1',
        name: 'Cohort 1',
        current_users: 100,
        monthly_acquisition: 0,
        acquisition_growth_rate: 0,
        monthly_churn_rate: 0,
        base_arpu: 100,
        arpu_uplift: 10,
        arpu_uplift_percent: 0,
        ai_adoption_rate: 0.50,
        adoption_ramp_months: 6,
        retention_floor: 0.60,
        monthly_expansion_rate: 0.02
      };

      const scenario: Scenario = {
        id: 's-elastic',
        name: 'Elastic Scenario',
        projection_months: 12,
        discount_rate: 0.10,
        scope_type: 'cohorts' as const,
        evc_capture_target_pct: 0.30,
        adoption_elasticity: 1.5,
        scope_cohorts: [baseCohort]
      };

      // 1. Lower capture (20%) -> more surplus, adoption ceiling should increase, ramp months should decrease
      const resLower = calculateScenario(scenario, [], undefined, {
        runtime_capture_pct: 0.20
      });

      // 2. Higher capture (40%) -> less surplus, adoption ceiling should decrease, ramp months should increase
      const resHigher = calculateScenario(scenario, [], undefined, {
        runtime_capture_pct: 0.40
      });

      // For Lower (capture = 0.20 < target = 0.30):
      // target = 0.5 * (1 + 1.5 * (0.30 - 0.20)) = 0.5 * 1.15 = 0.575
      // ramp = 6 * (1 + 1.5 * 0.5 * (0.20 - 0.30)) = 6 * (1 - 0.075) = 5.55 -> round to 6 or 5?
      // 1.5 * 0.5 * -0.10 = -0.075, ramp = 6 * 0.925 = 5.55 -> round to 6 (wait, round(5.55) is 6? No, round(5.55) = 6).
      // Let's check the adoption rates in Month 12 (when ramp is fully complete):
      // Month 12 activeAiUsers should be 100 * target
      expect(resLower.timeline[11].aiUsers).toBeGreaterThan(resHigher.timeline[11].aiUsers);
    });

    it('should sweep capture rate and return correct CaptureCurveResult', () => {
      const scenario: Scenario = {
        id: 's-curve',
        name: 'Curve Scenario',
        projection_months: 12,
        discount_rate: 0.10,
        scope_type: 'cohorts',
        evc_nba_annual_value: 12000,
        evc_extra_positive_value: 2400,
        evc_negative_value: 1200,
        evc_capture_target_pct: 0.30,
        adoption_elasticity: 1.0,
        scope_cohorts: [
          {
            id: 'c1',
            name: 'Cohort 1',
            current_users: 100,
            monthly_acquisition: 0,
            acquisition_growth_rate: 0,
            monthly_churn_rate: 0,
            base_arpu: 0,
            arpu_uplift: 0,
            arpu_uplift_percent: 0,
            ai_adoption_rate: 0.50,
            adoption_ramp_months: 0,
            retention_floor: 0.60,
            monthly_expansion_rate: 0.02
          }
        ]
      };

      const result = runCaptureCurve(scenario, []);
      expect(result.points).toHaveLength(21);
      expect(result.optimalCapture).toBeGreaterThanOrEqual(0.0);
      expect(result.optimalCapture).toBeLessThanOrEqual(1.0);
      expect(result.optimalOverlayPrice).toBeDefined();
      expect(result.epsilonBand.low).toBeDefined();
      expect(result.epsilonBand.high).toBeDefined();
    });

    it('should calculate analytical labor savings correctly', () => {
      const scenario: Scenario = {
        id: 's-analytical-savings',
        name: 'Analytical Savings Scenario',
        projection_months: 12,
        discount_rate: 0.10,
        scope_type: 'cohorts',
        scope_cohorts: [
          {
            id: 'c1',
            name: 'Cohort 1',
            current_users: 100,
            monthly_acquisition: 0,
            acquisition_growth_rate: 0,
            monthly_churn_rate: 0,
            base_arpu: 100,
            arpu_uplift: 0,
            arpu_uplift_percent: 0,
            ai_adoption_rate: 0.50,
            adoption_ramp_months: 0,
            retention_floor: 0.60,
            monthly_expansion_rate: 0.02
          }
        ],
        services: [
          {
            id: 'srv1',
            name: 'Customer Agent',
            status: 'planned',
            service_type: 'agent',
            interaction_driver_type: 'per_customer',
            interactions_per_customer_month: 50,
            containment_rate: 0.60,
            average_handle_time_seconds: 60,
            productive_hours_per_fte_month: 120,
            fully_loaded_cost_per_fte_month: 6000,
            avg_input_tokens: 0,
            avg_output_tokens: 0,
            avg_requests_per_user_month: 0,
            rollout_month: 0
          }
        ]
      };

      // Representative Customers: 100
      // Representative Adoption: 0.50
      // interactionsPerCustomerMonth = 0.50 * 100 = 50
      // deflected = 50 * 0.60 = 30
      // hoursSaved = 30 * 60 / 3600 = 0.5 hours
      // fteSaved = 0.5 / 120 = 0.004167 FTE
      // monthly_savings_per_customer = 0.004167 * 6000 = 25
      // annual_savings_per_customer = 25 * 12 = 300
      const savings = calculateAnalyticalLaborSavings(scenario);
      expect(savings).toBeCloseTo(300, 1);
    });

    it('should compute deflected interaction outcome revenue', () => {
      const provider: Provider = {
        id: 'p1', name: 'OpenAI', model_name: 'gpt-4', input_price: 0, output_price: 0,
        is_predefined: true, currency: 'USD', input_tokens_per_credit: 1000, output_tokens_per_credit: 1000, updated_at: ''
      };

      const srv: Service = {
        id: 's1',
        name: 'Agent Service',
        status: 'planned',
        service_type: 'agent',
        provider_id: 'p1',
        avg_input_tokens: 0,
        avg_output_tokens: 0,
        interaction_driver_type: 'flat',
        monthly_volume: 100000,
        avg_requests_per_user_month: 100,
        average_handle_time_seconds: 60,
        fully_loaded_cost_per_fte_month: 5000,
        containment_rate: 0.5,
        monetization: {
          monetization_type: 'outcome',
          outcome_basis: 'deflected',
          price_per_outcome: 2.0
        }
      };

      const cohort: CohortConfig = {
        id: 'c1',
        name: 'Cohort 1',
        current_users: 1000,
        monthly_acquisition: 0,
        acquisition_growth_rate: 0,
        monthly_churn_rate: 0,
        retention_floor: 0,
        monthly_expansion_rate: 0,
        ai_adoption_rate: 1.0,
        base_arpu: 0
      };

      const result = calculateScenario({
        id: 'test-outcome',
        name: 'Outcome Test',
        projection_months: 1,
        discount_rate: 0.1,
        scope_type: 'cohorts',
        modeling_type: 'appraisal',
        revenue_carrier: 'feature',
        services: [{ ...srv, rollout_month: 0 } as any],
        scope_cohorts: [cohort]
      }, [provider]);

      // month 1 active users = 1000
      // interactions = 100000
      // deflected = 100000 * 0.5 = 50000
      // outcome revenue = 50000 * $2 = $100000
      const breakdown = result.timeline[0];
      expect(breakdown.outcomeRevenue).toBe(100000);
      expect(breakdown.monetizationRevenue).toBe(100000);
    });

    it('should count per_user outcome revenue exactly once (no double-count)', () => {
      const srv: Service = {
        id: 's1',
        name: 'Copilot Service',
        status: 'planned',
        service_type: 'copilot',
        avg_input_tokens: 0,
        avg_output_tokens: 0,
        interaction_driver_type: 'flat',
        avg_requests_per_user_month: 0,
        monetization: {
          monetization_type: 'outcome',
          outcome_basis: 'per_user',
          outcomes_per_user_month: 10,
          price_per_outcome: 3.0
        }
      };

      const cohort: CohortConfig = {
        id: 'c1',
        name: 'Cohort 1',
        current_users: 1000,
        monthly_acquisition: 0,
        acquisition_growth_rate: 0,
        monthly_churn_rate: 0,
        retention_floor: 0,
        monthly_expansion_rate: 0,
        ai_adoption_rate: 1.0,
        base_arpu: 0
      };

      const result = calculateScenario({
        id: 'test-outcome-per-user',
        name: 'Outcome Per-User Test',
        projection_months: 1,
        discount_rate: 0.1,
        scope_type: 'cohorts',
        modeling_type: 'appraisal',
        revenue_carrier: 'feature',
        services: [{ ...srv, rollout_month: 0 } as any],
        scope_cohorts: [cohort]
      }, []);

      // active AI users = 1000; outcomes = 1000 * 10 = 10000; revenue = 10000 * $3 = $30000.
      // Must be booked EXACTLY once — regression guard against the per_user double-count
      // that occurred when both calculateMonetizationRevenue and the service loop accrued it.
      const breakdown = result.timeline[0];
      expect(breakdown.outcomeRevenue).toBe(30000);
      expect(breakdown.monetizationRevenue).toBe(30000);
      expect(breakdown.revenue).toBe(30000);
    });
  });

  describe('buildPricingCorridor', () => {
    it('should build pricing corridor correctly with multiple cohorts', () => {
      const scenario: Scenario = {
        id: 's-corridor',
        name: 'Corridor Scenario',
        projection_months: 12,
        discount_rate: 0.1,
        scope_type: 'cohorts',
        scope_cohorts: [
          {
            id: 'c1',
            name: 'Cohort Light',
            current_users: 100,
            monthly_acquisition: 0,
            acquisition_growth_rate: 0,
            monthly_churn_rate: 0,
            retention_floor: 0,
            monthly_expansion_rate: 0,
            ai_adoption_rate: 0.2,
            gross_margin: 0.8,
            base_arpu: 50
          },
          {
            id: 'c2',
            name: 'Cohort Heavy',
            current_users: 100,
            monthly_acquisition: 0,
            acquisition_growth_rate: 0,
            monthly_churn_rate: 0,
            retention_floor: 0,
            monthly_expansion_rate: 0,
            ai_adoption_rate: 0.8,
            gross_margin: 0.5,
            base_arpu: 50
          }
        ]
      };

      const timeline = [
        {
          month: 12,
          revenue: 12000, // 12000 / 200 = 60 actualPrice
          customers: 200,
          aiUsers: 100,
          opex: 2000, // 2000 / 200 = 10 fixed cost
          tokenCosts: 2000, // 2000 / 100 = 20 token cost per AI user
          grossRevenue: 12000,
          baselineRevenue: 10000,
          baselineCustomers: 200,
          monetizationRevenue: 0,
          addonRevenue: 0,
          usageRevenue: 0,
          hybridBaseRevenue: 0,
          overchargeRevenue: 0,
          outcomeRevenue: 0,
          totalCosts: 4000,
          capex: 0,
          netCashFlow: 8000,
          cumulativeCashFlow: 8000
        }
      ];

      const evc: EvcResult = {
        evc: 150,
        referenceValue: 50,
        positiveValueTotal: 120,
        negativeValueTotal: 20,
        netCreatedValue: 100,
        priceFloor: 65,
        priceTarget: 80,
        priceCeiling: 100,
        laborSavings: 0,
        extraPositiveValue: 0,
        unitNetValue: 100,
        targetCapturePerUserMonth: 30,
        customerSurplusPerUserMonth: 70,
        vendorGrossProfitPerUserMonth: 23,
        cogsPerUserMonth: 20
      };

      const corridor = buildPricingCorridor(scenario, timeline, evc);

      expect(corridor.actualPrice).toBe(60);
      expect(corridor.points.length).toBe(2);

      // Light cohort: a = 0.2. cogs = 0.2 * 20 (u) + 10 (o) = 14.
      // Heavy cohort: a = 0.8. cogs = 0.8 * 20 (u) + 10 (o) = 26.
      // Light is sorted first.
      expect(corridor.points[0].cohortName).toBe('Cohort Light');
      expect(corridor.points[0].cogs).toBe(14);
      expect(corridor.points[0].floorTarget).toBeCloseTo(14 / (1 - 0.8), 1); // 70
      // actualPrice (60) is between cogs (14) and floorTarget (70) -> below_margin
      expect(corridor.points[0].status).toBe('below_margin');

      expect(corridor.points[1].cohortName).toBe('Cohort Heavy');
      expect(corridor.points[1].cogs).toBe(26);
      expect(corridor.points[1].floorTarget).toBeCloseTo(26 / (1 - 0.5), 1); // 52
      // actualPrice (60) is between floorTarget (52) and ceiling (100) -> healthy
      expect(corridor.points[1].status).toBe('healthy');

      expect(corridor.hasBreak).toBe(false);
    });

    it('should calculate per-cohort EVC values when value_per_outcome is set and respect usage_intensity', () => {
      const scenario: Scenario = {
        id: 's-evc-cohort',
        name: 'EVC Cohort Scenario',
        projection_months: 12,
        discount_rate: 0.1,
        scope_type: 'cohorts',
        evc_nba_annual_value: 240, // 20/mo
        evc_capture_ceiling_pct: 0.5,
        evc_capture_target_pct: 0.3,
        evc_capture_floor_pct: 0.15,
        evc_negative_value: 120, // 10/mo
        scope_cohorts: [
          {
            id: 'c1',
            name: 'Pro',
            current_users: 100,
            monthly_acquisition: 0,
            acquisition_growth_rate: 0,
            monthly_churn_rate: 0,
            retention_floor: 0,
            monthly_expansion_rate: 0,
            ai_adoption_rate: 0.5,
            gross_margin: 0.8,
            base_arpu: 50,
            usage_intensity: 0.7
          },
          {
            id: 'c2',
            name: 'Enterprise',
            current_users: 100,
            monthly_acquisition: 0,
            acquisition_growth_rate: 0,
            monthly_churn_rate: 0,
            retention_floor: 0,
            monthly_expansion_rate: 0,
            ai_adoption_rate: 0.5,
            gross_margin: 0.8,
            base_arpu: 50,
            usage_intensity: 1.5
          }
        ],
        services: [
          {
            id: 's1',
            name: 'AI Summaries',
            status: 'planned',
            service_type: 'copilot',
            avg_requests_per_user_month: 100,
            avg_input_tokens: 1000,
            avg_output_tokens: 200,
            value_per_outcome: 2.0, // outcome value
            rollout_month: 0
          }
        ]
      };

      const timeline = [
        {
          month: 12,
          revenue: 10000,
          customers: 200,
          aiUsers: 100,
          opex: 1000, // 5 per customer
          tokenCosts: 2000, // 20 per AI user
          grossRevenue: 10000,
          baselineRevenue: 8000,
          baselineCustomers: 200,
          monetizationRevenue: 0,
          addonRevenue: 0,
          usageRevenue: 0,
          hybridBaseRevenue: 0,
          overchargeRevenue: 0,
          outcomeRevenue: 0,
          totalCosts: 3000,
          capex: 0,
          netCashFlow: 7000,
          cumulativeCashFlow: 7000
        }
      ];

      const evc: EvcResult = {
        evc: 150,
        referenceValue: 20,
        positiveValueTotal: 120,
        negativeValueTotal: 10,
        netCreatedValue: 100,
        priceFloor: 35,
        priceTarget: 50,
        priceCeiling: 70,
        laborSavings: 0,
        extraPositiveValue: 0,
        unitNetValue: 100,
        targetCapturePerUserMonth: 30,
        customerSurplusPerUserMonth: 70,
        vendorGrossProfitPerUserMonth: 23,
        cogsPerUserMonth: 20
      };

      const corridor = buildPricingCorridor(scenario, timeline, evc);

      expect(corridor.points.length).toBe(2);

      // Pro point (usage_intensity = 0.7)
      // baseActivity = 100 requests. activity = 70.
      // valueFromOutcomes = 70 * 2 = 140.
      // netValue = 140 - 10 (negValue/12) = 130.
      // ceiling = 20 + 0.5 * 130 = 85.
      // target = 20 + 0.3 * 130 = 59.
      // floor = 20 + 0.15 * 130 = 39.5.
      // cogs = 0.5 (adoption) * 0.7 (intensity) * 20 (u) + 5 (o) = 7 + 5 = 12.
      const proPoint = corridor.points.find(p => p.cohortName === 'Pro')!;
      expect(proPoint.cogs).toBe(12);
      expect(proPoint.ceiling).toBe(85);
      expect(proPoint.targetPrice).toBe(59);
      expect(proPoint.floorPrice).toBe(39.5);

      // Enterprise point (usage_intensity = 1.5)
      // baseActivity = 100 requests. activity = 150.
      // valueFromOutcomes = 150 * 2 = 300.
      // netValue = 300 - 10 = 290.
      // ceiling = 20 + 0.5 * 290 = 165.
      // target = 20 + 0.3 * 290 = 107.
      // floor = 20 + 0.15 * 290 = 63.5.
      // cogs = 0.5 * 1.5 * 20 + 5 = 15 + 5 = 20.
      const entPoint = corridor.points.find(p => p.cohortName === 'Enterprise')!;
      expect(entPoint.cogs).toBe(20);
      expect(entPoint.ceiling).toBe(165);
      expect(entPoint.targetPrice).toBe(107);
      expect(entPoint.floorPrice).toBe(63.5);
    });

    it('de-weights tokenCosts by aiUsersWeighted so usage_intensity is not double-counted in COGS (ADR 0011)', () => {
      // Regression guard: the main timeline scales tokenCosts by per-cohort usage_intensity (Phase B),
      // so the corridor must divide by aiUsersWeighted to recover the intensity-free unit cost before
      // re-applying each cohort's own intensity. Without de-weighting, the blended avgIntensity is
      // double-counted into every COGS floor. Here aiUsersWeighted (200) = aiUsers (100) × intensity (2.0).
      const scenario: Scenario = {
        id: 's-evc-deweight',
        name: 'Deweight Scenario',
        projection_months: 12,
        discount_rate: 0.1,
        scope_type: 'cohorts',
        scope_cohorts: [
          {
            id: 'c1',
            name: 'Heavy',
            current_users: 100,
            monthly_acquisition: 0,
            acquisition_growth_rate: 0,
            monthly_churn_rate: 0,
            retention_floor: 0,
            monthly_expansion_rate: 0,
            ai_adoption_rate: 1.0,
            gross_margin: 0.5,
            base_arpu: 50,
            usage_intensity: 2.0
          }
        ],
        services: []
      };

      const timeline = [
        {
          month: 12,
          revenue: 5000,
          customers: 100,
          aiUsers: 100,
          aiUsersWeighted: 200, // engine already scaled tokenCosts by intensity 2.0
          opex: 0,
          tokenCosts: 2000, // = 200 weighted users × $10 intensity-free unit cost
          grossRevenue: 5000,
          baselineRevenue: 4000,
          baselineCustomers: 100,
          monetizationRevenue: 0,
          addonRevenue: 0,
          usageRevenue: 0,
          hybridBaseRevenue: 0,
          overchargeRevenue: 0,
          outcomeRevenue: 0,
          totalCosts: 2000,
          capex: 0,
          netCashFlow: 3000,
          cumulativeCashFlow: 3000
        }
      ];

      const evc: EvcResult = {
        evc: 150,
        referenceValue: 20,
        positiveValueTotal: 120,
        negativeValueTotal: 10,
        netCreatedValue: 100,
        priceFloor: 35,
        priceTarget: 50,
        priceCeiling: 70,
        laborSavings: 0,
        extraPositiveValue: 0,
        unitNetValue: 100,
        targetCapturePerUserMonth: 30,
        customerSurplusPerUserMonth: 70,
        vendorGrossProfitPerUserMonth: 23,
        cogsPerUserMonth: 20
      };

      const corridor = buildPricingCorridor(scenario, timeline, evc);
      // u_base = tokenCosts / aiUsersWeighted = 2000 / 200 = 10 (NOT 2000 / 100 = 20).
      // cogs = adoption(1.0) × intensity(2.0) × 10 + opex(0) = 20. With the double-count it would be 40.
      expect(corridor.points[0].cogs).toBe(20);
    });

    it('should detect a break in pricing corridor', () => {
      const scenario: Scenario = {
        id: 's-corridor-break',
        name: 'Corridor Break Scenario',
        projection_months: 12,
        discount_rate: 0.1,
        scope_type: 'cohorts',
        scope_cohorts: [
          {
            id: 'c1',
            name: 'Cohort High Burn',
            current_users: 100,
            monthly_acquisition: 0,
            acquisition_growth_rate: 0,
            monthly_churn_rate: 0,
            retention_floor: 0,
            monthly_expansion_rate: 0,
            ai_adoption_rate: 0.9,
            gross_margin: 0.5,
            base_arpu: 20
          }
        ]
      };

      const timeline = [
        {
          month: 12,
          revenue: 2000, // 2000 / 100 = 20 actualPrice
          customers: 100,
          aiUsers: 90,
          opex: 1000, // 1000 / 100 = 10 fixed cost
          tokenCosts: 1800, // 1800 / 90 = 20 token cost per AI user
          grossRevenue: 2000,
          baselineRevenue: 1000,
          baselineCustomers: 100,
          monetizationRevenue: 0,
          addonRevenue: 0,
          usageRevenue: 0,
          hybridBaseRevenue: 0,
          overchargeRevenue: 0,
          outcomeRevenue: 0,
          totalCosts: 2800,
          capex: 0,
          netCashFlow: -800,
          cumulativeCashFlow: -800
        }
      ];

      const evc: EvcResult = {
        evc: 50,
        referenceValue: 10,
        positiveValueTotal: 45,
        negativeValueTotal: 5,
        netCreatedValue: 40,
        priceFloor: 16,
        priceTarget: 22,
        priceCeiling: 30,
        laborSavings: 0,
        extraPositiveValue: 0,
        unitNetValue: 40,
        targetCapturePerUserMonth: 12,
        customerSurplusPerUserMonth: 28,
        vendorGrossProfitPerUserMonth: -16,
        cogsPerUserMonth: 28
      };

      const corridor = buildPricingCorridor(scenario, timeline, evc);
      
      // cogs = 0.9 * 20 + 10 = 28
      // actualPrice = 20
      // actualPrice < cogs -> status is loss (corridor break!)
      expect(corridor.points[0].status).toBe('loss');
      expect(corridor.hasBreak).toBe(true);
    });
  });

  describe('buildPocketMarginWaterfall', () => {
    it('should build pocket margin waterfall with correct step types and values', () => {
      const scenario: Scenario = {
        id: 's-waterfall',
        name: 'Waterfall Scenario',
        projection_months: 12,
        discount_rate: 0.1,
        scope_type: 'cohorts',
        scope_cohorts: []
      };

      const timeline = [
        {
          month: 12,
          revenue: 10000,
          customers: 100,
          aiUsers: 50,
          opex: 1000, // 10 fixed cost
          tokenCosts: 1000, // 20 token cost per AI user
          grossRevenue: 10000,
          baselineRevenue: 8000,
          baselineCustomers: 100,
          monetizationRevenue: 0,
          addonRevenue: 0,
          usageRevenue: 0,
          hybridBaseRevenue: 0,
          overchargeRevenue: 0,
          outcomeRevenue: 0,
          totalCosts: 2000,
          capex: 0,
          netCashFlow: 8000,
          cumulativeCashFlow: 8000
        }
      ];

      const evc: EvcResult = {
        evc: 120,
        referenceValue: 40,
        positiveValueTotal: 100,
        negativeValueTotal: 20,
        netCreatedValue: 80,
        priceFloor: 52,
        priceTarget: 64,
        priceCeiling: 80,
        laborSavings: 0,
        extraPositiveValue: 0,
        unitNetValue: 80,
        targetCapturePerUserMonth: 24,
        customerSurplusPerUserMonth: 56,
        vendorGrossProfitPerUserMonth: 4,
        cogsPerUserMonth: 20
      };

      const waterfall = buildPocketMarginWaterfall(scenario, timeline, evc);

      expect(waterfall.pocketMargin).toBe(64 - 10 - 10); // priceTarget - u - o = 44
      expect(waterfall.reconciliationError).toBe(0);
      expect(waterfall.steps.length).toBe(6);

      expect(waterfall.steps[0]).toEqual({ name: 'Economic Value to Customer (EVC)', value: 120, type: 'base' });
      expect(waterfall.steps[1]).toEqual({ name: 'Customer Surplus', value: -56, type: 'delta' });
      expect(waterfall.steps[2]).toEqual({ name: 'Target Price', value: 64, type: 'total' });
      expect(waterfall.steps[3]).toEqual({ name: 'AI COGS', value: -10, type: 'delta' });
      expect(waterfall.steps[4]).toEqual({ name: 'Cost-to-Serve', value: -10, type: 'delta' });
      expect(waterfall.steps[5]).toEqual({ name: 'Pocket Margin', value: 44, type: 'total' });
    });
  });
});

