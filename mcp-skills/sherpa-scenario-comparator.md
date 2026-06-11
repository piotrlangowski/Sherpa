---
name: sherpa-scenario-comparator
description: Provides context for comparing SaaS ROI scenarios and evaluating opportunity costs.
---

## Core Concepts

**Opportunity Cost in Sherpa**: When evaluating multiple product strategies, choosing a sub-optimal scenario instead of the one with the highest NPV results in an opportunity cost.
- **Delta NPV (ΔNPV)**: The difference in Net Present Value between the highest-NPV scenario and a given alternative.
- **Tradeoff Analysis**: Balances higher ARPU (revenue) against higher Capex/Opex or LLM token usage (costs).

## Workflow Patterns

### 1. High-level Dashboard Review
- The general dashboard summary (names, discount rates, projection horizons, and cached results) is available via the resource URI: `sherpa://dashboard/summary`

### 2. Multi-scenario Comparison
- The tool `compare_scenarios` performs side-by-side financial comparisons and calculates opportunity costs.
  - Arguments: `{ ids: ["uuid-1", "uuid-2", ...] }`
  - Output: Markdown comparison table detailing Net Present Value differences.

## Strategic Comparison Guidelines
SaaS scenario evaluations generally consider:
- The optimal candidate, which is the scenario that maximizes NPV.
- Hurdle rate compatibility, ensuring the annualized IRR exceeds the WACC or discount rate.
- Cash flow and liquidity risk, comparing payback periods (e.g., short vs. long break-even).
- Infrastructure cost volatility, noting sensitivities to high-cost LLM providers under high adoption rates.
