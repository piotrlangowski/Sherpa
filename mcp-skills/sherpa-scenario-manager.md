---
name: sherpa-scenario-manager
description: Provides context for creating and configuring SaaS ROI scenarios from text or structured metrics.
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
- Use `scenario_action` with `action: "generate"` to parse natural language text and automatically create the scenario, cohort configuration, and link catalog services.
  - Arguments: `{ action: "generate", description: "A plain text description" }`
  - Example: "Utwórz scenariusz 'Chatbot Pro' z 5000 początkowych użytkowników, churnem 4% i ARPU 150$. Wprowadzamy usługę summarization w 3 miesiącu."

### 2. Structured Scenario Lifecycle
- Use `scenario_action` with `action: "create" | "get" | "update" | "delete" | "list"` to manage scenario records.
  - Key Fields for `action: "create"`:
    - `name`: Scenario name.
    - `projection_months` (optional): Duration of analysis (typically 36 or 60).
    - `discount_rate` (optional): Annual discount rate (default is 10%/0.10).
    - `cohort_config`: Object defining user acquisition, churn, ARPU, and adoption.
    - `services` (optional): Array of `{ id: string, rollout_month?: number }` to attach.
    - `packs` (optional): Array of `{ id: string, rollout_month?: number }` to attach.
    - `plans` (optional): Array of `{ id: string, rollout_month?: number }` to attach.
    - `cost_ids` (optional): Array of Capex/Opex fixed cost item IDs to attach.
  - Deletions (`action: "delete"`) require `confirm: true`.

## Configuration Details
- **Rollout Month**: Represents when a service starts. A rollout month of `0` starts immediately, while `6` defers costs until month 6.
- **AI Adoption Rate**: Expressed as a decimal (e.g., 0.3 for 30%) to control what percentage of users incur model token costs.
- **Discount Rate (WACC)**: Normally ranges between 0.08 and 0.15 to discount future cash flows.
