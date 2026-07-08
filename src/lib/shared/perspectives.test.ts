import { describe, it, expect } from 'vitest';
import {
  isModuleFilled,
  getActiveModule,
  buildPerspectiveVariant,
  calculateRevenuePv,
  computePerspectives,
  generateExplanation,
  classifyPerspectiveRelations
} from './perspectives.js';
import { calculateScenario, resolveCompositeComponents } from './financial-math.js';
import type { Scenario, Provider, CreditSettings } from './types.js';

describe('Scenario Revenue Perspectives (ADR 0013) Tests', () => {
  const mockCohort: any = {
    id: 'c1',
    name: 'Cohort 1',
    current_users: 1000,
    ai_adoption_rate: 0.5,
    arpu_uplift: 10,
    arpu_uplift_percent: 0.1
  };

  const mockPlan: any = {
    id: 'p1',
    name: 'Plan 1',
    seats: 100,
    base_price: 20
  };

  const mockService: any = {
    id: 's1',
    name: 'Service 1',
    service_type: 'copilot',
    monetization: {
      monetization_type: 'addon',
      addon_monthly_fee: 5
    }
  };

  const mockScenario: Scenario = {
    id: 'sc1',
    name: 'Mock Scenario',
    projection_months: 12,
    discount_rate: 0.10,
    scope_type: 'cohorts',
    revenue_source: 'monetization',
    modeling_type: 'appraisal',
    revenue_carrier: 'feature',
    scope_cohorts: [mockCohort],
    plans: [mockPlan],
    services: [mockService],
    costs: [],
    capex_contingency_pct: 0
  };

  const mockProviders: Provider[] = [
    {
      id: 'prov1',
      name: 'Prov 1',
      model_name: 'gpt-4o',
      input_price: 5.0,
      output_price: 15.0,
      is_predefined: true,
      currency: 'USD',
      input_tokens_per_credit: 100000,
      output_tokens_per_credit: 100000,
      updated_at: ''
    }
  ];

  const mockCreditSettings: CreditSettings = {
    defaultPricePerCredit: 0.01,
    defaultOverchargeMarkup: 0.2,
    defaultOverchargeUserPct: 0.1,
    defaultAvgOverchargePct: 0.2,
    defaultInputTokensPerCredit: 100000,
    defaultOutputTokensPerCredit: 100000
  };

  describe('isModuleFilled', () => {
    it('should identify cohort module is filled', () => {
      expect(isModuleFilled(mockScenario, 'cohort')).toBe(true);
      const emptyCohortScenario = { ...mockScenario, scope_cohorts: [{ ...mockCohort, arpu_uplift: 0, arpu_uplift_percent: 0 }] };
      expect(isModuleFilled(emptyCohortScenario, 'cohort')).toBe(false);
    });

    it('should identify plan module is filled', () => {
      expect(isModuleFilled(mockScenario, 'plan')).toBe(true);
      const emptyPlanScenario = { ...mockScenario, plans: [{ ...mockPlan, seats: 0 }] };
      expect(isModuleFilled(emptyPlanScenario, 'plan')).toBe(false);
    });

    it('should identify monetization module is filled', () => {
      expect(isModuleFilled(mockScenario, 'monetization')).toBe(true);
      const emptyMonetizationScenario = { ...mockScenario, services: [{ ...mockService, monetization: { monetization_type: 'none' } }] };
      expect(isModuleFilled(emptyMonetizationScenario, 'monetization')).toBe(false);
    });

    it('should identify pool module is filled when pool tier is set', () => {
      const poolScenario: any = { ...mockScenario, pool_tier_id: 't1', pool_burn_rates: [{ service_id: 's1', burn_rate: 10 }] };
      expect(isModuleFilled(poolScenario, 'pool')).toBe(true);
    });
  });

  describe('getActiveModule', () => {
    it('should identify active module based on modeling type and carrier', () => {
      expect(getActiveModule({ ...mockScenario, modeling_type: 'incremental' })).toBe('cohort');
      expect(getActiveModule({ ...mockScenario, modeling_type: 'gtm' })).toBe('plan');
      expect(getActiveModule({ ...mockScenario, modeling_type: 'appraisal', revenue_carrier: 'feature' })).toBe('monetization');
      expect(getActiveModule({ ...mockScenario, modeling_type: 'appraisal', revenue_carrier: 'pool' })).toBe('pool');
    });

    it('resolves the invariant-consistent (appraisal, plan/cohort) pairs by carrier, not modeling_type (duplication regression)', () => {
      // (appraisal, plan) used to fall through to 'cohort', mislabeling the
      // panel's "Active Carrier" row on plan-carrier duplicates.
      expect(getActiveModule({ ...mockScenario, modeling_type: 'appraisal', revenue_carrier: 'plan' })).toBe('plan');
      expect(getActiveModule({ ...mockScenario, modeling_type: 'appraisal', revenue_carrier: 'cohort' })).toBe('cohort');
    });
  });

  describe('buildPerspectiveVariant', () => {
    it('should correctly build variant for cohort', () => {
      const variant = buildPerspectiveVariant(mockScenario, 'cohort');
      expect(variant.modeling_type).toBe('incremental');
      expect(variant.revenue_carrier).toBe('cohort');
      expect(variant.revenue_bridge).toBeNull();
      expect(variant.plans?.[0].seats).toBe(0);
      expect(variant.services?.[0].monetization?.monetization_type).toBe('none'); // copilot monetization is stripped
    });

    it('should correctly build variant for plan', () => {
      const variant = buildPerspectiveVariant(mockScenario, 'plan');
      expect(variant.modeling_type).toBe('gtm');
      expect(variant.revenue_carrier).toBe('plan');
    });

    it('should correctly build variant for monetization', () => {
      const variant = buildPerspectiveVariant(mockScenario, 'monetization');
      expect(variant.modeling_type).toBe('appraisal');
      expect(variant.revenue_carrier).toBe('feature');
    });
  });

  describe('calculateRevenuePv', () => {
    it('should compute discounted sum of timeline revenues', () => {
      const timeline = [
        { revenue: 100 },
        { revenue: 200 },
        { revenue: 300 }
      ];
      const rate = 0.12;
      const pv = calculateRevenuePv(timeline, rate);
      // r_monthly = (1 + 0.12)^(1/12) - 1 ≈ 0.0094888
      // t=0: 100 / 1.0094888^0 = 100
      // t=1: 200 / 1.0094888^1 = 198.12
      // t=2: 300 / 1.0094888^2 = 294.39
      // sum ≈ 592.51
      expect(pv).toBeCloseTo(592.51, 1);
    });
  });

  describe('computePerspectives', () => {
    it('should run triangulation on all configured perspectives', () => {
      const triangulation = computePerspectives(mockScenario, mockProviders, mockCreditSettings);
      expect(triangulation.activeModule).toBe('monetization');
      expect(triangulation.perspectives.length).toBe(4);

      const cohortRes = triangulation.perspectives.find(p => p.module === 'cohort');
      expect(cohortRes?.filled).toBe(true);

      const planRes = triangulation.perspectives.find(p => p.module === 'plan');
      expect(planRes?.filled).toBe(true);

      const monetizationRes = triangulation.perspectives.find(p => p.module === 'monetization');
      expect(monetizationRes?.filled).toBe(true);
      expect(monetizationRes?.isActive).toBe(true);
    });
  });
});

