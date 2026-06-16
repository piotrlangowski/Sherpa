# Sherpa — AI Feature ROI Calculator for SaaS

[![CI](https://github.com/piotrlangowski/Sherpa/actions/workflows/ci.yml/badge.svg)](https://github.com/piotrlangowski/Sherpa/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Local-first](https://img.shields.io/badge/data-100%25%20local-success)

**Should we ship that AI feature?** Sherpa answers with CFO-grade numbers instead of gut feeling: it combines a cohort-based revenue model with an LLM token cost engine and CAPEX/OPEX tracking, and turns them into NPV, payback period, a discounted Profitability Index and a guarded IRR — computed on a **contribution-margin** basis and presented as an upper/lower range — locally, with nothing leaving your machine.

Built for product leaders (CPO/RevOps) at SaaS companies, it also ships as an **MCP server**, so you can model scenarios conversationally from Claude Desktop: *"create a scenario with 5,000 users, 4% churn and a $150 ARPU chatbot rollout"*.

### Disclaimer
Yes, it is vibecoded, but the problems it tackles are real. Test it yourself.
Altough I am not a SWE I have given Sherpa all the technical attention I could think of.

**Sherpa requires Claude Desktop to run.**

### Why Sherpa
By this name I wanted to convey two things:
1. This is a journey that is hard and complicated. We have many tools nowaydays to make it easier, but we still go into the uknown (be it everest or todays markets) and only our prepardness makes it successful.
2. This is a private exeperience. Here are you, your data and your decisions in this specific moment in time. It is your soliloquy.

**Work your way**
Work as a Claude Desktop App user connecting to a permanent data source that **lives only on your computer, locally, private**
- use Claude to ingest Sherpa with your client base info, pricing structure and usage
- use Claude to update Sherpa with those data
- use Sherpas data in Claude to build workflows, documents and presentations
- use Claude to help you with navigating ROI methodologies implemented in Sherpa

<img width="1139" height="846" alt="image" src="https://github.com/user-attachments/assets/d89f6338-117d-4b9a-8fc4-77b2af9c8366" />


or as a separate App with its own UI that launches from Claude with a command: **open Sherpa's dashobard**
- visually compare different scenarios
- tinker with catalogs

<img width="1407" height="796" alt="image" src="https://github.com/user-attachments/assets/62d1c7a6-4935-4773-85f0-ca0c8085d5f3" />


data:
* **is stored on your computer**
* **stays in sync between the two modes**
* **is computed outside of LLM, in Sherpa's math engine, so it provieds you the same results every session you ask**
* **saves you tokens, because you don't have to compute the same scenario end to end in Claude. Claude just reads the data or manipulates the data**

---

## Quickstart and Claude Desktop integration (MCP)

1. Go into [releases](https://github.com/piotrlangowski/Sherpa/releases) and download sherpa.mpcb file from the latest release

2. Open Claude Desktop > Settings > Extensions
<img width="999" height="737" alt="image" src="https://github.com/user-attachments/assets/55a876c2-7fd4-4845-a38a-a7aab7ff84fa" />

3. Click Advanced Settins > click: Install Extension
<img width="1212" height="610" alt="image" src="https://github.com/user-attachments/assets/5f8cd43f-725b-4f7f-a2fe-bbfd055c8227" />

4. Confirm that is the right extension and hit install
<img width="805" height="811" alt="image" src="https://github.com/user-attachments/assets/3035f33a-014f-4dbb-9205-d8249627528c" />

You are ready to go. **Restart your Claude app**
<img width="795" height="619" alt="image" src="https://github.com/user-attachments/assets/be19bd6a-ea0e-4728-9b2d-65be1aff261d" />

5. Claude will show Connector as ready to use in Claude Chat or Cowork
<img width="676" height="481" alt="image" src="https://github.com/user-attachments/assets/fd4b0379-a286-4440-accf-431ba353fa68" />

6. To open UI just tell Claude to **open Sherpa dashoboard**.

Requires Node.js ≥ 22.5 — it uses the built-in `node:sqlite` module.

First launch opens a 3-step setup wizard and seeds a demo workspace ("Beacon Helpdesk": 3 AI services, 1 feature pack, 2 pricing plans, 1 pre-computed scenario), so you can explore a populated dashboard immediately.

The dev registration pins the database to the repo's `data/sherpa.db` (via `SHERPA_DB_PATH`), so whatever you model in conversation shows up in the web dashboard and vice versa. For tool development without Claude Desktop, `npm run mcp:inspect` opens the MCP Inspector against the built server.

### Alternative installation (workaround for Claude Desktop 1.12603.x)

> **Note:** Claude Desktop **1.12603.1** (June 2026) has a regression where installing *any* local `.mcpb` file fails with `Failed to handle file: … reply was never sent` — on both macOS and Windows, regardless of the extension being installed. Until a fixed Claude Desktop ships, you can register Sherpa as a regular local MCP server instead. You get the same tools, the same dashboard and the same local database — only the install mechanism differs.

**Prerequisite:** Node.js ≥ 22.5 installed and on your `PATH` (check with `node --version`). Unlike the one-click extension, manual mode runs on your system Node, not the runtime bundled with Claude Desktop. Download from [nodejs.org](https://nodejs.org) if needed.

1. **Download** `sherpa.mcpb` from the [latest release](https://github.com/piotrlangowski/Sherpa/releases).

2. **Extract it** — a `.mcpb` file is just a ZIP archive. Put it where you want
3. **Install** - go into Claude > Settings > Extensions > Advanced Settings and this time choose **Install Unpacked Version** - second option from the left <img width="849" height="641" alt="image" src="https://github.com/user-attachments/assets/12ebd70e-bf2a-4122-8a64-a3c670fcbe93" />
4. **Choose folder with unpacked Sherpa** Proceed with installation after which you will see Sherpa installed:<img width="957" height="700" alt="image" src="https://github.com/user-attachments/assets/8c546904-3213-427c-81c8-fabcc9bac659" />

5. **Fully restart Claude Desktop** — quit the app entirely (macOS: Cmd+Q; Windows: File → Exit, not just closing the window) and start it again.

6. **Verify** — the `sherpa` server should appear under Settings → Developer as running. <img width="948" height="626" alt="image" src="https://github.com/user-attachments/assets/60f9cd2b-6f02-4a41-b712-331d7ca4a5bf" />

7. In a chat, ask Claude to *"open the Sherpa dashboard"* — the web UI should open in your browser, seeded with the demo workspace on first run.


### Launching the Dashboard from Claude Desktop

You can open and close the web dashboard directly from your chat with Claude using the new MCP tools:

- **Open/Close Dashboard**: Say *"open the dashboard"* or *"close the dashboard"*. Claude will call the `dashboard_action` tool with the appropriate action parameter (`"open"` or `"close"`). The `"open"` action starts the SvelteKit app in-process (directly inside the MCP server process using port `4848` or another available port if occupied) and automatically opens it in your default browser.
- **Deep-linking Scenarios**: Claude can deep-link directly to a scenario page (e.g. `dashboard_action(action: "open", path: "/scenarios/<id>")`) immediately after calculating ROI or creating a scenario.

**In-process Lifecycle & Port Caching**: Because SvelteKit's handler imports and caches environment variables (like `ORIGIN`) at load time, the server binds to a single port per runtime process. If you stop the dashboard, reopening it will start the listener on the same port. If there is a port conflict, you will receive a diagnostic message advising you to restart Claude Desktop.

--

## Why it's different

Typical ROI calculators don't understand LLM economics; token cost calculators don't understand revenue. Sherpa models both sides of the equation in one place:

- **Revenue side** — cohort projections with exponential retention decay (`retention(n) = max(floor, e^(-λ·n))`), acquisition growth, ARPU expansion, and an AI-adoption overlay (with an optional multi-month ramp) that controls which users actually generate token costs. Each cohort carries a **gross margin**, so value is booked as contribution, not top-line.
- **Cost side** — per-service LLM token costs (input/output prices per model, requests per user), plus CAPEX/OPEX items (engineering, infrastructure, marketing, compliance) with an optional CAPEX contingency buffer.
- **Decision layer** — monthly discounted **contribution-margin** cashflows rolled up into an upper/lower band of NPV, payback period (linear interpolation) and a discounted **Profitability Index** (PV of benefits ÷ PV of costs), plus a **guarded IRR** (nominal ×12, suppressed when uninformative) and TCO.

## Features

- **Catalog** — define AI services (chat, summarization, search…), assign provider models, group services into feature packs, map packs onto pricing plans, and visualize service dependencies as a DAG.
- **Scoped scenarios** — target the whole client base, selected verticals, or individual cohorts, with a three-level parameter override cascade (global → vertical → cohort).
- **Sensitivity analysis** — tornado charts showing how ±10% swings in churn, acquisition, ARPU, token costs, adoption and discount rate move the NPV.
- **Scenario comparison** — side-by-side KPIs, cumulative ROI curves and opportunity cost (ΔNPV) between alternatives.
- **Import & export** — model your real customer base from a CSV export (CRM/billing), export scenarios to JSON/CSV, download the dashboard as a high-res PNG.
- **Current model prices** — bundled price list for OpenAI, Anthropic and Google models with a visible "prices as of" date and one-click sync.
- **MCP server** — 12 consolidated tools (including a dedicated monetization manager) and 2 resources exposing the same engine to LLM hosts; includes full database CRUD capabilities with action parameters and Human-in-the-Loop safety confirmation for deletions, natural-language scenario generation, and 4 bundled agent skills.

## Methodology & ROI Calculations

Sherpa operates on an **incremental value** model: all KPIs are computed on the delta between a "With AI" projection and a "Without AI" counterfactual baseline. That delta is booked at **contribution margin** (not top-line revenue) and reported as an **upper/lower band** rather than a single point estimate.

### Uplift Parameters
Four AI impact parameters can be configured at cohort, vertical, or scenario override levels:
- `arpu_uplift` — flat currency ARPU increase for users adopting AI (per month).
- `arpu_uplift_percent` — percentage ARPU increase for users adopting AI.
- `churn_reduction` — percentage reduction of monthly churn rate for users adopting AI.
- `acquisition_uplift` — percentage increase in new-customer acquisition (attributable to the product having AI; unweighted by adoption).

Plus two realism controls (also cascaded): `gross_margin` (cohort-level contribution margin, default 100%) and `adoption_ramp_months` (months to ramp adoption from 0 to the target); and one scenario-level control, `capex_contingency_pct`.

### Formulas
Sherpa partitions the target cohort into two distinct sub-cohorts to model the counterfactual with-AI projection:
- **AI Adopters** (size = \(N \times \text{ai\_adoption\_rate}\)):
  - \(\text{churnRate}_{\text{adopters}} = \text{baseChurn} \times (1 - \text{churn\_reduction})\)
  - \(\text{acquisition}_{\text{adopters}} = \text{baseAcquisition} \times (1 + \text{acquisition\_uplift}) \times \text{ai\_adoption\_rate}\)
  - \(\text{arpu}_{\text{adopters}} = \text{baseArpu} \times (1 + \text{arpu\_uplift\_percent}) + \text{arpu\_uplift}\)
- **Non-Adopters** (size = \(N \times (1 - \text{ai\_adoption\_rate})\)):
  - \(\text{churnRate}_{\text{non-adopters}} = \text{baseChurn}\)
  - \(\text{acquisition}_{\text{non-adopters}} = \text{baseAcquisition} \times (1 + \text{acquisition\_uplift}) \times (1 - \text{ai\_adoption\_rate})\)
  - \(\text{arpu}_{\text{non-adopters}} = \text{baseArpu}\)

The total with-AI MRR and active customers are the sum of these two sub-cohort timelines.

### Contribution Margin & the Attribution Band
The engine never treats top-line revenue as value. Each cohort carries a `gross_margin` (default 100%, cascaded global → vertical → cohort), and incremental revenue is booked at margin. Because crediting the *entire* retained/acquired base to one AI feature is optimistic, every headline KPI (NPV, payback, Profitability Index) is reported as a **range**:
- **Upper bound** — full effect: ARPU uplift **plus** churn reduction **plus** acquisition uplift across the whole adopter base.
- **Lower bound** — price effect only: ARPU uplift on a customer base that still follows the baseline churn/acquisition path.

### Adoption Ramp & CAPEX Contingency
- `adoption_ramp_months` ramps effective adoption linearly from 0 to the target over *N* months (0 = instant, matching the legacy behavior), pushing payback rightward. It is implemented as a per-month blend of the full-adoption and baseline projections.
- `capex_contingency_pct` (scenario level) inflates CAPEX line items to model build-cost overrun risk.

### Guarded IRR & Profitability Index
- **IRR** is annualized **nominally (monthly × 12)**, not compounded — compounding a high monthly rate produced absurd four-figure percentages. It is further *guarded*: the UI shows it only when informative and reports `n/d` for short paybacks (< 12 months), non-unique roots (multiple sign changes on the cumulative cashflow), or non-convergence. For the fast-payback projects Sherpa typically models, NPV and payback are the load-bearing metrics.
- **Profitability Index (PI)** replaces the old undiscounted ROI%. `PI = PV(benefits) / PV(costs) = NPV / PV(costs) + 1`, shown as a multiple (e.g. `4.47x`) on the same discounted basis as NPV.

### Known Limitations & Approximations
1. **Expansion-rate uplift:** Excluded from the current scope.
2. **Horizon truncation:** The standard 36-month horizon truncates terminal value, leading to conservative NPV calculations.
3. **IRR is conditional, by design:** For non-conventional cash flows (multiple sign changes) or very short paybacks, a single annualized IRR is misleading, so the guard reports `n/d` rather than a spurious root. Lean on NPV + payback.
4. **Adoption-ramp retention:** The linear ramp blends the full-adoption and baseline projections, so customers who adopt mid-ramp inherit the lower churn as if they had adopted at month 0 — a slight upward bias on retention during the ramp.

## Architecture

Two independent TypeScript projects share one engine through a symlink — the financial math, domain types, DB schema and demo seed live in `src/lib/shared/` and are compiled into both:

```mermaid
graph LR
    subgraph shared ["src/lib/shared/ — single source of truth"]
        FM["financial-math.ts<br/>(pure functions, zero I/O)"]
        SCH["db-schema.ts + seed.ts"]
        CAT["provider-catalog.ts"]
    end

    subgraph app ["SvelteKit app"]
        ENGINE["financial-engine.ts<br/>(DB-aware wrapper)"]
        REPOS["repositories + routes"]
    end

    subgraph mcp ["MCP server (stdio)"]
        TOOLS["11 tools + 2 resources"]
    end

    DB[("SQLite<br/>data/sherpa.db")]

    FM --> ENGINE
    FM --> TOOLS
    SCH --> REPOS
    SCH --> TOOLS
    CAT --> REPOS
    ENGINE --> DB
    TOOLS --> DB
```

Design decisions worth a look:

- **Pure core, impure shell.** All computation sits in [`financial-math.ts`](src/lib/shared/financial-math.ts) as pure functions (providers passed as arguments, zero DB access) — unit-tested at 99% statement coverage. The app and the MCP server are thin I/O wrappers around it, so both always produce identical numbers.
- **Scope override cascade.** A scenario can override cohort parameters at three levels (global → vertical → cohort), resolved by a single cascade function shared by both frontends.
- **Result cache with invalidation.** Computed KPIs are cached per scenario; every mutation path (services, providers, cohorts, costs…) cascades an invalidation so dashboards never show stale numbers.
- **Self-initializing MCP server.** On first run it creates the schema and demo data on its own, in an OS-appropriate user data directory — no web app required first.


**Database sharing**: For packaged extension installs (`.mcpb`), the spawned dashboard automatically connects to the same database located at:
- macOS: `~/Library/Application Support/Sherpa/sherpa.db`
- Windows: `%APPDATA%\Sherpa\sherpa.db` (usually `C:\Users\<User>\AppData\Roaming\Sherpa\sherpa.db`)

Any scenarios you create conversationally are immediately visible in the UI.

### Dev vs. packaged — separate environments

|  | `sherpa-dev` (development) | `Sherpa` extension (packaged) |
|---|---|---|
| Registered via | `npm run mcp:install` → `claude_desktop_config.json` | drag & drop `sherpa.mcpb` in Settings → Extensions |
| Code | `mcp-server/build/` straight from the repo | unpacked copy inside Claude Desktop |
| Database | repo `data/sherpa.db` — shared with `npm run dev` | macOS: `~/Library/Application Support/Sherpa/sherpa.db`<br/>Windows: `%APPDATA%\Sherpa\sherpa.db` |
| Update loop | `cd mcp-server && npm run build`, restart Claude Desktop | re-pack and re-install the `.mcpb` |
| Reset | delete `data/sherpa.db` | delete the Sherpa user-data folder — next start re-seeds |

Keep only one of the two enabled at a time — both expose the same tool names, which confuses the model.

## Testing

The pure math core is the contract: [`financial-math.test.ts`](src/lib/shared/financial-math.test.ts) covers cohort modeling, NPV/payback/TCO, full-scenario calculation, contribution-margin scaling, the upper/lower attribution band, the adoption ramp, CAPEX contingency, the Profitability Index, and every guarded-IRR status (kept well above the enforced 80/80/65 coverage thresholds in CI). The importer has its own suite. UI and integration layers are exercised by `svelte-check` and the CI build; treat the financial outputs as tested, the UI as best-effort.

## Privacy

Sherpa is local-first: every scenario, cohort and setting lives in a SQLite file on your disk (`data/sherpa.db`). The app makes no network calls to model providers — token prices come from a bundled, dated price list you can inspect and edit.

## License

[MIT](LICENSE)
