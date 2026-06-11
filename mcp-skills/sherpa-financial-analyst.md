---
name: sherpa-financial-analyst
description: Provides context and tools for calculating and analyzing ROI, NPV, IRR, TCO, and sensitivity for scenarios.
---

## Core Concepts

**Financial Engine Metrics**:
- **NPV (Net Present Value)**: The total present value of discounted net cash flows.
- **IRR (Internal Rate of Return)**: The annualized return rate of the project.
- **Payback Period**: The number of months it takes for cumulative net cash flow to turn positive.
- **TCO (Total Cost of Ownership)**: Includes Capex/Opex infrastructure, development costs, and LLM model usage (input and output token fees).
- **ROI%**: Percentage return on investment, estimated as `(Total Revenue - TCO) / TCO`.

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
