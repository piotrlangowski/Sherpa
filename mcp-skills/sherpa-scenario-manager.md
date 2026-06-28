---
name: sherpa-scenario-manager
description: Provides context for creating, configuring, and updating SaaS ROI scenarios, including scopes, override cascades, modeling types, revenue carriers, and credit pools.
surface: prompt
---

# Sherpa Scenario Manager

Configure and manage ROI scenarios by tying together customer cohorts, fixed costs, pricing plans, and AI services.

## 1. Scopes and Override Cascade
Every scenario target has a `scope_type` that determines which cohorts are included in the simulation:
- **`all_clients`**: Projects metrics over all cohorts in the system, applying global defaults.
- **`verticals`**: Projects metrics over cohorts belonging to specific vertical markets.
- **`cohorts`**: Projects metrics over a single specified cohort.

### The Override Cascade (Crucial Logic)
When projecting cash flows, Sherpa resolves parameter values (e.g. churn, ARPU, acquisition, adoption, uplifts) at run-time by starting with the cohort's own defined values and layering scenario-specific overrides from the `scenario_scope_overrides` table in increasing order of specificity:
1. **Cohort Base**: The cohort's own catalog definition.
2. **Global Scenario Override** (`all_clients` target type): Overrides the cohort base for all cohorts in the scenario.
3. **Vertical Scenario Override** (`vertical` target type): Overrides both the cohort base and global scenario overrides for cohorts belonging to the specified vertical.
4. **Cohort Scenario Override** (`cohort` target type): Overrides all other layers for the specific cohort (most specific, wins).

Note: Global defaults (`client_base` table) and vertical market defaults only serve to seed initial values when creating new cohorts or scenarios in the catalog; they are not part of the active runtime cascade.

---

## 2. Modeling Type, Revenue Carriers & Credit Pools (ADR 0001–0004, ADR 0009–0010)

To prevent double-counting of benefits, exactly one entity level or billing model carries revenue in any given scenario:
- **`modeling_type`**:
  - `incremental`: Default. Calculates counterfactual differences between With-AI and Without-AI baselines.
  - `gtm`: Calculates absolute Go-To-Market subscription/monetization flows.
  - `appraisal`: Valuates specific AI capabilities in isolation.
- **`revenue_carrier`**:
  - `cohort`: Revenue is modeled via cohort ARPU uplifts and subscription expansion.
  - `plan`: Revenue is modeled via seats multiplied by pricing plan base prices.
  - `pack`: Revenue is modeled via attached feature pack monetization configs.
  - `feature`: Revenue is modeled via attached service-level monetization configs.
  - `pool`: Revenue is modeled via a unified credit pool tier fee (ADR 0010).
- **`revenue_bridge`**:
  - `upsell_on_cohort`: Seats are informational only; revenue comes from the cohort.
  - `separate_market`: Plan seats add subscription revenue on top of cohort modeling.

### Credit Pools & Integrity Rules (ADR 0010)
- Setting `revenue_carrier` to `'pool'` requires linking a pool tier via `pool_tier_id`.
- The pool tier bills a flat monthly subscription fee covering a shared bundle of usage credits.
- All services drawing from the pool must share the same `monetization_type` (e.g., all `addon`, all `usage`, or all `hybrid`) and cannot use `'outcome'` based monetization. Violation of this rule blocks scenario calculation.

---

## 3. Scenario Lifecycle Tooling (`scenario_action`)

### 1. Natural Language Generation (`action: "generate"`)
- **Arguments**: `{ action: "generate", description: "text description" }`
- **Behavior**: Uses LLM heuristics to parse text description and automatically creates the scenario, configuration, and attaches services.

### 2. Structured Creation (`action: "create"`)
- **Key constraint**: Setting `scope_type` during `create` is ignored; it is **always forced to `'cohorts'`**. To use `verticals` or `all_clients`, you must first run `create` and then perform an `update` to change `scope_type`.
- **Arguments**:
  - `name` (string, required)
  - `description` (string)
  - `projection_months` (number, default: 36, max 120)
  - `discount_rate` (number, annual discount rate, default: 0.10)
  - `capex_contingency_pct` (number, contingency multiplier, default: 0.0)
  - `modeling_type` (enum: `"incremental"`, `"gtm"`, `"appraisal"`, default: `"incremental"`)
  - `revenue_carrier` (enum: `"cohort"`, `"plan"`, `"pack"`, `"feature"`, `"pool"`, default: `"cohort"`)
  - `revenue_bridge` (enum: `"upsell_on_cohort"`, `"separate_market"`, default: `"upsell_on_cohort"`)
  - `pool_tier_id` (string, UUID of credit-pool tier, required when `revenue_carrier` is `"pool"`)
  - `cohort_config` (object, optional if `cohort_ids` is specified):
    - `name`, `current_users`, `monthly_acquisition` (required)
    - `acquisition_growth_rate`, `monthly_churn_rate`, `retention_floor`, `monthly_expansion_rate`, `ai_adoption_rate`, `base_arpu`, `arpu_uplift`, `arpu_uplift_percent`, `churn_reduction`, `acquisition_uplift`
    - `vertical_id`
  - `cohort_ids` (array of strings, existing cohort configuration UUIDs)
  - `services` (array of objects: `[{ id: string, rollout_month?: number }]`)
  - `packs` (array of objects: `[{ id: string, rollout_month?: number }]`)
  - `plans` (array of objects: `[{ id: string, rollout_month?: number, seats?: number }]`)
  - `cost_ids` (array of strings, Capex/Opex cost UUIDs)

