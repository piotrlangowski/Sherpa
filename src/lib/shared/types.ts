/**
 * Shared domain types for the Sherpa financial engine.
 * These types are used by both the main SvelteKit app and the MCP Server.
 */

export type Currency = 'USD' | 'EUR' | 'PLN' | 'GBP';
export type ExchangeRates = Record<Currency, number>;
export type ServiceStatus = 'existing' | 'planned';
export type DependencyType = 'requires' | 'enhanced_by' | 'replaces';
export type CostCategory = 'capex' | 'opex';
export type CostFrequency = 'one_time' | 'monthly' | 'yearly';
export type ScopeType = 'all_clients' | 'verticals' | 'cohorts';

// ============================================================
// AI Monetization Models
// ============================================================

/** Monetization model attached to a Service / Pack / Plan. */
export type MonetizationType = 'none' | 'addon' | 'usage' | 'hybrid' | 'outcome';
/** Usage-based billing variant. */
export type UsageVariant = 'prepaid' | 'payg';
/** Behaviour once a usage limit / credit pool is exhausted. */
export type OverchargePolicy = 'hard_stop' | 'credit_pack' | 'payg';
/** Where a scenario draws its revenue from.
 * @deprecated Use ModelingType + RevenueCarrier instead (ADR 0001–0004). */
export type RevenueSource = 'cohort' | 'monetization' | 'both';

// ============================================================
// Revenue Modeling (ADR 0001–0004)
// ============================================================

/** Business-centric modeling type chosen in Step 0 of the wizard. */
export type ModelingType = 'incremental' | 'gtm' | 'appraisal' | 'composite';
/** Exactly one entity level carries revenue; the rest are cost/context. */
export type RevenueCarrier = 'cohort' | 'plan' | 'pack' | 'feature' | 'pool' | 'composite';
/** When a plan-carrier scenario also references a cohort, how they relate. */
export type RevenueBridge = 'upsell_on_cohort' | 'separate_market';

export type RevenueIntegrityStatus = 'ok' | 'warn' | 'block';
export interface RevenueIntegrityResult {
  status: RevenueIntegrityStatus;
  severity: 'ok' | 'warn' | 'block';
  message: string | null;
}

/**
 * Monetization configuration shared by Service, Pack and Plan.
 * Persisted in the polymorphic `monetization_configs` table.
 * Monetary values (fees, price_per_credit) are expressed in the company base currency.
 */
export interface MonetizationConfig {
  monetization_type: MonetizationType;

  // Add-on (flat fee) fields
  addon_monthly_fee?: number | null;
  addon_has_usage_limit?: boolean;
  addon_usage_limit?: number | null;
  addon_overcharge_policy?: OverchargePolicy | null;

  // Usage-based (credits) fields
  usage_variant?: UsageVariant | null;
  price_per_credit?: number | null;

  // Hybrid fields
  hybrid_monthly_fee?: number | null;
  hybrid_included_credits?: number | null;
  hybrid_overcharge_policy?: OverchargePolicy | null;

  // Shared overcharge params
  overcharge_markup?: number | null;
  overcharge_user_pct?: number | null;
  avg_overcharge_pct?: number | null;

  // Outcome-based pricing fields
  outcome_basis?: 'deflected' | 'per_user' | 'interactions' | null;
  price_per_outcome?: number | null;
  outcomes_per_user_month?: number | null;

  // Resolver metadata (not persisted) — describes where an effective config was inherited from.
  inherited_from?: 'service' | 'pack' | 'plan' | null;
  inherited_from_name?: string | null;
  is_scenario_override?: boolean | null;
}

/** Global credit defaults passed into the pure engine. */
export interface CreditSettings {
  defaultPricePerCredit: number;
  defaultOverchargeMarkup: number;
  defaultOverchargeUserPct: number;
  defaultAvgOverchargePct: number;
  /** Fallback input token→credit ratio when the provider has none set. */
  defaultInputTokensPerCredit: number;
  /** Fallback output token→credit ratio when the provider has none set. */
  defaultOutputTokensPerCredit: number;
}

