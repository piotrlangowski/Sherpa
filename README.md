# Sherpa — AI Feature ROI Calculator for SaaS

[![CI](https://github.com/piotrlangowski/Sherpa/actions/workflows/ci.yml/badge.svg)](https://github.com/piotrlangowski/Sherpa/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Local-first](https://img.shields.io/badge/data-100%25%20local-success)

**Should we ship that AI feature?** Sherpa answers with CFO-grade numbers instead of gut feeling: it combines a cohort-based revenue model with an LLM token cost engine and CAPEX/OPEX tracking, and turns them into NPV, IRR, payback period, TCO and ROI — locally, with nothing leaving your machine.

Built for product leaders (CPO/RevOps) at SaaS companies, it also ships as an **MCP server**, so you can model scenarios conversationally from Claude Desktop: *"create a scenario with 5,000 users, 4% churn and a $150 ARPU chatbot rollout"*.

### Why Sherpa
By this name I wanted to convey two things:
1. This is a journey that is hard and complicated. We have many tools nowaydays to make it easier, but we still go into the uknown (be it everest or todays markets) and only our prepardness makes it successful.
2. This is a private exeperience. Here are you, your data and your decisions in this specific moment in time. It is your soliloquy.

**Work your way**
Work as a Claude Desktop App user connecting to a permanent data source that **lives only on your computer, locally, private**

<img width="902" height="765" alt="image" src="https://github.com/user-attachments/assets/c0414aa0-2104-4acb-980e-45f878d95f4a" />

or as a separate App with its own UI

<img width="1430" height="790" alt="image" src="https://github.com/user-attachments/assets/f8e8b706-5064-400c-8d8f-b13dd19944ec" />

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

First launch opens a 3-step setup wizard and seeds a demo workspace ("Acme Analytics": 5 AI services, 2 feature packs, 2 pricing plans, 2 pre-computed scenarios), so you can explore a populated dashboard immediately.

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

**Good to know:**

- **Your data is in the same place as with the extension.** The database defaults to `~/Library/Application Support/Sherpa/sherpa.db` (macOS) / `%APPDATA%\Sherpa\sherpa.db` (Windows) — exactly where the one-click extension keeps it. If you used the extension before, all your scenarios are already there; nothing to migrate.
- **Custom database location:** add an `env` block to the entry: `"env": { "SHERPA_DB_PATH": "/path/to/sherpa.db" }`.
- **Switching back when the bug is fixed:** remove the `sherpa` entry from `claude_desktop_config.json`, restart Claude Desktop, and install `sherpa.mcpb` the normal way. Your data carries over automatically. Don't run both at once — you'd get duplicate tools.
- **Updating:** manual installs don't auto-update. To update, download the new release and extract it over the same folder.

### Launching the Dashboard from Claude Desktop

You can open and close the web dashboard directly from your chat with Claude using the new MCP tools:

- **Open/Close Dashboard**: Say *"open the dashboard"* or *"close the dashboard"*. Claude will call the `dashboard_action` tool with the appropriate action parameter (`"open"` or `"close"`). The `"open"` action starts the SvelteKit app in-process (directly inside the MCP server process using port `4848` or another available port if occupied) and automatically opens it in your default browser.
- **Deep-linking Scenarios**: Claude can deep-link directly to a scenario page (e.g. `dashboard_action(action: "open", path: "/scenarios/<id>")`) immediately after calculating ROI or creating a scenario.

**In-process Lifecycle & Port Caching**: Because SvelteKit's handler imports and caches environment variables (like `ORIGIN`) at load time, the server binds to a single port per runtime process. If you stop the dashboard, reopening it will start the listener on the same port. If there is a port conflict, you will receive a diagnostic message advising you to restart Claude Desktop.

--

## Why it's different

Typical ROI calculators don't understand LLM economics; token cost calculators don't understand revenue. Sherpa models both sides of the equation in one place:

- **Revenue side** — cohort projections with exponential retention decay (`retention(n) = max(floor, e^(-λ·n))`), acquisition growth, ARPU expansion, and an AI-adoption overlay that controls which users actually generate token costs.
- **Cost side** — per-service LLM token costs (input/output prices per model, requests per user), plus CAPEX/OPEX items (engineering, infrastructure, marketing, compliance).
- **Decision layer** — monthly discounted cashflows rolled up into NPV, IRR (Newton-Raphson with bisection fallback), payback period (with linear interpolation), TCO and ROI%.

## Features

- **Catalog** — define AI services (chat, summarization, search…), assign provider models, group services into feature packs, map packs onto pricing plans, and visualize service dependencies as a DAG.
- **Scoped scenarios** — target the whole client base, selected verticals, or individual cohorts, with a three-level parameter override cascade (global → vertical → cohort).
- **Sensitivity analysis** — tornado charts showing how ±10% swings in churn, acquisition, ARPU, token costs, adoption and discount rate move the NPV.
- **Scenario comparison** — side-by-side KPIs, cumulative ROI curves and opportunity cost (ΔNPV) between alternatives.
- **Import & export** — model your real customer base from a CSV export (CRM/billing), export scenarios to JSON/CSV, download the dashboard as a high-res PNG.
- **Current model prices** — bundled price list for OpenAI, Anthropic and Google models with a visible "prices as of" date and one-click sync.
- **MCP server** — 11 consolidated tools and 2 resources exposing the same engine to LLM hosts; includes full database CRUD capabilities with action parameters and Human-in-the-Loop safety confirmation for deletions, natural-language scenario generation, and 4 bundled agent skills.

## Methodology & ROI Calculations

Sherpa operates on an **incremental value** model: all KPIs (NPV, IRR, Payback, ROI%) are computed on the delta between a "With AI" projection and a "Without AI" counterfactual baseline.

### Uplift Parameters
Four AI impact parameters can be configured at cohort, vertical, or scenario override levels:
- `arpu_uplift` — flat currency ARPU increase for users adopting AI (per month).
- `arpu_uplift_percent` — percentage ARPU increase for users adopting AI.
- `churn_reduction` — percentage reduction of monthly churn rate for users adopting AI.
- `acquisition_uplift` — percentage increase in new-customer acquisition (attributable to the product having AI; unweighted by adoption).

### Formulas
The effective with-AI parameters are calculated as:
- \(\text{churnRate} = \text{baseChurn} \times (1 - \text{churn\_reduction} \times \text{ai\_adoption\_rate})\)
- \(\text{acquisition} = \text{baseAcquisition} \times (1 + \text{acquisition\_uplift})\)
- \(\text{arpu} = \text{baseArpu} \times (1 + \text{arpu\_uplift\_percent} \times \text{ai\_adoption\_rate}) + \text{arpu\_uplift} \times \text{ai\_adoption\_rate}\)

### Known Limitations & Approximations
1. **Blended-rate approximation:** Weighting churn/ARPU by the adoption rate applies a blended average rate to the whole cohort instead of simulating adopter/non-adopter sub-cohorts separately. Due to the convexity of \((1-c)^{\text{age}}\) (Jensen's inequality), this slightly understates mixture retention, making results mildly conservative.
2. **Expansion-rate uplift:** Excluded from the current scope.
3. **Horizon truncation:** The standard 36-month horizon truncates terminal value, leading to conservative NPV calculations.
4. **IRR non-uniqueness:** For non-conventional cash flows (e.g. multiple sign changes), IRR may have non-unique solutions. The engine uses a Newton-Raphson method with Bisection fallback to resolve one root.

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

The pure math core is the contract: [`financial-math.test.ts`](src/lib/shared/financial-math.test.ts) covers cohort modeling, NPV/IRR/payback/TCO and full-scenario calculation (99% stmt / 77% branch coverage, enforced thresholds in CI). The importer has its own suite. UI and integration layers are exercised by `svelte-check` and the CI build; treat the financial outputs as tested, the UI as best-effort.

## Privacy

Sherpa is local-first: every scenario, cohort and setting lives in a SQLite file on your disk (`data/sherpa.db`). The app makes no network calls to model providers — token prices come from a bundled, dated price list you can inspect and edit.

## License

[MIT](LICENSE)
