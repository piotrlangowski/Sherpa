import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { PREDEFINED_PROVIDERS } from '../utils/constants';

export function seedDatabase(db: Database): void {
  // Check if already seeded by checking settings
  const checkSettings = db.prepare("SELECT COUNT(*) as count FROM settings").get() as { count: number };
  if (checkSettings.count > 0) {
    console.log('Database already initialized/seeded. Skipping seed.');
    return;
  }

  console.log('Seeding database with default settings and sample data...');

  db.transaction(() => {
    // 1. Insert settings
    const insertSetting = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
    insertSetting.run('company_name', 'Acme Analytics');
    insertSetting.run('currency', 'USD');
    insertSetting.run('default_discount_rate', '0.10');
    insertSetting.run('setup_completed', '0'); // Show wizard on first visit
    insertSetting.run('projection_horizon_months', '36');

    // 2. Insert AI Providers
    const insertProvider = db.prepare(`
      INSERT INTO providers (id, name, model_name, input_price, output_price, is_predefined, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const providersMap: Record<string, string> = {}; // key: "Name - Model", value: id

    const now = new Date().toISOString();
    for (const prov of PREDEFINED_PROVIDERS) {
      const id = uuidv4();
      insertProvider.run(id, prov.name, prov.model_name, prov.input_price, prov.output_price, 1, now);
      providersMap[`${prov.name} - ${prov.model_name}`] = id;
    }

    // 3. Insert Services (3 existing, 2 planned)
    const insertService = db.prepare(`
      INSERT INTO services (id, name, description, status, provider_id, avg_input_tokens, avg_output_tokens, avg_requests_per_user_month, fixed_cost_per_month, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const sSummarization = uuidv4();
    const sSearch = uuidv4();
    const sChatbot = uuidv4();
    const sSentiment = uuidv4();
    const sPredictive = uuidv4();

    insertService.run(
      sSummarization,
      'AI Document Summarization',
      'Summarizes text documents uploaded by users.',
      'existing',
      providersMap['OpenAI - GPT-4o'],
      800,
      300,
      200,
      null,
      now,
      now
    );

    insertService.run(
      sSearch,
      'Smart Search',
      'Semantic search across user data indexes.',
      'existing',
      providersMap['Google - Gemini 2.5 Flash'],
      500,
      100,
      500,
      null,
      now,
      now
    );

    insertService.run(
      sChatbot,
      'AI Chatbot',
      'Conversational AI customer agent helper.',
      'existing',
      providersMap['Anthropic - Claude 3.5 Haiku'], // Wait, we had Sonnet or Haiku in seed description, let's use Haiku
      1200,
      600,
      100,
      null,
      now,
      now
    );

    insertService.run(
      sSentiment,
      'Sentiment Analysis',
      'Classifies sentiment of chat logs to flag customer satisfaction issues.',
      'planned',
      providersMap['OpenAI - GPT-4o mini'],
      300,
      50,
      300,
      null,
      now,
      now
    );

    insertService.run(
      sPredictive,
      'Predictive Analytics',
      'Forecasts user behavior based on index searches and uploads.',
      'planned',
      providersMap['Google - Gemini 2.5 Pro'],
      2000,
      500,
      50,
      null,
      now,
      now
    );

    // 4. Service Dependencies
    const insertDependency = db.prepare(`
      INSERT INTO service_dependencies (id, source_id, target_id, dependency_type)
      VALUES (?, ?, ?, ?)
    `);
    // Sentiment Analysis (planned) requires AI Chatbot (existing)
    insertDependency.run(uuidv4(), sSentiment, sChatbot, 'requires');
    // Predictive Analytics (planned) enhanced_by Smart Search (existing)
    insertDependency.run(uuidv4(), sPredictive, sSearch, 'enhanced_by');

    // 5. Feature Packs (2)
    const insertPack = db.prepare(`
      INSERT INTO packs (id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertPackService = db.prepare(`
      INSERT INTO pack_services (pack_id, service_id)
      VALUES (?, ?)
    `);

    const pWritingSuite = uuidv4();
    const pIntelligence = uuidv4();

    insertPack.run(
      pWritingSuite,
      'AI Writing Suite',
      'Document summaries and chat assist features.',
      now,
      now
    );
    insertPackService.run(pWritingSuite, sSummarization);
    insertPackService.run(pWritingSuite, sChatbot);

    insertPack.run(
      pIntelligence,
      'Intelligence Pack',
      'Advanced search, sentiment, and predictive forecasting.',
      now,
      now
    );
    insertPackService.run(pIntelligence, sSearch);
    insertPackService.run(pIntelligence, sSentiment);
    insertPackService.run(pIntelligence, sPredictive);

    // 6. Pricing Plans (2)
    const insertPlan = db.prepare(`
      INSERT INTO plans (id, name, description, base_price, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertPlanService = db.prepare(`
      INSERT INTO plan_services (plan_id, service_id)
      VALUES (?, ?)
    `);
    const insertPlanPack = db.prepare(`
      INSERT INTO plan_packs (plan_id, pack_id)
      VALUES (?, ?)
    `);

    const plProfessional = uuidv4();
    const plEnterprise = uuidv4();

    insertPlan.run(
      plProfessional,
      'Professional Plan',
      'For small to medium teams looking for content editing.',
      49.00,
      now,
      now
    );
    insertPlanPack.run(plProfessional, pWritingSuite);

    insertPlan.run(
      plEnterprise,
      'Enterprise Plan',
      'Customized enterprise access with full intelligence suites.',
      149.00,
      now,
      now
    );
    insertPlanPack.run(plEnterprise, pWritingSuite);
    insertPlanPack.run(plEnterprise, pIntelligence);

    // 7. Verticals (2)
    const insertVertical = db.prepare(`
      INSERT INTO verticals (id, name, description, tam_users, sam_users, som_users, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertVerticalPlan = db.prepare(`
      INSERT INTO vertical_plans (vertical_id, plan_id)
      VALUES (?, ?)
    `);
    const insertVerticalPack = db.prepare(`
      INSERT INTO vertical_packs (vertical_id, pack_id)
      VALUES (?, ?)
    `);

    const vLegalTech = uuidv4();
    const vEcommerce = uuidv4();

    insertVertical.run(
      vLegalTech,
      'LegalTech',
      'Law firms and compliance departments.',
      50000,
      15000,
      3000,
      now,
      now
    );
    insertVerticalPlan.run(vLegalTech, plEnterprise);

    insertVertical.run(
      vEcommerce,
      'E-commerce',
      'Online retailers and shop operators.',
      200000,
      80000,
      12000,
      now,
      now
    );
    insertVerticalPlan.run(vEcommerce, plProfessional);
    insertVerticalPlan.run(vEcommerce, plEnterprise);

    // 8. Cost Items
    const insertCost = db.prepare(`
      INSERT INTO cost_items (id, name, category, subcategory, amount, frequency, service_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const cSalary = uuidv4();
    const cInfra = uuidv4();
    const cSetup = uuidv4();
    const cMarketing = uuidv4();

    insertCost.run(
      cSalary,
      'ML Engineer Salary Allocation',
      'opex',
      'personnel',
      8000.00,
      'monthly',
      null,
      now,
      now
    );

    insertCost.run(
      cInfra,
      'GPU Infrastructure Overhead',
      'opex',
      'infrastructure',
      3000.00,
      'monthly',
      null,
      now,
      now
    );

    insertCost.run(
      cSetup,
      'Initial Data Integration Setup',
      'capex',
      'development',
      25000.00,
      'one_time',
      null,
      now,
      now
    );

    insertCost.run(
      cMarketing,
      'Marketing Launch Campaign',
      'capex',
      'marketing',
      15000.00,
      'one_time',
      null,
      now,
      now
    );

    // 9. Cohorts (1 linked to LegalTech)
    const insertCohort = db.prepare(`
      INSERT INTO cohort_configs (id, name, vertical_id, current_users, monthly_acquisition, acquisition_growth_rate, monthly_churn_rate, retention_floor, monthly_expansion_rate, ai_adoption_rate, base_arpu, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const coLegalTech = uuidv4();
    insertCohort.run(
      coLegalTech,
      'LegalTech Professional Cohort',
      vLegalTech,
      500,
      50,
      0.02, // 2% MoM growth
      0.03, // 3% churn
      0.60, // 60% floor
      0.015, // 1.5% expansion
      0.40, // 40% adoption of AI features
      149.00, // Enterprise ARPU
      now,
      now
    );

    // 10. Scenarios
    const insertScenario = db.prepare(`
      INSERT INTO scenarios (id, name, description, projection_months, discount_rate, cohort_config_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertScenarioService = db.prepare(`
      INSERT INTO scenario_services (scenario_id, service_id, rollout_month)
      VALUES (?, ?, ?)
    `);
    const insertScenarioPack = db.prepare(`
      INSERT INTO scenario_packs (scenario_id, pack_id, rollout_month)
      VALUES (?, ?, ?)
    `);
    const insertScenarioPlan = db.prepare(`
      INSERT INTO scenario_plans (scenario_id, plan_id, rollout_month)
      VALUES (?, ?, ?)
    `);
    const insertScenarioCost = db.prepare(`
      INSERT INTO scenario_costs (scenario_id, cost_item_id)
      VALUES (?, ?)
    `);

    const scScenario = uuidv4();
    insertScenario.run(
      scScenario,
      'Enterprise LegalTech Rollout',
      'Full rollout of the Enterprise plan containing all AI packs to our LegalTech cohort over 36 months.',
      36,
      0.10,
      coLegalTech,
      now,
      now
    );

    // Rollout schedule:
    // Existing services available at month 0
    insertScenarioService.run(scScenario, sSummarization, 0);
    insertScenarioService.run(scScenario, sSearch, 0);
    insertScenarioService.run(scScenario, sChatbot, 0);
    // Planned services rollout
    insertScenarioService.run(scScenario, sSentiment, 3); // Month 3
    insertScenarioService.run(scScenario, sPredictive, 6); // Month 6

    // Add Packs
    insertScenarioPack.run(scScenario, pWritingSuite, 0);
    insertScenarioPack.run(scScenario, pIntelligence, 3);

    // Add Plan
    insertScenarioPlan.run(scScenario, plEnterprise, 0);

    // Add Scenario Costs
    insertScenarioCost.run(scScenario, cSalary);
    insertScenarioCost.run(scScenario, cInfra);
    insertScenarioCost.run(scScenario, cSetup);
    insertScenarioCost.run(scScenario, cMarketing);

    // 11. Scenarios Results (Pre-populate with dummy calculation results to look full on load)
    // We will update these with the real math in Phase 2
    const insertResult = db.prepare(`
      INSERT INTO scenario_results (id, scenario_id, payback_months, npv, irr_annual, tco, roi_percent, monthly_cashflows, monthly_mrr, monthly_customers, calculated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Dummy data for visual appearance
    const payback = 14.5;
    const npv = 158420.00;
    const irr = 0.456;
    const tco = 328000.00;
    const roi = 1.48;
    const cashflows = JSON.stringify(new Array(36).fill(0).map((_, i) => -40000 + i * 8000));
    const mrr = JSON.stringify(new Array(36).fill(0).map((_, i) => 74500 + i * 2500));
    const customers = JSON.stringify(new Array(36).fill(0).map((_, i) => 500 + i * 15));

    insertResult.run(uuidv4(), scScenario, payback, npv, irr, tco, roi, cashflows, mrr, customers, now);
  })();

  console.log('Database seed completed successfully!');
}
