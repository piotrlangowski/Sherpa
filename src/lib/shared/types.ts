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
}

export interface Provider {
  id: string;
  name: string;
  model_name: string;
  input_price: number;
  output_price: number;
  is_predefined: boolean;
  currency: Currency;
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
  
  // Relations
  provider?: Provider | null;
  dependencies?: ServiceDependency[];
  rollout_month?: number;
}

export interface Pack {
  id: string;
  name: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
  
  services?: Service[];
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
}

export interface Scenario {
  id: string;
  name: string;
  description?: string;
  projection_months: number;
  discount_rate: number;
  scope_type: ScopeType;
  created_at?: string;
  updated_at?: string;
  
  scope_verticals?: Vertical[];
  scope_cohorts?: CohortConfig[];
  scope_overrides?: ScopeOverride[];
  services?: Array<Service & { rollout_month: number }>;
  packs?: Array<{ id: string; name: string; rollout_month: number }>;
  plans?: Array<{ id: string; name: string; rollout_month: number }>;
  costs?: CostItem[];
  results?: {
    payback_months: number | null;
    npv: number;
    irr_annual: number | null;
    tco: number;
    roi_percent: number;
  };
}

export interface ScenarioResult {
  id: string;
  scenario_id: string;
  payback_months: number | null;
  npv: number;
  irr_annual: number | null;
  tco: number;
  roi_percent: number;
  monthly_cashflows: number[];
  monthly_mrr: number[];
  monthly_customers: number[];
  calculated_at: string;
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
  grossRevenue: number; // MRR with AI
  baselineRevenue: number; // MRR baseline
  baselineCustomers: number; // baseline customers
}

export interface CalculationResult {
  timeline: MonthlyBreakdown[];
  paybackMonths: number | null;
  npv: number;
  irrAnnual: number | null;
  tco: number;
  roiPercent: number;
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