/** Breakdown of a single month's monetization revenue. */
export interface MonetizationRevenueResult {
  totalRevenue: number;
  addonRevenue: number;
  usageRevenue: number;
  hybridBaseRevenue: number;
  overchargeRevenue: number;
  outcomeRevenue: number;
}

export interface ClientBase {
  id: string;
  total_users: number;
  default_arpu: number;
  default_monthly_churn_rate: number;
  default_monthly_acquisition: number;
  default_acquisition_growth_rate: number;
  default_ai_adoption_rate: number;
  default_retention_floor: number;
  default_expansion_rate: number;
  default_arpu_uplift: number;
  default_arpu_uplift_percent: number;
  default_churn_reduction: number;
  default_acquisition_uplift: number;
  default_gross_margin?: number;
  default_adoption_ramp_months?: number;
  default_copilot_margin_threshold?: number;
  default_agent_margin_threshold?: number;
  updated_at: string;
}

export interface Settings {
  company_name: string;
  currency: Currency;
  default_discount_rate: number;
  setup_completed: boolean;
  projection_horizon_months: number;
  exchange_rates: ExchangeRates;
  exchange_rates_as_of: string;
  // Credit configuration (global defaults for AI monetization)
  default_price_per_credit: number;
  default_input_tokens_per_credit: number;
  default_output_tokens_per_credit: number;
  default_overcharge_markup: number;
  default_overcharge_user_pct: number;
  default_avg_overcharge_pct: number;
}

export interface Provider {
  id: string;
  name: string;
  model_name: string;
  input_price: number;
  output_price: number;
  is_predefined: boolean;
  currency: Currency;
  // How many input/output tokens of this model map to 1 sellable credit.
  input_tokens_per_credit: number;
  output_tokens_per_credit: number;
  updated_at: string;
}

export interface ServiceDependency {
  id: string;
  source_id: string;
  target_id: string;
  dependency_type: DependencyType;
  source_name?: string;
  target_name?: string;
}

export interface Service {
  id: string;
  name: string;
  description?: string;
  status: ServiceStatus;
  provider_id?: string | null;
  avg_input_tokens: number;
  avg_output_tokens: number;
  avg_requests_per_user_month: number;
  fixed_cost_per_month?: number | null;
  fixed_cost_currency?: Currency | null;
  created_at?: string;
  updated_at?: string;
  
  // Agent archetype fields
  service_type?: 'copilot' | 'agent';
  interaction_driver_type?: 'flat' | 'per_customer';
  monthly_volume?: number;
  volume_growth_rate?: number;
  interactions_per_customer_month?: number;
  fully_loaded_cost_per_fte_month?: number;
  productive_hours_per_fte_month?: number;
  average_handle_time_seconds?: number;
  baseline_fte?: number;
  staffing_realization_lag_months?: number;
  containment_rate?: number;
  containment_start_rate?: number;
  containment_ramp_months?: number;
  escalation_rate?: number;
  failed_deflection_penalty?: number;
  churn_rate_uplift?: number;

  // Relations
  provider?: Provider | null;
  dependencies?: ServiceDependency[];
  rollout_month?: number;

  // Monetization (catalog config, or the resolved effective config when attached by the engine)
  monetization?: MonetizationConfig;

  /** Economic value created per single outcome (e.g. per resolved ticket). Drives
   *  price_per_outcome = captureTargetPct * value_per_outcome (ADR 0007 Decision 4 / ADR 0009). */
  value_per_outcome?: number | null;
}

export interface Pack {
  id: string;
  name: string;
  description?: string;
  created_at?: string;
  updated_at?: string;

  services?: Service[];
  monetization?: MonetizationConfig;
}

export interface Plan {
  id: string;
  name: string;
  description?: string;
  base_price: number;
  created_at?: string;
  updated_at?: string;

  services?: Service[];
  packs?: Pack[];
  monetization?: MonetizationConfig;
}

export interface Vertical {
  id: string;
  name: string;
  description?: string;
  tam_users?: number;
  sam_users?: number;
  som_users?: number;
  created_at?: string;
  updated_at?: string;
  
  plans?: Plan[];
  packs?: Pack[];
}

