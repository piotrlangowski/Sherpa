# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Sherpa is a **local-first** AI-feature ROI calculator for SaaS (financial modeling: NPV/IRR/payback/TCO over a cohort revenue model plus LLM token + CAPEX/OPEX cost engine). It is a SvelteKit app backed by SQLite, plus a standalone MCP server that exposes the same engine to LLM hosts (e.g. Claude Desktop). All data lives locally in `data/sherpa.db`; nothing is sent to the cloud. The README is in Polish; many commit messages are too.

## Commands

```bash
npm run dev            # Vite dev server at http://localhost:5173
npm run build          # Production build (adapter-node)
npm run preview        # Serve the production build
npm run check          # svelte-check type checking — this is the lint/CI gate (no ESLint/Prettier configured)
npm run check:watch    # type check in watch mode
```

**Tests** — there is no `test` script in `package.json`. Run Vitest directly:

```bash
npx vitest                                        # watch mode
npx vitest run                                    # single pass (CI)
npx vitest run src/lib/shared/financial-math.test.ts   # one file
npx vitest run -t "calculates NPV"                # one test by name
npx vitest run --coverage                         # coverage (only measures src/lib/shared/**; thresholds 80/80/65)
```

Test files are colocated as `*.test.ts`. Only two suites exist today (`src/lib/shared/financial-math.test.ts`, `src/lib/server/services/importer.test.ts`); the pure math module is the primary thing under test.

**MCP server** (separate npm project under `mcp-server/`):

```bash
cd mcp-server && npm install && npm run build     # tsc → mcp-server/build/
node mcp-server/build/index.js                    # run over stdio
cd mcp-server && npm run dev                       # run from source via tsx
npm run mcp:install                               # (from root) copy mcp-skills/ → .agent/skills/ and register the server in Claude Desktop config
```

## Architecture

### Two projects, one shared engine
This repo contains **two independent TypeScript projects**, each with its own `package.json`, `tsconfig.json`, and `node_modules`:
- the **SvelteKit app** at the root (`src/`)
- the **MCP server** at `mcp-server/`

They share financial logic through a **symlink**: `mcp-server/src/shared → ../../src/lib/shared`. So `src/lib/shared/` is the single source of truth, and `tsc` compiles the symlinked copy into `mcp-server/build/shared/`. **After changing anything in `src/lib/shared/`, rebuild the MCP server** (`cd mcp-server && npm run build`) or it will serve stale logic.

### Pure vs. impure split (the central design decision)
- **`src/lib/shared/financial-math.ts`** — ALL computation: `buildCohortModel`, `calculateNPV`/`calculateIRR` (Newton-Raphson + bisection fallback) / `calculatePaybackPeriod` / `calculateTCO`, `calculateScenario`, `runSensitivityAnalysis`. These are **pure** functions with zero DB access; providers are passed in as arguments. This is what the MCP server consumes.
- **`src/lib/server/services/financial-engine.ts`** — thin **DB-aware wrappers**: resolve the scenario's cohorts + provider list from the DB, then delegate to the pure functions. `runAndSaveScenario` recomputes and caches results.
- Put new financial math in the **shared** module, not in the server wrapper, so the app and MCP stay consistent.

### Data layer
- SQLite via `better-sqlite3`. The connection is a **singleton** created on first import of `src/lib/server/db.ts` (WAL mode, `foreign_keys = ON`). Importing it runs `runMigrations` (`schema.ts`) then `seedDatabase` (`seed.ts`) automatically. The DB file is `data/sherpa.db` resolved relative to `process.cwd()`.
- `src/lib/server/repositories/*.ts` — one plain object per entity (e.g. `scenariosRepository`) holding prepared statements. **Server-only** (they import `db`); never import them into client components.
- Schema lives entirely in `schema.ts` as idempotent `CREATE TABLE IF NOT EXISTS` calls inside one transaction, plus a `runDataMigrations` step for additive `ALTER TABLE`/backfill (SQLite can't drop columns, so legacy columns like `scenarios.cohort_config_id` are left in place and simply no longer written).

### SvelteKit conventions
- Route directories use `+page.server.ts` (a `load` function for reads + `actions` for mutations via `FormData`) calling repositories, with `+page.svelte` for UI. Global settings are loaded in `src/routes/+layout.server.ts`.
- Server-only code (`$lib/server/**`) must never reach the client bundle.
- A few JSON endpoints live under `src/routes/api/**` (import/export, provider price updates, settings init).

### Domain model: scope + override cascade
A `Scenario` targets a **scope** (`scope_type`: `all_clients` | `verticals` | `cohorts`). `resolveScenarioCohorts` (in `financial-engine.ts`) expands that scope into concrete `CohortConfig`s and then applies a **three-level override cascade in order: global (`all_clients`) → vertical → cohort** (`scenario_scope_overrides` table). This resolution is the trickiest domain logic — changes to cohort/override handling belong here.

### Results caching & invalidation
`scenario_results` caches computed KPIs and the monthly arrays (cashflows/MRR/customers stored as JSON strings). Any mutation that changes a scenario's inputs must **delete the cached row** — `scenariosRepository.update` already does this, and `invalidateResults` + the `findScenarioIdsBy*` helpers exist to cascade-invalidate when upstream entities (services, providers, cohorts, verticals, cost items) change. When adding a new way to edit inputs, wire in invalidation or KPIs will go stale.

### Client state, UI, styling
- **Svelte 5 runes mode is forced** project-wide (see `svelte.config.js`). Global client state is a class singleton `appState` in `src/lib/stores/app.svelte.ts` using `$state`, hydrated via `appState.init(...)` from the layout load. Reactive helpers use the `.svelte.ts` extension.
- UI components in `src/lib/components/ui/` are **shadcn-svelte** (Bits UI) generated from the registry (style `vega`, `lucide` icons) — prefer regenerating/adding via the shadcn CLI over hand-editing. App-specific components live alongside under `catalog/`, `dashboard/`, `layout/`, `wizard/`.
- **Tailwind CSS v4 is configured entirely in CSS** at `src/routes/layout.css` (OKLCH theme, `@import 'tailwindcss'`) via `@tailwindcss/vite`. There is **no `tailwind.config.js`** (the README's reference to one is outdated).
- Charts use Apache ECharts; dashboard PNG export uses `html2canvas-pro`.

### Path aliases
`$lib` → `src/lib`. Per `components.json`: `$lib/components`, `$lib/components/ui`, `$lib/utils`, `$lib/hooks`.

## Gotchas
- **MCP scenario reads are on the legacy schema.** `getFullScenario` in `mcp-server/src/index.ts` still reads the old single `scenarios.cohort_config_id` / `cohort_config`, which predates the multi-cohort scope migration. Scenarios created by the current app store cohorts in the `scenario_cohorts` junction, so the MCP path can return missing/stale cohort data. Account for this when touching MCP scenario tooling.
- **MCP DB path.** `mcp-server/src/db.ts` resolves the DB by trying `SHERPA_DB_PATH`, then a **hardcoded absolute path**, then cwd-relative fallbacks. The app and MCP must point at the **same** `data/sherpa.db` to share data (the installer sets `cwd` to the project root for this reason). A stale `mcp-server/data/sherpa.db` also exists — ignore it. MCP servers must log only to `stderr` (stdout carries JSON-RPC).
- `.npmrc` sets `engine-strict=true`.
