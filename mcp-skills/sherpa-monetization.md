---
name: sherpa-monetization
description: Assists with configuring and understanding SaaS monetization models for AI features, including addons, usage-based, and hybrid pricing.
surface: prompt
---

# AI Feature Monetization Models

Sherpa supports three primary monetization models to capture additional revenue from AI features, along with robust configuration inheritance and override rules.

## 1. Monetization Models
Monetization can be applied to an **AI Service**, a **Feature Pack**, or a **Pricing Plan**. The active model type is determined by the `monetization_type` parameter:
- **`none`**: No additional monetization; features are included in the base plan subscription.
- **`addon`**: An optional monthly flat fee (`addon_monthly_fee`) for access. Can optionally enforce a usage limit (`addon_has_usage_limit` and `addon_usage_limit`).
- **`usage`**: Pure usage-based billing. Can be `prepaid` or `payg` (pay-as-you-go) via `usage_variant`. Charges are computed per credit via `price_per_credit`.
- **`hybrid`**: Combines a flat base fee (`hybrid_monthly_fee`) with a bundle of included credits (`hybrid_included_credits`), charging a markup for additional usage.

## 2. Usage Credit Conversion
LLM token usage is mapped to "credits" based on the provider/model configuration or global defaults:
- **Default rate**: 1 credit = 1,000,000 input tokens = 333,333 output tokens (configurable in `provider_action` or `settings_action`).
- **Overcharge policies**: When limits are exceeded (addon limit or hybrid included credits), three policies are supported (`addon_overcharge_policy` or `hybrid_overcharge_policy`):
  - `hard_stop`: User usage is capped; no additional requests allowed, no extra costs or revenues.
  - `credit_pack`: Users purchase additional pre-priced credit bundles.
  - `payg`: Standard pay-as-you-go pricing applies to all overage.
- **Overcharge math**: Overage revenue uses three key settings:
  - `overcharge_markup`: Multiplier applied to standard credit prices (default: 1.5).
  - `overcharge_user_pct`: Percentage of users who exceed limits (default: 0.2).
  - `avg_overcharge_pct`: Average overage amount as a percentage of standard limits (default: 0.5).

## 3. Configuration & Overrides
- **Inheritance Flow**: Pricing resolves from the most specific entity to the least specific: **Service → Feature Pack → Pricing Plan**. A service-level configuration overrides any pack-level configuration, which in turn overrides plan-level configuration. Plan-level monetization acts only as a last-resort fallback.
- **Scenario Overrides**: Monetization models can be configured globally in the catalog (applied to all scenarios where `scenario_id` is null) or overridden for a specific scenario by setting `scenario_id` to the target scenario's UUID.
- **Managing Monetization**: Use the `monetization_action` tool:
  - **Retrieve config**: `{ action: "get", entity_type: "service" | "pack" | "plan", entity_id: "uuid", scenario_id?: "uuid" }`
  - **Set/Upsert config**: `{ action: "set", entity_type, entity_id, scenario_id?, monetization_type, ... }`
  - **Delete config**: `{ action: "delete", entity_type, entity_id, scenario_id? }`
  - **List Catalog configurations**: `{ action: "list_catalog" }`
  - **List Scenario Overrides**: `{ action: "list_overrides" }`