export interface CostItem {
  id: string;
  name: string;
  category: CostCategory;
  subcategory?: string | null;
  amount: number;
  frequency: CostFrequency;
  currency: Currency;
  service_id?: string | null;
  created_at?: string;
  updated_at?: string;
  
  service_name?: string;
}

export interface CohortConfig {
  id: string;
  name: string;
  vertical_id?: string | null;
  current_users: number;
  monthly_acquisition: number;
  acquisition_growth_rate: number;
  monthly_churn_rate: number;
  retention_floor: number;
  monthly_expansion_rate: number;
  ai_adoption_rate: number;
  base_arpu: number;
  arpu_uplift?: number;
  arpu_uplift_percent?: number;
  churn_reduction?: number;
  acquisition_uplift?: number;
  gross_margin?: number;
  adoption_ramp_months?: number;
  usage_intensity?: number;
  created_at?: string;
  updated_at?: string;

  // EVC per-cohort multipliers (ADR 0011 Track A) — resolved at runtime by the
  // scope-override cascade (applyScopeOverrides), not persisted on cohort_configs.
  // Relative to the scenario's evc_reference_cohort_id; default 1.0 (no differentiation).
  evc_extra_value_multiplier?: number;
  evc_negative_value_multiplier?: number;
  evc_nba_multiplier?: number;

  vertical_name?: string;
}

export interface ScopeOverride {
  id: string;
  scenario_id: string;
  target_type: 'all_clients' | 'vertical' | 'cohort';
  target_id: string | null;
  monthly_churn_rate: number | null;
  monthly_acquisition: number | null;
  acquisition_growth_rate: number | null;
  ai_adoption_rate: number | null;
  retention_floor: number | null;
  expansion_rate: number | null;
  arpu_override: number | null;
  arpu_uplift?: number | null;
  arpu_uplift_percent?: number | null;
  churn_reduction?: number | null;
  acquisition_uplift?: number | null;
  gross_margin?: number | null;
  adoption_ramp_months?: number | null;
  usage_intensity?: number | null;

  // EVC per-cohort multipliers (ADR 0011 Track A) — relative to evc_reference_cohort_id.
  evc_extra_value_multiplier?: number | null;
  evc_negative_value_multiplier?: number | null;
  evc_nba_multiplier?: number | null;

  // Presentation-only fields loaded on demand
  target_name?: string;
  base_values?: {
    monthly_churn_rate: number | null;
    monthly_acquisition: number | null;
    acquisition_growth_rate: number | null;
    ai_adoption_rate: number | null;
    retention_floor: number | null;
    expansion_rate: number | null;
    arpu_override: number | null;
    arpu_uplift: number | null;
    arpu_uplift_percent: number | null;
    churn_reduction: number | null;
    acquisition_uplift: number | null;
    gross_margin: number | null;
    adoption_ramp_months: number | null;
    evc_extra_value_multiplier: number | null;
    evc_negative_value_multiplier: number | null;
    evc_nba_multiplier: number | null;
  } | null;
}

/** The catalog entities that support per-scenario financial overrides. */
export type EntityOverrideType = 'service' | 'cost' | 'provider' | 'plan';

/**
 * A per-scenario override of a catalog entity's financial parameters.
 * Persisted in the polymorphic `scenario_entity_overrides` table; only the
 * fields relevant to `entity_type` are populated (the rest stay null).
 * Mirrors the catalog-vs-scenario split used by `MonetizationConfig`.
 */
export interface EntityOverride {
  // service
  avg_input_tokens?: number | null;
  avg_output_tokens?: number | null;
  avg_requests_per_user_month?: number | null;
  fixed_cost_per_month?: number | null;
  monthly_volume?: number | null;
  interactions_per_customer_month?: number | null;
  containment_rate?: number | null;
  average_handle_time_seconds?: number | null;
  fully_loaded_cost_per_fte_month?: number | null;
  baseline_fte?: number | null;
  churn_rate_uplift?: number | null;
  // cost
  amount?: number | null;
  frequency?: CostFrequency | null;
  // provider
  input_price?: number | null;
  output_price?: number | null;
  // plan
  base_price?: number | null;
}