describe('Cross-perspective invariants (ADR 0013)', () => {
  const provider: Provider = {
    id: 'p1', name: 'OpenAI', model_name: 'gpt-4', input_price: 5.0, output_price: 15.0,
    is_predefined: true, currency: 'USD',
    input_tokens_per_credit: 1000000, output_tokens_per_credit: 333333, updated_at: ''
  };

  const creditSettings: CreditSettings = {
    defaultPricePerCredit: 0.01,
    defaultOverchargeMarkup: 0.2,
    defaultOverchargeUserPct: 0.1,
    defaultAvgOverchargePct: 0.2,
    defaultInputTokensPerCredit: 100000,
    defaultOutputTokensPerCredit: 100000
  };

  // Static cohort (no churn/acquisition growth) so activeAiUsers — and therefore token costs —
  // is identical across every perspective variant regardless of which module carries revenue.
  const cohort: any = {
    id: 'c1', name: 'Cohort', current_users: 1000, monthly_acquisition: 0,
    acquisition_growth_rate: 0, monthly_churn_rate: 0, retention_floor: 1,
    monthly_expansion_rate: 0, ai_adoption_rate: 0.3, base_arpu: 100, arpu_uplift: 10
  };

  const copilotService: any = {
    id: 's1', name: 'Copilot Assist', status: 'planned', provider_id: 'p1', service_type: 'copilot',
    avg_input_tokens: 2000, avg_output_tokens: 1000, avg_requests_per_user_month: 10,
    fixed_cost_per_month: 0, rollout_month: 0,
    monetization: { monetization_type: 'addon', addon_monthly_fee: 5 }
  };

  const plan: any = { id: 'pl1', name: 'Pro Plan', base_price: 20, rollout_month: 0, seats: 50 };

  const baseScenario: Scenario = {
    id: 'sc-tri', name: 'Triangulation Fixture', projection_months: 12, discount_rate: 0.10,
    scope_type: 'cohorts', modeling_type: 'appraisal', revenue_carrier: 'feature',
    scope_cohorts: [cohort], services: [copilotService], plans: [plan], costs: []
  };

  it('produces identical monthly totalCosts across cohort, plan, and monetization variants (chassis cost identity)', () => {
    const cohortResult = calculateScenario(buildPerspectiveVariant(baseScenario, 'cohort'), [provider], creditSettings);
    const planResult = calculateScenario(buildPerspectiveVariant(baseScenario, 'plan'), [provider], creditSettings);
    const monetizationResult = calculateScenario(buildPerspectiveVariant(baseScenario, 'monetization'), [provider], creditSettings);

    expect(cohortResult.timeline.length).toBe(planResult.timeline.length);
    expect(cohortResult.timeline.length).toBe(monetizationResult.timeline.length);
    for (let t = 0; t < cohortResult.timeline.length; t++) {
      expect(planResult.timeline[t].totalCosts).toBeCloseTo(cohortResult.timeline[t].totalCosts, 2);
      expect(monetizationResult.timeline[t].totalCosts).toBeCloseTo(cohortResult.timeline[t].totalCosts, 2);
    }
  });

  it('keeps ΔNPV equal to Δ(revenue PV) between perspectives, per the cost-identity proof', () => {
    const triangulation = computePerspectives(baseScenario, [provider], creditSettings);
    expect(triangulation.deltas.length).toBeGreaterThan(0);
    for (const delta of triangulation.deltas) {
      expect(Math.abs(delta.deltaNpvUpper - delta.deltaRevenuePv)).toBeLessThan(0.5);
    }
  });

  it('regression: cohort perspective books zero plan revenue even when the source scenario carries seats > 0', () => {
    const withSeatsVariant = buildPerspectiveVariant(baseScenario, 'cohort');
    const withoutPlanVariant = buildPerspectiveVariant({ ...baseScenario, plans: [] }, 'cohort');

    const resultWithSeats = calculateScenario(withSeatsVariant, [provider], creditSettings);
    const resultWithoutPlan = calculateScenario(withoutPlanVariant, [provider], creditSettings);

    expect(resultWithSeats.npvUpper).toBeCloseTo(resultWithoutPlan.npvUpper, 2);
    for (let t = 0; t < resultWithSeats.timeline.length; t++) {
      expect(resultWithSeats.timeline[t].revenue).toBeCloseTo(resultWithoutPlan.timeline[t].revenue, 2);
    }
  });

  it('keeps agent-archetype monetization intact in the cohort variant while stripping copilot monetization (ADR 0009 disjoint stream)', () => {
    const agentService: any = {
      id: 's2', name: 'Agent Resolver', status: 'planned', provider_id: 'p1', service_type: 'agent',
      avg_input_tokens: 0, avg_output_tokens: 0, avg_requests_per_user_month: 0,
      fixed_cost_per_month: 0, rollout_month: 0,
      monetization: { monetization_type: 'outcome', outcome_basis: 'per_ticket', price_per_outcome: 2, outcomes_per_user_month: 5 }
    };
    const scenarioWithAgent: Scenario = { ...baseScenario, services: [copilotService, agentService] };

    const variant = buildPerspectiveVariant(scenarioWithAgent, 'cohort');
    const copilotInVariant = variant.services!.find(s => s.id === 's1')!;
    const agentInVariant = variant.services!.find(s => s.id === 's2')!;

    expect((copilotInVariant as any).monetization?.monetization_type).toBe('none');
    expect((agentInVariant as any).monetization?.monetization_type).toBe('outcome');
  });
});

