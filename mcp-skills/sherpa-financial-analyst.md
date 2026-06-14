---
name: sherpa-financial-analyst
description: Provides context and tools for calculating and analyzing ROI, NPV, IRR, TCO, and sensitivity for scenarios.
surface: prompt
---

# Sherpa Financial Analyst

Interpret, compute, and present the financial performance metrics for SaaS AI feature deployments.

## 1. Core Financial Methodology

### The Incremental Value Model
To prevent inflating financial returns, Sherpa computes all metrics on **incremental cash flows**.
- **The Equation**: `Incremental Net Cash Flow = ΔRevenue - TCO`
- **Baseline Comparison**: `ΔRevenue = MRR_with_AI - MRR_without_AI_baseline` (where baseline is the counterfactual SaaS performance without any AI investments).
- **No Uplifts => Pure Cost**: AI value is modeled through cohort parameters (`churn_reduction`, `arpu_uplift`, `arpu_uplift_percent`, `acquisition_uplift`). If no uplifts are defined, the scenario produces no incremental revenue, resulting in a negative NPV by design.

### How Monetization Factors In
The `revenue_source` parameter changes what constitutes `MRR_with_AI`:
- `cohort`: Standard subscription plan revenue.
- `monetization`: Incremental revenue generated purely from AI-specific charges (addons, usage overcharges, prepaid credit purchases).
- `both`: Accumulates both subscription plans and monetization model overcharges.

---

## 2. Key Metrics Definitions
- **NPV (Net Present Value)**: The present value of all discounted monthly incremental cash flows. Calculated using the scenario's annual `discount_rate` divided by 12.
- **IRR (Internal Rate of Return)**: The annualized discount rate that makes the NPV of all incremental cash flows equal to zero. If cash flows never change sign (e.g. they are purely negative or always positive from month 0), IRR cannot be solved and returns `null`. This is normal.
- **Payback Period**: The month when the cumulative incremental cash flow becomes positive.
  - Returns `"Immediate"` if cumulative cash flow is never negative.
  - Returns `"Not within horizon"` if break-even is not reached within the scenario's projection months.
- **TCO (Total Cost of Ownership)**: Accumulates fixed capex/opex costs, development costs, and variable LLM provider token costs.
- **ROI%**: Calculated as `(Incremental Cumulative Revenue - TCO) / TCO`.

---

## 3. Workflow Patterns

### 1. Calculation & Result Retrieval
- Run projections: `{ action: "calculate", id: "scenario-uuid" }`
- Retrieve results (MRR, customer growth, cashflows) from resource: `sherpa://scenarios/{id}/results`

### 2. Sensitivity Analysis
- Run sensitivity calculations to evaluate tornado-chart leverage points:
  - `{ action: "sensitivity", id: "scenario-uuid", variation_percent?: number }`
  - Varies inputs (ARPU, churn, adoption, token costs) to highlight where the model has the highest risk or leverage.
