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
        service_type    TEXT DEFAULT 'copilot',
        interaction_driver_type TEXT DEFAULT 'flat',
        monthly_volume  REAL DEFAULT 0,
        volume_growth_rate REAL DEFAULT 0,
        interactions_per_customer_month REAL DEFAULT 0,
        fully_loaded_cost_per_fte_month REAL DEFAULT 0,
        productive_hours_per_fte_month REAL DEFAULT 120,
        average_handle_time_seconds INTEGER DEFAULT 0,
        baseline_fte    REAL DEFAULT 0,
        staffing_realization_lag_months INTEGER DEFAULT 0,
        containment_rate REAL DEFAULT 0,
        containment_start_rate REAL DEFAULT 0,
        containment_ramp_months INTEGER DEFAULT 0,
        escalation_rate REAL DEFAULT 0,
        failed_deflection_penalty REAL DEFAULT 0,
        churn_rate_uplift REAL DEFAULT 0,
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
        gross_margin            REAL DEFAULT 1.0,
        adoption_ramp_months    INTEGER DEFAULT 0,
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
        default_gross_margin        REAL DEFAULT 1.0,
        default_adoption_ramp_months INTEGER DEFAULT 0,
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
        id                          TEXT PRIMARY KEY,
        name                        TEXT NOT NULL,
        description                 TEXT,
        projection_months           INTEGER DEFAULT 36,
        discount_rate               REAL DEFAULT 0.10,
        scope_type                  TEXT NOT NULL DEFAULT 'cohorts',
        revenue_source              TEXT NOT NULL DEFAULT 'cohort',
        capex_contingency_pct       REAL DEFAULT 0,
        modeling_type               TEXT DEFAULT 'appraisal',
        revenue_carrier             TEXT DEFAULT 'cohort',
        revenue_bridge              TEXT,
        expansion_vertical_id       TEXT REFERENCES verticals(id),
        penetration_baseline_months REAL,
        ai_acceleration_factor      REAL,
        ai_som_lift_pct             REAL,
        evc_nba_annual_value        REAL,
        evc_extra_positive_value    REAL,
        evc_negative_value          REAL,
        evc_capture_ceiling_pct     REAL,
        evc_capture_target_pct      REAL,
        evc_capture_floor_pct       REAL,
        price_from_evc              INTEGER DEFAULT 0,
        adoption_elasticity         REAL DEFAULT 0,
        evc_reference_cohort_id     TEXT,
        created_at                  TEXT NOT NULL,
        updated_at                  TEXT NOT NULL
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
        acquisition_uplift      REAL,
        gross_margin            REAL,
        adoption_ramp_months    INTEGER,
        evc_extra_value_multiplier    REAL, -- ADR 0011 Track A
        evc_negative_value_multiplier REAL, -- ADR 0011 Track A
        evc_nba_multiplier             REAL -- ADR 0011 Track A
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
        profitability_index REAL,
        monthly_cashflows TEXT,
        monthly_mrr      TEXT,
        monthly_customers TEXT,
        calculated_at   TEXT NOT NULL,
        npv_lower             REAL,
        payback_months_lower  REAL,
        profitability_index_lower REAL,
        irr_monthly           REAL,
        irr_status            TEXT,
        irr_annual_nominal    REAL,
        evc                   TEXT,
        evc_price_floor       REAL,
        evc_price_target      REAL,
        evc_price_ceiling     REAL
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
        avg_overcharge_pct       REAL,
        outcome_basis            TEXT,
        price_per_outcome        REAL,
        outcomes_per_user_month  REAL
      )
    `).run();

    // SQLite cannot express COALESCE() inside a table-level UNIQUE constraint,
    // so the "one catalog config + one override per scenario per entity" rule
    // is enforced via a unique index (mirrors scenario_scope_overrides).
    db.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_monetization_configs_unique
      ON monetization_configs(entity_type, entity_id, COALESCE(scenario_id, ''))
    `).run();

    // 14. Scenario Entity Overrides — per-scenario override of a catalog entity's
    // financial parameters. Polymorphic over entity_type ('service' | 'cost' |
    // 'provider' | 'plan'); only the columns relevant to the type are populated,
    // the rest stay NULL. Mirrors the catalog-vs-scenario split of monetization_configs.
    db.prepare(`
      CREATE TABLE IF NOT EXISTS scenario_entity_overrides (
        id           TEXT PRIMARY KEY,
        scenario_id  TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
        entity_type  TEXT NOT NULL,
        entity_id    TEXT NOT NULL,
        avg_input_tokens            INTEGER,  -- service
        avg_output_tokens           INTEGER,  -- service
        avg_requests_per_user_month INTEGER,  -- service
        fixed_cost_per_month        REAL,     -- service
        amount       REAL,                    -- cost
        frequency    TEXT,                    -- cost
        input_price  REAL,                    -- provider
        output_price REAL,                    -- provider
        base_price   REAL,                    -- plan
        monthly_volume              REAL,     -- service (agent)
        interactions_per_customer_month REAL, -- service (agent)
        containment_rate            REAL,     -- service (agent)
        average_handle_time_seconds INTEGER,  -- service (agent)
        fully_loaded_cost_per_fte_month REAL, -- service (agent)
        baseline_fte                REAL,     -- service (agent)
        churn_rate_uplift           REAL,     -- service (agent)
        cohort_id    TEXT     -- ADR 0009 Track B: NULL = scenario-wide (unchanged); set = applies to one cohort's consumption of the entity only
      )
    `).run();

    // scenario_id is NOT NULL, but cohort_id is nullable (NULL = scenario-wide), so it needs
    // COALESCE in the unique index — mirrors scenario_scope_overrides' target_id handling.
    db.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_scenario_entity_overrides_unique
      ON scenario_entity_overrides(scenario_id, entity_type, entity_id, COALESCE(cohort_id, ''))
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

  // Migration 8: CFO overhaul — contribution margin, adoption ramp, CAPEX contingency, and lower bounds/guarded IRR in scenario_results.
  const scenarioResultsColumns = (db.prepare("PRAGMA table_info(scenario_results)").all() as any[]).map(c => c.name);
  let resultsInvalidated8 = false;

  const cohortCols8 = (db.prepare("PRAGMA table_info(cohort_configs)").all() as any[]).map(c => c.name);
  if (!cohortCols8.includes('gross_margin')) {
    db.prepare("ALTER TABLE cohort_configs ADD COLUMN gross_margin REAL DEFAULT 1.0").run();
    resultsInvalidated8 = true;
  }
  if (!cohortCols8.includes('adoption_ramp_months')) {
    db.prepare("ALTER TABLE cohort_configs ADD COLUMN adoption_ramp_months INTEGER DEFAULT 0").run();
    resultsInvalidated8 = true;
  }

  const clientBaseCols8 = (db.prepare("PRAGMA table_info(client_base)").all() as any[]).map(c => c.name);
  if (!clientBaseCols8.includes('default_gross_margin')) {
    db.prepare("ALTER TABLE client_base ADD COLUMN default_gross_margin REAL DEFAULT 1.0").run();
    resultsInvalidated8 = true;
  }
  if (!clientBaseCols8.includes('default_adoption_ramp_months')) {
    db.prepare("ALTER TABLE client_base ADD COLUMN default_adoption_ramp_months INTEGER DEFAULT 0").run();
    resultsInvalidated8 = true;
  }

  const overrideCols8 = (db.prepare("PRAGMA table_info(scenario_scope_overrides)").all() as any[]).map(c => c.name);
  if (!overrideCols8.includes('gross_margin')) {
    db.prepare("ALTER TABLE scenario_scope_overrides ADD COLUMN gross_margin REAL").run();
    resultsInvalidated8 = true;
  }
  if (!overrideCols8.includes('adoption_ramp_months')) {
    db.prepare("ALTER TABLE scenario_scope_overrides ADD COLUMN adoption_ramp_months INTEGER").run();
    resultsInvalidated8 = true;
  }

  const scenarioCols8 = (db.prepare("PRAGMA table_info(scenarios)").all() as any[]).map(c => c.name);
  if (!scenarioCols8.includes('capex_contingency_pct')) {
    db.prepare("ALTER TABLE scenarios ADD COLUMN capex_contingency_pct REAL DEFAULT 0").run();
    resultsInvalidated8 = true;
  }

  if (!scenarioResultsColumns.includes('npv_lower')) {
    db.prepare("ALTER TABLE scenario_results ADD COLUMN npv_lower REAL").run();
  }
  if (!scenarioResultsColumns.includes('payback_months_lower')) {
    db.prepare("ALTER TABLE scenario_results ADD COLUMN payback_months_lower REAL").run();
  }
  if (!scenarioResultsColumns.includes('irr_monthly')) {
    db.prepare("ALTER TABLE scenario_results ADD COLUMN irr_monthly REAL").run();
  }
  if (!scenarioResultsColumns.includes('irr_status')) {
    db.prepare("ALTER TABLE scenario_results ADD COLUMN irr_status TEXT").run();
  }
  if (!scenarioResultsColumns.includes('irr_annual_nominal')) {
    db.prepare("ALTER TABLE scenario_results ADD COLUMN irr_annual_nominal REAL").run();
  }

  // Rename columns from old roi_percent names if they exist, or add them if creating fresh or from intermediate schemas
  if (scenarioResultsColumns.includes('roi_percent')) {
    db.prepare("ALTER TABLE scenario_results RENAME COLUMN roi_percent TO profitability_index").run();
  } else if (!scenarioResultsColumns.includes('profitability_index')) {
    db.prepare("ALTER TABLE scenario_results ADD COLUMN profitability_index REAL").run();
  }

  if (scenarioResultsColumns.includes('roi_percent_lower')) {
    db.prepare("ALTER TABLE scenario_results RENAME COLUMN roi_percent_lower TO profitability_index_lower").run();
  } else if (!scenarioResultsColumns.includes('profitability_index_lower')) {
    db.prepare("ALTER TABLE scenario_results ADD COLUMN profitability_index_lower REAL").run();
  }

  if (resultsInvalidated8) {
    db.prepare("DELETE FROM scenario_results").run();
  }

  // Migration 9: per-scenario entity overrides + plan seats.
  // (scenario_entity_overrides is created idempotently in runMigrations above.)
  // scenario_plans.seats drives the new plan-subscription revenue line; existing
  // links default to 0 seats, so cached results stay correct, but invalidate once
  // on first add so any recompute picks up the new engine path.
  const scenarioPlansColumns = (db.prepare("PRAGMA table_info(scenario_plans)").all() as any[]).map(c => c.name);
  if (!scenarioPlansColumns.includes('seats')) {
    db.prepare("ALTER TABLE scenario_plans ADD COLUMN seats INTEGER DEFAULT 0").run();
    db.prepare("DELETE FROM scenario_results").run();
  }

  // Migration 10: Agent archetype fields.
  const serviceColumns10 = (db.prepare("PRAGMA table_info(services)").all() as any[]).map(c => c.name);
  let servicesInvalidated10 = false;
  if (!serviceColumns10.includes('service_type')) {
    db.prepare("ALTER TABLE services ADD COLUMN service_type TEXT DEFAULT 'copilot'").run();
    servicesInvalidated10 = true;
  }
  if (!serviceColumns10.includes('interaction_driver_type')) {
    db.prepare("ALTER TABLE services ADD COLUMN interaction_driver_type TEXT DEFAULT 'flat'").run();
    servicesInvalidated10 = true;
  }
  if (!serviceColumns10.includes('monthly_volume')) {
    db.prepare("ALTER TABLE services ADD COLUMN monthly_volume REAL DEFAULT 0").run();
    servicesInvalidated10 = true;
  }
  if (!serviceColumns10.includes('volume_growth_rate')) {
    db.prepare("ALTER TABLE services ADD COLUMN volume_growth_rate REAL DEFAULT 0").run();
    servicesInvalidated10 = true;
  }
  if (!serviceColumns10.includes('interactions_per_customer_month')) {
    db.prepare("ALTER TABLE services ADD COLUMN interactions_per_customer_month REAL DEFAULT 0").run();
    servicesInvalidated10 = true;
  }
  if (!serviceColumns10.includes('fully_loaded_cost_per_fte_month')) {
    db.prepare("ALTER TABLE services ADD COLUMN fully_loaded_cost_per_fte_month REAL DEFAULT 0").run();
    servicesInvalidated10 = true;
  }
  if (!serviceColumns10.includes('productive_hours_per_fte_month')) {
    db.prepare("ALTER TABLE services ADD COLUMN productive_hours_per_fte_month REAL DEFAULT 120").run();
    servicesInvalidated10 = true;
  }
  if (!serviceColumns10.includes('average_handle_time_seconds')) {
    db.prepare("ALTER TABLE services ADD COLUMN average_handle_time_seconds INTEGER DEFAULT 0").run();
    servicesInvalidated10 = true;
  }
  if (!serviceColumns10.includes('baseline_fte')) {
    db.prepare("ALTER TABLE services ADD COLUMN baseline_fte REAL DEFAULT 0").run();
    servicesInvalidated10 = true;
  }
  if (!serviceColumns10.includes('staffing_realization_lag_months')) {
    db.prepare("ALTER TABLE services ADD COLUMN staffing_realization_lag_months INTEGER DEFAULT 0").run();
    servicesInvalidated10 = true;
  }
  if (!serviceColumns10.includes('containment_rate')) {
    db.prepare("ALTER TABLE services ADD COLUMN containment_rate REAL DEFAULT 0").run();
    servicesInvalidated10 = true;
  }
  if (!serviceColumns10.includes('containment_start_rate')) {
    db.prepare("ALTER TABLE services ADD COLUMN containment_start_rate REAL DEFAULT 0").run();
    servicesInvalidated10 = true;
  }
  if (!serviceColumns10.includes('containment_ramp_months')) {
    db.prepare("ALTER TABLE services ADD COLUMN containment_ramp_months INTEGER DEFAULT 0").run();
    servicesInvalidated10 = true;
  }
  if (!serviceColumns10.includes('escalation_rate')) {
    db.prepare("ALTER TABLE services ADD COLUMN escalation_rate REAL DEFAULT 0").run();
    servicesInvalidated10 = true;
  }
  if (!serviceColumns10.includes('failed_deflection_penalty')) {
    db.prepare("ALTER TABLE services ADD COLUMN failed_deflection_penalty REAL DEFAULT 0").run();
    servicesInvalidated10 = true;
  }
  if (!serviceColumns10.includes('churn_rate_uplift')) {
    db.prepare("ALTER TABLE services ADD COLUMN churn_rate_uplift REAL DEFAULT 0").run();
    servicesInvalidated10 = true;
  }

  // Overrides table migration
  const entityOverrideColumns = (db.prepare("PRAGMA table_info(scenario_entity_overrides)").all() as any[]).map(c => c.name);
  if (!entityOverrideColumns.includes('monthly_volume')) {
    db.prepare("ALTER TABLE scenario_entity_overrides ADD COLUMN monthly_volume REAL").run();
    servicesInvalidated10 = true;
  }
  if (!entityOverrideColumns.includes('interactions_per_customer_month')) {
    db.prepare("ALTER TABLE scenario_entity_overrides ADD COLUMN interactions_per_customer_month REAL").run();
    servicesInvalidated10 = true;
  }
  if (!entityOverrideColumns.includes('containment_rate')) {
    db.prepare("ALTER TABLE scenario_entity_overrides ADD COLUMN containment_rate REAL").run();
    servicesInvalidated10 = true;
  }
  if (!entityOverrideColumns.includes('average_handle_time_seconds')) {
    db.prepare("ALTER TABLE scenario_entity_overrides ADD COLUMN average_handle_time_seconds INTEGER").run();
    servicesInvalidated10 = true;
  }
  if (!entityOverrideColumns.includes('fully_loaded_cost_per_fte_month')) {
    db.prepare("ALTER TABLE scenario_entity_overrides ADD COLUMN fully_loaded_cost_per_fte_month REAL").run();
    servicesInvalidated10 = true;
  }
  if (!entityOverrideColumns.includes('baseline_fte')) {
    db.prepare("ALTER TABLE scenario_entity_overrides ADD COLUMN baseline_fte REAL").run();
    servicesInvalidated10 = true;
  }
  if (!entityOverrideColumns.includes('churn_rate_uplift')) {
    db.prepare("ALTER TABLE scenario_entity_overrides ADD COLUMN churn_rate_uplift REAL").run();
    servicesInvalidated10 = true;
  }

  if (servicesInvalidated10) {
    db.prepare("DELETE FROM scenario_results").run();
  }

  // Migration 11: Revenue modeling overhaul (ADR 0001–0004).
  // Adds modeling_type / revenue_carrier / revenue_bridge to scenarios and
  // integrity fields to scenario_results.  Backfills from the deprecated
  // revenue_source column:
  //   'cohort'       → incremental / cohort
  //   'monetization' → appraisal  / feature
  //   'both'         → appraisal  / cohort  (bridge = NULL → forces user resolution)
  const scenarioCols11 = (db.prepare("PRAGMA table_info(scenarios)").all() as any[]).map(c => c.name);
  let resultsInvalidated11 = false;

  if (!scenarioCols11.includes('modeling_type')) {
    db.prepare("ALTER TABLE scenarios ADD COLUMN modeling_type TEXT DEFAULT 'appraisal'").run();
    // Backfill modeling_type from revenue_source
    db.prepare(`
      UPDATE scenarios SET modeling_type = CASE
        WHEN revenue_source = 'cohort' THEN 'incremental'
        ELSE 'appraisal'
      END
    `).run();
    resultsInvalidated11 = true;
  }

  if (!scenarioCols11.includes('revenue_carrier')) {
    db.prepare("ALTER TABLE scenarios ADD COLUMN revenue_carrier TEXT").run();
    // Backfill revenue_carrier from revenue_source
    db.prepare(`
      UPDATE scenarios SET revenue_carrier = CASE
        WHEN revenue_source = 'cohort'       THEN 'cohort'
        WHEN revenue_source = 'monetization' THEN 'feature'
        WHEN revenue_source = 'both'         THEN 'cohort'
        ELSE 'cohort'
      END
    `).run();
    resultsInvalidated11 = true;
  }

  if (!scenarioCols11.includes('revenue_bridge')) {
    db.prepare("ALTER TABLE scenarios ADD COLUMN revenue_bridge TEXT").run();
    // 'both' scenarios get NULL bridge intentionally — forces user to choose
    resultsInvalidated11 = true;
  }

  const scenarioResultsCols11 = (db.prepare("PRAGMA table_info(scenario_results)").all() as any[]).map(c => c.name);
  if (!scenarioResultsCols11.includes('revenue_integrity_status')) {
    db.prepare("ALTER TABLE scenario_results ADD COLUMN revenue_integrity_status TEXT").run();
  }
  if (!scenarioResultsCols11.includes('revenue_integrity_message')) {
    db.prepare("ALTER TABLE scenario_results ADD COLUMN revenue_integrity_message TEXT").run();
  }

  if (resultsInvalidated11) {
    db.prepare("DELETE FROM scenario_results").run();
  }

  // Migration 12: Make revenue_carrier the authoritative dial (carrier-first
  // redesign, follow-up to ADR 0001–0004). Backfill any NULL/empty carrier
  // from modeling_type so the column is never null going forward. This mirrors
  // resolveCarrier() exactly (incremental/appraisal→cohort, gtm→plan), so the
  // effective carrier the engine already used is unchanged → cached KPIs stay
  // valid and scenario_results are NOT invalidated. The deprecated
  // revenue_source column is left in place (SQLite cannot drop columns) and is
  // no longer read by the engine.
  db.prepare(`
    UPDATE scenarios SET revenue_carrier = CASE
      WHEN modeling_type = 'gtm' THEN 'plan'
      ELSE 'cohort'
    END
    WHERE revenue_carrier IS NULL OR revenue_carrier = ''
  `).run();

  // Migration 13: Retire 'verticals' as a scope_type (carrier-first redesign,
  // Phase 2). The new wizard offers only "whole base" (all_clients) vs
  // "selected cohorts" (cohorts); a vertical is now just a tag/filter inside the
  // cohort picker, not a scope category. Convert existing scope_type='verticals'
  // scenarios to 'cohorts' by materialising the cohorts of their selected
  // verticals into scenario_cohorts. The resolved cohort set is identical, so
  // KPIs are unchanged → scenario_results are NOT invalidated. (The engine keeps
  // defensive read-support for 'verticals'; this only stops new writes of it.)
  const verticalsScopeScenarios = (db.prepare(
    "SELECT id FROM scenarios WHERE scope_type = 'verticals'"
  ).all() as { id: string }[]);
  if (verticalsScopeScenarios.length > 0) {
    const materialiseCohorts = db.prepare(`
      INSERT OR IGNORE INTO scenario_cohorts (scenario_id, cohort_config_id)
      SELECT sv.scenario_id, c.id
        FROM scenario_verticals sv
        JOIN cohort_configs c ON c.vertical_id = sv.vertical_id
       WHERE sv.scenario_id = ?
    `);
    for (const s of verticalsScopeScenarios) {
      materialiseCohorts.run(s.id);
    }
    db.prepare("UPDATE scenarios SET scope_type = 'cohorts' WHERE scope_type = 'verticals'").run();
  }

  // Migration 14: Add S-curve market penetration params for GTM plan expansion
  const scenarioCols14 = (db.prepare("PRAGMA table_info(scenarios)").all() as any[]).map(c => c.name);
  let resultsInvalidated14 = false;

  if (!scenarioCols14.includes('expansion_vertical_id')) {
    db.prepare("ALTER TABLE scenarios ADD COLUMN expansion_vertical_id TEXT REFERENCES verticals(id)").run();
    resultsInvalidated14 = true;
  }
  if (!scenarioCols14.includes('penetration_baseline_months')) {
    db.prepare("ALTER TABLE scenarios ADD COLUMN penetration_baseline_months REAL").run();
    resultsInvalidated14 = true;
  }
  if (!scenarioCols14.includes('ai_acceleration_factor')) {
    db.prepare("ALTER TABLE scenarios ADD COLUMN ai_acceleration_factor REAL").run();
    resultsInvalidated14 = true;
  }
  if (!scenarioCols14.includes('ai_som_lift_pct')) {
    db.prepare("ALTER TABLE scenarios ADD COLUMN ai_som_lift_pct REAL").run();
    resultsInvalidated14 = true;
  }

  if (resultsInvalidated14) {
    db.prepare("DELETE FROM scenario_results").run();
  }

  // Migration 15: Add outcome-based monetization fields to monetization_configs
  const monetizationCols15 = (db.prepare("PRAGMA table_info(monetization_configs)").all() as any[]).map(c => c.name);
  if (!monetizationCols15.includes('outcome_basis')) {
    db.prepare("ALTER TABLE monetization_configs ADD COLUMN outcome_basis TEXT").run();
  }
  if (!monetizationCols15.includes('price_per_outcome')) {
    db.prepare("ALTER TABLE monetization_configs ADD COLUMN price_per_outcome REAL").run();
  }
  if (!monetizationCols15.includes('outcomes_per_user_month')) {
    db.prepare("ALTER TABLE monetization_configs ADD COLUMN outcomes_per_user_month REAL").run();
  }

  // Migration 16: Add EVC inputs to scenarios and EVC outputs to scenario_results
  const scenarioCols16 = (db.prepare("PRAGMA table_info(scenarios)").all() as any[]).map(c => c.name);
  if (!scenarioCols16.includes('evc_nba_annual_value')) {
    db.prepare("ALTER TABLE scenarios ADD COLUMN evc_nba_annual_value REAL").run();
  }
  if (!scenarioCols16.includes('evc_extra_positive_value')) {
    db.prepare("ALTER TABLE scenarios ADD COLUMN evc_extra_positive_value REAL").run();
  }
  if (!scenarioCols16.includes('evc_negative_value')) {
    db.prepare("ALTER TABLE scenarios ADD COLUMN evc_negative_value REAL").run();
  }
  if (!scenarioCols16.includes('evc_capture_ceiling_pct')) {
    db.prepare("ALTER TABLE scenarios ADD COLUMN evc_capture_ceiling_pct REAL").run();
  }
  if (!scenarioCols16.includes('evc_capture_target_pct')) {
    db.prepare("ALTER TABLE scenarios ADD COLUMN evc_capture_target_pct REAL").run();
  }
  if (!scenarioCols16.includes('evc_capture_floor_pct')) {
    db.prepare("ALTER TABLE scenarios ADD COLUMN evc_capture_floor_pct REAL").run();
  }

  const resultsCols16 = (db.prepare("PRAGMA table_info(scenario_results)").all() as any[]).map(c => c.name);
  if (!resultsCols16.includes('evc')) {
    db.prepare("ALTER TABLE scenario_results ADD COLUMN evc TEXT").run();
  }
  if (!resultsCols16.includes('evc_price_floor')) {
    db.prepare("ALTER TABLE scenario_results ADD COLUMN evc_price_floor REAL").run();
  }
  if (!resultsCols16.includes('evc_price_target')) {
    db.prepare("ALTER TABLE scenario_results ADD COLUMN evc_price_target REAL").run();
  }
  if (!resultsCols16.includes('evc_price_ceiling')) {
    db.prepare("ALTER TABLE scenario_results ADD COLUMN evc_price_ceiling REAL").run();
  }

  // Migration 17: Add price_from_evc and adoption_elasticity to scenarios, and invalidate cached scenario results
  const scenarioCols17 = (db.prepare("PRAGMA table_info(scenarios)").all() as any[]).map(c => c.name);
  let resultsInvalidated17 = false;
  if (!scenarioCols17.includes('price_from_evc')) {
    db.prepare("ALTER TABLE scenarios ADD COLUMN price_from_evc INTEGER DEFAULT 0").run();
    resultsInvalidated17 = true;
  }
  if (!scenarioCols17.includes('adoption_elasticity')) {
    db.prepare("ALTER TABLE scenarios ADD COLUMN adoption_elasticity REAL DEFAULT 0").run();
    resultsInvalidated17 = true;
  }

  if (resultsInvalidated17) {
    db.prepare("DELETE FROM scenario_results").run();
  }

  // Migration 18: ADR 0009 (Foundation) — per-archetype revenue streams. Adds the per-outcome
  // value field driving price_per_outcome (ADR 0007 Decision 4), the soft margin-threshold
  // cascade (client_base global default → scenario override), and persists the computed driver
  // profile + stream margins. The engine behavior change (agent/copilot outcome revenue now
  // flows regardless of carrier) alters NPV for any monetized-outcome scenario, so cached
  // results are invalidated once on upgrade.
  let resultsInvalidated18 = false;

  const serviceColumns18 = (db.prepare("PRAGMA table_info(services)").all() as any[]).map(c => c.name);
  if (!serviceColumns18.includes('value_per_outcome')) {
    db.prepare("ALTER TABLE services ADD COLUMN value_per_outcome REAL").run();
  }

  const clientBaseColumns18 = (db.prepare("PRAGMA table_info(client_base)").all() as any[]).map(c => c.name);
  if (!clientBaseColumns18.includes('default_copilot_margin_threshold')) {
    db.prepare("ALTER TABLE client_base ADD COLUMN default_copilot_margin_threshold REAL DEFAULT 0.78").run();
  }
  if (!clientBaseColumns18.includes('default_agent_margin_threshold')) {
    db.prepare("ALTER TABLE client_base ADD COLUMN default_agent_margin_threshold REAL DEFAULT 0.62").run();
  }

  const scenarioCols18 = (db.prepare("PRAGMA table_info(scenarios)").all() as any[]).map(c => c.name);
  if (!scenarioCols18.includes('copilot_margin_threshold')) {
    db.prepare("ALTER TABLE scenarios ADD COLUMN copilot_margin_threshold REAL").run();
    resultsInvalidated18 = true;
  }
  if (!scenarioCols18.includes('agent_margin_threshold')) {
    db.prepare("ALTER TABLE scenarios ADD COLUMN agent_margin_threshold REAL").run();
    resultsInvalidated18 = true;
  }

  const resultsCols18 = (db.prepare("PRAGMA table_info(scenario_results)").all() as any[]).map(c => c.name);
  if (!resultsCols18.includes('driver_profile')) {
    db.prepare("ALTER TABLE scenario_results ADD COLUMN driver_profile TEXT").run();
  }
  if (!resultsCols18.includes('stream_margins')) {
    db.prepare("ALTER TABLE scenario_results ADD COLUMN stream_margins TEXT").run();
  }

  if (resultsInvalidated18) {
    db.prepare("DELETE FROM scenario_results").run();
  }

  // Migration 19: ADR 0010 (Approach B) — unified credit pool. New tier entity + burn-rate table
  // (a separate carrier, not overloaded onto 'addon' — ADR 0010 Decision 5). A pool scenario
  // selects one tier via scenarios.pool_tier_id. New carrier behavior alters NPV for any scenario
  // that adopts it, but since 'pool' didn't exist before this migration, no existing scenario can
  // already use it — invalidation here is for schema-version hygiene, not behavior drift.
  db.prepare(`
    CREATE TABLE IF NOT EXISTS pool_tiers (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      monthly_fee      REAL NOT NULL DEFAULT 0,
      credit_pool_size REAL NOT NULL DEFAULT 0,
      capture          REAL,
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS pool_burn_rates (
      id         TEXT PRIMARY KEY,
      tier_id    TEXT NOT NULL REFERENCES pool_tiers(id) ON DELETE CASCADE,
      service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      burn_rate  REAL NOT NULL DEFAULT 1
    )
  `).run();

  db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pool_burn_rates_unique
    ON pool_burn_rates(tier_id, service_id)
  `).run();

  const scenarioCols19 = (db.prepare("PRAGMA table_info(scenarios)").all() as any[]).map(c => c.name);
  if (!scenarioCols19.includes('pool_tier_id')) {
    db.prepare("ALTER TABLE scenarios ADD COLUMN pool_tier_id TEXT REFERENCES pool_tiers(id)").run();
  }

  const resultsCols19 = (db.prepare("PRAGMA table_info(scenario_results)").all() as any[]).map(c => c.name);
  if (!resultsCols19.includes('pool_economics')) {
    db.prepare("ALTER TABLE scenario_results ADD COLUMN pool_economics TEXT").run();
  }

  // Migration 20: ADR 0011 — EVC per-segment (usage intensity per cohort config)
  const cohortCols20 = (db.prepare("PRAGMA table_info(cohort_configs)").all() as any[]).map(c => c.name);
  if (!cohortCols20.includes('usage_intensity')) {
    db.prepare("ALTER TABLE cohort_configs ADD COLUMN usage_intensity REAL DEFAULT 1.0").run();
    db.prepare("DELETE FROM scenario_results").run();
  }

  // Migration 21: Per-cohort value differentiation (ADR 0011 Track A EVC multipliers +
  // reference cohort; ADR 0009 Track B cohort-scoped entity overrides + agent deflection corridor).
  let migration21Applied = false;

  const scenarioCols21 = (db.prepare("PRAGMA table_info(scenarios)").all() as any[]).map(c => c.name);
  if (!scenarioCols21.includes('evc_reference_cohort_id')) {
    db.prepare("ALTER TABLE scenarios ADD COLUMN evc_reference_cohort_id TEXT").run();
    migration21Applied = true;
  }

  const overrideCols21 = (db.prepare("PRAGMA table_info(scenario_scope_overrides)").all() as any[]).map(c => c.name);
  if (!overrideCols21.includes('evc_extra_value_multiplier')) {
    db.prepare("ALTER TABLE scenario_scope_overrides ADD COLUMN evc_extra_value_multiplier REAL").run();
    db.prepare("ALTER TABLE scenario_scope_overrides ADD COLUMN evc_negative_value_multiplier REAL").run();
    db.prepare("ALTER TABLE scenario_scope_overrides ADD COLUMN evc_nba_multiplier REAL").run();
    migration21Applied = true;
  }

  const entityOverrideCols21 = (db.prepare("PRAGMA table_info(scenario_entity_overrides)").all() as any[]).map(c => c.name);
  if (!entityOverrideCols21.includes('cohort_id')) {
    db.prepare("ALTER TABLE scenario_entity_overrides ADD COLUMN cohort_id TEXT").run();
    // Rebuild the unique index to include cohort_id (NULL = scenario-wide, unchanged behavior).
    db.prepare("DROP INDEX IF EXISTS idx_scenario_entity_overrides_unique").run();
    db.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_scenario_entity_overrides_unique
      ON scenario_entity_overrides(scenario_id, entity_type, entity_id, COALESCE(cohort_id, ''))
    `).run();
    migration21Applied = true;
  }

  const resultsCols21 = (db.prepare("PRAGMA table_info(scenario_results)").all() as any[]).map(c => c.name);
  if (!resultsCols21.includes('agent_deflection_corridor')) {
    db.prepare("ALTER TABLE scenario_results ADD COLUMN agent_deflection_corridor TEXT").run();
    migration21Applied = true;
  }

  if (migration21Applied) {
    db.prepare("DELETE FROM scenario_results").run();
  }

  // Migration 22: ADR 0012 — pool tier fee basis (flat per-tier vs per-member). Existing tiers
  // default to 'flat', reproducing today's only behavior, so no result invalidation is needed.
  const poolTierCols22 = (db.prepare("PRAGMA table_info(pool_tiers)").all() as any[]).map(c => c.name);
  if (!poolTierCols22.includes('fee_basis')) {
    db.prepare("ALTER TABLE pool_tiers ADD COLUMN fee_basis TEXT NOT NULL DEFAULT 'flat'").run();
  }

  // Migration 23: ADR 0012 — pool size basis (absolute vs per-member) + invalidate pool scenario results.
  const poolTierCols23 = (db.prepare("PRAGMA table_info(pool_tiers)").all() as any[]).map(c => c.name);
  if (!poolTierCols23.includes('pool_size_basis')) {
    db.prepare("ALTER TABLE pool_tiers ADD COLUMN pool_size_basis TEXT NOT NULL DEFAULT 'absolute'").run();
    db.prepare("DELETE FROM scenario_results WHERE scenario_id IN (SELECT id FROM scenarios WHERE pool_tier_id IS NOT NULL)").run();
  }

  // Migration 24: scenario_results never had a uniqueness constraint on scenario_id, and
  // saveResults() always generates a fresh row id, so every recalculation left the previous
  // cached row orphaned instead of replacing it. Duplicate rows made a single scenario appear
  // multiple times anywhere that LEFT JOINs scenario_results (e.g. scenariosRepository.getAll(),
  // used by the scenarios list and Compare pages). Dedup down to the most recent row per
  // scenario, then add a UNIQUE index so INSERT OR REPLACE correctly upserts on scenario_id.
  const scenarioResultsIndex24 = db.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_scenario_results_scenario_id'`
  ).get();
  if (!scenarioResultsIndex24) {
    db.prepare(`
      DELETE FROM scenario_results
      WHERE rowid NOT IN (
        SELECT MAX(r.rowid)
        FROM scenario_results r
        WHERE r.calculated_at = (
          SELECT MAX(r2.calculated_at) FROM scenario_results r2 WHERE r2.scenario_id = r.scenario_id
        )
        GROUP BY r.scenario_id
      )
    `).run();
    db.prepare(`CREATE UNIQUE INDEX idx_scenario_results_scenario_id ON scenario_results(scenario_id)`).run();
  }
}