describe('Pool perspective integrity (ADR 0013 × ADR 0010/0012)', () => {
  const provider: Provider = {
    id: 'p1', name: 'OpenAI', model_name: 'gpt-4', input_price: 5.0, output_price: 15.0,
    is_predefined: true, currency: 'USD',
    input_tokens_per_credit: 1000000, output_tokens_per_credit: 333333, updated_at: ''
  };

  const creditSettings: CreditSettings = {
    defaultPricePerCredit: 0.01,
    defaultOverchargeMarkup: 0.2,
    defaultOverchargeUserPct: 0.1,
    defaultAvgOverchargePct: 0.2,
    defaultInputTokensPerCredit: 100000,
    defaultOutputTokensPerCredit: 100000
  };

  it('reports block status (not silent zeroing) when pool member services have mismatched billing models', () => {
    const cohort: any = {
      id: 'c1', name: 'Cohort', current_users: 1000, monthly_acquisition: 0,
      acquisition_growth_rate: 0, monthly_churn_rate: 0, retention_floor: 1,
      monthly_expansion_rate: 0, ai_adoption_rate: 0.3, base_arpu: 100, arpu_uplift: 10
    };
    const usageService: any = {
      id: 'sp1', name: 'Usage Pool Member', status: 'planned', provider_id: 'p1',
      avg_input_tokens: 500, avg_output_tokens: 200, avg_requests_per_user_month: 5,
      fixed_cost_per_month: 0, rollout_month: 0,
      monetization: { monetization_type: 'usage', usage_variant: 'payg', price_per_credit: 0.5 }
    };
    const hybridService: any = {
      id: 'sp2', name: 'Hybrid Pool Member', status: 'planned', provider_id: 'p1',
      avg_input_tokens: 500, avg_output_tokens: 200, avg_requests_per_user_month: 5,
      fixed_cost_per_month: 0, rollout_month: 0,
      monetization: { monetization_type: 'hybrid', hybrid_monthly_fee: 10, hybrid_included_credits: 20 }
    };
    const poolScenario: Scenario = {
      id: 'sc-pool', name: 'Pool Fixture', projection_months: 12, discount_rate: 0.10,
      scope_type: 'cohorts', modeling_type: 'appraisal', revenue_carrier: 'feature',
      scope_cohorts: [cohort], services: [usageService, hybridService], plans: [], costs: [],
      pool_tier_id: 'tier1',
      pool_burn_rates: [
        { service_id: 'sp1', burn_rate: 1 } as any,
        { service_id: 'sp2', burn_rate: 1 } as any
      ]
    };

    expect(isModuleFilled(poolScenario, 'pool')).toBe(true);

    const triangulation = computePerspectives(poolScenario, [provider], creditSettings);
    const poolResult = triangulation.perspectives.find(p => p.module === 'pool')!;

    expect(poolResult.filled).toBe(true);
    expect(poolResult.integrity.status).toBe('block');
    expect(poolResult.npvUpper).toBe(0);
  });
});

