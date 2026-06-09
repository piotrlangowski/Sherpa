---
name: sherpa-financial-analyst
description: Calculates and analyzes ROI, NPV, IRR, TCO, and sensitivity for Sherpa scenarios. Use when the user requests financial metrics, performance forecasts, or parameter sensitivity.
---

## Core Concepts

**Financial Engine Metrics**:
- **NPV (Net Present Value)**: The total present value of discounted net cash flows. A positive NPV indicates that the project is profitable given the discount rate (WACC).
- **IRR (Internal Rate of Return)**: The annualized return rate of the project. Compare this against the hurdle rate/WACC.
- **Payback Period**: The number of months it takes for cumulative net cash flow to turn positive. Calculated using linear interpolation.
- **TCO (Total Cost of Ownership)**: Includes all Capex/Opex infrastructure, development costs, and LLM model usage (input and output token fees).
- **ROI%**: Procentowy zwrot z inwestycji, szacowany jako `(Suma przychodów z projektu - TCO) / TCO`.

## Workflow Patterns

### 1. Triggering Calculations & Fetching Results
To analyze a scenario, first run the calculations to ensure the cached values are up-to-date, then fetch the detailed monthly logs if necessary.

1.  **Calculate ROI**: Use `calculate_roi` with the scenario `id`.
    - Tool: `calculate_roi`
    - Arguments: `{ id: "scenario-uuid" }`
2.  **Retrieve Detailed Timeline**: Query the scenario results resource to inspect monthly cashflows, customer growth, and MRR.
    - Resource URI: `sherpa://scenarios/{id}/results`

### 2. Sensitivity Analysis (Tornado Data)
Evaluate how fluctuations in the model parameters impact the scenario's NPV. This is useful for identifying financial risks.

- **Tool**: `run_sensitivity`
- **Arguments**: `{ id: "scenario-uuid", variation_percent: 0.10 }` (default variations are ±10%)
- **Analysis**:
  - Compare the **Impact Range** of each variable.
  - Variables with the largest impact range represent the highest risk and leverage.
  - Common critical variables: `churn`, `arpu`, `adoption`, and `token costs`.

## Reporting Guidelines

When reporting to CPOs or RevOps:
1.  **Summary Table**: Present the high-level metrics clearly (NPV, IRR, Payback, TCO, ROI%).
2.  **Timeline Narrative**: Mention when the project breaks even (Payback Period).
3.  **Risk Mitigation**: Use sensitivity data to point out which parameters the product team must optimize (e.g., "A 10% increase in Churn drops NPV by $50k, making customer retention the highest leverage factor").
