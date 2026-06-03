import { z } from 'zod';

export const SettingsSchema = z.object({
  company_name: z.string().min(1, 'Company name is required').max(100),
  currency: z.enum(['USD', 'EUR', 'PLN', 'GBP']),
  default_discount_rate: z.coerce.number().min(0).max(1),
  setup_completed: z.coerce.boolean(),
  projection_horizon_months: z.coerce.number().int().min(12).max(120),
  hubspot_access_token: z.string().optional()
});

export const ProviderSchema = z.object({
  name: z.string().min(1, 'Provider name is required'),
  model_name: z.string().min(1, 'Model name is required'),
  input_price: z.coerce.number().nonnegative(),
  output_price: z.coerce.number().nonnegative()
});

export const ServiceSchema = z.object({
  name: z.string().min(1, 'Service name is required').max(100),
  description: z.string().max(500).optional().default(''),
  status: z.enum(['existing', 'planned']),
  provider_id: z.string().nullable().optional(),
  avg_input_tokens: z.coerce.number().int().nonnegative().default(0),
  avg_output_tokens: z.coerce.number().int().nonnegative().default(0),
  avg_requests_per_user_month: z.coerce.number().int().nonnegative().default(0),
  fixed_cost_per_month: z.coerce.number().nonnegative().nullable().optional()
});

export const PackSchema = z.object({
  name: z.string().min(1, 'Pack name is required').max(100),
  description: z.string().max(500).optional().default(''),
  service_ids: z.array(z.string()).default([])
});

export const PlanSchema = z.object({
  name: z.string().min(1, 'Plan name is required').max(100),
  description: z.string().max(500).optional().default(''),
  base_price: z.coerce.number().nonnegative().default(0),
  service_ids: z.array(z.string()).default([]),
  pack_ids: z.array(z.string()).default([])
});

export const VerticalSchema = z.object({
  name: z.string().min(1, 'Vertical name is required').max(100),
  description: z.string().max(500).optional().default(''),
  tam_users: z.coerce.number().int().nonnegative().default(0),
  sam_users: z.coerce.number().int().nonnegative().default(0),
  som_users: z.coerce.number().int().nonnegative().default(0),
  pack_ids: z.array(z.string()).default([]),
  plan_ids: z.array(z.string()).default([])
});

export const CostItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  category: z.enum(['capex', 'opex']),
  subcategory: z.string().min(1, 'Subcategory is required'),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  frequency: z.enum(['one_time', 'monthly', 'yearly']),
  service_id: z.string().nullable().optional()
});

export const CohortConfigSchema = z.object({
  name: z.string().min(1, 'Cohort name is required').max(100),
  vertical_id: z.string().nullable().optional(),
  current_users: z.coerce.number().int().nonnegative().default(0),
  monthly_acquisition: z.coerce.number().int().nonnegative().default(0),
  acquisition_growth_rate: z.coerce.number().min(-1).max(5).default(0), // % as decimal
  monthly_churn_rate: z.coerce.number().min(0).max(1).default(0.05),
  retention_floor: z.coerce.number().min(0).max(1).default(0.60),
  monthly_expansion_rate: z.coerce.number().min(-1).max(5).default(0.02),
  ai_adoption_rate: z.coerce.number().min(0).max(1).default(0.30),
  base_arpu: z.coerce.number().nonnegative().default(100)
});

export const ScenarioSchema = z.object({
  name: z.string().min(1, 'Scenario name is required').max(100),
  description: z.string().max(500).optional().default(''),
  projection_months: z.coerce.number().int().min(12).max(120).default(36),
  discount_rate: z.coerce.number().min(0).max(1).default(0.10),
  cohort_config_id: z.string().nullable().optional(),
  services: z.array(z.object({
    id: z.string(),
    rollout_month: z.coerce.number().int().nonnegative().default(0)
  })).default([]),
  packs: z.array(z.object({
    id: z.string(),
    rollout_month: z.coerce.number().int().nonnegative().default(0)
  })).default([]),
  plans: z.array(z.object({
    id: z.string(),
    rollout_month: z.coerce.number().int().nonnegative().default(0)
  })).default([]),
  cost_ids: z.array(z.string()).default([])
});