describe('Delta-anchored explanations (ADR 0013)', () => {
  const provider: Provider = {
    id: 'p1', name: 'OpenAI', model_name: 'gpt-4', input_price: 5.0, output_price: 15.0,
    is_predefined: true, currency: 'USD',
    input_tokens_per_credit: 1000000, output_tokens_per_credit: 333333, updated_at: ''
  };

  const creditSettings: CreditSettings = {
    defaultPricePerCredit: 0.01,
    defaultOverchargeMarkup: 0.2,
    defaultOverchargeUserPct: 0.1,
    defaultAvgOverchargePct: 0.2,
    defaultInputTokensPerCredit: 100000,
    defaultOutputTokensPerCredit: 100000
  };

  function makeScenario(cohortUplift: number, addonFee: number): Scenario {
    const cohort: any = {
      id: 'c1', name: 'Cohort', current_users: 1000, monthly_acquisition: 0,
      acquisition_growth_rate: 0, monthly_churn_rate: 0, retention_floor: 1,
      monthly_expansion_rate: 0, ai_adoption_rate: 0.5, base_arpu: 100, arpu_uplift: cohortUplift
    };
    const copilotService: any = {
      id: 's1', name: 'Copilot Assist', status: 'planned', provider_id: 'p1', service_type: 'copilot',
      avg_input_tokens: 0, avg_output_tokens: 0, avg_requests_per_user_month: 0,
      fixed_cost_per_month: 0, rollout_month: 0,
      monetization: { monetization_type: 'addon', addon_monthly_fee: addonFee }
    };
    return {
      id: 'sc-explain', name: 'Explanation Fixture', projection_months: 12, discount_rate: 0.10,
      scope_type: 'cohorts', modeling_type: 'incremental', revenue_carrier: 'cohort',
      scope_cohorts: [cohort], services: [copilotService], plans: [], costs: []
    };
  }

  it('flips comparison wording ("more" vs "less") when the delta sign flips, for the same module pair', () => {
    // Active perspective is always 'cohort' here (modeling_type: 'incremental').
    const monetizationWins = makeScenario(1, 200); // tiny cohort uplift, large add-on fee
    const cohortWins = makeScenario(80, 1); // large cohort uplift, tiny add-on fee

    const triWin = computePerspectives(monetizationWins, [provider], creditSettings);
    const triLose = computePerspectives(cohortWins, [provider], creditSettings);

    const deltaWin = triWin.deltas.find(d => d.toModule === 'monetization')!;
    const deltaLose = triLose.deltas.find(d => d.toModule === 'monetization')!;

    expect(deltaWin.deltaNpvUpper).toBeGreaterThan(0);
    expect(deltaWin.explanation).toContain('more NPV');
    expect(deltaWin.explanation).not.toContain('less NPV');

    expect(deltaLose.deltaNpvUpper).toBeLessThan(0);
    expect(deltaLose.explanation).toContain('less NPV');
    expect(deltaLose.explanation).not.toContain('more NPV');

    // Same module pair, opposite sentences — proves the wording is driven by the
    // delta, not just a static description of the target module.
    expect(deltaWin.explanation).not.toBe(deltaLose.explanation);
  });

  it('is worded in English (regression: sentences must not default to Polish)', () => {
    const scenario = makeScenario(1, 200);
    const text = generateExplanation('cohort', 'monetization', scenario, 36553);
    expect(text).not.toMatch(/Perspektywa|kohortow|planow|monetyzacj|puli kredytowej/i);
    expect(text).toContain('USE');
    expect(text).toContain('INC');
  });

  it('reports "about the same" for a near-zero delta instead of an arbitrary direction', () => {
    const text = generateExplanation('cohort', 'plan', {} as Scenario, 0.001);
    expect(text).toContain('about the same NPV');
  });
});

