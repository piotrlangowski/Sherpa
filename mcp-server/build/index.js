#!/usr/bin/env node
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import crypto from "crypto";
import db from "./db.js";
import { calculateScenario, runSensitivityAnalysis, applyScopeOverrides } from "./shared/financial-math.js";
// Initialize MCP Server
const server = new McpServer({
    name: "sherpa-roi-calculator",
    version: "1.0.0"
});
// Helper: Query all providers from database
function getProviders() {
    return db.prepare(`
    SELECT id, name, model_name, input_price, output_price, is_predefined, updated_at
    FROM providers
  `).all();
}
// Helper: Load a full scenario using the current multi-cohort schema (scope_type + junctions)
function getFullScenario(scenarioId) {
    const s = db.prepare(`
    SELECT id, name, description, projection_months, discount_rate, scope_type
    FROM scenarios
    WHERE id = ?
  `).get(scenarioId);
    if (!s)
        return null;
    // Resolve cohorts based on scope_type
    let baseCohorts = [];
    if (s.scope_type === 'all_clients') {
        baseCohorts = db.prepare(`
      SELECT id, name, vertical_id, current_users, monthly_acquisition,
             acquisition_growth_rate, monthly_churn_rate, retention_floor,
             monthly_expansion_rate, ai_adoption_rate, base_arpu
      FROM cohort_configs
    `).all();
    }
    else if (s.scope_type === 'verticals') {
        baseCohorts = db.prepare(`
      SELECT c.id, c.name, c.vertical_id, c.current_users, c.monthly_acquisition,
             c.acquisition_growth_rate, c.monthly_churn_rate, c.retention_floor,
             c.monthly_expansion_rate, c.ai_adoption_rate, c.base_arpu
      FROM cohort_configs c
      JOIN verticals v ON c.vertical_id = v.id
      JOIN scenario_verticals sv ON sv.vertical_id = v.id
      WHERE sv.scenario_id = ?
    `).all(scenarioId);
    }
    else {
        // scope_type = 'cohorts' (default)
        baseCohorts = db.prepare(`
      SELECT c.id, c.name, c.vertical_id, c.current_users, c.monthly_acquisition,
             c.acquisition_growth_rate, c.monthly_churn_rate, c.retention_floor,
             c.monthly_expansion_rate, c.ai_adoption_rate, c.base_arpu
      FROM cohort_configs c
      JOIN scenario_cohorts sc ON sc.cohort_config_id = c.id
      WHERE sc.scenario_id = ?
    `).all(scenarioId);
    }
    // Load scope overrides and apply cascade
    const overrides = db.prepare(`
    SELECT id, scenario_id, target_type, target_id, monthly_churn_rate, monthly_acquisition,
           acquisition_growth_rate, ai_adoption_rate, retention_floor, expansion_rate, arpu_override
    FROM scenario_scope_overrides
    WHERE scenario_id = ?
  `).all(scenarioId);
    s.scope_cohorts = applyScopeOverrides(baseCohorts, overrides);
    // Load services
    s.services = db.prepare(`
    SELECT s.id, s.name, s.description, s.status, s.provider_id,
           s.avg_input_tokens, s.avg_output_tokens, s.avg_requests_per_user_month,
           s.fixed_cost_per_month, ss.rollout_month
    FROM services s
    JOIN scenario_services ss ON s.id = ss.service_id
    WHERE ss.scenario_id = ?
    ORDER BY ss.rollout_month ASC
  `).all(scenarioId);
    // Load cost items
    s.costs = db.prepare(`
    SELECT c.id, c.name, c.category, c.subcategory, c.amount, c.frequency, c.service_id
    FROM cost_items c
    JOIN scenario_costs sc ON c.id = sc.cost_item_id
    WHERE sc.scenario_id = ?
  `).all(scenarioId);
    return s;
}
// ============================================================
// TOOLS DEFINITION
// ============================================================
// 1. Settings CRUD
server.tool("get_settings", "Retrieve global company settings (currency, discount rate, company name, etc.)", {}, async () => {
    try {
        const rows = db.prepare("SELECT key, value FROM settings").all();
        const settings = {};
        for (const row of rows) {
            settings[row.key] = row.value;
        }
        return {
            content: [{ type: "text", text: JSON.stringify(settings, null, 2) }]
        };
    }
    catch (err) {
        return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true
        };
    }
});
server.tool("update_settings", "Modify company parameters like company_name, currency, default_discount_rate, etc.", {
    company_name: z.string().optional(),
    currency: z.enum(["USD", "EUR", "PLN", "GBP"]).optional(),
    default_discount_rate: z.number().min(0).max(1).optional(),
    projection_horizon_months: z.number().min(12).max(120).optional()
}, async (args) => {
    try {
        db.transaction(() => {
            if (args.company_name !== undefined) {
                db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('company_name', ?)")
                    .run(args.company_name);
            }
            if (args.currency !== undefined) {
                db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('currency', ?)")
                    .run(args.currency);
            }
            if (args.default_discount_rate !== undefined) {
                db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('default_discount_rate', ?)")
                    .run(args.default_discount_rate.toString());
            }
            if (args.projection_horizon_months !== undefined) {
                db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('projection_horizon_months', ?)")
                    .run(args.projection_horizon_months.toString());
            }
        })();
        return {
            content: [{ type: "text", text: "Settings updated successfully." }]
        };
    }
    catch (err) {
        return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true
        };
    }
});
// 2. Services CRUD
server.tool("list_services", "List all registered AI services in the Svelte catalog alongside their provider parameters", {}, async () => {
    try {
        const services = db.prepare(`
        SELECT s.id, s.name, s.description, s.status, s.provider_id, 
               s.avg_input_tokens, s.avg_output_tokens, s.avg_requests_per_user_month,
               s.fixed_cost_per_month, s.created_at, s.updated_at,
               p.name as provider_name, p.model_name as provider_model_name
        FROM services s
        LEFT JOIN providers p ON s.provider_id = p.id
        ORDER BY s.name ASC
      `).all();
        return {
            content: [{ type: "text", text: JSON.stringify(services, null, 2) }]
        };
    }
    catch (err) {
        return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true
        };
    }
});
server.tool("create_service", "Register a new AI service catalog item with details of its LLM usage, input/output tokens, and requests per user", {
    name: z.string(),
    description: z.string().optional(),
    status: z.enum(["planned", "existing"]).default("planned"),
    provider_id: z.string().nullable().optional(),
    avg_input_tokens: z.number().default(0),
    avg_output_tokens: z.number().default(0),
    avg_requests_per_user_month: z.number().default(0),
    fixed_cost_per_month: z.number().nullable().optional()
}, async (args) => {
    try {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        db.prepare(`
        INSERT INTO services (id, name, description, status, provider_id, avg_input_tokens, avg_output_tokens, avg_requests_per_user_month, fixed_cost_per_month, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, args.name, args.description || null, args.status, args.provider_id || null, args.avg_input_tokens, args.avg_output_tokens, args.avg_requests_per_user_month, args.fixed_cost_per_month ?? null, now, now);
        return {
            content: [{ type: "text", text: `Service '${args.name}' created with ID: ${id}` }]
        };
    }
    catch (err) {
        return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true
        };
    }
});
server.tool("update_service", "Modify parameters of an existing AI service", {
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["planned", "existing"]).optional(),
    provider_id: z.string().nullable().optional(),
    avg_input_tokens: z.number().optional(),
    avg_output_tokens: z.number().optional(),
    avg_requests_per_user_month: z.number().optional(),
    fixed_cost_per_month: z.number().nullable().optional()
}, async (args) => {
    try {
        const current = db.prepare("SELECT * FROM services WHERE id = ?").get(args.id);
        if (!current) {
            return { content: [{ type: "text", text: "Service not found" }], isError: true };
        }
        const name = args.name !== undefined ? args.name : current.name;
        const description = args.description !== undefined ? args.description : current.description;
        const status = args.status !== undefined ? args.status : current.status;
        const providerId = args.provider_id !== undefined ? args.provider_id : current.provider_id;
        const input = args.avg_input_tokens !== undefined ? args.avg_input_tokens : current.avg_input_tokens;
        const output = args.avg_output_tokens !== undefined ? args.avg_output_tokens : current.avg_output_tokens;
        const reqs = args.avg_requests_per_user_month !== undefined ? args.avg_requests_per_user_month : current.avg_requests_per_user_month;
        const fixed = args.fixed_cost_per_month !== undefined ? args.fixed_cost_per_month : current.fixed_cost_per_month;
        const now = new Date().toISOString();
        db.prepare(`
        UPDATE services
        SET name = ?, description = ?, status = ?, provider_id = ?, avg_input_tokens = ?, avg_output_tokens = ?, avg_requests_per_user_month = ?, fixed_cost_per_month = ?, updated_at = ?
        WHERE id = ?
      `).run(name, description, status, providerId, input, output, reqs, fixed, now, args.id);
        return {
            content: [{ type: "text", text: `Service '${name}' updated successfully.` }]
        };
    }
    catch (err) {
        return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true
        };
    }
});
// 3. Packs & Plans Tools
server.tool("list_packs", "List registered catalog packages and their atomic services", {}, async () => {
    try {
        const packs = db.prepare("SELECT id, name, description FROM packs").all();
        for (const p of packs) {
            p.services = db.prepare(`
          SELECT s.id, s.name, s.status
          FROM services s
          JOIN pack_services ps ON s.id = ps.service_id
          WHERE ps.pack_id = ?
        `).all(p.id);
        }
        return {
            content: [{ type: "text", text: JSON.stringify(packs, null, 2) }]
        };
    }
    catch (err) {
        return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true
        };
    }
});
server.tool("create_pack", "Create a feature pack catalog item that groups multiple service IDs together", {
    name: z.string(),
    description: z.string().optional(),
    service_ids: z.array(z.string())
}, async (args) => {
    try {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        db.transaction(() => {
            db.prepare("INSERT INTO packs (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
                .run(id, args.name, args.description || null, now, now);
            const insertLink = db.prepare("INSERT INTO pack_services (pack_id, service_id) VALUES (?, ?)");
            for (const sId of args.service_ids) {
                insertLink.run(id, sId);
            }
        })();
        return {
            content: [{ type: "text", text: `Pack '${args.name}' created with ID: ${id}` }]
        };
    }
    catch (err) {
        return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true
        };
    }
});
server.tool("list_plans", "List pricing plans along with their packaged bundles and service contents", {}, async () => {
    try {
        const plans = db.prepare("SELECT id, name, description, base_price FROM plans").all();
        for (const p of plans) {
            p.services = db.prepare(`
          SELECT s.id, s.name FROM services s
          JOIN plan_services ps ON s.id = ps.service_id
          WHERE ps.plan_id = ?
        `).all(p.id);
            p.packs = db.prepare(`
          SELECT pk.id, pk.name FROM packs pk
          JOIN plan_packs pp ON pk.id = pp.pack_id
          WHERE pp.plan_id = ?
        `).all(p.id);
        }
        return {
            content: [{ type: "text", text: JSON.stringify(plans, null, 2) }]
        };
    }
    catch (err) {
        return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true
        };
    }
});
server.tool("create_plan", "Register a pricing plan tier, wrapping service IDs and pack IDs", {
    name: z.string(),
    description: z.string().optional(),
    base_price: z.number(),
    service_ids: z.array(z.string()).optional(),
    pack_ids: z.array(z.string()).optional()
}, async (args) => {
    try {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        db.transaction(() => {
            db.prepare("INSERT INTO plans (id, name, description, base_price, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
                .run(id, args.name, args.description || null, args.base_price, now, now);
            if (args.service_ids) {
                const insertServ = db.prepare("INSERT INTO plan_services (plan_id, service_id) VALUES (?, ?)");
                for (const sId of args.service_ids) {
                    insertServ.run(id, sId);
                }
            }
            if (args.pack_ids) {
                const insertPack = db.prepare("INSERT INTO plan_packs (plan_id, pack_id) VALUES (?, ?)");
                for (const pId of args.pack_ids) {
                    insertPack.run(id, pId);
                }
            }
        })();
        return {
            content: [{ type: "text", text: `Plan '${args.name}' created with ID: ${id}` }]
        };
    }
    catch (err) {
        return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true
        };
    }
});
// 4. Scenarios & Projections CRUD
server.tool("list_scenarios", "List active ROI scenarios and their cached NPV/IRR results", {}, async () => {
    try {
        const scenarios = db.prepare(`
        SELECT s.id, s.name, s.description, s.projection_months, s.discount_rate, s.scope_type, s.created_at, s.updated_at,
               r.payback_months, r.npv, r.irr_annual, r.tco, r.roi_percent
        FROM scenarios s
        LEFT JOIN scenario_results r ON s.id = r.scenario_id
        ORDER BY s.updated_at DESC
      `).all();
        return {
            content: [{ type: "text", text: JSON.stringify(scenarios, null, 2) }]
        };
    }
    catch (err) {
        return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true
        };
    }
});
server.tool("create_scenario", "Create a new scenario, set up its cohort growth parameter block, and map catalog items + cost items to it", {
    name: z.string(),
    description: z.string().optional(),
    projection_months: z.number().default(36),
    discount_rate: z.number().default(0.10),
    cohort_config: z.object({
        name: z.string(),
        current_users: z.number(),
        monthly_acquisition: z.number(),
        acquisition_growth_rate: z.number().default(0),
        monthly_churn_rate: z.number().default(0.05),
        retention_floor: z.number().default(0.60),
        monthly_expansion_rate: z.number().default(0.02),
        ai_adoption_rate: z.number().default(0.30),
        base_arpu: z.number().default(100),
        vertical_id: z.string().nullable().optional()
    }),
    services: z.array(z.object({ id: z.string(), rollout_month: z.number().default(0) })).optional(),
    packs: z.array(z.object({ id: z.string(), rollout_month: z.number().default(0) })).optional(),
    plans: z.array(z.object({ id: z.string(), rollout_month: z.number().default(0) })).optional(),
    cost_ids: z.array(z.string()).optional()
}, async (args) => {
    try {
        const scenarioId = crypto.randomUUID();
        const cohortId = crypto.randomUUID();
        const now = new Date().toISOString();
        db.transaction(() => {
            // Create cohort config
            const cc = args.cohort_config;
            db.prepare(`
          INSERT INTO cohort_configs (id, name, vertical_id, current_users, monthly_acquisition, acquisition_growth_rate, monthly_churn_rate, retention_floor, monthly_expansion_rate, ai_adoption_rate, base_arpu, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(cohortId, cc.name, cc.vertical_id || null, cc.current_users, cc.monthly_acquisition, cc.acquisition_growth_rate, cc.monthly_churn_rate, cc.retention_floor, cc.monthly_expansion_rate, cc.ai_adoption_rate, cc.base_arpu, now, now);
            // Create scenario (multi-cohort schema)
            db.prepare(`
          INSERT INTO scenarios (id, name, description, projection_months, discount_rate, scope_type, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'cohorts', ?, ?)
        `).run(scenarioId, args.name, args.description || null, args.projection_months, args.discount_rate, now, now);
            // Link cohort via junction
            db.prepare(`INSERT INTO scenario_cohorts (scenario_id, cohort_config_id) VALUES (?, ?)`)
                .run(scenarioId, cohortId);
            // Map services
            if (args.services) {
                const insertServ = db.prepare("INSERT INTO scenario_services (scenario_id, service_id, rollout_month) VALUES (?, ?, ?)");
                for (const s of args.services) {
                    insertServ.run(scenarioId, s.id, s.rollout_month);
                }
            }
            // Map packs
            if (args.packs) {
                const insertPack = db.prepare("INSERT INTO scenario_packs (scenario_id, pack_id, rollout_month) VALUES (?, ?, ?)");
                for (const p of args.packs) {
                    insertPack.run(scenarioId, p.id, p.rollout_month);
                }
            }
            // Map plans
            if (args.plans) {
                const insertPlan = db.prepare("INSERT INTO scenario_plans (scenario_id, plan_id, rollout_month) VALUES (?, ?, ?)");
                for (const pl of args.plans) {
                    insertPlan.run(scenarioId, pl.id, pl.rollout_month);
                }
            }
            // Map costs
            if (args.cost_ids) {
                const insertCost = db.prepare("INSERT INTO scenario_costs (scenario_id, cost_item_id) VALUES (?, ?)");
                for (const cId of args.cost_ids) {
                    insertCost.run(scenarioId, cId);
                }
            }
        })();
        // Run and cache calculations
        const fullScenario = getFullScenario(scenarioId);
        const providers = getProviders();
        const results = calculateScenario(fullScenario, providers);
        const resultsId = crypto.randomUUID();
        db.prepare(`
        INSERT OR REPLACE INTO scenario_results (id, scenario_id, payback_months, npv, irr_annual, tco, roi_percent, monthly_cashflows, monthly_mrr, monthly_customers, calculated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(resultsId, scenarioId, results.paybackMonths, results.npv, results.irrAnnual, results.tco, results.roiPercent, JSON.stringify(results.timeline.map(t => t.netCashFlow)), JSON.stringify(results.timeline.map(t => t.revenue)), JSON.stringify(results.timeline.map(t => t.customers)), now);
        return {
            content: [{
                    type: "text",
                    text: `Scenario '${args.name}' created with ID: ${scenarioId}. Projections calculated (NPV: $${results.npv}, IRR: ${results.irrAnnual !== null ? (results.irrAnnual * 100).toFixed(1) + '%' : 'N/A'}).`
                }]
        };
    }
    catch (err) {
        return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true
        };
    }
});
// 5. Financial Computation Tools
server.tool("calculate_roi", "Execute NPV/IRR/TCO ROI calculations for a scenario and save results to cache", {
    id: z.string()
}, async (args) => {
    try {
        const scenario = getFullScenario(args.id);
        if (!scenario) {
            return { content: [{ type: "text", text: `Scenario '${args.id}' not found` }], isError: true };
        }
        const providers = getProviders();
        const results = calculateScenario(scenario, providers);
        // Save results
        const now = new Date().toISOString();
        db.prepare(`
        INSERT OR REPLACE INTO scenario_results (id, scenario_id, payback_months, npv, irr_annual, tco, roi_percent, monthly_cashflows, monthly_mrr, monthly_customers, calculated_at)
        VALUES ((SELECT id FROM scenario_results WHERE scenario_id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(args.id, args.id, results.paybackMonths, results.npv, results.irrAnnual, results.tco, results.roiPercent, JSON.stringify(results.timeline.map(t => t.netCashFlow)), JSON.stringify(results.timeline.map(t => t.revenue)), JSON.stringify(results.timeline.map(t => t.customers)), now);
        return {
            content: [{
                    type: "text",
                    text: `ROI Results calculated successfully:\n- NPV: $${results.npv.toLocaleString()}\n- IRR (Annualized): ${results.irrAnnual !== null ? (results.irrAnnual * 100).toFixed(2) + '%' : 'N/A'}\n- Payback Period: ${results.paybackMonths !== null ? results.paybackMonths + ' months' : 'Never'}\n- TCO: $${results.tco.toLocaleString()}\n- ROI%: ${(results.roiPercent * 100).toFixed(1)}%`
                }]
        };
    }
    catch (err) {
        return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true
        };
    }
});
server.tool("run_sensitivity", "Compute scenario sensitivity results (NPV deviation parameters) varying key metrics by ±10%", {
    id: z.string(),
    variation_percent: z.number().default(0.10)
}, async (args) => {
    try {
        const scenario = getFullScenario(args.id);
        if (!scenario) {
            return { content: [{ type: "text", text: `Scenario '${args.id}' not found` }], isError: true };
        }
        const providers = getProviders();
        const sensitivity = runSensitivityAnalysis(scenario, providers, args.variation_percent);
        let md = `### Sensitivity Analysis (Tornado Chart Data) for ${scenario.name}\n`;
        md += `*Base NPV: $${sensitivity.baseNpv.toLocaleString()}*\n\n`;
        md += `| Parameter | Variation | Low NPV | High NPV | Impact Range |\n`;
        md += `|---|---|---|---|---|\n`;
        for (const res of sensitivity.results) {
            md += `| ${res.parameter} | ±${args.variation_percent * 100}% | $${res.lowNpv.toLocaleString()} | $${res.highNpv.toLocaleString()} | $${res.impactRange.toLocaleString()} |\n`;
        }
        return {
            content: [{ type: "text", text: md }]
        };
    }
    catch (err) {
        return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true
        };
    }
});
server.tool("compare_scenarios", "Compare financial highlights and compute opportunity cost / NPV delta between multiple scenario IDs", {
    ids: z.array(z.string())
}, async (args) => {
    try {
        if (args.ids.length < 2) {
            return { content: [{ type: "text", text: "Comparison requires at least two scenario IDs." }], isError: true };
        }
        const providers = getProviders();
        const scenarios = [];
        for (const id of args.ids) {
            const scenario = getFullScenario(id);
            if (!scenario) {
                return { content: [{ type: "text", text: `Scenario '${id}' not found.` }], isError: true };
            }
            const results = calculateScenario(scenario, providers);
            scenarios.push({ scenario, results });
        }
        // Sort by NPV descending to find opportunity cost leaders
        scenarios.sort((a, b) => b.results.npv - a.results.npv);
        let md = `### Scenario Comparison & Opportunity Cost analysis\n\n`;
        md += `| Scenario Name | NPV | IRR | Payback | TCO | ROI% |\n`;
        md += `|---|---|---|---|---|---|\n`;
        for (const s of scenarios) {
            md += `| ${s.scenario.name} | **$${s.results.npv.toLocaleString()}** | ${s.results.irrAnnual !== null ? (s.results.irrAnnual * 100).toFixed(1) + '%' : 'N/A'} | ${s.results.paybackMonths !== null ? s.results.paybackMonths + ' mo' : 'Never'} | $${s.results.tco.toLocaleString()} | ${(s.results.roiPercent * 100).toFixed(1)}% |\n`;
        }
        md += `\n#### Opportunity Cost Breakdown:\n`;
        const best = scenarios[0];
        for (let i = 1; i < scenarios.length; i++) {
            const comparison = scenarios[i];
            const deltaNpv = best.results.npv - comparison.results.npv;
            md += `- Choosing **${comparison.scenario.name}** instead of **${best.scenario.name}** carries an NPV opportunity cost of **$${deltaNpv.toLocaleString()}**.\n`;
        }
        return {
            content: [{ type: "text", text: md }]
        };
    }
    catch (err) {
        return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true
        };
    }
});
// 6. Natural Language Description Scenario Generator
server.tool("generate_scenario_from_description", "Intelligently construct a scenario and cohort model from a plain-text description", {
    description: z.string()
}, async (args) => {
    try {
        const d = args.description.toLowerCase();
        // Defaults
        let scenarioName = "AI Project Simulation";
        let projectionMonths = 36;
        let discountRate = 0.10;
        let currentUsers = 1000;
        let monthlyAcquisition = 100;
        let acquisitionGrowthRate = 0.02;
        let monthlyChurnRate = 0.05;
        let retentionFloor = 0.60;
        let monthlyExpansionRate = 0.02;
        let aiAdoptionRate = 0.30;
        let baseArpu = 99;
        // Regular expressions to extract parameters
        const nameMatch = args.description.match(/(?:scenario|name)\s*["']([^"']+)["']/i);
        if (nameMatch)
            scenarioName = nameMatch[1];
        const churnMatch = d.match(/(\d+(?:\.\d+)?)\s*%\s*churn/);
        if (churnMatch)
            monthlyChurnRate = parseFloat(churnMatch[1]) / 100;
        const arpuMatch = d.match(/(?:arpu|price|revenue)\s*(?:is|of\s*)?\$?(\d+(?:\.\d+)?)/);
        if (arpuMatch)
            baseArpu = parseFloat(arpuMatch[1]);
        const usersMatch = d.match(/(\d+)\s*(?:starting|initial|current|base)\s*users/);
        if (usersMatch)
            currentUsers = parseInt(usersMatch[1]);
        const acqMatch = d.match(/(\d+)\s*(?:new|acquired)\s*(?:users|customers|cohort)/);
        if (acqMatch)
            monthlyAcquisition = parseInt(acqMatch[1]);
        const discountMatch = d.match(/(\d+(?:\.\d+)?)\s*%\s*(?:discount|wacc|rate)/);
        if (discountMatch)
            discountRate = parseFloat(discountMatch[1]) / 100;
        const horizonMatch = d.match(/(\d+)\s*(?:months?|horizon|period)/);
        if (horizonMatch)
            projectionMonths = parseInt(horizonMatch[1]);
        const adoptionMatch = d.match(/(\d+(?:\.\d+)?)\s*%\s*(?:adoption|adoption\s*rate)/);
        if (adoptionMatch)
            aiAdoptionRate = parseFloat(adoptionMatch[1]) / 100;
        // Resolve Service mapping (scan database services and match name queries)
        const dbServices = db.prepare("SELECT id, name FROM services").all();
        const serviceRollouts = [];
        for (const service of dbServices) {
            if (d.includes(service.name.toLowerCase())) {
                // Look for month specification near name, e.g. "summarization in month 3"
                let rolloutMonth = 0;
                const escapedName = service.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                const rolloutRegex = new RegExp(`${escapedName}.*?(?:rollout|launch|month|starts?)\\s*(\\d+)`, 'i');
                const rolloutMatch = args.description.match(rolloutRegex);
                if (rolloutMatch) {
                    rolloutMonth = parseInt(rolloutMatch[1]);
                }
                serviceRollouts.push({ id: service.id, rollout_month: rolloutMonth });
            }
        }
        // Check if a cohort config matches the name, else create one
        const cohortId = crypto.randomUUID();
        const scenarioId = crypto.randomUUID();
        const now = new Date().toISOString();
        db.transaction(() => {
            db.prepare(`
          INSERT INTO cohort_configs (id, name, vertical_id, current_users, monthly_acquisition, acquisition_growth_rate, monthly_churn_rate, retention_floor, monthly_expansion_rate, ai_adoption_rate, base_arpu, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(cohortId, `${scenarioName} Cohort`, null, currentUsers, monthlyAcquisition, acquisitionGrowthRate, monthlyChurnRate, retentionFloor, monthlyExpansionRate, aiAdoptionRate, baseArpu, now, now);
            db.prepare(`
          INSERT INTO scenarios (id, name, description, projection_months, discount_rate, scope_type, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'cohorts', ?, ?)
        `).run(scenarioId, scenarioName, args.description, projectionMonths, discountRate, now, now);
            db.prepare(`INSERT INTO scenario_cohorts (scenario_id, cohort_config_id) VALUES (?, ?)`)
                .run(scenarioId, cohortId);
            if (serviceRollouts.length > 0) {
                const insertLink = db.prepare("INSERT INTO scenario_services (scenario_id, service_id, rollout_month) VALUES (?, ?, ?)");
                for (const s of serviceRollouts) {
                    insertLink.run(scenarioId, s.id, s.rollout_month);
                }
            }
        })();
        // Run and cache ROI results
        const fullScenario = getFullScenario(scenarioId);
        const providers = getProviders();
        const results = calculateScenario(fullScenario, providers);
        const resultsId = crypto.randomUUID();
        db.prepare(`
        INSERT OR REPLACE INTO scenario_results (id, scenario_id, payback_months, npv, irr_annual, tco, roi_percent, monthly_cashflows, monthly_mrr, monthly_customers, calculated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(resultsId, scenarioId, results.paybackMonths, results.npv, results.irrAnnual, results.tco, results.roiPercent, JSON.stringify(results.timeline.map(t => t.netCashFlow)), JSON.stringify(results.timeline.map(t => t.revenue)), JSON.stringify(results.timeline.map(t => t.customers)), now);
        let responseText = `### Successfully parsed natural language description & created scenario: **${scenarioName}**\n\n`;
        responseText += `#### Extracted Cohort Settings:\n`;
        responseText += `- Starting Users: **${currentUsers}**\n`;
        responseText += `- Monthly Acquisition: **${monthlyAcquisition}**\n`;
        responseText += `- Churn Rate: **${(monthlyChurnRate * 100).toFixed(1)}%**\n`;
        responseText += `- Base ARPU: **$${baseArpu}/mo**\n`;
        responseText += `- AI Adoption: **${(aiAdoptionRate * 100).toFixed(1)}%**\n`;
        responseText += `- WACC/Discount Rate: **${(discountRate * 100).toFixed(1)}%**\n`;
        responseText += `- Horizon: **${projectionMonths} months**\n\n`;
        if (serviceRollouts.length > 0) {
            responseText += `#### Resolved & Linked Services:\n`;
            for (const rollout of serviceRollouts) {
                const sName = dbServices.find(s => s.id === rollout.id)?.name || "Unknown";
                responseText += `- Linked service **${sName}** with launch offset month **${rollout.rollout_month}**\n`;
            }
            responseText += `\n`;
        }
        else {
            responseText += `*No matching catalog services found in description; created scenario with cohort settings only.*\n\n`;
        }
        responseText += `#### Simulated ROI Summary:\n`;
        responseText += `- **NPV**: $${results.npv.toLocaleString()}\n`;
        responseText += `- **IRR**: ${results.irrAnnual !== null ? (results.irrAnnual * 100).toFixed(1) + '%' : 'N/A'}\n`;
        responseText += `- **Payback period**: ${results.paybackMonths !== null ? results.paybackMonths + ' months' : 'Never'}\n`;
        responseText += `- **TCO**: $${results.tco.toLocaleString()}\n`;
        responseText += `\n*Scenario ID: \`${scenarioId}\`. View this scenario inside the SvelteKit dashboard.*`;
        return {
            content: [{ type: "text", text: responseText }]
        };
    }
    catch (err) {
        return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true
        };
    }
});
// ============================================================
// RESOURCES DEFINITION
// ============================================================
// 1. Scenario Results Resource: sherpa://scenarios/{id}/results
const scenarioResultsTemplate = new ResourceTemplate("sherpa://scenarios/{id}/results", {
    list: undefined
});
server.resource("scenario_results", scenarioResultsTemplate, async (uri, variables) => {
    try {
        const scenarioId = variables.id;
        if (typeof scenarioId !== 'string') {
            throw new Error("Missing or invalid scenario ID parameter.");
        }
        const row = db.prepare(`
        SELECT id, scenario_id, payback_months, npv, irr_annual, tco, roi_percent, monthly_cashflows, monthly_mrr, monthly_customers, calculated_at
        FROM scenario_results
        WHERE scenario_id = ?
      `).get(scenarioId);
        if (!row) {
            return {
                contents: [{
                        uri: uri.href,
                        mimeType: "application/json",
                        text: JSON.stringify({ error: `Results not found for scenario '${scenarioId}'` })
                    }]
            };
        }
        const results = {
            id: row.id,
            scenario_id: row.scenario_id,
            payback_months: row.payback_months,
            npv: row.npv,
            irr_annual: row.irr_annual,
            tco: row.tco,
            roi_percent: row.roi_percent,
            monthly_cashflows: JSON.parse(row.monthly_cashflows || '[]'),
            monthly_mrr: JSON.parse(row.monthly_mrr || '[]'),
            monthly_customers: JSON.parse(row.monthly_customers || '[]'),
            calculated_at: row.calculated_at
        };
        return {
            contents: [{
                    uri: uri.href,
                    mimeType: "application/json",
                    text: JSON.stringify(results, null, 2)
                }]
        };
    }
    catch (err) {
        return {
            contents: [{
                    uri: uri.href,
                    mimeType: "application/json",
                    text: JSON.stringify({ error: err.message })
                }]
        };
    }
});
// 2. Summary Dashboard Resource: sherpa://dashboard/summary
server.resource("dashboard_summary", "sherpa://dashboard/summary", async (uri) => {
    try {
        const rows = db.prepare(`
        SELECT s.id, s.name, s.projection_months, s.discount_rate,
               r.payback_months, r.npv, r.irr_annual, r.tco, r.roi_percent
        FROM scenarios s
        LEFT JOIN scenario_results r ON s.id = r.scenario_id
        ORDER BY s.name ASC
      `).all();
        const summary = rows.map(r => ({
            id: r.id,
            name: r.name,
            projection_horizon_months: r.projection_months,
            discount_rate_annual: r.discount_rate,
            npv: r.npv ?? null,
            irr_annual: r.irr_annual ?? null,
            payback_period_months: r.payback_months ?? null,
            tco: r.tco ?? null,
            roi_percent: r.roi_percent ?? null
        }));
        return {
            contents: [{
                    uri: uri.href,
                    mimeType: "application/json",
                    text: JSON.stringify(summary, null, 2)
                }]
        };
    }
    catch (err) {
        return {
            contents: [{
                    uri: uri.href,
                    mimeType: "application/json",
                    text: JSON.stringify({ error: err.message })
                }]
        };
    }
});
// Run the server using Stdio transport
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Sherpa MCP Server is running on stdio transport.");
}
main().catch((err) => {
    console.error("Critical error in MCP server:", err);
    process.exit(1);
});
