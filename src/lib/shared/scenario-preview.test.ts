import { describe, it, expect } from 'vitest';
import { resolveScenarioCohortsClient, buildDraftScenario } from './scenario-preview.js';
import type { CohortConfig, Service, ScopeOverride, ServiceStatus } from './types.js';

describe('Scenario Preview Utility Tests', () => {
  const cohorts: CohortConfig[] = [
    { id: 'c1', name: 'Cohort 1', vertical_id: 'v1', current_users: 100, monthly_acquisition: 10, acquisition_growth_rate: 0, monthly_churn_rate: 0.05, retention_floor: 0.5, monthly_expansion_rate: 0.02, ai_adoption_rate: 0.3, base_arpu: 100 },
    { id: 'c2', name: 'Cohort 2', vertical_id: 'v1', current_users: 200, monthly_acquisition: 20, acquisition_growth_rate: 0, monthly_churn_rate: 0.05, retention_floor: 0.5, monthly_expansion_rate: 0.02, ai_adoption_rate: 0.3, base_arpu: 100 },
    { id: 'c3', name: 'Cohort 3', vertical_id: 'v2', current_users: 300, monthly_acquisition: 30, acquisition_growth_rate: 0, monthly_churn_rate: 0.05, retention_floor: 0.5, monthly_expansion_rate: 0.02, ai_adoption_rate: 0.3, base_arpu: 100 }
  ];

  const overrides: ScopeOverride[] = [
    { id: 'o1', scenario_id: 'sc1', target_type: 'all_clients', target_id: 'all', monthly_churn_rate: 0.1, monthly_acquisition: null, acquisition_growth_rate: null, ai_adoption_rate: null, retention_floor: null, expansion_rate: null, arpu_override: null }
  ];

  it('resolveScenarioCohortsClient: all_clients scope', () => {
    const res = resolveScenarioCohortsClient('all_clients', cohorts, {}, overrides);
    expect(res.length).toBe(3);
    expect(res[0].monthly_churn_rate).toBe(0.1); // overridden
  });

  it('resolveScenarioCohortsClient: cohorts scope', () => {
    const res = resolveScenarioCohortsClient('cohorts', cohorts, { c1: true, c3: true }, []);
    expect(res.length).toBe(2);
    expect(res.map(c => c.id)).toContain('c1');
    expect(res.map(c => c.id)).toContain('c3');
    expect(res.map(c => c.id)).not.toContain('c2');
  });

  it('buildDraftScenario: maps selection correctly', () => {
    const formState = {
      name: 'Draft Scenario',
      description: 'A test draft',
      projectionMonths: 36,
      discountRate: 0.1,
      scopeType: 'cohorts' as const
    };

    const allServices: Service[] = [
      { id: 's1', name: 'Service 1', status: 'existing' as ServiceStatus, provider_id: 'p1', avg_input_tokens: 10, avg_output_tokens: 20, avg_requests_per_user_month: 5, fixed_cost_per_month: 100, fixed_cost_currency: 'USD' }
    ];

    const draft = buildDraftScenario(
      formState,
      cohorts,
      overrides,
      { s1: true },
      { s1: 3 },
      {},
      {},
      {},
      {},
      {},
      allServices,
      [],
      [],
      []
    );

    expect(draft.name).toBe('Draft Scenario');
    expect(draft.services!.length).toBe(1);
    expect(draft.services![0].id).toBe('s1');
    expect((draft.services![0] as any).rollout_month).toBe(3);
  });
});
