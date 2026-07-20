import type { CohortConfig, Scenario, ScopeOverride, Service, Pack, Plan, CostItem, ServiceStatus, Currency, CostCategory, CostFrequency, ModelingType, RevenueCarrier, RevenueBridge, ExpansionConfig, MonetizationConfig, PoolTier, PoolBurnRate } from './types.js';
import { applyScopeOverrides } from './financial-math.js';

/**
 * Resolves targeted cohorts on the client side based on selections.
 */
export function resolveScenarioCohortsClient(
  scopeType: 'all_clients' | 'cohorts',
  allCohorts: CohortConfig[],
  selectedCohorts: Record<string, boolean>,
  overrides: ScopeOverride[]
): CohortConfig[] {
  let resolved: CohortConfig[] = [];

  if (scopeType === 'all_clients') {
    resolved = allCohorts;
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
  scopeType: 'all_clients' | 'cohorts';
  capexContingencyPct?: number;
  modelingType?: ModelingType;
  revenueCarrier?: RevenueCarrier | null;
  revenueBridge?: RevenueBridge | null;
  expansion_vertical_id?: string | null;
  penetration_baseline_months?: number;
  ai_acceleration_factor?: number;
  ai_som_lift_pct?: number;
  evc_nba_annual_value?: number | null;
  evc_extra_positive_value?: number | null;
  evc_negative_value?: number | null;
  evc_capture_ceiling_pct?: number | null;
  evc_capture_target_pct?: number | null;
  evc_capture_floor_pct?: number | null;
  price_from_evc?: boolean;
  adoption_elasticity?: number;
  arpu_uplift_includes_monetization?: boolean;
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
  allCosts: CostItem[],
  expansionVertical?: { tam_users?: number; sam_users?: number; som_users?: number },
  seatsPlans?: Record<string, number>,
  // Effective monetization per entity key (`service:{id}` / `pack:{id}` / `plan:{id}`) — catalog
  // merged with scenario/buffered overrides. Only SERVICE-level configs are attached here:
  // pack/plan inheritance needs the pack_services/plan_services membership joins, which are not
  // shipped to the client. Those inherited configs appear once the scenario is saved.
  monetizationByEntity?: Record<string, MonetizationConfig | null>,
  poolTier?: (PoolTier & { burn_rates?: PoolBurnRate[] }) | null
): Omit<Scenario, 'created_at' | 'updated_at'> {
  const services = Object.keys(selectedServices)
    .filter(id => selectedServices[id])
    .map(id => {
      const s = allServices.find(srv => srv.id === id);
      const effectiveMon = monetizationByEntity?.[`service:${id}`];
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
        ...(effectiveMon && effectiveMon.monetization_type !== 'none' ? { monetization: effectiveMon } : {}),
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
        rollout_month: rolloutPlans[id] || 0,
        seats: seatsPlans?.[id] ?? 0
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

  const expansion: ExpansionConfig | undefined = formState.expansion_vertical_id ? {
    expansion_vertical_id: formState.expansion_vertical_id,
    penetration_baseline_months: formState.penetration_baseline_months ?? 0,
    ai_acceleration_factor: formState.ai_acceleration_factor ?? 1,
    ai_som_lift_pct: formState.ai_som_lift_pct ?? 0,
    tam_users: expansionVertical?.tam_users,
    sam_users: expansionVertical?.sam_users,
    som_users: expansionVertical?.som_users
  } : undefined;

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
    expansion_vertical_id: formState.expansion_vertical_id || null,
    penetration_baseline_months: formState.penetration_baseline_months ?? null,
    ai_acceleration_factor: formState.ai_acceleration_factor ?? null,
    ai_som_lift_pct: formState.ai_som_lift_pct ?? null,
    evc_nba_annual_value: formState.evc_nba_annual_value ?? null,
    evc_extra_positive_value: formState.evc_extra_positive_value ?? null,
    evc_negative_value: formState.evc_negative_value ?? null,
    evc_capture_ceiling_pct: formState.evc_capture_ceiling_pct ?? null,
    evc_capture_target_pct: formState.evc_capture_target_pct ?? null,
    evc_capture_floor_pct: formState.evc_capture_floor_pct ?? null,
    price_from_evc: formState.price_from_evc ?? false,
    adoption_elasticity: formState.adoption_elasticity ?? 0,
    arpu_uplift_includes_monetization: formState.arpu_uplift_includes_monetization ?? true,
    pool_tier_id: poolTier?.id ?? null,
    pool_tier: poolTier ?? undefined,
    pool_burn_rates: poolTier?.burn_rates ?? [],
    expansion,
    scope_cohorts: resolvedCohorts,
    scope_overrides: overrides,
    services,
    packs,
    plans,
    costs
  };
}
