---
name: sherpa-scenario-manager
description: Guides creating and configuring SaaS ROI scenarios in Sherpa. Use when setting up new scenarios from plain text or structured metrics.
---

## Core Concepts

**SaaS Cohort Model**: Sherpa uses a cohort-based model to project revenue and calculate LLM/Infrastructure costs over time. A cohort is defined by:
- **Starting/Current Users** (`current_users`): Initial user base.
- **Monthly Acquisition** (`monthly_acquisition`): New users added each month.
- **Acquisition Growth Rate** (`acquisition_growth_rate`): Growth of the acquisition channel.
- **Monthly Churn Rate** (`monthly_churn_rate`): Customer churn.
- **Retention Floor** (`retention_floor`): Minimum percentage of users retained in the long term.
- **AI Adoption Rate** (`ai_adoption_rate`): The fraction of users within the cohort who adopt and trigger the active AI features.
- **Base ARPU** (`base_arpu`): Average Revenue Per User.

## Workflow Patterns

### 1. Natural Language Scenario Generation
When a user provides a plain-text description of their project, cohort, or pricing metrics, use the `generate_scenario_from_description` tool. This tool parses the text and automatically creates the scenario, cohort configuration, and attempts to link existing services from the catalog.

- **Tool**: `generate_scenario_from_description`
- **Argument**: `{ description: "A plain text description" }`

*Example usage:*
> "Utwórz scenariusz 'Chatbot Pro' z 5000 początkowych użytkowników, churnem 4% i ARPU 150$. Wprowadzamy usługę summarization w 3 miesiącu."

### 2. Structured Scenario Creation
If the user provides structured cohort metrics or wants exact control over service mappings, use `create_scenario`.

- **Tool**: `create_scenario`
- **Key Fields**:
  - `name`: Scenario name.
  - `projection_months`: Duration of analysis (typically 36 or 60).
  - `discount_rate`: Annual discount rate (default is 10%/0.10).
  - `cohort_config`: Object defining user acquisition, churn, ARPU, and adoption.
  - `services`: Array of `{ id: string, rollout_month: number }` to attach.
  - `cost_ids`: Array of Capex/Opex fixed cost item IDs to attach.

## Guidelines for Scenario Setup

1. **Rollout Month**: When attaching services, define `rollout_month` carefully. A rollout month of `0` means the service starts immediately. A rollout of `6` means costs are deferred until month 6 of the projection.
2. **AI Adoption vs Cohort Size**: Ensure the `ai_adoption_rate` is specified correctly (e.g. 0.3 for 30%). This controls what percentage of users incur model token costs.
3. **Discount Rate (WACC)**: Use a realistic discount rate (normally between 0.08 and 0.15) to discount future cash flows.