describe('Active perspective always computed (ADR 0013 — unfilled active module)', () => {
  const provider: Provider = {
    id: 'p1', name: 'OpenAI', model_name: 'gpt-4', input_price: 5.0, output_price: 15.0,
    is_predefined: true, currency: 'USD',
    input_tokens_per_credit: 1000000, output_tokens_per_credit: 333333, updated_at: ''
  };

  const creditSettings: CreditSettings = {
    defaultPricePerCredit: 0.01,
    defaultOverchargeMarkup: 0.2,
    defaultOverchargeUserPct: 0.1,
    defaultAvgOverchargePct: 0.2,
    defaultInputTokensPerCredit: 100000,
    defaultOutputTokensPerCredit: 100000
  };

  // Reproduction of the reported inconsistency: a (gtm, plan) scenario with
  // 0 seats and a monetized service showed headline KPIs (the plan carrier
  // books monetization) while the panel's "Active Carrier" row showed dashes,
  // because the active module was gated on isModuleFilled (seats > 0).
  it('computes the active plan perspective at 0 seats and anchors deltas on it', () => {
    const cohort: any = {
      id: 'c1', name: 'Cohort', current_users: 1000, monthly_acquisition: 0,
      acquisition_growth_rate: 0, monthly_churn_rate: 0, retention_floor: 1,
      monthly_expansion_rate: 0, ai_adoption_rate: 0.5, base_arpu: 100, arpu_uplift: 10
    };
    const copilotService: any = {
      id: 's1', name: 'Copilot', status: 'planned', provider_id: 'p1', service_type: 'copilot',
      avg_input_tokens: 0, avg_output_tokens: 0, avg_requests_per_user_month: 0,
      fixed_cost_per_month: 0, rollout_month: 0,
      monetization: { monetization_type: 'addon', addon_monthly_fee: 20 }
    };
    const scenario: Scenario = {
      id: 'sc-active-unfilled', name: 'GTM Zero Seats', projection_months: 12, discount_rate: 0.10,
      scope_type: 'cohorts', modeling_type: 'gtm', revenue_carrier: 'plan',
      scope_cohorts: [cohort], services: [copilotService],
      plans: [{ id: 'pl1', name: 'Pro', rollout_month: 0, base_price: 50, seats: 0 }],
      costs: []
    };

    const tri = computePerspectives(scenario, [provider], creditSettings);
    const active = tri.perspectives.find(p => p.module === 'plan')!;
    expect(active.isActive).toBe(true);
    expect(active.filled).toBe(false); // seats = 0 — module data not filled...
    expect(active.npvUpper).toBeGreaterThan(0); // ...but the carrier still books monetization

    // With a $0 subscription component the plan carrier ≡ the feature carrier.
    const use = tri.perspectives.find(p => p.module === 'monetization')!;
    expect(active.npvUpper).toBeCloseTo(use.npvUpper, 2);
    expect(active.revenuePv).toBeCloseTo(use.revenuePv, 2);

    // Deltas anchor on the active perspective even though it is unfilled.
    const useDelta = tri.deltas.find(d => d.toModule === 'monetization')!;
    expect(Math.abs(useDelta.deltaNpvUpper)).toBeLessThan(0.01);
    expect(useDelta.explanation).toContain('about the same NPV');
    expect(tri.deltas.find(d => d.toModule === 'cohort')).toBeTruthy();
  });
});

