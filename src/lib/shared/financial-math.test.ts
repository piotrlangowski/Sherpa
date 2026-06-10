import { describe, it, expect } from 'vitest';
import {
  calculateNPV,
  calculatePaybackPeriod,
  calculateIRR,
  calculateTCO,
  buildCohortModel,
  calculateScenario,
  runSensitivityAnalysis,
  applyScopeOverrides
} from './financial-math.js';
import type { Provider, Scenario, CohortConfig, CostItem, Service, ScopeOverride } from './types.js';

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
      frequency: 'one_time'
    };

    const costOpexMonthly: CostItem = {
      id: 'cost2',
      name: 'Support',
      category: 'opex',
      amount: 500,
      frequency: 'monthly'
    };

    const costOpexYearly: CostItem = {
      id: 'cost3',
      name: 'License Renewal',
      category: 'opex',
      amount: 2000,
      frequency: 'yearly'
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
      expect(results.npv).toBeDefined();
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

  describe('runSensitivityAnalysis', () => {
    const provider: Provider = {
      id: 'p1',
      name: 'OpenAI',
      model_name: 'gpt-4',
      input_price: 5.0,
      output_price: 15.0,
      is_predefined: true,
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
      frequency: 'one_time'
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
});
