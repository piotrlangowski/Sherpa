---
name: sherpa-scenario-comparator
description: Compares different SaaS ROI scenarios and calculates opportunity costs. Use when comparing options (e.g. low-tier chatbot vs premium copilot) or querying the dashboard summary.
---

## Core Concepts

**Opportunity Cost in Sherpa**: When evaluating multiple product strategies, choosing a sub-optimal scenario instead of the one with the highest NPV results in an opportunity cost.
- **Delta NPV ($\Delta$ NPV)**: The difference in Net Present Value between the highest-NPV scenario and a given alternative.
- **Tradeoff Analysis**: Balances higher ARPU (revenue) against higher Capex/Opex or LLM token usage (costs).

## Workflow Patterns

### 1. High-level Dashboard Review
To see all existing scenarios and quickly identify candidates for comparison, retrieve the general dashboard summary.

- **Resource URI**: `sherpa://dashboard/summary`
- **Output**: Returns a JSON array of all scenarios with their name, discount rate, projection horizon, and cached results (NPV, IRR, TCO, etc.).

### 2. Multi-scenario Comparison
To perform a side-by-side financial comparison and calculate opportunity costs between selected scenarios:

- **Tool**: `compare_scenarios`
- **Arguments**: `{ ids: ["uuid-1", "uuid-2", ...] }`
- **Output**: Returns a Markdown comparison table and lists the specific opportunity cost delta of choosing any scenario over the best one.

## Strategic Decision-Making Rules

When presenting choices to product leaders (CPO/RevOps):
1.  **Lead with the Optimal Choice**: Identify the scenario that maximizes NPV.
2.  **Highlight the Hurdle (IRR)**: Check if the annualized IRR of all scenarios exceeds the discount rate/WACC. Reject any scenario where IRR is lower than the discount rate.
3.  **Evaluate Cash Flow Risk (Payback)**: A scenario might have a slightly higher NPV but a much longer payback period (e.g. 24 months vs 6 months). Call out this liquidity risk.
4.  **Token Cost Sensitivity**: A scenario using expensive models (e.g., GPT-4o, Claude 3.5 Sonnet) might have higher revenue but high volatility if adoption spikes. Point this out as an infrastructure risk.
