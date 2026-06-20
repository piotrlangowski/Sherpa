# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Sherpa is a **local-first** AI-feature ROI calculator for SaaS (financial modeling: NPV/payback/Profitability Index plus a guarded IRR, computed on a **contribution-margin** cohort revenue model and reported as an upper/lower attribution band, with an LLM token + CAPEX/OPEX cost engine). It is a SvelteKit app backed by SQLite, plus a standalone MCP server that exposes the same engine to LLM hosts (e.g. Claude Desktop). All data lives locally in `data/sherpa.db`; nothing is sent to the cloud. The README is in Polish; many commit messages are too.

## Commands

```bash
npm run dev            # Vite dev server at http://localhost:5173
npm run build          # Production build (adapter-node)
npm run preview        # Serve the production build
npm run check          # svelte-check type checking — this is the lint/CI gate (no ESLint/Prettier configured)
npm run check:watch    # type check in watch mode
```

**Tests**:

```bash
npm test                                          # single pass (CI) — alias for `vitest run`
npx vitest                                        # watch mode
npx vitest run src/lib/shared/financial-math.test.ts   # one file
npx vitest run -t "calculates NPV"                # one test by name
npx vitest run --coverage                         # coverage (measures src/lib/shared/** minus db-schema/seed/provider-catalog; thresholds 80/80/65)
```

Test files are colocated as `*.test.ts`. Only two suites exist today (`src/lib/shared/financial-math.test.ts`, `src/lib/server/services/importer.test.ts`); the pure math module is the primary thing under test.

**MCP server** (separate npm project under `mcp-server/`):
Exposes 14 consolidated entity-action tools covering full database CRUD operations for all entities (settings, providers, verticals, cohorts, fixed costs, feature packs, pricing plans, scenarios, scenario cohort overrides, per-scenario entity financial overrides, and monetization models) with action parameters and Human-in-the-Loop confirmations, plus dashboard open/close controls.

```bash
cd mcp-server && npm install && npm run build     # tsc → mcp-server/build/
node mcp-server/build/index.js                    # run over stdio
cd mcp-server && npm run dev                       # run from source via tsx
npm run mcp:install                               # (from root) copy mcp-skills/ → .agent/skills/ and register "sherpa-dev" in Claude Desktop config (env SHERPA_DB_PATH → repo data/sherpa.db)
npm run mcp:inspect                               # (from root) open MCP Inspector against the built server — fastest tool-testing loop, no Claude Desktop needed
npm run mcp:pack                                  # (from root) build + pack the Claude Desktop extension → sherpa.mcpb (manifest in mcp-server/manifest.json)
```

*Note: `npm run build` must be run in the repository root at least once for `dashboard_action` to work in dev mode.*

## Architecture

### Two projects, one shared engine

This repo contains **two independent TypeScript projects**, each with its own `package.json`, `tsconfig.json`, and `node_modules`:

- the **SvelteKit app** at the root (`src/`)
- the **MCP server** at `mcp-server/`

They share code through a **symlink**: `mcp-server/src/shared → ../../src/lib/shared`. So `src/lib/shared/` is the single source of truth — financial math, types, the DB path resolver (`db-path.ts`), the DB schema (`db-schema.ts`), the demo seed (`seed.ts`), and the provider price catalog (`provider-catalog.ts`).

- Relative imports **inside** `src/lib/shared/` must use the `.js` extension (NodeNext resolution in the MCP build).
- **After changing anything in `src/lib/shared/`, rebuild the MCP server** (`cd mcp-server && npm run build`) or it will serve stale logic.
- `src/lib/shared/db-path.ts` resolves the SQLite filepath.
- `mcp-server/src/launcher.ts` manages launching/stopping the dashboard from the MCP server.
- `npm run mcp:pack` copies SvelteKit's built app (`build/`) to `mcp-server/app/` (with a generated `version.json`) before creating the `.mcpb` bundle.

