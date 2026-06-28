---
name: sherpa-overview
description: High-level overview of the Sherpa ROI calculator capabilities, architecture, and tool conventions.
surface: instructions
---

# Sherpa Overview & Instructions

Sherpa is a local-first AI-feature ROI calculator for SaaS. It calculates Net Present Value (NPV), Internal Rate of Return (IRR), Payback Period, and Total Cost of Ownership (TCO) over a cohort customer growth model, factoring in Capex/Opex costs and LLM token usage.

## 1. Tool Model & Conventions
- **Entity-Action Pattern**: All CRUD operations use consolidated entity tools (e.g. `service_action`, `scenario_action`).
- **Required Parameters**: Every tool call MUST specify the `action` parameter (e.g. `"list"`, `"get"`, `"create"`, `"update"`, `"delete"`).
- **Safe Deletion**: Deletions (`action: "delete"`) are destructive and require setting the parameter `confirm: true`.
- **Workspace Onboarding State**: Read `settings_action` (`action: "get"`) and check `onboarding_required`. When it is `true`, the workspace is fresh or was just reset and has **not** completed the setup wizard — the catalog, scenarios, and KPIs are placeholder "Beacon Helpdesk" seed data. In that case, tell the user the workspace still needs onboarding and help them set the basics (company name, currency, discount rate via `settings_action` `update`, or the in-app wizard) before treating any results as real.

## 2. ROI & Financial Methodology
- **Incremental Value Model**: All KPIs are computed on *incremental* cash flows (With AI minus Without AI counterfactual baseline).
- **No Uplifts => Pure Cost**: If you do not define customer uplifts (churn reduction, ARPU uplift, or acquisition growth) in copilot mode, or do not deflect interactions in agent mode, the scenario represents a pure cost and the NPV will be negative by design.
- **IRR Resolution**: IRR is calculated via Newton-Raphson. If cash flows never change sign (e.g. purely negative or always positive from month 0), IRR will return `null`. This is expected financial behavior.
- **Service Archetypes (Copilot vs Agent)**:
  - **Copilot**: "AI assists human". Request volume is driven by active users. Benefits derived from ARPU uplifts, churn reductions, and acquisition increases.
  - **Platform Agent**: "AI replaces human". Interaction volume is driven by ticket counts (flat monthly or per-customer). Benefits derived from FTE labor offsets (saved work hours). Quality parameters like containment rate, escalation rate, and deflection penalties apply. Staffing realization lag is supported.

## 3. Scenarios, Scopes, and Overrides
- **Cascading Overrides**: Cohort configurations serve as the base. When calculating scenario projections, scenario-specific overrides from the `scenario_scope_overrides` table are applied on top of the cohort base using a three-level hierarchy: `all_clients` (global scenario overrides) → `vertical` (vertical scenario overrides) → `cohort` (specific cohort scenario overrides). The most specific override wins.
- **Revenue Carriers & Modeling (ADR 0001–0004)**: Exactly one entity type carries revenue in a scenario to prevent double-counting. Configured via:
  - `modeling_type`: `incremental` (incremental benefits), `gtm` (Go-To-Market pricing), or `appraisal` (valuation).
  - `revenue_carrier`: `cohort` (standard cohort ARPU uplift), `plan` (pricing plan subscriptions), `pack` (feature pack monetization), `feature` (individual service monetization), or `pool` (unified credit pool).
  - `revenue_bridge`: Resolves plan seats coexisting with cohort modeling (e.g. `upsell_on_cohort` or `separate_market`).
- **Credit Pools (ADR 0010)**: When `revenue_carrier` is set to `'pool'`, the scenario bills a flat monthly subscription tier fee (which covers a shared pool of usage credits) plus overage fees for both Copilot and Agent streams. All participating services must share the same monetization type (addon, usage, or hybrid) and outcome types are blocked.

## 4. Navigation & User Interface
- **Dashboard Deep-Linking**: Use the `dashboard_action` tool to control the local web server and open the web browser to specific routes (e.g. `/scenarios/{id}`).
- **Key Resources**:
  - `sherpa://scenarios/{id}/results`: Monthly cashflow, MRR, and customer arrays.
  - `sherpa://dashboard/summary`: High-level summary of all scenarios.

## 5. Entity Reuse & Overrides
- **Avoid Duplicating Costs**: When a user wants to assign a cost (e.g., development/launch readiness/license) to multiple scenarios, do NOT create duplicate cost items. Instead, locate the existing cost item (using `cost_item_action` with `action: "list"`) and link its UUID via `cost_ids` array in `scenario_action.create` or `scenario_action.update`. Note: on `update`, `cost_ids` **replaces** the scenario's full cost set (it does not append), so include every cost item the scenario should keep — fetch the current set via `scenario_action` `action: "get"` first.
- **Avoid Duplicating Cohorts**: When a user wants to associate a scenario with an existing customer cohort, do NOT embed a new `cohort_config` in `scenario_action.create`. Instead, use `cohort_action` with `action: "list"` to find the existing cohort UUID, and link it via the `cohort_ids` array in `scenario_action.create` or `scenario_action.update`. Note: on `update`, `cohort_ids` **replaces** the scenario's full cohort set (it does not append), so fetch current cohorts first using `action: "get"`.
- **Role of service_id**: The `service_id` field on a cost item is purely an organizational tag for grouping. It does NOT scope the cost to that service or scenario. General/shared costs should be created with `service_id` set to `null` (or omitted) and explicitly linked to the chosen scenarios.
- **Scenario Scope Overrides**: To vary a shared cohort's behavioral parameters (e.g., ai_adoption_rate, churn, ARPU) per scenario without duplicating the cohort, use the **`scenario_override_action`** tool. Overrides can target the global level (`all_clients`), a vertical market (`vertical`), or a specific cohort (`cohort`).
- **Entity Financial Overrides**: To vary a shared service's token usage / fixed cost, a cost item's amount/frequency, a provider's token prices, or a plan's base price for one scenario only (instead of cloning the catalog entity), use the **`entity_override_action`** tool (`entity_type`: `service`|`cost`|`provider`|`plan`).

## 6. Available Prompts
For deeper domain expertise, load one of the following prompts:
- `sherpa-catalog-manager`: Managing services, packs, plans, models, and fixed costs.
- `sherpa-scenario-manager`: Creating and structuring ROI scenarios.
- `sherpa-financial-analyst`: Interpreting ROI, cash flows, TCO, and sensitivity.
- `sherpa-scenario-comparator`: Multi-scenario tradeoffs and opportunity costs.
- `sherpa-monetization`: Advanced monetization models (addon, usage, hybrid).
