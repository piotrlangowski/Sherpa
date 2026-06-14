---
name: sherpa-scenario-comparator
description: Provides context for comparing SaaS ROI scenarios, evaluating opportunity costs, and managing the local dashboard web interface.
surface: prompt
---

# Sherpa Scenario Comparator

Analyze trade-offs, compare multiple scenario cash flows, evaluate opportunity costs, and manage the local web dashboard.

## 1. Comparing Scenarios & Opportunity Cost
When comparing multiple product launch strategies side-by-side, choosing a sub-optimal scenario instead of the one with the highest NPV represents a direct opportunity cost:
- **Delta NPV (ΔNPV)**: The difference in Net Present Value between the highest-performing scenario and each alternative.
- **Trade-off Analysis**: Balances the variable LLM token pricing against the revenue gains from higher ARPU or lower churn.
- **Comparison Tool**: Use `scenario_action` with `action: "compare"`:
  - Arguments: `{ action: "compare", ids: ["uuid-1", "uuid-2", ...] }`
  - Output: Side-by-side comparison table showing NPV, IRR, Payback, TCO, and opportunity cost.

---

## 2. Reading Data Resources
Read-only resource URIs provide direct access to the financial projections:
1. **`sherpa://dashboard/summary`**: Returns a high-level summary of all scenarios, their configurations, and cached KPIs.
2. **`sherpa://scenarios/{id}/results`**: Returns monthly customer counts, MRR, cash flows, and token costs for a specific scenario.

---

## 3. Controlling the Web Dashboard (`dashboard_action`)
The web dashboard displays interactive charts, monthly cash flow tables, and comparative visualizations.
- **Launch/Open Dashboard**: Launches the SvelteKit local server (default: `http://localhost:5173`) and opens a web browser tab:
  - `{ action: "open", path?: "/scenarios/uuid" }`
  - Providing `path` deep-links the browser directly to the specified page (e.g. specific scenario details).
- **Stop/Close Dashboard**: Stops the local dashboard server process:
  - `{ action: "close" }`
