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
    insertSetting.run('company_name', 'Beacon Helpdesk');
    insertSetting.run('currency', 'USD');
    insertSetting.run('default_discount_rate', '0.10');
    insertSetting.run('setup_completed', '0'); // Show wizard on first visit
    insertSetting.run('projection_horizon_months', '36');
    insertSetting.run('exchange_rates', JSON.stringify(FALLBACK_EXCHANGE_RATES));
    insertSetting.run('exchange_rates_as_of', EXCHANGE_RATES_AS_OF);
    // Credit configuration (global defaults for AI monetization)
    insertSetting.run('default_price_per_credit', '0.02');
    insertSetting.run('default_input_tokens_per_credit', '1000000');
    insertSetting.run('default_output_tokens_per_credit', '333333');
    insertSetting.run('default_overcharge_markup', '1.5');
    insertSetting.run('default_overcharge_user_pct', '0.2');
    insertSetting.run('default_avg_overcharge_pct', '0.5');

    // 1.5 Insert Client Base (Global defaults)
    db.prepare(`
      INSERT OR REPLACE INTO client_base (
        id, total_users, default_arpu, default_monthly_churn_rate, default_monthly_acquisition,
        default_acquisition_growth_rate, default_ai_adoption_rate, default_retention_floor,
        default_expansion_rate, default_arpu_uplift, default_arpu_uplift_percent,
        default_churn_reduction, default_acquisition_uplift, default_gross_margin, default_adoption_ramp_months, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'singleton',
      10000,
      80.00,
      0.03,
      40,
      0.00,
      0.50,
      0.50,
      0.00,
      10,
      0.00,
      0.20,
      0.10,
      1.0,
      0,
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
    const sReplyDrafting = uuidv4();
    const sSentimentTriage = uuidv4();

    insertService.run(
      sSummarization, 
      'AI Ticket Summaries', 
      'Auto-summarizes support tickets to reduce agent handling time.', 
      'planned', 
      providersMap['Anthropic - Claude Haiku 4.5'], 
      2000, 
      400, 
      150, 
      null, 
      now, 
      now
    );

    insertService.run(
      sReplyDrafting, 
      'AI Reply Drafting', 
      'Generates draft replies based on previous ticket solutions.', 
      'planned', 
      providersMap['OpenAI - GPT-5.4 mini'], 
      1000, 
      500, 
      100, 
      null, 
      now, 
      now
    );

    insertService.run(
      sSentimentTriage, 
      'AI Sentiment Triage', 
      'Analyzes ticket tone to flag and escalate frustrated customers.', 
      'planned', 
      providersMap['OpenAI - GPT-5.4 mini'], 
      500, 
      100, 
      300, 
      null, 
      now, 
      now
    );

    // 4. Service Dependencies
    const insertDependency = db.prepare(`
      INSERT INTO service_dependencies (id, source_id, target_id, dependency_type)
      VALUES (?, ?, ?, ?)
    `);
    insertDependency.run(uuidv4(), sReplyDrafting, sSummarization, 'requires');

    // 5. Feature Packs
    const insertPack = db.prepare(`INSERT INTO packs (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`);
    const insertPackService = db.prepare(`INSERT INTO pack_services (pack_id, service_id) VALUES (?, ?)`);

    const pSupportAssistant = uuidv4();

    insertPack.run(pSupportAssistant, 'AI Support Assistant', 'Complete suite of summarization, reply drafting, and sentiment triage.', now, now);
    insertPackService.run(pSupportAssistant, sSummarization);
    insertPackService.run(pSupportAssistant, sReplyDrafting);
    insertPackService.run(pSupportAssistant, sSentimentTriage);

    // 6. Pricing Plans
    const insertPlan = db.prepare(`INSERT INTO plans (id, name, description, base_price, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`);
    const insertPlanPack = db.prepare(`INSERT INTO plan_packs (plan_id, pack_id) VALUES (?, ?)`);

    const plPro = uuidv4();
    const plTeam = uuidv4();

    insertPlan.run(plPro, 'Pro Plan', 'Ideal for standard teams adding support summaries and drafts.', 80.00, now, now);
    insertPlanPack.run(plPro, pSupportAssistant);

    insertPlan.run(plTeam, 'Team Plan', 'Advanced support workflows with full intelligence tools.', 149.00, now, now);
    insertPlanPack.run(plTeam, pSupportAssistant);

    // 6b. Demo AI monetization configs (catalog level, scenario_id = NULL).
    const insertMonetization = db.prepare(`
      INSERT INTO monetization_configs (
        id, entity_type, entity_id, scenario_id, monetization_type,
        addon_monthly_fee, addon_has_usage_limit, addon_usage_limit, addon_overcharge_policy,
        usage_variant, price_per_credit,
        hybrid_monthly_fee, hybrid_included_credits, hybrid_overcharge_policy,
        overcharge_markup, overcharge_user_pct, avg_overcharge_pct
      ) VALUES (?, 'plan', ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    // Pro Plan → flat add-on $29/mo (no usage limit)
    insertMonetization.run(uuidv4(), plPro, 'addon', 29, 0, null, null, null, null, null, null, null, 1.5, 0.2, 0.5);
    // Team Plan → hybrid: $99/mo including a 5,000-credit pool, pay-as-you-go overage
    insertMonetization.run(uuidv4(), plTeam, 'hybrid', null, 0, null, null, null, null, 99, 5000, 'payg', 1.5, 0.25, 0.4);

    // 7. Verticals
    const insertVertical = db.prepare(`INSERT INTO verticals (id, name, description, tam_users, sam_users, som_users, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertVerticalPlan = db.prepare(`INSERT INTO vertical_plans (vertical_id, plan_id) VALUES (?, ?)`);

    const vB2BSupport = uuidv4();

    insertVertical.run(vB2BSupport, 'B2B Support Teams', 'Customer helpdesks and technical support organizations.', 25000, 10000, 2500, now, now);
    insertVerticalPlan.run(vB2BSupport, plPro);
    insertVerticalPlan.run(vB2BSupport, plTeam);

    // 8. Cost Items
    const insertCost = db.prepare(`INSERT INTO cost_items (id, name, category, subcategory, amount, frequency, currency, service_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?)`);

    const cBuild = uuidv4();
    const cOps = uuidv4();

    insertCost.run(cBuild, 'AI Summaries build & integration', 'capex', 'development', 20000.00, 'one_time', sSummarization, now, now);
    insertCost.run(cOps, 'AI ops & monitoring', 'opex', 'infrastructure', 500.00, 'monthly', sSummarization, now, now);

    // 9. Cohorts
    const insertCohort = db.prepare(`
      INSERT INTO cohort_configs (id, name, vertical_id, current_users, monthly_acquisition, acquisition_growth_rate, monthly_churn_rate, retention_floor, monthly_expansion_rate, ai_adoption_rate, base_arpu, arpu_uplift, arpu_uplift_percent, churn_reduction, acquisition_uplift, gross_margin, adoption_ramp_months, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const coSMBHelpdesk = uuidv4();
    insertCohort.run(
      coSMBHelpdesk, 
      'SMB Helpdesk Customers', 
      vB2BSupport, 
      1000, 
      40, 
      0, 
      0.03, 
      0.50, 
      0, 
      0.50, 
      80.00, 
      10.00, 
      0, 
      0.20, 
      0.10, 
      0.60, 
      0, 
      now, 
      now
    );

    // 10. Scenarios
    const insertScenario = db.prepare(`
      INSERT INTO scenarios (id, name, description, projection_months, discount_rate, scope_type, revenue_source, modeling_type, revenue_carrier, revenue_bridge, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'cohort', 'incremental', 'cohort', null, ?, ?)
    `);
    const insertScenarioService = db.prepare(`INSERT INTO scenario_services (scenario_id, service_id, rollout_month) VALUES (?, ?, ?)`);
    const insertScenarioCost = db.prepare(`INSERT INTO scenario_costs (scenario_id, cost_item_id) VALUES (?, ?)`);
    const insertScenarioCohort = db.prepare(`INSERT INTO scenario_cohorts (scenario_id, cohort_config_id) VALUES (?, ?)`);

    const scHero = uuidv4();
    insertScenario.run(
      scHero, 
      'Is it worth adding AI Ticket Summaries?', 
      'Calculate ROI of adding AI Ticket Summaries at 1,000 customers', 
      36, 
      0.10, 
      'cohorts', 
      now, 
      now
    );
    
    // Link cohort
    insertScenarioCohort.run(scHero, coSMBHelpdesk);

    // Link service
    insertScenarioService.run(scHero, sSummarization, 0);

    // Link costs
    insertScenarioCost.run(scHero, cBuild);
    insertScenarioCost.run(scHero, cOps);

    // Scenario Results: intentionally NOT pre-populated.
  })();

  console.error('Database seed completed successfully!');
}
