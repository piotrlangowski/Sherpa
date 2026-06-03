export type Currency = 'USD' | 'EUR' | 'PLN' | 'GBP';

export type ServiceStatus = 'existing' | 'planned';

export type DependencyType = 'requires' | 'enhanced_by' | 'replaces';

export type CostCategory = 'capex' | 'opex';

export type CostFrequency = 'one_time' | 'monthly' | 'yearly';

export interface Settings {
  company_name: string;
  currency: Currency;
  default_discount_rate: number;
  setup_completed: boolean;
  projection_horizon_months: number;
  hubspot_access_token?: string;
}

export interface Provider {
  id: string;
  name: string;
  model_name: string;
  input_price: number; // USD per 1M input tokens
  output_price: number; // USD per 1M output tokens
  is_predefined: boolean;
  updated_at: string; // ISO date string
}

export interface Service {
  id: string;
  name: string;
  description: string;
  status: ServiceStatus;
  provider_id: string | null;
  avg_input_tokens: number;
  avg_output_tokens: number;
  avg_requests_per_user_month: number;
  fixed_cost_per_month: number | null;
  created_at: string;
  updated_at: string;
  
  // Relations (loaded dynamically)
  provider?: Provider | null;
  dependencies?: ServiceDependency[];
}

export interface ServiceDependency {
  id: string;
  source_id: string;
  target_id: string;
  dependency_type: DependencyType;
  
  // Loaded relation details
  source_name?: string;
  target_name?: string;
}

export interface Pack {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  
  // Relations
  services?: Service[];
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  base_price: number;
  created_at: string;
  updated_at: string;
  
  // Relations
  services?: Service[];
  packs?: Pack[];
}

export interface Vertical {
  id: string;
  name: string;
  description: string;
  tam_users: number;
  sam_users: number;
  som_users: number;
  created_at: string;
  updated_at: string;
  
  // Relations
  plans?: Plan[];
  packs?: Pack[];
}

export interface CostItem {
  id: string;
  name: string;
  category: CostCategory;
  subcategory: string; // e.g. 'personnel', 'infrastructure', 'marketing', 'training', 'other'
  amount: number;
  frequency: CostFrequency;
  service_id: string | null;
  created_at: string;
  updated_at: string;
  
  // Relations
  service_name?: string;
}

export interface CohortConfig {
  id: string;
  name: string;
  vertical_id: string | null;
  current_users: number;
  monthly_acquisition: number;
  acquisition_growth_rate: number; // decimal (e.g. 0.05 for 5%)
  monthly_churn_rate: number; // decimal
  retention_floor: number; // decimal
  monthly_expansion_rate: number; // decimal
  ai_adoption_rate: number; // decimal
  base_arpu: number;
  created_at: string;
  updated_at: string;
  
  // Relations
  vertical_name?: string;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  projection_months: number;
  discount_rate: number; // decimal
  cohort_config_id: string | null;
  created_at: string;
  updated_at: string;
  
  // Relations
  cohort_config?: CohortConfig | null;
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
