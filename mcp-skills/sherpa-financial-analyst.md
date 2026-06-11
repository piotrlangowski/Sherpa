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
- The tool `calculate_roi` runs the calculations for a scenario ID to ensure the cached values are up-to-date.
  - Arguments: `{ id: "scenario-uuid" }`
- Scenario results (monthly cashflows, customer growth, MRR) are available via the resource URI: `sherpa://scenarios/{id}/results`

### 2. Sensitivity Analysis
- The tool `run_sensitivity` evaluates how fluctuations in model parameters impact Net Present Value.
  - Arguments: `{ id: "scenario-uuid", variation_percent: 0.10 }`
- High impact ranges highlight variables (e.g., churn, ARPU, adoption, or token costs) representing high leverage or risk.

## Standard Report Components
Financial reports typically include:
- A summary table displaying key metrics (NPV, IRR, Payback, TCO, ROI%).
- A timeline narrative indicating the break-even month (Payback Period).
- Risk mitigation analysis identifying critical parameter sensitivities.