### 3. Scenario Update (`action: "update"`)
- Use this to change `scope_type` to `'verticals'` or `'all_clients'`, link different cohorts/plans, or modify scenario metrics.
- **Arguments**:
  - `id` (string, required)
  - `name`, `description`, `projection_months`, `discount_rate`, `capex_contingency_pct`, `scope_type`, `modeling_type`, `revenue_carrier`, `revenue_bridge`, `pool_tier_id`
  - `cohort_ids` (array of existing cohort configuration UUIDs)
  - `services` (array of `[{ id, rollout_month }]`)
  - `packs` (array of `[{ id, rollout_month }]`)
  - `plans` (array of `[{ id, rollout_month, seats }]`)
  - `cost_ids` (array of cost UUIDs)
- **Replace semantics (important)**: On `update`, each of `cohort_ids`, `services`, `packs`, `plans`, and `cost_ids` **replaces the scenario's entire existing set** for that key — it does not append. Omit a key to leave that set unchanged; pass `[]` to clear it. To add one item to a scenario that already has some, first fetch the current list via `action: "get"` and pass the full set you want to keep, otherwise the others are silently dropped. The `update` response echoes the resulting linked cohorts and costs so you can confirm the final set.

## 4. Entity Reuse & Overrides Guidelines
- **Always Reuse Matching Entities**: When a user wants to assign a cost or cohort to multiple scenarios, do NOT create new cost items or cohort configs if identical ones already exist. Use `cost_item_action` `action: "list"` or `cohort_action` `action: "list"`.
- **Linking Existing Entities**: Use the `cost_ids` or `cohort_ids` array in `scenario_action.create` or `scenario_action.update` to link the existing UUID(s).
- **Varying Shared Cohorts Per Scenario**: To vary a shared cohort's behavioral parameters (e.g. `ai_adoption_rate`, `monthly_churn_rate`) on a per-scenario basis, use the **`scenario_override_action`** tool rather than duplicating the cohort.
  - `scenario_override_action` supports: `list` (view overrides for a scenario), `get`, `set` (upsert override parameters), and `delete`.
  - Override scope levels (`target_type`) can be `'all_clients'` (global scenario default), `'vertical'` (applies to cohorts in a vertical market), or `'cohort'` (applies to a specific cohort config).
  - Overridden values are merged incrementally; `undefined` parameters in `set` calls preserve their current values in the database, while explicit `null` unsets them.
  - Setting or deleting overrides automatically invalidates the scenario's results cache.
- **Varying Shared Catalog Entities Per Scenario**: To vary a **service's** token usage / fixed cost, a **cost item's** amount or frequency, a **provider's** token prices, or a **plan's** base price for ONE scenario only, use the **`entity_override_action`** tool — do NOT clone the catalog entity.
  - `entity_override_action` supports `list`, `get`, `set` (upsert), `delete`; required params `scenario_id`, `entity_type` (`service`|`cost`|`provider`|`plan`), `entity_id`, plus the type-specific override fields (service: `avg_input_tokens`/`avg_output_tokens`/`avg_requests_per_user_month`/`fixed_cost_per_month`; cost: `amount`/`frequency`; provider: `input_price`/`output_price`; plan: `base_price`).
  - Setting or deleting an override invalidates the scenario's results cache. A plan's `base_price` only affects revenue when `revenue_carrier` is `plan` and the plan was attached with `seats` > 0.
- **Managing Credit Pools (`pool_tier_action`)**: If the scenario uses a credit pool (`revenue_carrier: "pool"`), you must manage the pool tiers via the **`pool_tier_action`** tool.
  - `pool_tier_action` supports `list`, `get`, `create`, `update`, and `delete`.
  - Arguments include `name`, `monthly_fee`, `credit_pool_size`, `capture` (percentage value capture), and `burn_rates` (an array of `{ service_id, burn_rate }`).
- **General Costs**: If a cost is general and shared across scenarios, ensure its `service_id` is set to `null` (or omitted). `service_id` is merely a grouping tag and does not restrict linking.