### Pure vs. impure split (the central design decision)

- **`src/lib/shared/financial-math.ts`** — ALL computation: `buildCohortModel`, `calculateNPV`/`solveMonthlyIRR` + `calculateIRRGuarded` (Newton-Raphson + bisection, then a nominal-×12 guard) / `countSignChanges` / `calculatePaybackPeriod` / `calculateTCO`, `calculateScenario`, `runSensitivityAnalysis`. These are **pure** functions with zero DB access; providers are passed in as arguments. This is what the MCP server consumes.
- **`src/lib/server/services/financial-engine.ts`** — thin **DB-aware wrappers**: resolve the scenario's cohorts + provider list from the DB, then delegate to the pure functions. `runAndSaveScenario` recomputes and caches results.
- Put new financial math in the **shared** module, not in the server wrapper, so the app and MCP stay consistent.

### Financial methodology (CFO-grade)

`calculateScenario` does **not** credit top-line revenue. The model (all in the shared module):

- **One revenue carrier (ADR 0001–0004).** Each scenario sets a `modeling_type` (`incremental` | `gtm` | `appraisal`) and a `revenue_carrier` (`cohort` | `plan` | `pack` | `feature`); `resolveCarrier` maps type → carrier (`incremental`→`cohort`, `gtm`→`plan`, `appraisal`→ the explicit carrier). **Exactly one carrier books revenue**, so cohort ARPU uplift, plan `seats × base_price`, and monetization overrides are never summed (the double-counting the old `revenue_source` `'both'` model caused). `calculateScenario` switches on the carrier — `cohort` = the incremental contribution-margin band; `plan` = plan subscription + monetization; `pack`/`feature` = monetization only. A `revenue_bridge` (`upsell_on_cohort` | `separate_market`) reconciles plan seats that coexist with a `cohort` carrier (`separate_market` = additive subscription; `upsell_on_cohort` = informational only, revenue still from cohort uplift). `validateRevenueIntegrity` returns `ok`/`warn`/`block` to stop double-counting at save time, surfaced via `scenario_results.revenue_integrity_status`/`revenue_integrity_message`. This replaces the deprecated `revenue_source` (`cohort` | `monetization` | `both`) summing model.
- **Contribution margin.** Each cohort carries a `gross_margin` (cascaded global → vertical → cohort, default `1.0`); incremental revenue is booked at margin, so cashflows reflect contribution, not gross revenue.
- **Upper/lower attribution band.** Three projections are built per cohort — baseline, full-adoption, and uplift-only (ARPU effect on a baseline customer-count path). The engine returns a band: **upper** = full retention + acquisition + price effect; **lower** = ARPU-uplift only. NPV, payback and the PI are each returned as `…Upper`/`…Lower`.
- **Adoption ramp.** `adoption_ramp_months` ramps effective adoption linearly from 0 to the target; implemented as a per-month blend `a(t)·fullAdopt + (1−a(t))·baseline` (the cohort model is linear in size, so `ramp=0` reproduces the old split). Late adopters inherit retention as if from month 0 — a documented approximation.
- **CAPEX contingency.** `scenarios.capex_contingency_pct` scales CAPEX line items to model overrun risk.
- **Guarded IRR.** `solveMonthlyIRR` returns the monthly rate; `calculateIRRGuarded` annualizes **nominally (×12, not compounded)** and returns `IrrResult { monthly, annualNominal, status, displayable }`. Status suppresses the number for `unstable_short_payback` (< 12 mo), `ambiguous_multiple_roots` (> 1 sign change on the **cumulative** stream), `undefined_no_sign_change`, or `non_converged`. The UI shows IRR only when `displayable`.
- **Profitability Index, not raw ROI.** The `roi*` fields/columns now hold a discounted PI = `NPV / PV(costs) + 1` (a multiple like `4.47x`) — see Gotchas.

### Data layer

