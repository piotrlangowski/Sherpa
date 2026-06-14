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

## 2. ROI & Financial Methodology
- **Incremental Value Model**: All KPIs are computed on *incremental* cash flows (With AI minus Without AI counterfactual baseline).
- **No Uplifts => Pure Cost**: If you do not define customer uplifts (churn reduction, ARPU uplift, or acquisition growth), the scenario represents a pure cost and the NPV will be negative by design.
- **IRR Resolution**: IRR is calculated via Newton-Raphson. If cash flows never change sign (e.g. purely negative or always positive from month 0), IRR will return `null`. This is expected financial behavior.

## 3. Scenarios, Scopes, and Overrides
- **Cascading Overrides**: Cohort configurations serve as the base. When calculating scenario projections, scenario-specific overrides from the `scenario_scope_overrides` table are applied on top of the cohort base using a three-level hierarchy: `all_clients` (global scenario overrides) → `vertical` (vertical scenario overrides) → `cohort` (specific cohort scenario overrides). The most specific override wins.
- **Revenue Sources**: Scenarios support `revenue_source` (`cohort` | `monetization` | `both`):
  - `cohort`: Standard SaaS subscription plans.
  - `monetization`: Direct monetization models configured for services/packs/plans.
  - `both`: Accumulates both SaaS subscription and direct monetization revenues.

## 4. Navigation & User Interface
- **Dashboard Deep-Linking**: Use the `dashboard_action` tool to control the local web server and open the web browser to specific routes (e.g. `/scenarios/{id}`).
- **Key Resources**:
  - `sherpa://scenarios/{id}/results`: Monthly cashflow, MRR, and customer arrays.
  - `sherpa://dashboard/summary`: High-level summary of all scenarios.

## 5. Available Prompts
For deeper domain expertise, load one of the following prompts:
- `sherpa-catalog-manager`: Managing services, packs, plans, models, and fixed costs.
- `sherpa-scenario-manager`: Creating and structuring ROI scenarios.
- `sherpa-financial-analyst`: Interpreting ROI, cash flows, TCO, and sensitivity.
- `sherpa-scenario-comparator`: Multi-scenario tradeoffs and opportunity costs.
- `sherpa-monetization`: Advanced monetization models (addon, usage, hybrid).