/** An EntityOverride tagged with the entity it applies to (used by the editor + export). */
export interface EntityOverrideRecord extends EntityOverride {
  entity_type: EntityOverrideType;
  entity_id: string;
  /**
   * Optional cohort scope (ADR 0009 Track B). `null`/absent = scenario-wide (applies to every
   * cohort, current behavior). When set, the override applies only to that cohort's consumption
   * of the entity within the scenario — resolved inside the engine, not pre-mutated onto the
   * shared entity list. Only meaningful for `entity_type: 'service'` (agent archetype fields).
   */
  cohort_id?: string | null;
}

/**
 * ADR 0010 (Approach B) — a credit-pool tier: monthly subscription fee + shared credit pool.
 * `capture` is a nullable per-tier override of the EVC capture rate used in the credit-value
 * hybrid and stream attribution; falls back to the scenario's evc_capture_target_pct when unset.
 */
/** How `monthly_fee` is charged (ADR 0012): once per tier, once per active AI user, or once per active customer. */
export type PoolFeeBasis = 'flat' | 'per_member' | 'per_customer';
export type PoolSizeBasis = 'absolute' | 'per_member';

export interface PoolTier {
  id: string;
  name: string;
  monthly_fee: number;
  credit_pool_size: number;
  capture?: number | null;
  /** ADR 0012 Decision 1 — 'flat' (default, unchanged) or 'per_member' (monthly_fee × active AI users) or 'per_customer'. */
  fee_basis?: PoolFeeBasis;
  /** ADR 0012 Decision 1 — 'absolute' (default) or 'per_member' (credit_pool_size × active AI users). */
  pool_size_basis?: PoolSizeBasis;
  created_at?: string;
  updated_at?: string;
}

/** Credits consumed per activity unit (interaction/request) for one service drawing on a pool tier. */
export interface PoolBurnRate {
  id: string;
  tier_id: string;
  service_id: string;
  burn_rate: number;
  service_name?: string;
}

/** How a pool tier's fee is split between the copilot and agent streams (ADR 0010 Decision 3). */
export interface PoolAttribution {
  copilotShare: number;
  agentShare: number;
  /** 'evc' when value_per_outcome was set on at least one pool service; otherwise even split or profile fallback. */
  method: 'evc' | 'even_split_fallback' | 'profile_fallback';
}

/** Scenario-level summary of a pool-carrier scenario's lifetime credit economics. */
export interface PoolEconomics {
  tierMonthlyFee: number;
  poolSize: number;
  totalConsumedCredits: number;
  /** Memo: value of unused credits, valued at the blended cost floor. No cash impact (Decision 2). */
  totalBreakage: number;
  totalOverageRevenue: number;
  totalTierFeeRevenue: number;
  feeBasis: PoolFeeBasis;
  poolSizeBasis: PoolSizeBasis;
  attribution: PoolAttribution;
}

export interface ExpansionConfig {
  expansion_vertical_id: string | null;
  penetration_baseline_months: number;
  ai_acceleration_factor: number;
  ai_som_lift_pct: number;
  tam_users?: number;
  sam_users?: number;
  som_users?: number;
}

export interface Scenario {
  id: string;
  name: string;
  description?: string;
  projection_months: number;
  discount_rate: number;
  scope_type: ScopeType;
  /** @deprecated Use modeling_type + revenue_carrier instead. */
  revenue_source?: RevenueSource;
  capex_contingency_pct?: number;

  // Revenue modeling (ADR 0001–0004)
  modeling_type?: ModelingType;
  revenue_carrier?: RevenueCarrier | null;
  revenue_bridge?: RevenueBridge | null;
  arpu_uplift_includes_monetization?: boolean;

  // Expansion modeling (Phase 3)
  expansion_vertical_id?: string | null;
  penetration_baseline_months?: number | null;
  ai_acceleration_factor?: number | null;
  ai_som_lift_pct?: number | null;
  expansion?: ExpansionConfig;

