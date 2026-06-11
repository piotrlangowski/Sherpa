---
name: sherpa-catalog-manager
description: Assists with managing the AI service catalog, feature packs, pricing plans, and LLM model parameters.
---

## Core Concepts

**Sherpa Catalog Structure**:
1. **AI Services**: Individual AI features (e.g. Chatbot, Translator, Semantic Search). Each service defines:
    - Input tokens (`avg_input_tokens`) and Output tokens (`avg_output_tokens`) per request.
    - Expected monthly requests per user (`avg_requests_per_user_month`).
    - Fixed monthly costs (`fixed_cost_per_month`).
    - A Provider (`provider_id`) which determines the pricing tier for LLM tokens.
2. **Feature Packs**: Bundles of AI services (e.g., "AI Basics Pack" containing Chatbot and Translation, "AI Advanced Pack" containing Semantic Search).
3. **Pricing Plans**: SaaS subscription plans (e.g. Starter, Growth, Enterprise). A plan has a monthly subscription base price (`base_price`) and maps to one or more Feature Packs or individual AI Services.
4. **Global Settings**: Global parameters like `company_name`, `currency`, `default_discount_rate`, and default `projection_horizon_months`.

## Workflow Patterns

All actions are grouped into consolidated entity tools. Always provide the `action` parameter.

### 1. Catalog Management (Services)
- Use `service_action` to list, create, update, or delete services.
  - Arguments: `{ action: "list" | "create" | "update" | "delete", id?, name?, description?, status?, provider_id?, avg_input_tokens?, avg_output_tokens?, avg_requests_per_user_month?, fixed_cost_per_month?, fixed_cost_currency?, confirm? }`
  - Deletions require `confirm: true`.

### 2. Feature Packaging (Packs)
- Use `pack_action` to manage feature packs.
  - Arguments: `{ action: "list" | "create" | "update" | "delete", id?, name?, description?, service_ids?, confirm? }`
  - Deletions require `confirm: true`.

### 3. Subscription & Pricing Setup (Plans)
- Use `plan_action` to manage pricing plans.
  - Arguments: `{ action: "list" | "create" | "update" | "delete", id?, name?, description?, base_price?, service_ids?, pack_ids?, confirm? }`
  - Deletions require `confirm: true`.

### 4. Providers & Verticals
- Use `provider_action` to manage AI token pricing providers.
  - Arguments: `{ action: "list" | "create" | "update" | "delete", id?, name?, model_name?, input_price?, output_price?, currency?, confirm? }`
- Use `vertical_action` to manage vertical markets.
  - Arguments: `{ action: "list" | "create" | "update" | "delete", id?, name?, description?, tam_users?, sam_users?, som_users?, confirm? }`

### 5. Settings & Client Base Defaults
- Use `settings_action` to view/edit settings.
  - Arguments: `{ action: "get" | "update", company_name?, currency?, default_discount_rate?, projection_horizon_months?, exchange_rates?, exchange_rates_as_of? }`
- Use `client_base_action` to view/edit default client base metrics.
  - Arguments: `{ action: "get" | "update", total_users?, default_arpu?, default_monthly_churn_rate?, default_monthly_acquisition?, default_acquisition_growth_rate?, default_ai_adoption_rate?, default_retention_floor?, default_expansion_rate? }`
