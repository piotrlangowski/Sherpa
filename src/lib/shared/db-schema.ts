export interface DatabaseConnection {
  prepare(sql: string): any;
  exec(sql: string): void;
  transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T;
  pragma?(sql: string): void;
}

export function runMigrations(db: DatabaseConnection): void {
  // Use a transaction for safe schema execution
  db.transaction(() => {
    // 1. Settings
    db.prepare(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `).run();

    // 2. Providers
    db.prepare(`
      CREATE TABLE IF NOT EXISTS providers (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        model_name      TEXT NOT NULL,
        input_price     REAL NOT NULL,
        output_price    REAL NOT NULL,
        is_predefined   INTEGER DEFAULT 0,
        currency        TEXT NOT NULL DEFAULT 'USD',
        input_tokens_per_credit  INTEGER NOT NULL DEFAULT 1000000,
        output_tokens_per_credit INTEGER NOT NULL DEFAULT 333333,
        updated_at      TEXT NOT NULL
      )
    `).run();

    // 3. Services
    db.prepare(`
      CREATE TABLE IF NOT EXISTS services (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        description     TEXT,
        status          TEXT NOT NULL DEFAULT 'planned',
        provider_id     TEXT REFERENCES providers(id) ON DELETE SET NULL,
        avg_input_tokens   INTEGER DEFAULT 0,
        avg_output_tokens  INTEGER DEFAULT 0,
        avg_requests_per_user_month INTEGER DEFAULT 0,
        fixed_cost_per_month REAL,
        fixed_cost_currency TEXT NOT NULL DEFAULT 'USD',
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      )
    `).run();

    // 4. Packs
    db.prepare(`
      CREATE TABLE IF NOT EXISTS packs (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS pack_services (
        pack_id    TEXT REFERENCES packs(id) ON DELETE CASCADE,
        service_id TEXT REFERENCES services(id) ON DELETE CASCADE,
        PRIMARY KEY (pack_id, service_id)
      )
    `).run();

    // 5. Plans
    db.prepare(`
      CREATE TABLE IF NOT EXISTS plans (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT,
        base_price  REAL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS plan_services (
        plan_id    TEXT REFERENCES plans(id) ON DELETE CASCADE,
        service_id TEXT REFERENCES services(id) ON DELETE CASCADE,
        PRIMARY KEY (plan_id, service_id)
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS plan_packs (
        plan_id TEXT REFERENCES plans(id) ON DELETE CASCADE,
        pack_id TEXT REFERENCES packs(id) ON DELETE CASCADE,
        PRIMARY KEY (plan_id, pack_id)
      )
    `).run();

    // 6. Dependencies
    db.prepare(`
      CREATE TABLE IF NOT EXISTS service_dependencies (
        id              TEXT PRIMARY KEY,
        source_id       TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
        target_id       TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
        dependency_type TEXT NOT NULL,
        UNIQUE(source_id, target_id)
      )
    `).run();

    // 7. Verticals
    db.prepare(`
      CREATE TABLE IF NOT EXISTS verticals (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT,
        tam_users   INTEGER DEFAULT 0,
        sam_users   INTEGER DEFAULT 0,
        som_users   INTEGER DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS vertical_plans (
        vertical_id TEXT REFERENCES verticals(id) ON DELETE CASCADE,
        plan_id     TEXT REFERENCES plans(id) ON DELETE CASCADE,
        PRIMARY KEY (vertical_id, plan_id)
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS vertical_packs (
        vertical_id TEXT REFERENCES verticals(id) ON DELETE CASCADE,
        pack_id     TEXT REFERENCES packs(id) ON DELETE CASCADE,
        PRIMARY KEY (vertical_id, pack_id)
      )
    `).run();

    // 8. Cost Items
    db.prepare(`
      CREATE TABLE IF NOT EXISTS cost_items (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        category    TEXT NOT NULL,
        subcategory TEXT,
        amount      REAL NOT NULL,
        frequency   TEXT NOT NULL,
        currency    TEXT NOT NULL DEFAULT 'USD',
        service_id  TEXT REFERENCES services(id) ON DELETE SET NULL,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      )
    `).run();

    // 9. Cohorts
    db.prepare(`
      CREATE TABLE IF NOT EXISTS cohort_configs (
        id                      TEXT PRIMARY KEY,
        name                    TEXT NOT NULL,
        vertical_id             TEXT REFERENCES verticals(id) ON DELETE SET NULL,
        current_users           INTEGER DEFAULT 0,
        monthly_acquisition     INTEGER DEFAULT 0,
        acquisition_growth_rate REAL DEFAULT 0,
        monthly_churn_rate      REAL DEFAULT 0.05,
        retention_floor         REAL DEFAULT 0.60,
        monthly_expansion_rate  REAL DEFAULT 0.02,
        ai_adoption_rate        REAL DEFAULT 0.30,
        base_arpu              REAL DEFAULT 100,
        arpu_uplift             REAL DEFAULT 0,
        arpu_uplift_percent     REAL DEFAULT 0,
        churn_reduction         REAL DEFAULT 0,
        acquisition_uplift      REAL DEFAULT 0,
        created_at              TEXT NOT NULL,
        updated_at              TEXT NOT NULL
      )
    `).run();

    // 10. Client Base (singleton — the company's entire customer base)
    db.prepare(`
      CREATE TABLE IF NOT EXISTS client_base (
        id                          TEXT PRIMARY KEY DEFAULT 'singleton',
        total_users                 INTEGER DEFAULT 0,
        default_arpu                REAL DEFAULT 100,
        default_monthly_churn_rate  REAL DEFAULT 0.05,
        default_monthly_acquisition INTEGER DEFAULT 0,
        default_acquisition_growth_rate REAL DEFAULT 0,
        default_ai_adoption_rate    REAL DEFAULT 0.30,
        default_retention_floor     REAL DEFAULT 0.60,
        default_expansion_rate      REAL DEFAULT 0.02,
        default_arpu_uplift         REAL DEFAULT 0,
        default_arpu_uplift_percent REAL DEFAULT 0,
        default_churn_reduction     REAL DEFAULT 0,
        default_acquisition_uplift  REAL DEFAULT 0,
        updated_at                  TEXT NOT NULL
      )
    `).run();

    // Ensure singleton row exists
    db.prepare(`
      INSERT OR IGNORE INTO client_base (id, updated_at)
      VALUES ('singleton', datetime('now'))
    `).run();

    // 11. Scenarios
    db.prepare(`
      CREATE TABLE IF NOT EXISTS scenarios (
        id                     TEXT PRIMARY KEY,
        name                   TEXT NOT NULL,
        description            TEXT,
        projection_months      INTEGER DEFAULT 36,
        discount_rate          REAL DEFAULT 0.10,
        scope_type             TEXT NOT NULL DEFAULT 'cohorts',
        revenue_source         TEXT NOT NULL DEFAULT 'cohort',
        created_at             TEXT NOT NULL,
        updated_at             TEXT NOT NULL
      )
    `).run();

    // 11a. Scenario — Verticals (M:N) — used when scope_type='verticals'
    db.prepare(`
      CREATE TABLE IF NOT EXISTS scenario_verticals (
        scenario_id TEXT REFERENCES scenarios(id) ON DELETE CASCADE,
        vertical_id TEXT REFERENCES verticals(id) ON DELETE CASCADE,
        PRIMARY KEY (scenario_id, vertical_id)
      )
    `).run();

    // 11b. Scenario — Cohorts (M:N) — used when scope_type='cohorts'
    db.prepare(`
      CREATE TABLE IF NOT EXISTS scenario_cohorts (
        scenario_id      TEXT REFERENCES scenarios(id) ON DELETE CASCADE,
        cohort_config_id TEXT REFERENCES cohort_configs(id) ON DELETE CASCADE,
        PRIMARY KEY (scenario_id, cohort_config_id)
      )
    `).run();

    // 11c. Scenario Scope Overrides — behavioral parameter overrides per scope level
    // Inheritance cascade: cohort override → vertical override → base override → catalog defaults
    db.prepare(`
      CREATE TABLE IF NOT EXISTS scenario_scope_overrides (
        id                      TEXT PRIMARY KEY,
        scenario_id             TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
        target_type             TEXT NOT NULL,
        target_id               TEXT,
        monthly_churn_rate      REAL,
        monthly_acquisition     INTEGER,
        acquisition_growth_rate REAL,
        ai_adoption_rate        REAL,
        retention_floor         REAL,
        expansion_rate          REAL,
        arpu_override           REAL,
        arpu_uplift             REAL,
        arpu_uplift_percent     REAL,
        churn_reduction         REAL,
        acquisition_uplift      REAL
      )
    `).run();

    db.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_scenario_scope_overrides_unique 
      ON scenario_scope_overrides(scenario_id, target_type, COALESCE(target_id, ''))
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS scenario_services (
        scenario_id TEXT REFERENCES scenarios(id) ON DELETE CASCADE,
        service_id  TEXT REFERENCES services(id) ON DELETE CASCADE,
        rollout_month INTEGER DEFAULT 0,
        PRIMARY KEY (scenario_id, service_id)
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS scenario_packs (
        scenario_id TEXT REFERENCES scenarios(id) ON DELETE CASCADE,
        pack_id     TEXT REFERENCES packs(id) ON DELETE CASCADE,
        rollout_month INTEGER DEFAULT 0,
        PRIMARY KEY (scenario_id, pack_id)
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS scenario_plans (
        scenario_id TEXT REFERENCES scenarios(id) ON DELETE CASCADE,
        plan_id     TEXT REFERENCES plans(id) ON DELETE CASCADE,
        rollout_month INTEGER DEFAULT 0,
        PRIMARY KEY (scenario_id, plan_id)
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS scenario_costs (
        scenario_id TEXT REFERENCES scenarios(id) ON DELETE CASCADE,
        cost_item_id TEXT REFERENCES cost_items(id) ON DELETE CASCADE,
        PRIMARY KEY (scenario_id, cost_item_id)
      )
    `).run();

    // 12. Scenario Results
    db.prepare(`
      CREATE TABLE IF NOT EXISTS scenario_results (
        id              TEXT PRIMARY KEY,
        scenario_id     TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
        payback_months  REAL,
        npv             REAL,
        irr_annual      REAL,
        tco             REAL,
        roi_percent     REAL,
        monthly_cashflows TEXT,
        monthly_mrr      TEXT,
        monthly_customers TEXT,
        calculated_at   TEXT NOT NULL
      )
    `).run();

    // 13. Monetization configs (polymorphic over service/pack/plan).
    // scenario_id NULL  → catalog config (the default attached to the entity)
    // scenario_id NOT NULL → scenario-level override of that entity's config
    db.prepare(`
      CREATE TABLE IF NOT EXISTS monetization_configs (
        id                       TEXT PRIMARY KEY,
        entity_type              TEXT NOT NULL,
        entity_id                TEXT NOT NULL,
        scenario_id              TEXT REFERENCES scenarios(id) ON DELETE CASCADE,
        monetization_type        TEXT NOT NULL DEFAULT 'none',
        addon_monthly_fee        REAL,
        addon_has_usage_limit    INTEGER DEFAULT 0,
        addon_usage_limit        INTEGER,
        addon_overcharge_policy  TEXT,
        usage_variant            TEXT,
        price_per_credit         REAL,
        hybrid_monthly_fee       REAL,
        hybrid_included_credits  INTEGER,
        hybrid_overcharge_policy TEXT,
        overcharge_markup        REAL,
        overcharge_user_pct      REAL,
        avg_overcharge_pct       REAL
      )
    `).run();

    // SQLite cannot express COALESCE() inside a table-level UNIQUE constraint,
    // so the "one catalog config + one override per scenario per entity" rule
    // is enforced via a unique index (mirrors scenario_scope_overrides).
    db.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_monetization_configs_unique
      ON monetization_configs(entity_type, entity_id, COALESCE(scenario_id, ''))
    `).run();
  })();

  // --- Data migrations (run outside main transaction to be idempotent) ---
  runDataMigrations(db);
}

/**
 * Idempotent data migrations.
 * Handles upgrading an existing DB from the old single-cohort model
 * to the new multi-cohort scope model.
 */
function runDataMigrations(db: DatabaseConnection): void {
  // Migration 1: Add scope_type column to scenarios if it doesn't exist
  // (for databases created before this schema version)
  const scenarioColumns = (db.prepare("PRAGMA table_info(scenarios)").all() as any[])
    .map(c => c.name);

  if (!scenarioColumns.includes('scope_type')) {
    db.prepare("ALTER TABLE scenarios ADD COLUMN scope_type TEXT NOT NULL DEFAULT 'cohorts'").run();
  }

  // Migration 3: Add currency to cost_items if it doesn't exist
  const costItemColumns = (db.prepare("PRAGMA table_info(cost_items)").all() as any[])
    .map(c => c.name);
  if (!costItemColumns.includes('currency')) {
    db.prepare("ALTER TABLE cost_items ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'").run();
  }

  // Migration 4: Add currency to providers if it doesn't exist
  const providerColumns = (db.prepare("PRAGMA table_info(providers)").all() as any[])
    .map(c => c.name);
  if (!providerColumns.includes('currency')) {
    db.prepare("ALTER TABLE providers ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'").run();
  }

  // Migration 5: Add fixed_cost_currency to services if it doesn't exist
  const serviceColumns = (db.prepare("PRAGMA table_info(services)").all() as any[])
    .map(c => c.name);
  if (!serviceColumns.includes('fixed_cost_currency')) {
    db.prepare("ALTER TABLE services ADD COLUMN fixed_cost_currency TEXT NOT NULL DEFAULT 'USD'").run();
  }

  // Migration 6: Add uplift columns & invalidate results
  let resultsInvalidated = false;
  const cohortColumns = (db.prepare("PRAGMA table_info(cohort_configs)").all() as any[]).map(c => c.name);
  const newCohortCols = ['arpu_uplift', 'arpu_uplift_percent', 'churn_reduction', 'acquisition_uplift'];
  for (const col of newCohortCols) {
    if (!cohortColumns.includes(col)) {
      db.prepare(`ALTER TABLE cohort_configs ADD COLUMN ${col} REAL DEFAULT 0`).run();
      resultsInvalidated = true;
    }
  }

  const clientBaseColumns = (db.prepare("PRAGMA table_info(client_base)").all() as any[]).map(c => c.name);
  const newClientBaseCols = ['default_arpu_uplift', 'default_arpu_uplift_percent', 'default_churn_reduction', 'default_acquisition_uplift'];
  for (const col of newClientBaseCols) {
    if (!clientBaseColumns.includes(col)) {
      db.prepare(`ALTER TABLE client_base ADD COLUMN ${col} REAL DEFAULT 0`).run();
      resultsInvalidated = true;
    }
  }

  const overrideColumns = (db.prepare("PRAGMA table_info(scenario_scope_overrides)").all() as any[]).map(c => c.name);
  const newOverrideCols = ['arpu_uplift', 'arpu_uplift_percent', 'churn_reduction', 'acquisition_uplift'];
  for (const col of newOverrideCols) {
    if (!overrideColumns.includes(col)) {
      db.prepare(`ALTER TABLE scenario_scope_overrides ADD COLUMN ${col} REAL`).run();
      resultsInvalidated = true;
    }
  }

  if (resultsInvalidated) {
    db.prepare("DELETE FROM scenario_results").run();
  }

  // Migration 7: AI monetization — provider credit columns + scenario revenue_source.
  // (The monetization_configs table itself is created idempotently in runMigrations.)
  if (!providerColumns.includes('input_tokens_per_credit')) {
    db.prepare("ALTER TABLE providers ADD COLUMN input_tokens_per_credit INTEGER NOT NULL DEFAULT 1000000").run();
  }
  if (!providerColumns.includes('output_tokens_per_credit')) {
    db.prepare("ALTER TABLE providers ADD COLUMN output_tokens_per_credit INTEGER NOT NULL DEFAULT 333333").run();
  }
  if (!scenarioColumns.includes('revenue_source')) {
    db.prepare("ALTER TABLE scenarios ADD COLUMN revenue_source TEXT NOT NULL DEFAULT 'cohort'").run();
  }

  // Migration 2: Migrate old cohort_config_id → scenario_cohorts junction
  if (scenarioColumns.includes('cohort_config_id')) {
    const oldScenarios = db.prepare(`
      SELECT id, cohort_config_id FROM scenarios
      WHERE cohort_config_id IS NOT NULL
    `).all() as any[];

    if (oldScenarios.length > 0) {
      const insertJunction = db.prepare(`
        INSERT OR IGNORE INTO scenario_cohorts (scenario_id, cohort_config_id)
        VALUES (?, ?)
      `);

      const insertOverride = db.prepare(`
        INSERT OR IGNORE INTO scenario_scope_overrides
          (id, scenario_id, target_type, target_id,
           monthly_churn_rate, monthly_acquisition, acquisition_growth_rate,
           ai_adoption_rate, retention_floor, expansion_rate, arpu_override)
        SELECT
          lower(hex(randomblob(16))),
          ?, 'cohort', ?,
          c.monthly_churn_rate, c.monthly_acquisition, c.acquisition_growth_rate,
          c.ai_adoption_rate, c.retention_floor, c.monthly_expansion_rate, c.base_arpu
        FROM cohort_configs c WHERE c.id = ?
      `);

      db.transaction(() => {
        for (const s of oldScenarios) {
          insertJunction.run(s.id, s.cohort_config_id);
          insertOverride.run(s.id, s.cohort_config_id, s.cohort_config_id);
        }
      })();
    }

    // Note: We cannot DROP COLUMN in SQLite < 3.35, so we leave cohort_config_id in place
    // and simply stop writing to it. New scenarios will use scenario_cohorts instead.
  }
}
