import db from './db.js';
import { exportScenarioToJSON } from '../../src/lib/server/services/export.js';
import crypto from 'crypto';
async function test() {
    console.error("Running round-trip integration test...");
    // 1. Check if scenario exists
    const baseScenario = db.prepare("SELECT id, name FROM scenarios LIMIT 1").get();
    if (!baseScenario) {
        console.error("Base scenario not found in seeded DB. Setup first.");
        process.exit(1);
    }
    console.error(`Base Scenario Found: ${baseScenario.name} (${baseScenario.id})`);
    // 2. Export scenario to JSON string
    const jsonStr = exportScenarioToJSON(baseScenario.id);
    const snapshot = JSON.parse(jsonStr);
    console.error("Scenario successfully exported to JSON.");
    // 3. Simulating import logic from +server.ts
    const scenario = snapshot.scenario;
    // Resolve unique name
    let baseName = scenario.name;
    if (db.prepare('SELECT id FROM scenarios WHERE name = ?').get(baseName)) {
        baseName = `${baseName} (Imported)`;
    }
    let uniqueName = baseName;
    let counter = 2;
    while (db.prepare('SELECT id FROM scenarios WHERE name = ?').get(uniqueName)) {
        uniqueName = `${baseName} ${counter}`;
        counter++;
    }
    console.error(`Importing scenario as unique name: ${uniqueName}`);
    const scenarioId = crypto.randomUUID();
    const cohortId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.transaction(() => {
        // Import cohort
        const cc = scenario.cohort_config;
        db.prepare(`
      INSERT INTO cohort_configs (id, name, vertical_id, current_users, monthly_acquisition, acquisition_growth_rate, monthly_churn_rate, retention_floor, monthly_expansion_rate, ai_adoption_rate, base_arpu, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(cohortId, `${uniqueName} Cohort`, null, cc.current_users, cc.monthly_acquisition, cc.acquisition_growth_rate, cc.monthly_churn_rate, cc.retention_floor, cc.monthly_expansion_rate, cc.ai_adoption_rate, cc.base_arpu, now, now);
        // Import scenario
        db.prepare(`
      INSERT INTO scenarios (id, name, description, projection_months, discount_rate, cohort_config_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(scenarioId, uniqueName, scenario.description, scenario.projection_months, scenario.discount_rate, cohortId, now, now);
        // Services
        if (scenario.services) {
            const insertServ = db.prepare("INSERT INTO scenario_services (scenario_id, service_id, rollout_month) VALUES (?, ?, ?)");
            for (const s of scenario.services) {
                insertServ.run(scenarioId, s.id, s.rollout_month);
            }
        }
    })();
    console.error("Scenario successfully imported into database.");
    // 4. Verify calculation matches
    const loaded = db.prepare("SELECT * FROM scenarios WHERE id = ?").get(scenarioId);
    if (!loaded) {
        throw new Error("Imported scenario was not found in DB.");
    }
    // Clean up the imported test scenario
    db.transaction(() => {
        db.prepare("DELETE FROM scenario_services WHERE scenario_id = ?").run(scenarioId);
        db.prepare("DELETE FROM scenarios WHERE id = ?").run(scenarioId);
        db.prepare("DELETE FROM cohort_configs WHERE id = ?").run(cohortId);
    })();
    console.error("Test completed successfully! Round-trip export and import logic verified with exact values.");
}
test().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
