import type { DatabaseConnection } from './db-schema.js';
import { randomUUID as uuidv4 } from 'crypto';
import { PREDEFINED_PROVIDERS } from './provider-catalog.js';
import { FALLBACK_EXCHANGE_RATES, EXCHANGE_RATES_AS_OF } from './currency.js';

export function seedDatabase(db: DatabaseConnection): void {
  // Check if already seeded by checking settings
  const checkSettings = db.prepare("SELECT COUNT(*) as count FROM settings").get() as { count: number };
  if (checkSettings.count > 0) {
    // stderr only — this also runs inside the MCP server, where stdout carries JSON-RPC
    console.error('Database already initialized/seeded. Skipping seed.');
    return;
  }

  console.error('Seeding database with default settings and sample data...');

  db.transaction(() => {
    // 1. Insert settings
    const insertSetting = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
    insertSetting.run('company_name', 'Acme Analytics');
    insertSetting.run('currency', 'USD');
    insertSetting.run('default_discount_rate', '0.10');
    insertSetting.run('setup_completed', '0'); // Show wizard on first visit
    insertSetting.run('projection_horizon_months', '36');
    insertSetting.run('exchange_rates', JSON.stringify(FALLBACK_EXCHANGE_RATES));
    insertSetting.run('exchange_rates_as_of', EXCHANGE_RATES_AS_OF);

    // 1.5 Insert Client Base (Global defaults)
    // OR REPLACE: runMigrations already creates a placeholder singleton row
    db.prepare(`
      INSERT OR REPLACE INTO client_base (
        id, total_users, default_arpu, default_monthly_churn_rate, default_monthly_acquisition,
        default_acquisition_growth_rate, default_ai_adoption_rate, default_retention_floor,
        default_expansion_rate, default_arpu_uplift, default_arpu_uplift_percent,
        default_churn_reduction, default_acquisition_uplift, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'singleton',
      500000,
      29.99,
      0.05,
      2000,
      0.01,
      0.25,
      0.40,
      0.02,
      0,
      0.10,
      0.15,
      0.10,
      new Date().toISOString()
    );

    // 2. Insert AI Providers
    const insertProvider = db.prepare(`
      INSERT INTO providers (id, name, model_name, input_price, output_price, is_predefined, currency, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'USD', ?)
    `);

    const providersMap: Record<string, string> = {}; 

    const now = new Date().toISOString();
    for (const prov of PREDEFINED_PROVIDERS) {
      const id = uuidv4();
      insertProvider.run(id, prov.name, prov.model_name, prov.input_price, prov.output_price, 1, now);
      providersMap[`${prov.name} - ${prov.model_name}`] = id;
    }

    // 3. Insert Services
    const insertService = db.prepare(`
      INSERT INTO services (id, name, description, status, provider_id, avg_input_tokens, avg_output_tokens, avg_requests_per_user_month, fixed_cost_per_month, fixed_cost_currency, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?)
    `);

    const sSummarization = uuidv4();
    const sSearch = uuidv4();
    const sChatbot = uuidv4();
    const sSentiment = uuidv4();
    const sPredictive = uuidv4();

    insertService.run(sSummarization, 'AI Document Summarization', 'Summarizes text documents uploaded by users.', 'existing', providersMap['OpenAI - GPT-5.5'], 800, 300, 200, null, now, now);
    insertService.run(sSearch, 'Smart Search', 'Semantic search across user data indexes.', 'existing', providersMap['Google - Gemini 3.5 Flash'], 500, 100, 500, null, now, now);
    insertService.run(sChatbot, 'AI Chatbot', 'Conversational AI customer agent helper.', 'existing', providersMap['Anthropic - Claude Haiku 4.5'], 1200, 600, 100, null, now, now);
    insertService.run(sSentiment, 'Sentiment Analysis', 'Classifies sentiment of chat logs to flag customer satisfaction issues.', 'planned', providersMap['OpenAI - GPT-5.4 mini'], 300, 50, 300, null, now, now);
    insertService.run(sPredictive, 'Predictive Analytics', 'Forecasts user behavior based on index searches and uploads.', 'planned', providersMap['Google - Gemini 3.1 Pro'], 2000, 500, 50, null, now, now);

    // 4. Service Dependencies
    const insertDependency = db.prepare(`
      INSERT INTO service_dependencies (id, source_id, target_id, dependency_type)
      VALUES (?, ?, ?, ?)
    `);
    insertDependency.run(uuidv4(), sSentiment, sChatbot, 'requires');
    insertDependency.run(uuidv4(), sPredictive, sSearch, 'enhanced_by');

    // 5. Feature Packs
    const insertPack = db.prepare(`INSERT INTO packs (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`);
    const insertPackService = db.prepare(`INSERT INTO pack_services (pack_id, service_id) VALUES (?, ?)`);

    const pWritingSuite = uuidv4();
    const pIntelligence = uuidv4();

    insertPack.run(pWritingSuite, 'AI Writing Suite', 'Document summaries and chat assist features.', now, now);
    insertPackService.run(pWritingSuite, sSummarization);
    insertPackService.run(pWritingSuite, sChatbot);

    insertPack.run(pIntelligence, 'Intelligence Pack', 'Advanced search, sentiment, and predictive forecasting.', now, now);
    insertPackService.run(pIntelligence, sSearch);
    insertPackService.run(pIntelligence, sSentiment);
    insertPackService.run(pIntelligence, sPredictive);

    // 6. Pricing Plans
    const insertPlan = db.prepare(`INSERT INTO plans (id, name, description, base_price, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`);
    const insertPlanPack = db.prepare(`INSERT INTO plan_packs (plan_id, pack_id) VALUES (?, ?)`);

    const plProfessional = uuidv4();
    const plEnterprise = uuidv4();

    insertPlan.run(plProfessional, 'Professional Plan', 'For small to medium teams looking for content editing.', 49.00, now, now);
    insertPlanPack.run(plProfessional, pWritingSuite);

    insertPlan.run(plEnterprise, 'Enterprise Plan', 'Customized enterprise access with full intelligence suites.', 149.00, now, now);
    insertPlanPack.run(plEnterprise, pWritingSuite);
    insertPlanPack.run(plEnterprise, pIntelligence);

    // 7. Verticals
    const insertVertical = db.prepare(`INSERT INTO verticals (id, name, description, tam_users, sam_users, som_users, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertVerticalPlan = db.prepare(`INSERT INTO vertical_plans (vertical_id, plan_id) VALUES (?, ?)`);

    const vLegalTech = uuidv4();
    const vEcommerce = uuidv4();

    insertVertical.run(vLegalTech, 'LegalTech', 'Law firms and compliance departments.', 50000, 15000, 3000, now, now);
    insertVerticalPlan.run(vLegalTech, plEnterprise);

    insertVertical.run(vEcommerce, 'E-commerce', 'Online retailers and shop operators.', 200000, 80000, 12000, now, now);
    insertVerticalPlan.run(vEcommerce, plProfessional);
    insertVerticalPlan.run(vEcommerce, plEnterprise);

    // 8. Cost Items
    const insertCost = db.prepare(`INSERT INTO cost_items (id, name, category, subcategory, amount, frequency, currency, service_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?)`);

    const cSalary = uuidv4();
    const cInfra = uuidv4();
    const cSetup = uuidv4();
    const cMarketing = uuidv4();

    insertCost.run(cSalary, 'ML Engineer Salary Allocation', 'opex', 'personnel', 8000.00, 'monthly', null, now, now);
    insertCost.run(cInfra, 'GPU Infrastructure Overhead', 'opex', 'infrastructure', 3000.00, 'monthly', null, now, now);
    insertCost.run(cSetup, 'Initial Data Integration Setup', 'capex', 'development', 25000.00, 'one_time', null, now, now);
    insertCost.run(cMarketing, 'Marketing Launch Campaign', 'capex', 'marketing', 15000.00, 'one_time', null, now, now);

    // 9. Cohorts
    const insertCohort = db.prepare(`
      INSERT INTO cohort_configs (id, name, vertical_id, current_users, monthly_acquisition, acquisition_growth_rate, monthly_churn_rate, retention_floor, monthly_expansion_rate, ai_adoption_rate, base_arpu, arpu_uplift, arpu_uplift_percent, churn_reduction, acquisition_uplift, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const coLegalTech = uuidv4();
    insertCohort.run(coLegalTech, 'LegalTech Professional Cohort', vLegalTech, 500, 50, 0.02, 0.03, 0.60, 0.015, 0.40, 149.00, 0, 0.10, 0.15, 0.10, now, now);

    // 10. Scenarios
    const insertScenario = db.prepare(`
      INSERT INTO scenarios (id, name, description, projection_months, discount_rate, scope_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertScenarioService = db.prepare(`INSERT INTO scenario_services (scenario_id, service_id, rollout_month) VALUES (?, ?, ?)`);
    const insertScenarioPack = db.prepare(`INSERT INTO scenario_packs (scenario_id, pack_id, rollout_month) VALUES (?, ?, ?)`);
    const insertScenarioPlan = db.prepare(`INSERT INTO scenario_plans (scenario_id, plan_id, rollout_month) VALUES (?, ?, ?)`);
    const insertScenarioCost = db.prepare(`INSERT INTO scenario_costs (scenario_id, cost_item_id) VALUES (?, ?)`);
    const insertScenarioCohort = db.prepare(`INSERT INTO scenario_cohorts (scenario_id, cohort_config_id) VALUES (?, ?)`);

    const scScenario = uuidv4();
    insertScenario.run(scScenario, 'Enterprise LegalTech Rollout', 'Full rollout of the Enterprise plan to our LegalTech cohort over 36 months.', 36, 0.10, 'cohorts', now, now);
    
    // Link cohort
    insertScenarioCohort.run(scScenario, coLegalTech);

    insertScenarioService.run(scScenario, sSummarization, 0);
    insertScenarioService.run(scScenario, sSearch, 0);
    insertScenarioService.run(scScenario, sChatbot, 0);
    insertScenarioService.run(scScenario, sSentiment, 3);
    insertScenarioService.run(scScenario, sPredictive, 6);

    insertScenarioPack.run(scScenario, pWritingSuite, 0);
    insertScenarioPack.run(scScenario, pIntelligence, 3);
    insertScenarioPlan.run(scScenario, plEnterprise, 0);

    insertScenarioCost.run(scScenario, cSalary);
    insertScenarioCost.run(scScenario, cInfra);
    insertScenarioCost.run(scScenario, cSetup);
    insertScenarioCost.run(scScenario, cMarketing);

    // Scenario 2: Global Rollout
    const scGlobal = uuidv4();
    insertScenario.run(scGlobal, 'Global Chatbot Rollout', 'Deploy Chatbot to entire user base immediately.', 36, 0.12, 'all_clients', now, now);
    insertScenarioService.run(scGlobal, sChatbot, 0);
    insertScenarioCost.run(scGlobal, cInfra);

    // 11. Scenario Results: intentionally NOT pre-populated.
    // The incremental engine computes real results lazily — the scenario detail page
    // runs and caches KPIs on first view, and the list shows a "Pending Simulation"
    // state until then. Seeding fixed numbers here would contradict that recomputation.
  })();

  console.error('Database seed completed successfully!');
}
