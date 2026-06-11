---
name: sherpa-catalog-manager
description: Assists with managing the AI service catalog, feature packs, pricing plans, and LLM model parameters.
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
- **List services**: The tool `list_services` retrieves current catalog items and their provider IDs.
- **Create service**: The tool `create_service` registers a new service.
  - Arguments: `{ name, provider_id, avg_input_tokens, avg_output_tokens, avg_requests_per_user_month, status, fixed_cost_per_month }`
- **Update service**: The tool `update_service` modifies service specifications (e.g., adjusting average token parameters).

### 2. Feature Packaging (Packs)
- **List Packs**: The tool `list_packs` retrieves existing service groups.
- **Create Pack**: The tool `create_pack` groups multiple services.
  - Arguments: `{ name, description, service_ids: ["id1", "id2", ...] }`

### 3. Subscription & Pricing Setup (Plans)
- **List Plans**: The tool `list_plans` retrieves existing tiers.
- **Create Plan**: The tool `create_plan` links pricing to packs or services.
  - Arguments: `{ name, base_price, pack_ids: ["pack1", ...], service_ids: ["service1", ...] }`

### 4. Global Settings
- **Get Settings**: The tool `get_settings` retrieves current company settings.
- **Update Settings**: The tool `update_settings` updates settings (e.g., currency, default discount rate, or projection horizon).

## Design Details
- A service status can be "planned" or "existing".
- Predefined LLM providers (e.g., OpenAI, Anthropic) are available in the database to determine cost estimates.
