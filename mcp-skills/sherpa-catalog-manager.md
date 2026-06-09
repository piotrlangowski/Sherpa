---
name: sherpa-catalog-manager
description: Manages the AI service catalog, feature packs, and pricing plans. Use when adding or updating services, model parameters (input/output token costs), or pricing tiers.
---

## Core Concepts

**Sherpa Catalog Structure**:
1.  **AI Services**: Individual AI features (e.g. Chatbot, Translator, Semantic Search). Each service defines:
    - Input tokens (`avg_input_tokens`) and Output tokens (`avg_output_tokens`) per request.
    - Expected monthly requests per user (`avg_requests_per_user_month`).
    - Fixed monthly costs (`fixed_cost_per_month`).
    - A Provider (`provider_id`) which determines the pricing tier for LLM tokens.
2.  **Feature Packs**: Bundles of AI services (e.g., "AI Basics Pack" containing Chatbot and Translation, "AI Advanced Pack" containing Semantic Search).
3.  **Pricing Plans**: SaaS subscription plans (e.g. Starter, Growth, Enterprise). A plan has a monthly subscription base price (`base_price`) and maps to one or more Feature Packs or individual AI Services.
4.  **Global Settings**: Global parameters like `company_name`, `currency`, `default_discount_rate`, and default `projection_horizon_months`.

## Workflow Patterns

### 1. Catalog Management (Services)
- **List services**: Use `list_services` to inspect current items in the catalog and retrieve their `provider_id` values.
- **Create service**: Use `create_service` to register a new service.
  - Arguments: `{ name, provider_id, avg_input_tokens, avg_output_tokens, avg_requests_per_user_month, status, fixed_cost_per_month }`
- **Update service**: Use `update_service` to edit service specifications (e.g. if the team optimizes prompt sizes, lowering `avg_input_tokens`).

### 2. Feature Packaging (Packs)
- **List Packs**: Use `list_packs` to see existing groups.
- **Create Pack**: Use `create_pack` to group multiple services.
  - Arguments: `{ name, description, service_ids: ["id1", "id2", ...] }`

### 3. Subscription & Pricing Setup (Plans)
- **List Plans**: Use `list_plans` to see existing tiers.
- **Create Plan**: Use `create_plan` to link pricing to packs.
  - Arguments: `{ name, base_price, pack_ids: ["pack1", ...], service_ids: ["service1", ...] }`

### 4. Global Settings CRUD
- **Get Settings**: Use `get_settings` to retrieve company details.
- **Update Settings**: Use `update_settings` to adjust corporate WACC / default discount rates or projection horizons.

## Design Tips

1.  **Status**: A service's status can be `"planned"` or `"existing"`. Existing services are already running, whereas planned services indicate features to be rolled out.
2.  **Model Cost Estimates**: If creating a service and the provider is unknown, search or prompt the user for the best matching predefined provider (e.g., OpenAI GPT-4o, Anthropic Claude 3.5 Sonnet) from the database providers list.