describe('classifyPerspectiveRelations (ADR 0014)', () => {
  it('correctly identifies additive and contained relations', () => {
    const scenario: Scenario = {
      id: 'sc1', name: 'S', scope_type: 'cohorts', projection_months: 12, discount_rate: 0.1,
      modeling_type: 'composite', revenue_carrier: 'composite', revenue_bridge: 'separate_market',
      arpu_uplift_includes_monetization: false,
      scope_cohorts: [{ id: 'c1', name: 'Cohort', current_users: 1000, monthly_acquisition: 0, monthly_churn_rate: 0, ai_adoption_rate: 0.5, base_arpu: 100, arpu_uplift: 10, acquisition_growth_rate: 0, retention_floor: 0, monthly_expansion_rate: 0 } as any],
      plans: [{ id: 'p1', name: 'Pro', rollout_month: 0, base_price: 50, seats: 100 }],
      services: [
        { id: 's1', name: 'Copilot', service_type: 'copilot', status: 'planned', avg_input_tokens: 0, avg_output_tokens: 0, avg_requests_per_user_month: 10, fixed_cost_per_month: 0, monetization: { monetization_type: 'addon', addon_monthly_fee: 10 }, rollout_month: 0 } as any
      ]
    };

    const rels = classifyPerspectiveRelations(scenario);
    
    // Cohort <-> Plan relation: separate market -> additive
    const cp = rels.find(r => r.moduleA === 'cohort' && r.moduleB === 'plan')!;
    expect(cp.kind).toBe('additive');
    expect(cp.incommensurable).toBe(true); // seats (100) vs impliedPop (1000 * 0.5 = 500) has mismatch
    
    // Cohort <-> Copilot relation: includes = false -> additive
    const cm = rels.find(r => r.moduleA === 'cohort' && r.moduleB === 'monetization')!;
    expect(cm.kind).toBe('additive');
  });

  it('agrees with resolveCompositeComponents when seats are configured but no bridge is selected', () => {
    // Regression guard: classifyPerspectiveRelations must never report a relation kind that
    // contradicts the Composite Revenue Breakdown table (resolveCompositeComponents) for the
    // same scenario — previously this case showed 'cross_check' here and 'blocked' there.
    const scenario: Scenario = {
      id: 'sc1', name: 'S', scope_type: 'cohorts', projection_months: 12, discount_rate: 0.1,
      modeling_type: 'composite', revenue_carrier: 'composite', revenue_bridge: null,
      scope_cohorts: [{ id: 'c1', name: 'Cohort', current_users: 1000, monthly_acquisition: 0, monthly_churn_rate: 0, ai_adoption_rate: 0.5, base_arpu: 100, arpu_uplift: 10, acquisition_growth_rate: 0, retention_floor: 0, monthly_expansion_rate: 0 } as any],
      plans: [{ id: 'p1', name: 'Pro', rollout_month: 0, base_price: 50, seats: 100 }],
      services: []
    };

    const rels = classifyPerspectiveRelations(scenario);
    const resComp = resolveCompositeComponents(scenario);

    expect(resComp.plan.role).toBe('blocked');
    const cp = rels.find(r => r.moduleA === 'cohort' && r.moduleB === 'plan')!;
    expect(cp).toBeTruthy();
    expect(cp.kind).toBe('blocked');
  });
});
