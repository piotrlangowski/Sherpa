import type { Database } from 'better-sqlite3';

export function runMigrations(db: Database): void {
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
        created_at              TEXT NOT NULL,
        updated_at              TEXT NOT NULL
      )
    `).run();

    // 10. Scenarios
    db.prepare(`
      CREATE TABLE IF NOT EXISTS scenarios (
        id                     TEXT PRIMARY KEY,
        name                   TEXT NOT NULL,
        description            TEXT,
        projection_months      INTEGER DEFAULT 36,
        discount_rate          REAL DEFAULT 0.10,
        cohort_config_id       TEXT REFERENCES cohort_configs(id) ON DELETE SET NULL,
        created_at             TEXT NOT NULL,
        updated_at             TEXT NOT NULL
      )
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

    // 11. Scenario Results
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
  })();
}
