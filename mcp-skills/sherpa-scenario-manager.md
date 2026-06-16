---
name: sherpa-scenario-manager
description: Provides context for creating, configuring, and updating SaaS ROI scenarios, including scopes, override cascades, and revenue source models.
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

## 2. Revenue Sources
The `revenue_source` parameter determines which revenue streams are accumulated in the cashflow projections:
- **`cohort`**: Only standard subscription revenue from pricing plans.
- **`monetization`**: Only monetization revenue (addons, prepaid credits, pay-as-you-go credit overcharges) defined for services, packs, and plans.
- **`both`**: Sum of plan subscriptions and monetization overcharges.

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
  - `revenue_source` (enum: `"cohort"`, `"monetization"`, `"both"`, default: `"cohort"`)
  - `cohort_config` (object, required during create):
    - `name`, `current_users`, `monthly_acquisition` (required)
    - `acquisition_growth_rate`, `monthly_churn_rate`, `retention_floor`, `monthly_expansion_rate`, `ai_adoption_rate`, `base_arpu`, `arpu_uplift`, `arpu_uplift_percent`, `churn_reduction`, `acquisition_uplift`
    - `vertical_id`
  - `services` (array of objects: `[{ id: string, rollout_month?: number }]`)
  - `packs` (array of objects: `[{ id: string, rollout_month?: number }]`)
  - `plans` (array of objects: `[{ id: string, rollout_month?: number }]`)
  - `cost_ids` (array of strings, Capex/Opex cost UUIDs)

### 3. Scenario Update (`action: "update"`)
- Use this to change `scope_type` to `'verticals'` or `'all_clients'`, link different plans, or modify scenario metrics.
- **Arguments**:
  - `id` (string, required)
  - `name`, `description`, `projection_months`, `discount_rate`, `scope_type`, `revenue_source`
  - `services` (array of `[{ id, rollout_month }]`)
  - `packs` (array of `[{ id, rollout_month }]`)
  - `plans` (array of `[{ id, rollout_month }]`)
  - `cost_ids` (array of cost UUIDs)
- **Replace semantics (important)**: On `update`, each of `services`, `packs`, `plans`, and `cost_ids` **replaces the scenario's entire existing set** for that key — it does not append. Omit a key to leave that set unchanged; pass `[]` to clear it. To add one item to a scenario that already has some, first fetch the current list via `action: "get"` and pass the full set you want to keep, otherwise the others are silently dropped. The `update` response echoes the resulting linked cost items so you can confirm the final set.

## 4. Cost Reuse Guidelines
- **Always Reuse Matching Costs**: When a user wants to assign a cost to multiple scenarios, do NOT create a new cost item if an identical one already exists. Check the existing cost items catalog using `cost_item_action` with `action: "list"`.
- **Linking Existing Costs**: Use the `cost_ids` array in `scenario_action.update` (or `create`) to link the existing cost item UUID(s) to the target scenarios.
- **General Costs**: If a cost is general and shared across scenarios, ensure its `service_id` is set to `null` (or omitted). `service_id` is merely a grouping tag and does not restrict linking.
