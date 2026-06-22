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
export type MonetizationType = 'none' | 'addon' | 'usage' | 'hybrid';
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
export type ModelingType = 'incremental' | 'gtm' | 'appraisal';
/** Exactly one entity level carries revenue; the rest are cost/context. */
export type RevenueCarrier = 'cohort' | 'plan' | 'pack' | 'feature';
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
  created_at?: string;
  updated_at?: string;
  
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

  created_at?: string;
  updated_at?: string;

  scope_verticals?: Vertical[];
  scope_cohorts?: CohortConfig[];
  scope_overrides?: ScopeOverride[];
  services?: Array<Service & { rollout_month: number }>;
  packs?: Array<{ id: string; name: string; rollout_month: number }>;
  plans?: Array<{ id: string; name: string; rollout_month: number; base_price?: number; seats?: number }>;
  costs?: CostItem[];
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
  opex: number;
  capex: number;
  tokenCosts: number;
  totalCosts: number;
  netCashFlow: number;
  cumulativeCashFlow: number;
  cumulativeCashFlowLower?: number; // lower bound: ARPU-uplift-only attribution
  grossRevenue: number; // MRR with AI
  baselineRevenue: number; // MRR baseline
  baselineCustomers: number; // baseline customers
  // AI monetization revenue breakdown (zero unless revenue_source includes monetization)
  monetizationRevenue: number;
  addonRevenue: number;
  usageRevenue: number;
  hybridBaseRevenue: number;
  overchargeRevenue: number;

  // Agent archetype fields
  totalInteractions?: number;
  deflectedInteractions?: number;
  laborSavingsCash?: number;
  laborSavingsCapacity?: number; // memo
  failedDeflectionCost?: number;
  agentTokenCosts?: number;
}

export type IrrStatus = 'ok' | 'unstable_short_payback' | 'ambiguous_multiple_roots' | 'undefined_no_sign_change' | 'non_converged' | 'blocked_by_integrity';

export interface IrrResult {
  monthly: number | null;
  annualNominal: number | null;
  status: IrrStatus;
  displayable: boolean;
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
  field?: string;
}