  // EVC inputs
  evc_nba_annual_value?: number | null;
  evc_extra_positive_value?: number | null;
  evc_negative_value?: number | null;
  evc_capture_ceiling_pct?: number | null;
  evc_capture_target_pct?: number | null;
  evc_capture_floor_pct?: number | null;
  price_from_evc?: boolean;
  adoption_elasticity?: number;
  /**
   * Per-cohort EVC multipliers (ADR 0011 Track A) are expressed relative to this cohort's id.
   * `null`/unset preserves the flat scenario-scalar EVC ceiling/target/floor (fully backward
   * compatible) — see `buildPricingCorridor`.
   */
  evc_reference_cohort_id?: string | null;

  // Per-stream margin thresholds (ADR 0009) — nullable scenario override; the DB-aware
  // layer cascades the client_base global default in before reaching the pure engine.
  copilot_margin_threshold?: number | null;
  agent_margin_threshold?: number | null;

  // Credit pool (ADR 0010, carrier 'pool') — a pool scenario selects one tier; the DB-aware
  // layer resolves the tier + its burn-rate table onto the runtime scenario for the pure engine.
  pool_tier_id?: string | null;
  pool_tier?: PoolTier;
  pool_burn_rates?: PoolBurnRate[];

  created_at?: string;
  updated_at?: string;

  scope_verticals?: Vertical[];
  scope_cohorts?: CohortConfig[];
  scope_overrides?: ScopeOverride[];
  services?: Array<Service & { rollout_month: number }>;
  packs?: Array<{ id: string; name: string; rollout_month: number }>;
  plans?: Array<{ id: string; name: string; rollout_month: number; base_price?: number; seats?: number }>;
  costs?: CostItem[];
  /**
   * Cohort-scoped entity overrides (ADR 0009 Track B), keyed `"${entity_type}:${entity_id}:${cohort_id}"`.
   * Populated by the DB-aware layer (financial-engine.ts / MCP getFullScenario) from
   * `scenario_entity_overrides` rows that carry a `cohort_id`; resolved inside the pure engine's
   * agent `per_customer` branch (scenario-wide, `cohort_id IS NULL`, rows are still pre-mutated
   * onto `services` as before). `null`/absent = no cohort-scoped overrides (unchanged behavior).
   */
  cohort_entity_overrides?: Record<string, EntityOverride> | null;
  results?: {
    payback_months: number | null;
    npv: number;
    irr_annual: number | null;
    tco: number;
    profitability_index: number;
    payback_months_lower?: number | null;
    npv_lower?: number;
    profitability_index_lower?: number;
    irr_monthly?: number | null;
    irr_annual_nominal?: number | null;
    irr_status?: string;
  };
}

export interface EvcInputs {
  nbaAnnualValue: number;
  extraPositiveValue: number;
  negativeValue: number;
  captureCeilingPct: number;
  captureTargetPct: number;
  captureFloorPct: number;
  unitLaborSavingsAnnual: number;
  /** Weighted-average gross margin across cohorts (default 1.0). Used for vendor profit in Value Split. */
  grossMargin?: number;
}

export interface PricingCorridorPoint {
  cohortId: string;
  cohortName: string;
  adoptionRate: number;
  grossMargin: number;
  cogs: number;
  floorTarget: number;
  ceiling: number;
  status: 'loss' | 'below_margin' | 'healthy' | 'over_ceiling';
  targetPrice?: number;
  floorPrice?: number;
  valueFromOutcomes?: number;
  /** True when this point is the scenario's evc_reference_cohort_id (ADR 0011 Track A). */
  isReference?: boolean;
  pricePerCustomer?: number;
  priceBasis: 'cohort' | 'blended';
}

export interface PricingCorridorResult {
  points: PricingCorridorPoint[];
  actualPrice: number;
  blendedMediumCogs: number;
  blendedMediumFloorTarget: number;
  hasBreak: boolean;
}

/** Per-cohort suggested EVC multiplier defaults (ADR 0011 Track A), vs. the reference cohort. */
export interface EvcMultiplierSuggestion {
  cohortId: string;
  cohortName: string;
  suggestedExtraValueMultiplier: number;
  arpuRatio: number;
  intensityRatio: number;
}

/**
 * Agent-archetype analogue of the Pricing Corridor (ADR 0009 Track B): displaced-labor
 * cost-to-serve vs. avoided-cost value, per cohort, instead of a willingness-to-pay ceiling.
 */
