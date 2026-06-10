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

```bash
cd mcp-server && npm install && npm run build     # tsc → mcp-server/build/
node mcp-server/build/index.js                    # run over stdio
cd mcp-server && npm run dev                       # run from source via tsx
npm run mcp:install                               # (from root) copy mcp-skills/ → .agent/skills/ and register "sherpa-dev" in Claude Desktop config (env SHERPA_DB_PATH → repo data/sherpa.db)
npm run mcp:inspect                               # (from root) open MCP Inspector against the built server — fastest tool-testing loop, no Claude Desktop needed
npm run mcp:pack                                  # (from root) build + pack the Claude Desktop extension → sherpa.mcpb (manifest in mcp-server/manifest.json)
```

*Note: `npm run build` must be run in the repository root at least once for `open_dashboard` to work in dev mode.*

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
- **`src/lib/shared/financial-math.ts`** — ALL computation: `buildCohortModel`, `calculateNPV`/`calculateIRR` (Newton-Raphson + bisection fallback) / `calculatePaybackPeriod` / `calculateTCO`, `calculateScenario`, `runSensitivityAnalysis`. These are **pure** functions with zero DB access; providers are passed in as arguments. This is what the MCP server consumes.
- **`src/lib/server/services/financial-engine.ts`** — thin **DB-aware wrappers**: resolve the scenario's cohorts + provider list from the DB, then delegate to the pure functions. `runAndSaveScenario` recomputes and caches results.
- Put new financial math in the **shared** module, not in the server wrapper, so the app and MCP stay consistent.

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

### Client state, UI, styling
- **Svelte 5 runes mode is forced** project-wide (see `svelte.config.js`). Global client state is a class singleton `appState` in `src/lib/stores/app.svelte.ts` using `$state`, hydrated via `appState.init(...)` from the layout load. Reactive helpers use the `.svelte.ts` extension.
- UI components in `src/lib/components/ui/` are **shadcn-svelte** (Bits UI) generated from the registry (style `vega`, `lucide` icons) — prefer regenerating/adding via the shadcn CLI over hand-editing. App-specific components live alongside under `catalog/`, `dashboard/`, `layout/`, `wizard/`.
- **Tailwind CSS v4 is configured entirely in CSS** at `src/routes/layout.css` (OKLCH theme, `@import 'tailwindcss'`) via `@tailwindcss/vite`. There is **no `tailwind.config.js`** (the README's reference to one is outdated).
- Charts use Apache ECharts; dashboard PNG export uses `html2canvas-pro`.

### Path aliases
`$lib` → `src/lib`. Per `components.json`: `$lib/components`, `$lib/components/ui`, `$lib/utils`, `$lib/hooks`.

## Gotchas
- **MCP DB path resolution**: Handled by `src/lib/shared/db-path.ts`. `SHERPA_DB_PATH` always wins if valid (ignoring unsubstituted placeholders containing `${`), then `repoDbPath` (dev), then the OS user data dir (`~/Library/Application Support/Sherpa/` on macOS). The MCP server self-initializes (migrations + seed) on first run.
- **SvelteKit CSRF & ORIGIN gotcha**: SvelteKit enforces CSRF checks for form actions. When launching SvelteKit via `mcp-server/src/launcher.ts`, you MUST set the `ORIGIN` environment variable (e.g., `http://127.0.0.1:4848`) in the spawned process, or all form post actions will fail with a 403 "Cross-site POST form submissions are forbidden" error.
- **Electron run path**: Claude Desktop can host the MCP server inside its Electron runtime, where `process.execPath` is the Electron binary and the `ELECTRON_RUN_AS_NODE` fuse may be disabled — spawning `process.execPath` then boots the full Claude GUI instead of the dashboard. `resolveNodeBinary()` in `mcp-server/src/launcher.ts` finds a standalone `node` (`SHERPA_NODE_PATH` env → `which node` → common install paths) and only falls back to `ELECTRON_RUN_AS_NODE`.
- **Database lock & busy_timeout**: SvelteKit and MCP write to the same SQLite WAL file. Both connection initialization paths must set `db.pragma('busy_timeout = 5000')` to handle lock contention.
- **Health check contract**: SvelteKit exposes `/api/health` returning `{ ok: true, name: 'sherpa', version, dbPath }`. The `name` proving identity and `version` mapping to `package.json` are critical for launcher validation and automatic restart upgrades; `dbPath` must match the launcher's resolved DB or the dashboard is treated as belonging to a different Sherpa install (not reused, not killed).
- **MCP Stderr Logging**: MCP servers must log only to `stderr` (stdout carries JSON-RPC). This includes anything reachable from `shared/seed.ts` or imports during tool executions.
- `.npmrc` sets `engine-strict=true`.
