/**
 * Shared domain types for the Sherpa financial engine.
 * These types are used by both the main SvelteKit app and the MCP Server.
 * They are free of any framework or database dependencies.
 */

export type Currency = 'USD' | 'EUR' | 'PLN' | 'GBP';

export type ServiceStatus = 'existing' | 'planned';

export type CostCategory = 'capex' | 'opex';

export type CostFrequency = 'one_time' | 'monthly' | 'yearly';

export interface Provider {
  id: string;
  name: string;
  model_name: string;
  input_price: number; // USD per 1M input tokens
  output_price: number; // USD per 1M output tokens
  is_predefined: boolean;
  updated_at: string;
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
  rollout_month?: number;
}

export interface CohortConfig {
  id: string;
  name: string;
  vertical_id?: string | null;
  current_users: number;
  monthly_acquisition: number;
  acquisition_growth_rate: number; // decimal (e.g. 0.05 for 5%)
  monthly_churn_rate: number; // decimal
  retention_floor: number; // decimal
  monthly_expansion_rate: number; // decimal
  ai_adoption_rate: number; // decimal
  base_arpu: number;
}

export interface CostItem {
  id: string;
  name: string;
  category: CostCategory;
  subcategory?: string | null;
  amount: number;
  frequency: CostFrequency;
  service_id?: string | null;
}

export interface Scenario {
  id: string;
  name: string;
  description?: string;
  projection_months: number;
  discount_rate: number;
  cohort_config_id?: string | null;
  cohort_config?: CohortConfig | null;
  services?: Service[];
  packs?: any[];
  plans?: any[];
  costs?: CostItem[];
}

// --- Cohort Model Result Types ---

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

// --- Financial Engine Result Types ---

export interface MonthlyBreakdown {
  month: number;
  revenue: number;
  customers: number;
  aiUsers: number;
  opex: number;
  capex: number;
  tokenCosts: number;
  totalCosts: number;
  netCashFlow: number;
  cumulativeCashFlow: number;
}

export interface CalculationResult {
  timeline: MonthlyBreakdown[];
  paybackMonths: number | null;
  npv: number;
  irrAnnual: number | null;
  tco: number;
  roiPercent: number;
}

// --- Sensitivity Analysis Types ---

export interface SensitivityParamResult {
  parameter: string;        // Human-readable name (e.g. "Monthly Churn Rate")
  key: string;              // Identifier (e.g. "churn_rate")
  lowValueText: string;     // E.g. "2.7%"
  highValueText: string;    // E.g. "3.3%"
  lowNpv: number;
  highNpv: number;
  lowIrr: number | null;
  highIrr: number | null;
  lowPayback: number | null;
  highPayback: number | null;
  impactRange: number;      // Absolute difference in NPV between low and high
}

export interface SensitivityAnalysisResult {
  scenarioId: string;
  baseNpv: number;
  baseIrr: number | null;
  basePayback: number | null;
  results: SensitivityParamResult[];
}
