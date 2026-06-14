---
name: sherpa-catalog-manager
description: Assists with managing the AI service catalog, feature packs, pricing plans, LLM model parameters, customer cohorts, and Capex/Opex fixed costs.
surface: prompt
---

# Sherpa Catalog Manager

Manage the central AI feature catalog, subscription plans, provider pricing models, customer cohorts, and fixed costs.

## 1. Core Structures

1. **AI Providers**: LLM providers (OpenAI, Anthropic) defining input/output token pricing per million tokens, and token-to-credit conversion ratios.
2. **AI Services**: Features (e.g. Chatbot, Summary) defining:
   - Expected user usage (`avg_input_tokens`, `avg_output_tokens`, `avg_requests_per_user_month`).
   - Fixed monthly costs (`fixed_cost_per_month`, `fixed_cost_currency`).
   - Launch status (`status`: `"planned"` | `"existing"`).
3. **Feature Packs**: Groupings of services (e.g., "AI Basic Pack") bundled for easier plan packaging.
4. **Pricing Plans**: SaaS subscription tiers (Starter, Growth, Enterprise) defining `base_price`, containing packs or services.
5. **Fixed Cost Items**: Infrastructure, hosting, or development expenses categorized as `capex` or `opex` with recurrence `one_time`, `monthly`, or `yearly`.
6. **Customer Cohorts**: Customer growth definitions tracking initial users, monthly acquisition, acquisition growth, churn, expansion, and AI adoption.

---

## 2. Tool Workflows & Complete Schemas

All catalog changes are executed via entity actions. Deletions always require `confirm: true`.

### 1. Provider Management (`provider_action`)
- **Action options**: `list`, `create`, `update`, `delete`.
- **Arguments**:
  - `id` (string, required for `update`/`delete`)
  - `name` (string, required for `create`)
  - `model_name` (string, required for `create`)
  - `input_price` (number, price per million input tokens, required for `create`)
  - `output_price` (number, price per million output tokens, required for `create`)
  - `currency` (enum: `"USD"`, `"EUR"`, `"PLN"`, `"GBP"`)
  - `input_tokens_per_credit` (integer, default: 1000000)
  - `output_tokens_per_credit` (integer, default: 333333)
  - `confirm` (boolean, required for `delete`)

### 2. Service Management (`service_action`)
- **Action options**: `list`, `create`, `update`, `delete`.
- **Arguments**:
  - `id` (string, required for `update`/`delete`)
  - `name` (string, required for `create`)
  - `description` (string)
  - `status` (enum: `"planned"`, `"existing"`, default: `"planned"`)
  - `provider_id` (string, UUID of provider)
  - `avg_input_tokens` (number)
  - `avg_output_tokens` (number)
  - `avg_requests_per_user_month` (number)
  - `fixed_cost_per_month` (number)
  - `fixed_cost_currency` (enum: `"USD"`, `"EUR"`, `"PLN"`, `"GBP"`)
  - `confirm` (boolean, required for `delete`)

### 3. Feature Packs (`pack_action`)
- **Action options**: `list`, `create`, `update`, `delete`.
- **Arguments**:
  - `id` (string, required for `update`/`delete`)
  - `name` (string, required for `create`)
  - `description` (string)
  - `service_ids` (array of strings, UUIDs of services, required for `create`)
  - `confirm` (boolean, required for `delete`)

### 4. Pricing Plans (`plan_action`)
- **Action options**: `list`, `create`, `update`, `delete`.
- **Arguments**:
  - `id` (string, required for `update`/`delete`)
  - `name` (string, required for `create`)
  - `description` (string)
  - `base_price` (number, required for `create`)
  - `service_ids` (array of strings)
  - `pack_ids` (array of strings)
  - `confirm` (boolean, required for `delete`)

### 5. Customer Cohorts (`cohort_action`)
- **Action options**: `list`, `create`, `update`, `delete`.
- **Arguments**:
  - `id` (string, required for `update`/`delete`)
  - `name` (string, required for `create`)
  - `vertical_id` (string, UUID of vertical)
  - `current_users` (number, required for `create`)
  - `monthly_acquisition` (number, required for `create`)
  - `acquisition_growth_rate` (number, decimal, e.g. 0.02)
  - `monthly_churn_rate` (number, decimal, e.g. 0.05)
  - `retention_floor` (number, decimal, e.g. 0.60)
  - `monthly_expansion_rate` (number, decimal, e.g. 0.02)
  - `ai_adoption_rate` (number, decimal, e.g. 0.30)
  - `base_arpu` (number)
  - `arpu_uplift` (number, flat uplift on adopting users)
  - `arpu_uplift_percent` (number, percent uplift on adopting users)
  - `churn_reduction` (number, percent reduction on adopting users)
  - `acquisition_uplift` (number, percent uplift on acquisition channel)
  - `confirm` (boolean, required for `delete`)

### 6. Capex/Opex Cost Items (`cost_item_action`)
- **Action options**: `list`, `create`, `update`, `delete`.
- **Arguments**:
  - `id` (string, required for `update`/`delete`)
  - `name` (string, required for `create`)
  - `category` (enum: `"capex"`, `"opex"`, required for `create`)
  - `subcategory` (string)
  - `amount` (number, required for `create`)
  - `frequency` (enum: `"one_time"`, `"monthly"`, `"yearly"`, required for `create`)
  - `currency` (enum: `"USD"`, `"EUR"`, `"PLN"`, `"GBP"`)
  - `service_id` (string, optional service link)
  - `confirm` (boolean, required for `delete`)

### 7. Verticals (`vertical_action`)
- **Action options**: `list`, `create`, `update`, `delete`.
- **Arguments**:
  - `id` (string, required for `update`/`delete`)
  - `name` (string, required for `create`)
  - `description` (string)
  - `tam_users` (integer)
  - `sam_users` (integer)
  - `som_users` (integer)
  - `confirm` (boolean, required for `delete`)

### 8. Global Workspace Settings (`settings_action`)
- **Action options**: `get`, `update`.
- **Arguments**:
  - `company_name` (string)
  - `currency` (enum: `"USD"`, `"EUR"`, `"PLN"`, `"GBP"`)
  - `default_discount_rate` (number, e.g. 0.10)
  - `projection_horizon_months` (number, min 12, max 120)
  - `exchange_rates` (record/object of currency-to-rate mapping)
  - `exchange_rates_as_of` (string)
  - `default_price_per_credit` (number, e.g. 0.02)
  - `default_input_tokens_per_credit` (integer, e.g. 1000000)
  - `default_output_tokens_per_credit` (integer, e.g. 333333)
  - `default_overcharge_markup` (number, e.g. 1.5)
  - `default_overcharge_user_pct` (number, e.g. 0.2)
  - `default_avg_overcharge_pct` (number, e.g. 0.5)

### 9. Client Base Defaults (`client_base_action`)
- **Action options**: `get`, `update`.
- **Arguments**:
  - `total_users` (integer)
  - `default_arpu` (number)
  - `default_monthly_churn_rate` (number)
  - `default_monthly_acquisition` (integer)
  - `default_acquisition_growth_rate` (number)
  - `default_ai_adoption_rate` (number)
  - `default_retention_floor` (number)
  - `default_expansion_rate` (number)
  - `default_arpu_uplift` (number)
  - `default_arpu_uplift_percent` (number)
  - `default_churn_reduction` (number)
  - `default_acquisition_uplift` (number)
