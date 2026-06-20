import type { CohortConfig, Scenario, ScopeOverride, Service, Pack, Plan, CostItem, ServiceStatus, Currency, CostCategory, CostFrequency, ModelingType, RevenueCarrier, RevenueBridge } from './types.js';
import { applyScopeOverrides } from './financial-math.js';

/**
 * Resolves targeted cohorts on the client side based on selections.
 */
export function resolveScenarioCohortsClient(
  scopeType: 'all_clients' | 'verticals' | 'cohorts',
  allCohorts: CohortConfig[],
  selectedVerticals: Record<string, boolean>,
  selectedCohorts: Record<string, boolean>,
  overrides: ScopeOverride[]
): CohortConfig[] {
  let resolved: CohortConfig[] = [];

  if (scopeType === 'all_clients') {
    resolved = allCohorts;
  } else if (scopeType === 'verticals') {
    const activeVerticalIds = Object.keys(selectedVerticals).filter(id => selectedVerticals[id]);
    resolved = allCohorts.filter(c => c.vertical_id && activeVerticalIds.includes(c.vertical_id));
  } else if (scopeType === 'cohorts') {
    const activeCohortIds = Object.keys(selectedCohorts).filter(id => selectedCohorts[id]);
    resolved = allCohorts.filter(c => activeCohortIds.includes(c.id));
  }

  return applyScopeOverrides(resolved, overrides);
}

interface DraftFormState {
  name: string;
  description: string;
  projectionMonths: number;
  discountRate: number;
  scopeType: 'all_clients' | 'verticals' | 'cohorts';
  capexContingencyPct?: number;
  modelingType?: ModelingType;
  revenueCarrier?: RevenueCarrier | null;
  revenueBridge?: RevenueBridge | null;
}


/**
 * Maps wizard form states into a Scenario object structure.
 */
export function buildDraftScenario(
  formState: DraftFormState,
  resolvedCohorts: CohortConfig[],
  overrides: ScopeOverride[],
  selectedServices: Record<string, boolean>,
  rolloutServices: Record<string, number>,
  selectedPacks: Record<string, boolean>,
  rolloutPacks: Record<string, number>,
  selectedPlans: Record<string, boolean>,
  rolloutPlans: Record<string, number>,
  selectedCosts: Record<string, boolean>,
  allServices: Service[],
  allPacks: Pack[],
  allPlans: Plan[],
  allCosts: CostItem[]
): Omit<Scenario, 'created_at' | 'updated_at'> {
  const services = Object.keys(selectedServices)
    .filter(id => selectedServices[id])
    .map(id => {
      const s = allServices.find(srv => srv.id === id);
      return {
        ...(s || {
          id,
          name: '',
          status: 'existing' as ServiceStatus,
          provider_id: null,
          avg_input_tokens: 0,
          avg_output_tokens: 0,
          avg_requests_per_user_month: 0,
          fixed_cost_per_month: 0,
          fixed_cost_currency: 'USD' as Currency
        }),
        rollout_month: rolloutServices[id] || 0
      };
    });

  const packs = Object.keys(selectedPacks)
    .filter(id => selectedPacks[id])
    .map(id => {
      const p = allPacks.find(pck => pck.id === id);
      return {
        ...(p || { id, name: '' }),
        rollout_month: rolloutPacks[id] || 0
      };
    });

  const plans = Object.keys(selectedPlans)
    .filter(id => selectedPlans[id])
    .map(id => {
      const pl = allPlans.find(p => p.id === id);
      return {
        ...(pl || { id, name: '', base_price: 0, billing_frequency: 'monthly', features: '' }),
        rollout_month: rolloutPlans[id] || 0
      };
    });

  const costs = Object.keys(selectedCosts)
    .filter(id => selectedCosts[id])
    .map(id => {
      const c = allCosts.find(cst => cst.id === id);
      return c || {
        id,
        name: '',
        category: 'opex' as CostCategory,
        amount: 0,
        frequency: 'monthly' as CostFrequency,
        currency: 'USD' as Currency,
        created_at: '',
        updated_at: ''
      };
    });

  return {
    id: 'draft',
    name: formState.name,
    description: formState.description,
    projection_months: formState.projectionMonths,
    discount_rate: formState.discountRate,
    scope_type: formState.scopeType,
    capex_contingency_pct: formState.capexContingencyPct ?? 0,
    modeling_type: formState.modelingType || 'appraisal',
    revenue_carrier: formState.revenueCarrier || null,
    revenue_bridge: formState.revenueBridge || null,
    scope_cohorts: resolvedCohorts,
    scope_overrides: overrides,
    services,
    packs,
    plans,
    costs
  };
}