export interface AgentDeflectionCorridorPoint {
  cohortId: string;
  cohortName: string;
  interactions: number; // interactions/customer/month, steady-state
  containmentRate: number;
  costToServe: number; // AI COGS + fixedCostAlloc + failed-deflection cost, per customer/month
  avoidedValue: number; // gross FTE-equivalent labor value avoided, per customer/month
  realizableAvoidedValue: number;
  realizationRatio: number;
  netDeflectionValue: number; // avoidedValue - costToServe
  costDecomposition: {
    tokens: number;
    fixedAlloc: number;
    failedDeflection: number;
  };
  status: 'loss' | 'below_margin' | 'healthy';
}

export interface AgentDeflectionCorridorResult {
  points: AgentDeflectionCorridorPoint[];
  blendedCostToServe: number;
  blendedAvoidedValue: number;
  blendedRealizableAvoidedValue: number;
  hasBreak: boolean;
}

export interface PocketMarginWaterfallStep {
  name: string;
  value: number;
  type: 'base' | 'delta' | 'total';
}

export interface PocketMarginWaterfallResult {
  steps: PocketMarginWaterfallStep[];
  actualPrice: number;
  pocketMargin: number;
  reconciliationError: number;
}

export interface EvcResult {
  evc: number;
  referenceValue: number;
  positiveValueTotal: number;
  negativeValueTotal: number;
  netCreatedValue: number;
  priceFloor: number;
  priceTarget: number;
  priceCeiling: number;
  laborSavings: number;
  extraPositiveValue: number;
  unitNetValue: number;
  targetCapturePerUserMonth: number;
  customerSurplusPerUserMonth: number;
  vendorGrossProfitPerUserMonth: number;
  cogsPerUserMonth: number;
  captureCurve?: CaptureCurveResult;
  pricingCorridor?: PricingCorridorResult;
  pocketMarginWaterfall?: PocketMarginWaterfallResult;
}

export interface CaptureCurvePoint {
  capture: number;
  npvUpper: number;
  npvLower: number;
  customerSurplus: number;
  vendorProfit: number;
}

export interface CaptureCurveResult {
  points: CaptureCurvePoint[];
  optimalCapture: number;
  optimalOverlayPrice: number;
  epsilonBand: {
    low: number;
    base: number;
    high: number;
  };
}

export interface CompositeComponentBreakdown {
  role: 'books' | 'folded' | 'pool_billed' | 'blocked' | 'empty';
  revenuePv: number;
  memoValue?: number;
  reason: string;
}

export type CompositeBreakdown = Record<string, CompositeComponentBreakdown>;

export interface ScenarioResult {
  id: string;
  scenario_id: string;
  payback_months: number | null;
  npv: number;
  irr_annual: number | null;
  tco: number;
  profitability_index: number;
  monthly_cashflows: number[];
  monthly_mrr: number[];
  monthly_customers: number[];
  calculated_at: string;
  payback_months_lower?: number | null;
  npv_lower?: number;
  profitability_index_lower?: number;
  irr_monthly?: number | null;
  irr_annual_nominal?: number | null;
  irr_status?: string;

  // Revenue integrity (ADR 0004)
  revenue_integrity_status?: RevenueIntegrityStatus | null;
  revenue_integrity_message?: string | null;

  // EVC results
  evc?: EvcResult | null;
  evc_price_floor?: number | null;
  evc_price_target?: number | null;
  evc_price_ceiling?: number | null;

  // Per-archetype stream results (ADR 0009)
  driver_profile?: DriverProfile | null;
  stream_margins?: StreamMargins | null;

  // Credit pool results (ADR 0010)
  pool_economics?: PoolEconomics | null;

  // Agent Cost-to-Serve / Deflection Value corridor (ADR 0009 Track B)
  agent_deflection_corridor?: AgentDeflectionCorridorResult | null;
  composite_breakdown?: CompositeBreakdown | null;
}

export interface CohortTimelineResult {
  month: number;
  activeCustomers: number;
  activeAiUsers: number;
  mrr: number;
  arr: number;
  newUsersAcquired: number;
}

export interface CohortModelResult {
  timeline: CohortTimelineResult[];
  totalRevenue: number;
  endingMrr: number;
  endingCustomers: number;
}

