---
name: sherpa-patterns
description: Coding patterns and architectural conventions extracted from the Sherpa repository
version: 1.0.0
source: local-git-analysis
analyzed_commits: 100
surface: dev
---

# Sherpa Coding Patterns

## Commit Conventions

The repository transitioned from Polish description-based commits to strict **Conventional Commits**:
- `feat:` – For new features (e.g., "feat: implement scope-aware scenario creation...")
- `fix:` – For bug fixes (e.g., "fix: polish incremental ROI model...")
- `chore:` – For maintenance tasks and version bumps (e.g., "chore: version bump")
- Commit messages should be in English for all new contributions.

## Code Architecture

Sherpa contains two independent TypeScript projects:
1. **SvelteKit app** (root `src/`): Web UI using Svelte 5 runes (`$state`, `$derived`).
2. **MCP Server** (`mcp-server/`): Exposes entity actions and launcher services.

These projects share code through a symlink: `mcp-server/src/shared` points to `src/lib/shared/`.
- Relative imports within `src/lib/shared/` **must use the `.js` extension** (NodeNext resolution requirement in MCP server build).
- SQLite is the data store. Database connection is a singleton in `src/lib/server/db.ts`.

## Workflows

### 1. Modifying Shared Logic
When editing code in `src/lib/shared/` (e.g., `types.ts`, `financial-math.ts`, `db-schema.ts`):
1. Make changes in `src/lib/shared/`.
2. Build the MCP server: `cd mcp-server && npm run build` (or rebuild from root).
3. Verify type correctness using `npm run check`.

### 2. Database Schema Migrations
1. Add standard idempotent `CREATE TABLE IF NOT EXISTS` statements inside the main transaction of `runMigrations` in `src/lib/shared/db-schema.ts`.
2. For schema changes in existing tables (e.g., `ALTER TABLE`), add checks using `PRAGMA table_info` inside the `runDataMigrations` function in `src/lib/shared/db-schema.ts`.
3. Invalidate computed results: if migrations modify calculation parameters, call `db.prepare("DELETE FROM scenario_results").run()` to clear caches.

### 3. Scenario Calculation Invalidation
- Results are cached in `scenario_results`.
- If modifying cohorts, cost items, providers, or services associated with scenarios, ensure that you delete the cached row in `scenario_results` so the financial engine recomputes correct values next time it runs.

## Testing Patterns

- Colocation: Test files are named `[name].test.ts` and placed next to the source code file.
- Framework: Vitest.
- Run tests: `npm test` or `npx vitest run`.
- Main focus of testing: financial math (`src/lib/shared/financial-math.test.ts`).