- SQLite via built-in `node:sqlite` (`DatabaseSync`). The connection is a **singleton** created on first import of `src/lib/server/db.ts` (WAL mode, `foreign_keys = ON`). Importing it runs `runMigrations` (`src/lib/shared/db-schema.ts`) then `seedDatabase` (`src/lib/shared/seed.ts`) automatically. The app's DB file is `data/sherpa.db` resolved relative to `process.cwd()`; the MCP server has its own resolution order (see Gotchas).
- `src/lib/server/repositories/*.ts` — one plain object per entity (e.g. `scenariosRepository`) holding prepared statements. **Server-only** (they import `db`); never import them into client components.
- Schema lives entirely in `src/lib/shared/db-schema.ts` as idempotent `CREATE TABLE IF NOT EXISTS` calls inside one transaction, plus a `runDataMigrations` step for additive `ALTER TABLE`/backfill (SQLite can't drop columns, so legacy columns like `scenarios.cohort_config_id` are left in place and simply no longer written). Schema + seed sit in `shared/` (not `server/`) so the MCP server can self-initialize a fresh database.

### SvelteKit conventions

- Route directories use `+page.server.ts` (a `load` function for reads + `actions` for mutations via `FormData`) calling repositories, with `+page.svelte` for UI. Global settings are loaded in `src/routes/+layout.server.ts`.
- Server-only code (`$lib/server/**`) must never reach the client bundle.
- A few JSON endpoints live under `src/routes/api/**` (import/export, provider price updates, settings init).

### Domain model: scope + override cascade

A `Scenario` targets a **scope** (`scope_type`: `all_clients` | `verticals` | `cohorts`). `resolveScenarioCohorts` (in `financial-engine.ts`) expands that scope into concrete `CohortConfig`s and then applies a **three-level override cascade in order: global (`all_clients`) → vertical → cohort** (`scenario_scope_overrides` table). This resolution is the trickiest domain logic — changes to cohort/override handling belong here.

### Results caching & invalidation

`scenario_results` caches computed KPIs and the monthly arrays (cashflows/MRR/customers stored as JSON strings). Any mutation that changes a scenario's inputs must **delete the cached row** — `scenariosRepository.update` already does this, and `invalidateResults` + the `findScenarioIdsBy*` helpers exist to cascade-invalidate when upstream entities (services, providers, cohorts, verticals, cost items) change. When adding a new way to edit inputs, wire in invalidation or KPIs will go stale.

The row stores both bounds of the band plus the guarded IRR: `npv`/`payback_months`/`roi_percent` hold the **upper** bound, with `npv_lower`/`payback_months_lower`/`roi_percent_lower` the lower, and `irr_monthly`/`irr_annual_nominal`/`irr_status` the guarded IRR. Migration 8 added these columns (and the cohort `gross_margin`/`adoption_ramp_months` + scenario `capex_contingency_pct` inputs) and invalidated all cached results. Migration 11 (ADR 0001–0004 revenue overhaul) then added `scenarios.modeling_type`/`revenue_carrier`/`revenue_bridge` and `scenario_results.revenue_integrity_status`/`revenue_integrity_message`, backfilled the new scenario columns from the deprecated `revenue_source`, and again invalidated all cached results.

### Client state, UI, styling

- consult DESIGN.md for detailed styling and component guidelines
- **Svelte 5 runes mode is forced** project-wide (see `svelte.config.js`). Global client state is a class singleton `appState` in `src/lib/stores/app.svelte.ts` using `$state`, hydrated via `appState.init(...)` from the layout load. Reactive helpers use the `.svelte.ts` extension.
- UI components in `src/lib/components/ui/` are **shadcn-svelte** (Bits UI) generated from the registry (style `vega`, `lucide` icons) — prefer regenerating/adding via the shadcn CLI over hand-editing. App-specific components live alongside under `catalog/`, `dashboard/`, `layout/`, `wizard/`.
- **Tailwind CSS v4 is configured entirely in CSS** at `src/routes/layout.css` (OKLCH theme, `@import 'tailwindcss'`) via `@tailwindcss/vite`. There is **no `tailwind.config.js`** (the README's reference to one is outdated).
- Charts use Apache ECharts; dashboard PNG export uses `html2canvas-pro`.

### Path aliases

`$lib` → `src/lib`. Per `components.json`: `$lib/components`, `$lib/components/ui`, `$lib/utils`, `$lib/hooks`.

## Gotchas

- **MCP DB path resolution**: Handled by `src/lib/shared/db-path.ts`. `SHERPA_DB_PATH` always wins if valid (ignoring unsubstituted placeholders containing `${`), then `repoDbPath` (dev), then the OS user data dir (`~/Library/Application Support/Sherpa/` on macOS, `%APPDATA%\Sherpa\` on Windows). The MCP server self-initializes (migrations + seed) on first run.
- **In-process Dashboard & ESM Caching**: The SvelteKit dashboard is served in-process by the MCP server using Node's native HTTP module. Environment variables (`ORIGIN`, `SHERPA_DB_PATH`, `HOST`) must be written to `process.env` *before* dynamically importing `shims.js` and `handler.js` via `pathToFileURL`. Because SvelteKit caches these variables upon import, the dashboard port and origin are baked for the entire process lifetime.
- **MCP Stderr Logging & Guard**: MCP servers must log only to `stderr` (stdout carries JSON-RPC). To prevent third-party dashboard or SvelteKit logs from leaking to stdout, `mcp-server/src/stderr-guard.ts` is imported as the very first line of `index.ts` to globally bind `console.log/info/debug/warn` to `console.error`.
- **Database lock & busy_timeout**: SvelteKit and MCP write to the same SQLite WAL file. Both connection initialization paths must set `db.pragma('busy_timeout = 5000')` to handle lock contention.
- **Health check contract**: SvelteKit exposes `/api/health` returning `{ ok: true, name: 'sherpa', version, dbPath }`. The `name` proving identity and `version` mapping to `package.json` are critical for launcher validation; `dbPath` must match the launcher's resolved DB or the dashboard is treated as belonging to a different Sherpa install (not reused, not killed).
- **`roi_percent` columns hold a Profitability Index, not a percentage.** Since the CFO-grade overhaul, `scenario_results.roi_percent`/`roi_percent_lower` (and `CalculationResult.roiUpper`/`roiLower`) store a discounted PI multiple (e.g. `4.47`) — render with `formatPI` (→ `4.47x`), never `formatPercent`. Likewise the legacy `irr_annual` column now stores the **nominal** annual IRR (monthly × 12, not compounded); read `irr_status`/`irr_annual_nominal` and gate on `displayable` via `formatIrr`, since IRR is intentionally suppressed (`n/d`) for short-payback or ambiguous-sign profiles. (One known seam: the scenario-compare table still renders IRR with `formatPercent(irr_annual)` without the guard.)
- **`scenarios.revenue_source` is deprecated (kept, not dropped).** Since the ADR 0001–0004 overhaul, revenue is driven by `modeling_type` + `revenue_carrier` (+ `revenue_bridge`), resolved by `resolveCarrier` to **exactly one** carrier. The old `revenue_source` (`cohort` | `monetization` | `both`) column is left in place (SQLite can't drop columns), was backfilled into the new fields by Migration 11, and is no longer read by the engine. Don't reintroduce summing across carriers — `validateRevenueIntegrity` blocks it (`block`) or warns (`warn`) at save time.
- `.npmrc` sets `engine-strict=true`.
- **MCP Architecture and Guidance**: Comprehensive details on MCP exposure surfaces, transport, codegen sync, and development maintenance reside in [MCP-ARCHITECTURE.md](file:///Users/piotrlangowski/Documents/Sherpa/MCP-ARCHITECTURE.md).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:

- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