export interface MonthlyBreakdown {
  month: number;
  revenue: number; // ΔRevenue
  customers: number; // active customers (with AI)
  aiUsers: number;
  aiUsersWeighted?: number; // AI users weighted by per-cohort usage_intensity (ADR 0011); intensity-free base unit cost = tokenCosts / aiUsersWeighted
  opex: number;
  capex: number;
  tokenCosts: number;
  totalCosts: number;
  netCashFlow: number;
  cumulativeCashFlow: number;
  cumulativeCashFlowLower?: number; // lower bound: ARPU-uplift-only attribution
  tokenCostsLower?: number;
  totalCostsLower?: number;
  grossRevenue: number; // MRR with AI
  baselineRevenue: number; // MRR baseline
  baselineCustomers: number; // baseline customers
  // AI monetization revenue breakdown (zero unless revenue_source includes monetization)
  monetizationRevenue: number;
  addonRevenue: number;
  usageRevenue: number;
  hybridBaseRevenue: number;
  overchargeRevenue: number;
  outcomeRevenue: number;

  // Agent archetype fields
  totalInteractions?: number;
  deflectedInteractions?: number;
  laborSavingsCash?: number;
  laborSavingsCapacity?: number; // memo
  failedDeflectionCost?: number;
  agentTokenCosts?: number;

  // Per-stream revenue/COGS (ADR 0009) — disjoint copilot (seat) vs agent (interaction) streams,
  // on top of the cohort/plan seat economy already captured in `revenue`/`tokenCosts`.
  copilotRevenue?: number;
  copilotCogs?: number;
  copilotTokenCosts?: number;
  agentRevenue?: number;
  agentCogs?: number;

  // Credit pool (ADR 0010) — memo only, no cash impact (Decision 2).
  poolBreakage?: number;
  poolTierFeeRevenue?: number;
  poolOverageRevenue?: number;
}

export type IrrStatus = 'ok' | 'unstable_short_payback' | 'ambiguous_multiple_roots' | 'undefined_no_sign_change' | 'non_converged' | 'blocked_by_integrity';

export interface IrrResult {
  monthly: number | null;
  annualNominal: number | null;
  status: IrrStatus;
  displayable: boolean;
}

/** Service-type mix for a scenario (ADR 0009): which archetype(s) actually carry value. */
export type DriverProfile = 'seat_only' | 'interaction_only' | 'mixed';

/** Blended + per-stream gross margin, compared against soft (warn-only) thresholds. */
export interface StreamMargins {
  /** Copilot-stream margin, or null when the scenario has no copilot revenue. */
  copilot: number | null;
  /** Agent-stream margin, or null when the scenario has no agent revenue. */
  agent: number | null;
  blended: number;
  copilotThreshold: number;
  agentThreshold: number;
}

export interface CalculationResult {
  timeline: MonthlyBreakdown[];
  paybackUpper: number | null;
  paybackLower: number | null;
  npvUpper: number;
  npvLower: number;
  piUpper: number;
  piLower: number;
  irr: IrrResult;
  tco: number;
  evc?: EvcResult | null;
  driverProfile: DriverProfile;
  streamMargins: StreamMargins;
  poolEconomics?: PoolEconomics | null;
  /** Agent Cost-to-Serve / Deflection Value corridor (ADR 0009 Track B). */
  agentDeflectionCorridor?: AgentDeflectionCorridorResult | null;
  cohortPriceMap?: Map<string, number>;
  compositeBreakdown?: CompositeBreakdown;
}

export interface SensitivityParamResult {
  parameter: string;
  key: string;
  lowValueText: string;
  highValueText: string;
  lowNpv: number;
  highNpv: number;
  lowIrr: number | null;
  highIrr: number | null;
  lowPayback: number | null;
  highPayback: number | null;
  impactRange: number;
}

export interface SensitivityAnalysisResult {
  scenarioId: string;
  baseNpv: number;
  baseIrr: number | null;
  basePayback: number | null;
  results: SensitivityParamResult[];
}

export type DiagnosticSeverity = 'info' | 'warn';

export interface ScenarioDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  title?: string;
  field?: string;
}

