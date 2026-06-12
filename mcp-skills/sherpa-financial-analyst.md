---
name: sherpa-financial-analyst
description: Provides context and tools for calculating and analyzing ROI, NPV, IRR, TCO, and sensitivity for scenarios.
---

## Core Concepts

**Methodology — incremental value model**: All KPIs are computed on *incremental* cash flows, i.e. the delta between a "With AI" projection and a "Without AI" counterfactual baseline (`ΔRevenue = MRR_withAI − MRR_baseline`, minus AI costs). The numbers measure value created by the AI investment, **not** the whole business. AI benefits are modeled via cohort uplift assumptions (`churn_reduction`, `arpu_uplift`, `arpu_uplift_percent`, `acquisition_uplift`); with no uplifts a scenario is pure cost and NPV is negative by design.

**Financial Engine Metrics**:
- **NPV (Net Present Value)**: Present value of the discounted *incremental* net cash flows.
- **IRR (Internal Rate of Return)**: Annualized return of the incremental flows. Returns `null` when the flows never change sign (a pure-cost scenario, or one that is positive from month 0) — this is expected, not an error.
- **Payback Period**: Months for cumulative *incremental* net cash flow to turn positive. `Immediate` when there is no upfront investment phase; `Not within horizon` when it never recovers inside the projection window.
- **TCO (Total Cost of Ownership)**: Capex/Opex infrastructure, development costs, and LLM token usage (input/output fees). Already AI-only — unaffected by the incremental change.
- **ROI%**: `(Incremental Revenue − TCO) / TCO`.

## Workflow Patterns

### 1. Calculation & Result Retrieval
- Use `scenario_action` with `action: "calculate"` to run cashflow projections and update cache.
  - Arguments: `{ action: "calculate", id: "scenario-uuid" }`
- Scenario results (monthly cashflows, customer growth, MRR) are available via the resource URI: `sherpa://scenarios/{id}/results`

### 2. Sensitivity Analysis
- Use `scenario_action` with `action: "sensitivity"` to perform tornado-chart sensitivity analysis.
  - Arguments: `{ action: "sensitivity", id: "scenario-uuid", variation_percent?: number }`
- High impact ranges highlight variables (e.g., churn, ARPU, adoption, or token costs) representing high leverage or risk.

## Standard Report Components
Financial reports typically include:
- A summary table displaying key metrics (NPV, IRR, Payback, TCO, ROI%).
- A timeline narrative indicating the break-even month (Payback Period).
- Risk mitigation analysis identifying critical parameter sensitivities.
