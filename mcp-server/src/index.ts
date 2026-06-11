#!/usr/bin/env node
import './stderr-guard.js';
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db, { dbPath } from "./db.js";
import { ensureDashboard, openBrowser, stopDashboard } from "./launcher.js";
import {
  calculateScenario,
  runSensitivityAnalysis,
  buildCohortModel,
  applyScopeOverrides
} from "./shared/financial-math.js";
import {
  convertAmount,
  normalizeScenarioCurrency,
  FALLBACK_EXCHANGE_RATES
} from "./shared/currency.js";
import type {
  Scenario,
  Provider,
  Service,
  CohortConfig,
  ScopeOverride,
  CostItem,
  CalculationResult,
  Currency,
  ExchangeRates
} from "./shared/types.js";

const manifestPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../manifest.json');
let version = "1.1.0";
try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  version = manifest.version || "1.1.0";
} catch {}

// Initialize MCP Server
const server = new McpServer({
  name: "sherpa-roi-calculator",
  version: version
}, {
  capabilities: {
    prompts: {}
  }
});

interface CurrencyContext {
  currency: Currency;
  exchangeRates: ExchangeRates;
}

// Helper: Load currency and exchange rates from settings
function loadCurrencyContext(): CurrencyContext {
  try {
    const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    const currency = (settings['currency'] as Currency) || 'USD';
    let exchangeRates = FALLBACK_EXCHANGE_RATES;
    if (settings['exchange_rates']) {
      try {
        exchangeRates = JSON.parse(settings['exchange_rates']);
      } catch {}
    }
    return { currency, exchangeRates };
  } catch {
    return { currency: 'USD', exchangeRates: FALLBACK_EXCHANGE_RATES };
  }
}

// Helper: Query all providers from database
function getProviders(): Provider[] {
  return db.prepare(`
    SELECT id, name, model_name, input_price, output_price, is_predefined, currency, updated_at
    FROM providers
  `).all() as any[];
}

// Helper: Load a full scenario using the current multi-cohort schema (scope_type + junctions)
function getFullScenario(scenarioId: string): Scenario | null {
  const s = db.prepare(`
    SELECT id, name, description, projection_months, discount_rate, scope_type
    FROM scenarios
    WHERE id = ?
  `).get(scenarioId) as any;

  if (!s) return null;

  // Resolve cohorts based on scope_type
  let baseCohorts: CohortConfig[] = [];
  if (s.scope_type === 'all_clients') {
    baseCohorts = db.prepare(`
      SELECT id, name, vertical_id, current_users, monthly_acquisition,
             acquisition_growth_rate, monthly_churn_rate, retention_floor,
             monthly_expansion_rate, ai_adoption_rate, base_arpu
      FROM cohort_configs
    `).all() as any[];
  } else if (s.scope_type === 'verticals') {
    baseCohorts = db.prepare(`
      SELECT c.id, c.name, c.vertical_id, c.current_users, c.monthly_acquisition,
             c.acquisition_growth_rate, c.monthly_churn_rate, c.retention_floor,
             c.monthly_expansion_rate, c.ai_adoption_rate, c.base_arpu
      FROM cohort_configs c
      JOIN verticals v ON c.vertical_id = v.id
      JOIN scenario_verticals sv ON sv.vertical_id = v.id
      WHERE sv.scenario_id = ?
    `).all(scenarioId) as any[];
  } else {
    // scope_type = 'cohorts' (default)
    baseCohorts = db.prepare(`
      SELECT c.id, c.name, c.vertical_id, c.current_users, c.monthly_acquisition,
             c.acquisition_growth_rate, c.monthly_churn_rate, c.retention_floor,
             c.monthly_expansion_rate, c.ai_adoption_rate, c.base_arpu
      FROM cohort_configs c
      JOIN scenario_cohorts sc ON sc.cohort_config_id = c.id
      WHERE sc.scenario_id = ?
    `).all(scenarioId) as any[];
  }

  // Load scope overrides and apply cascade
  const overrides = db.prepare(`
    SELECT id, scenario_id, target_type, target_id, monthly_churn_rate, monthly_acquisition,
           acquisition_growth_rate, ai_adoption_rate, retention_floor, expansion_rate, arpu_override
    FROM scenario_scope_overrides
    WHERE scenario_id = ?
  `).all(scenarioId) as ScopeOverride[];

  s.scope_cohorts = applyScopeOverrides(baseCohorts, overrides);

  // Load services
  s.services = db.prepare(`
    SELECT s.id, s.name, s.description, s.status, s.provider_id,
           s.avg_input_tokens, s.avg_output_tokens, s.avg_requests_per_user_month,
           s.fixed_cost_per_month, s.fixed_cost_currency, ss.rollout_month
    FROM services s
    JOIN scenario_services ss ON s.id = ss.service_id
    WHERE ss.scenario_id = ?
    ORDER BY ss.rollout_month ASC
  `).all(scenarioId) as any[];

  // Load cost items
  s.costs = db.prepare(`
    SELECT c.id, c.name, c.category, c.subcategory, c.amount, c.frequency, c.currency, c.service_id
    FROM cost_items c
    JOIN scenario_costs sc ON c.id = sc.cost_item_id
    WHERE sc.scenario_id = ?
  `).all(scenarioId) as any[];

  return s as Scenario;
}

// ============================================================
// TOOLS DEFINITION
// ============================================================

// 1. Settings CRUD
server.tool(
  "get_settings",
  "Retrieve global company settings (currency, discount rate, company name, etc.)",
  {},
  async () => {
    try {
      const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
      const settings: Record<string, string> = {};
      for (const row of rows) {
        settings[row.key] = row.value;
      }
      return {
        content: [{ type: "text", text: JSON.stringify(settings, null, 2) }]
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "update_settings",
  "Modify company parameters like company_name, currency, default_discount_rate, exchange_rates, etc.",
  {
    company_name: z.string().optional(),
    currency: z.enum(["USD", "EUR", "PLN", "GBP"]).optional(),
    default_discount_rate: z.number().min(0).max(1).optional(),
    projection_horizon_months: z.number().min(12).max(120).optional(),
    exchange_rates: z.record(z.enum(["USD", "EUR", "PLN", "GBP"]), z.number()).optional(),
    exchange_rates_as_of: z.string().optional()
  },
  async (args) => {
    try {
      db.transaction(() => {
        let shouldInvalidateCache = false;

        if (args.company_name !== undefined) {
          db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('company_name', ?)")
            .run(args.company_name);
        }
        if (args.currency !== undefined) {
          const currentCurrency = db.prepare("SELECT value FROM settings WHERE key = 'currency'").get() as any;
          if (!currentCurrency || currentCurrency.value !== args.currency) {
            shouldInvalidateCache = true;
          }
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
        if (args.exchange_rates !== undefined) {
          shouldInvalidateCache = true;
          db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('exchange_rates', ?)")
            .run(JSON.stringify(args.exchange_rates));
        }
        if (args.exchange_rates_as_of !== undefined) {
          db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('exchange_rates_as_of', ?)")
            .run(args.exchange_rates_as_of);
        }

        if (shouldInvalidateCache) {
          db.prepare("DELETE FROM scenario_results").run();
        }
      })();
      return {
        content: [{ type: "text", text: "Settings updated successfully." }]
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "get_client_base",
  "Retrieve the global customer base parameters (total users, ARPU, acquisition, churn, expansion, etc.)",
  {},
  async () => {
    try {
      const row = db.prepare("SELECT * FROM client_base WHERE id = 'singleton'").get();
      if (!row) {
        return {
          content: [{ type: "text", text: "Error: Client base singleton row not found." }],
          isError: true
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(row, null, 2) }]
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "update_client_base",
  "Modify the global customer base parameters (total users, ARPU, acquisition, churn, expansion, etc.)",
  {
    total_users: z.number().int().nonnegative().optional(),
    default_arpu: z.number().nonnegative().optional(),
    default_monthly_churn_rate: z.number().min(0).max(1).optional(),
    default_monthly_acquisition: z.number().int().nonnegative().optional(),
    default_acquisition_growth_rate: z.number().min(0).max(1).optional(),
    default_ai_adoption_rate: z.number().min(0).max(1).optional(),
    default_retention_floor: z.number().min(0).max(1).optional(),
    default_expansion_rate: z.number().min(0).max(1).optional()
  },
  async (args) => {
    try {
      let updatedRow: any;
      db.transaction(() => {
        const current = db.prepare("SELECT * FROM client_base WHERE id = 'singleton'").get() as any;
        if (!current) {
          throw new Error("Client base singleton row not found.");
        }
        const total_users = args.total_users !== undefined ? args.total_users : current.total_users;
        const default_arpu = args.default_arpu !== undefined ? args.default_arpu : current.default_arpu;
        const default_monthly_churn_rate = args.default_monthly_churn_rate !== undefined ? args.default_monthly_churn_rate : current.default_monthly_churn_rate;
        const default_monthly_acquisition = args.default_monthly_acquisition !== undefined ? args.default_monthly_acquisition : current.default_monthly_acquisition;
        const default_acquisition_growth_rate = args.default_acquisition_growth_rate !== undefined ? args.default_acquisition_growth_rate : current.default_acquisition_growth_rate;
        const default_ai_adoption_rate = args.default_ai_adoption_rate !== undefined ? args.default_ai_adoption_rate : current.default_ai_adoption_rate;
        const default_retention_floor = args.default_retention_floor !== undefined ? args.default_retention_floor : current.default_retention_floor;
        const default_expansion_rate = args.default_expansion_rate !== undefined ? args.default_expansion_rate : current.default_expansion_rate;
        const now = new Date().toISOString();

        db.prepare(`
          UPDATE client_base
          SET total_users = ?, default_arpu = ?, default_monthly_churn_rate = ?,
              default_monthly_acquisition = ?, default_acquisition_growth_rate = ?,
              default_ai_adoption_rate = ?, default_retention_floor = ?,
              default_expansion_rate = ?, updated_at = ?
          WHERE id = 'singleton'
        `).run(
          total_users, default_arpu, default_monthly_churn_rate,
          default_monthly_acquisition, default_acquisition_growth_rate,
          default_ai_adoption_rate, default_retention_floor,
          default_expansion_rate, now
        );

        updatedRow = db.prepare("SELECT * FROM client_base WHERE id = 'singleton'").get();
      })();

      return {
        content: [{ type: "text", text: `Client base parameters updated successfully:\n${JSON.stringify(updatedRow, null, 2)}` }]
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

// 1.5 Providers CRUD
server.tool(
  "list_providers",
  "List all registered AI providers (e.g. OpenAI, Google, Anthropic) and their input/output token pricing.",
  {},
  async () => {
    try {
      const providers = db.prepare("SELECT * FROM providers ORDER BY name ASC").all();
      return { content: [{ type: "text", text: JSON.stringify(providers, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "create_provider",
  "Register a new custom AI provider catalog item with name, model_name, token pricing, and currency.",
  {
    name: z.string(),
    model_name: z.string(),
    input_price: z.number().nonnegative(),
    output_price: z.number().nonnegative(),
    currency: z.enum(["USD", "EUR", "PLN", "GBP"]).default("USD")
  },
  async (args) => {
    try {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO providers (id, name, model_name, input_price, output_price, is_predefined, currency, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?)
      `).run(id, args.name, args.model_name, args.input_price, args.output_price, args.currency, now);
      return { content: [{ type: "text", text: `Provider '${args.name}' (${args.model_name}) created with ID: ${id}` }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "update_provider",
  "Modify the token pricing, currency, or name of an existing AI provider by ID.",
  {
    id: z.string(),
    name: z.string().optional(),
    model_name: z.string().optional(),
    input_price: z.number().nonnegative().optional(),
    output_price: z.number().nonnegative().optional(),
    currency: z.enum(["USD", "EUR", "PLN", "GBP"]).optional()
  },
  async (args) => {
    try {
      const current = db.prepare("SELECT * FROM providers WHERE id = ?").get(args.id) as any;
      if (!current) {
        return { content: [{ type: "text", text: "Provider not found" }], isError: true };
      }
      const name = args.name !== undefined ? args.name : current.name;
      const model_name = args.model_name !== undefined ? args.model_name : current.model_name;
      const input_price = args.input_price !== undefined ? args.input_price : current.input_price;
      const output_price = args.output_price !== undefined ? args.output_price : current.output_price;
      const currency = args.currency !== undefined ? args.currency : current.currency;
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE providers
        SET name = ?, model_name = ?, input_price = ?, output_price = ?, currency = ?, updated_at = ?
        WHERE id = ?
      `).run(name, model_name, input_price, output_price, currency, now, args.id);
      return { content: [{ type: "text", text: `Provider '${name}' updated successfully.` }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "delete_provider",
  "Delete a custom AI provider by ID.",
  { id: z.string() },
  async (args) => {
    try {
      const current = db.prepare("SELECT * FROM providers WHERE id = ?").get(args.id) as any;
      if (!current) {
        return { content: [{ type: "text", text: "Provider not found" }], isError: true };
      }
      if (current.is_predefined === 1 || current.is_predefined === true) {
        return { content: [{ type: "text", text: "Cannot delete a predefined provider." }], isError: true };
      }
      db.prepare("DELETE FROM providers WHERE id = ?").run(args.id);
      return { content: [{ type: "text", text: `Provider with ID ${args.id} deleted successfully.` }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// 1.6 Verticals CRUD
server.tool(
  "list_verticals",
  "List all customer verticals (e.g. LegalTech, E-commerce) in the catalog.",
  {},
  async () => {
    try {
      const verticals = db.prepare("SELECT * FROM verticals ORDER BY name ASC").all();
      return { content: [{ type: "text", text: JSON.stringify(verticals, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "create_vertical",
  "Register a new customer vertical in the catalog.",
  {
    name: z.string(),
    description: z.string().optional(),
    tam_users: z.number().int().nonnegative().optional(),
    sam_users: z.number().int().nonnegative().optional(),
    som_users: z.number().int().nonnegative().optional()
  },
  async (args) => {
    try {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO verticals (id, name, description, tam_users, sam_users, som_users, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        args.name,
        args.description || null,
        args.tam_users ?? 0,
        args.sam_users ?? 0,
        args.som_users ?? 0,
        now,
        now
      );
      return { content: [{ type: "text", text: `Vertical '${args.name}' created with ID: ${id}` }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "update_vertical",
  "Modify metadata (TAM/SAM/SOM or description) of an existing vertical.",
  {
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    tam_users: z.number().int().nonnegative().optional(),
    sam_users: z.number().int().nonnegative().optional(),
    som_users: z.number().int().nonnegative().optional()
  },
  async (args) => {
    try {
      const current = db.prepare("SELECT * FROM verticals WHERE id = ?").get(args.id) as any;
      if (!current) {
        return { content: [{ type: "text", text: "Vertical not found" }], isError: true };
      }
      const name = args.name !== undefined ? args.name : current.name;
      const description = args.description !== undefined ? args.description : current.description;
      const tam = args.tam_users !== undefined ? args.tam_users : current.tam_users;
      const sam = args.sam_users !== undefined ? args.sam_users : current.sam_users;
      const som = args.som_users !== undefined ? args.som_users : current.som_users;
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE verticals
        SET name = ?, description = ?, tam_users = ?, sam_users = ?, som_users = ?, updated_at = ?
        WHERE id = ?
      `).run(name, description, tam, sam, som, now, args.id);
      return { content: [{ type: "text", text: `Vertical '${name}' updated successfully.` }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "delete_vertical",
  "Remove a vertical from the catalog by ID.",
  { id: z.string() },
  async (args) => {
    try {
      const current = db.prepare("SELECT * FROM verticals WHERE id = ?").get(args.id) as any;
      if (!current) {
        return { content: [{ type: "text", text: "Vertical not found" }], isError: true };
      }
      db.prepare("DELETE FROM verticals WHERE id = ?").run(args.id);
      return { content: [{ type: "text", text: `Vertical with ID ${args.id} deleted successfully.` }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// 1.7 Cohorts CRUD
server.tool(
  "list_cohorts",
  "List all cohort growth configurations in the database.",
  {},
  async () => {
    try {
      const cohorts = db.prepare("SELECT * FROM cohort_configs ORDER BY name ASC").all();
      return { content: [{ type: "text", text: JSON.stringify(cohorts, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "create_cohort",
  "Create a standalone cohort growth configuration.",
  {
    name: z.string(),
    vertical_id: z.string().nullable().optional(),
    current_users: z.number().int().nonnegative(),
    monthly_acquisition: z.number().int().nonnegative(),
    acquisition_growth_rate: z.number().min(0).max(1).default(0),
    monthly_churn_rate: z.number().min(0).max(1).default(0.05),
    retention_floor: z.number().min(0).max(1).default(0.60),
    monthly_expansion_rate: z.number().min(0).max(1).default(0.02),
    ai_adoption_rate: z.number().min(0).max(1).default(0.30),
    base_arpu: z.number().nonnegative().default(100)
  },
  async (args) => {
    try {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO cohort_configs (
          id, name, vertical_id, current_users, monthly_acquisition, acquisition_growth_rate,
          monthly_churn_rate, retention_floor, monthly_expansion_rate, ai_adoption_rate, base_arpu,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, args.name, args.vertical_id || null, args.current_users, args.monthly_acquisition, args.acquisition_growth_rate,
        args.monthly_churn_rate, args.retention_floor, args.monthly_expansion_rate, args.ai_adoption_rate, args.base_arpu,
        now, now
      );
      return { content: [{ type: "text", text: `Cohort '${args.name}' created with ID: ${id}` }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "update_cohort",
  "Modify growth parameters of an existing cohort config.",
  {
    id: z.string(),
    name: z.string().optional(),
    vertical_id: z.string().nullable().optional(),
    current_users: z.number().int().nonnegative().optional(),
    monthly_acquisition: z.number().int().nonnegative().optional(),
    acquisition_growth_rate: z.number().min(0).max(1).optional(),
    monthly_churn_rate: z.number().min(0).max(1).optional(),
    retention_floor: z.number().min(0).max(1).optional(),
    monthly_expansion_rate: z.number().min(0).max(1).optional(),
    ai_adoption_rate: z.number().min(0).max(1).optional(),
    base_arpu: z.number().nonnegative().optional()
  },
  async (args) => {
    try {
      const current = db.prepare("SELECT * FROM cohort_configs WHERE id = ?").get(args.id) as any;
      if (!current) {
        return { content: [{ type: "text", text: "Cohort not found" }], isError: true };
      }
      const name = args.name !== undefined ? args.name : current.name;
      const vertical_id = args.vertical_id !== undefined ? args.vertical_id : current.vertical_id;
      const current_users = args.current_users !== undefined ? args.current_users : current.current_users;
      const monthly_acquisition = args.monthly_acquisition !== undefined ? args.monthly_acquisition : current.monthly_acquisition;
      const acquisition_growth_rate = args.acquisition_growth_rate !== undefined ? args.acquisition_growth_rate : current.acquisition_growth_rate;
      const monthly_churn_rate = args.monthly_churn_rate !== undefined ? args.monthly_churn_rate : current.monthly_churn_rate;
      const retention_floor = args.retention_floor !== undefined ? args.retention_floor : current.retention_floor;
      const monthly_expansion_rate = args.monthly_expansion_rate !== undefined ? args.monthly_expansion_rate : current.monthly_expansion_rate;
      const ai_adoption_rate = args.ai_adoption_rate !== undefined ? args.ai_adoption_rate : current.ai_adoption_rate;
      const base_arpu = args.base_arpu !== undefined ? args.base_arpu : current.base_arpu;
      const now = new Date().toISOString();

      db.prepare(`
        UPDATE cohort_configs
        SET name = ?, vertical_id = ?, current_users = ?, monthly_acquisition = ?,
            acquisition_growth_rate = ?, monthly_churn_rate = ?, retention_floor = ?,
            monthly_expansion_rate = ?, ai_adoption_rate = ?, base_arpu = ?, updated_at = ?
        WHERE id = ?
      `).run(
        name, vertical_id, current_users, monthly_acquisition,
        acquisition_growth_rate, monthly_churn_rate, retention_floor,
        monthly_expansion_rate, ai_adoption_rate, base_arpu, now, args.id
      );
      return { content: [{ type: "text", text: `Cohort '${name}' updated successfully.` }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "delete_cohort",
  "Delete a cohort growth config by ID.",
  { id: z.string() },
  async (args) => {
    try {
      const current = db.prepare("SELECT * FROM cohort_configs WHERE id = ?").get(args.id) as any;
      if (!current) {
        return { content: [{ type: "text", text: "Cohort not found" }], isError: true };
      }
      db.prepare("DELETE FROM cohort_configs WHERE id = ?").run(args.id);
      return { content: [{ type: "text", text: `Cohort with ID ${args.id} deleted successfully.` }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// 1.8 Fixed Cost Items CRUD
server.tool(
  "list_cost_items",
  "List all CaPex/Opex fixed cost items in the catalog.",
  {},
  async () => {
    try {
      const costs = db.prepare("SELECT * FROM cost_items ORDER BY name ASC").all();
      return { content: [{ type: "text", text: JSON.stringify(costs, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "create_cost_item",
  "Create a fixed cost catalog item (Capex/Opex).",
  {
    name: z.string(),
    category: z.enum(["capex", "opex"]),
    subcategory: z.string().optional(),
    amount: z.number().nonnegative(),
    frequency: z.enum(["one_time", "monthly", "yearly"]),
    currency: z.enum(["USD", "EUR", "PLN", "GBP"]).default("USD"),
    service_id: z.string().nullable().optional()
  },
  async (args) => {
    try {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO cost_items (id, name, category, subcategory, amount, frequency, currency, service_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, args.name, args.category, args.subcategory || null, args.amount, args.frequency, args.currency, args.service_id || null, now, now);
      return { content: [{ type: "text", text: `Cost item '${args.name}' created with ID: ${id}` }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "update_cost_item",
  "Modify details of an existing fixed cost item.",
  {
    id: z.string(),
    name: z.string().optional(),
    category: z.enum(["capex", "opex"]).optional(),
    subcategory: z.string().optional(),
    amount: z.number().nonnegative().optional(),
    frequency: z.enum(["one_time", "monthly", "yearly"]).optional(),
    currency: z.enum(["USD", "EUR", "PLN", "GBP"]).optional(),
    service_id: z.string().nullable().optional()
  },
  async (args) => {
    try {
      const current = db.prepare("SELECT * FROM cost_items WHERE id = ?").get(args.id) as any;
      if (!current) {
        return { content: [{ type: "text", text: "Cost item not found" }], isError: true };
      }
      const name = args.name !== undefined ? args.name : current.name;
      const category = args.category !== undefined ? args.category : current.category;
      const subcategory = args.subcategory !== undefined ? args.subcategory : current.subcategory;
      const amount = args.amount !== undefined ? args.amount : current.amount;
      const frequency = args.frequency !== undefined ? args.frequency : current.frequency;
      const currency = args.currency !== undefined ? args.currency : current.currency;
      const service_id = args.service_id !== undefined ? args.service_id : current.service_id;
      const now = new Date().toISOString();

      db.prepare(`
        UPDATE cost_items
        SET name = ?, category = ?, subcategory = ?, amount = ?, frequency = ?, currency = ?, service_id = ?, updated_at = ?
        WHERE id = ?
      `).run(name, category, subcategory, amount, frequency, currency, service_id, now, args.id);
      return { content: [{ type: "text", text: `Cost item '${name}' updated successfully.` }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "delete_cost_item",
  "Delete a fixed cost item from the catalog by ID.",
  { id: z.string() },
  async (args) => {
    try {
      const current = db.prepare("SELECT * FROM cost_items WHERE id = ?").get(args.id) as any;
      if (!current) {
        return { content: [{ type: "text", text: "Cost item not found" }], isError: true };
      }
      db.prepare("DELETE FROM cost_items WHERE id = ?").run(args.id);
      return { content: [{ type: "text", text: `Cost item with ID ${args.id} deleted successfully.` }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// 2. Services CRUD
server.tool(
  "list_services",
  "List all registered AI services in the Svelte catalog alongside their provider parameters",
  {},
  async () => {
    try {
      const services = db.prepare(`
        SELECT s.id, s.name, s.description, s.status, s.provider_id, 
               s.avg_input_tokens, s.avg_output_tokens, s.avg_requests_per_user_month,
               s.fixed_cost_per_month, s.fixed_cost_currency, s.created_at, s.updated_at,
               p.name as provider_name, p.model_name as provider_model_name
        FROM services s
        LEFT JOIN providers p ON s.provider_id = p.id
        ORDER BY s.name ASC
      `).all() as any[];

      return {
        content: [{ type: "text", text: JSON.stringify(services, null, 2) }]
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "create_service",
  "Register a new AI service catalog item with details of its LLM usage, input/output tokens, and requests per user",
  {
    name: z.string(),
    description: z.string().optional(),
    status: z.enum(["planned", "existing"]).default("planned"),
    provider_id: z.string().nullable().optional(),
    avg_input_tokens: z.number().default(0),
    avg_output_tokens: z.number().default(0),
    avg_requests_per_user_month: z.number().default(0),
    fixed_cost_per_month: z.number().nullable().optional(),
    fixed_cost_currency: z.enum(["USD", "EUR", "PLN", "GBP"]).default("USD")
  },
  async (args) => {
    try {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO services (id, name, description, status, provider_id, avg_input_tokens, avg_output_tokens, avg_requests_per_user_month, fixed_cost_per_month, fixed_cost_currency, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        args.name,
        args.description || null,
        args.status,
        args.provider_id || null,
        args.avg_input_tokens,
        args.avg_output_tokens,
        args.avg_requests_per_user_month,
        args.fixed_cost_per_month ?? null,
        args.fixed_cost_currency,
        now,
        now
      );

      return {
        content: [{ type: "text", text: `Service '${args.name}' created with ID: ${id}` }]
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "update_service",
  "Modify parameters of an existing AI service",
  {
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["planned", "existing"]).optional(),
    provider_id: z.string().nullable().optional(),
    avg_input_tokens: z.number().optional(),
    avg_output_tokens: z.number().optional(),
    avg_requests_per_user_month: z.number().optional(),
    fixed_cost_per_month: z.number().nullable().optional(),
    fixed_cost_currency: z.enum(["USD", "EUR", "PLN", "GBP"]).optional()
  },
  async (args) => {
    try {
      const current = db.prepare("SELECT * FROM services WHERE id = ?").get(args.id) as any;
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
      const fixedCurrency = args.fixed_cost_currency !== undefined ? args.fixed_cost_currency : current.fixed_cost_currency;
      const now = new Date().toISOString();

      db.prepare(`
        UPDATE services
        SET name = ?, description = ?, status = ?, provider_id = ?, avg_input_tokens = ?, avg_output_tokens = ?, avg_requests_per_user_month = ?, fixed_cost_per_month = ?, fixed_cost_currency = ?, updated_at = ?
        WHERE id = ?
      `).run(name, description, status, providerId, input, output, reqs, fixed, fixedCurrency, now, args.id);

      return {
        content: [{ type: "text", text: `Service '${name}' updated successfully.` }]
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "delete_service",
  "Delete an existing AI service by ID.",
  { id: z.string() },
  async (args) => {
    try {
      const current = db.prepare("SELECT * FROM services WHERE id = ?").get(args.id);
      if (!current) {
        return { content: [{ type: "text", text: "Service not found" }], isError: true };
      }
      db.prepare("DELETE FROM services WHERE id = ?").run(args.id);
      return { content: [{ type: "text", text: `Service with ID ${args.id} deleted successfully.` }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// 3. Packs & Plans Tools
server.tool(
  "list_packs",
  "List registered catalog packages and their atomic services",
  {},
  async () => {
    try {
      const packs = db.prepare("SELECT id, name, description FROM packs").all() as any[];
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
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "create_pack",
  "Create a feature pack catalog item that groups multiple service IDs together",
  {
    name: z.string(),
    description: z.string().optional(),
    service_ids: z.array(z.string())
  },
  async (args) => {
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
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "list_plans",
  "List pricing plans along with their packaged bundles and service contents",
  {},
  async () => {
    try {
      const plans = db.prepare("SELECT id, name, description, base_price FROM plans").all() as any[];
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
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "create_plan",
  "Register a pricing plan tier, wrapping service IDs and pack IDs",
  {
    name: z.string(),
    description: z.string().optional(),
    base_price: z.number(),
    service_ids: z.array(z.string()).optional(),
    pack_ids: z.array(z.string()).optional()
  },
  async (args) => {
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
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "update_pack",
  "Modify metadata or associated service IDs of an existing feature pack.",
  {
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    service_ids: z.array(z.string()).optional()
  },
  async (args) => {
    try {
      db.transaction(() => {
        const current = db.prepare("SELECT * FROM packs WHERE id = ?").get(args.id) as any;
        if (!current) {
          throw new Error("Pack not found");
        }
        const name = args.name !== undefined ? args.name : current.name;
        const description = args.description !== undefined ? args.description : current.description;
        const now = new Date().toISOString();

        db.prepare("UPDATE packs SET name = ?, description = ?, updated_at = ? WHERE id = ?")
          .run(name, description, now, args.id);

        if (args.service_ids !== undefined) {
          db.prepare("DELETE FROM pack_services WHERE pack_id = ?").run(args.id);
          const insertLink = db.prepare("INSERT INTO pack_services (pack_id, service_id) VALUES (?, ?)");
          for (const sId of args.service_ids) {
            insertLink.run(args.id, sId);
          }
        }
      })();
      return { content: [{ type: "text", text: `Pack with ID ${args.id} updated successfully.` }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "delete_pack",
  "Delete an existing feature pack by ID.",
  { id: z.string() },
  async (args) => {
    try {
      const current = db.prepare("SELECT * FROM packs WHERE id = ?").get(args.id);
      if (!current) {
        return { content: [{ type: "text", text: "Pack not found" }], isError: true };
      }
      db.prepare("DELETE FROM packs WHERE id = ?").run(args.id);
      return { content: [{ type: "text", text: `Pack with ID ${args.id} deleted successfully.` }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "update_plan",
  "Modify pricing, description, or wrapped services and packs of a pricing plan.",
  {
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    base_price: z.number().optional(),
    service_ids: z.array(z.string()).optional(),
    pack_ids: z.array(z.string()).optional()
  },
  async (args) => {
    try {
      db.transaction(() => {
        const current = db.prepare("SELECT * FROM plans WHERE id = ?").get(args.id) as any;
        if (!current) {
          throw new Error("Plan not found");
        }
        const name = args.name !== undefined ? args.name : current.name;
        const description = args.description !== undefined ? args.description : current.description;
        const base_price = args.base_price !== undefined ? args.base_price : current.base_price;
        const now = new Date().toISOString();

        db.prepare("UPDATE plans SET name = ?, description = ?, base_price = ?, updated_at = ? WHERE id = ?")
          .run(name, description, base_price, now, args.id);

        if (args.service_ids !== undefined) {
          db.prepare("DELETE FROM plan_services WHERE plan_id = ?").run(args.id);
          const insertServ = db.prepare("INSERT INTO plan_services (plan_id, service_id) VALUES (?, ?)");
          for (const sId of args.service_ids) {
            insertServ.run(args.id, sId);
          }
        }

        if (args.pack_ids !== undefined) {
          db.prepare("DELETE FROM plan_packs WHERE plan_id = ?").run(args.id);
          const insertPack = db.prepare("INSERT INTO plan_packs (plan_id, pack_id) VALUES (?, ?)");
          for (const pId of args.pack_ids) {
            insertPack.run(args.id, pId);
          }
        }
      })();
      return { content: [{ type: "text", text: `Plan with ID ${args.id} updated successfully.` }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "delete_plan",
  "Delete an existing pricing plan by ID.",
  { id: z.string() },
  async (args) => {
    try {
      const current = db.prepare("SELECT * FROM plans WHERE id = ?").get(args.id);
      if (!current) {
        return { content: [{ type: "text", text: "Plan not found" }], isError: true };
      }
      db.prepare("DELETE FROM plans WHERE id = ?").run(args.id);
      return { content: [{ type: "text", text: `Plan with ID ${args.id} deleted successfully.` }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// 4. Scenarios & Projections CRUD
server.tool(
  "list_scenarios",
  "List active ROI scenarios and their cached NPV/IRR results",
  {},
  async () => {
    try {
      const scenarios = db.prepare(`
        SELECT s.id, s.name, s.description, s.projection_months, s.discount_rate, s.scope_type, s.created_at, s.updated_at,
               r.payback_months, r.npv, r.irr_annual, r.tco, r.roi_percent
        FROM scenarios s
        LEFT JOIN scenario_results r ON s.id = r.scenario_id
        ORDER BY s.updated_at DESC
      `).all() as any[];

      return {
        content: [{ type: "text", text: JSON.stringify(scenarios, null, 2) }]
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "create_scenario",
  "Create a new scenario, set up its cohort growth parameter block, and map catalog items + cost items to it",
  {
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
  },
  async (args) => {
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
      const fullScenario = getFullScenario(scenarioId)!;
      const providers = getProviders();
      const { currency, exchangeRates } = loadCurrencyContext();
      const { scenario: normalizedScenario, providers: normalizedProviders } = normalizeScenarioCurrency(
        fullScenario,
        providers,
        currency,
        exchangeRates
      );
      const results = calculateScenario(normalizedScenario, normalizedProviders);
      const resultsId = crypto.randomUUID();

      db.prepare(`
        INSERT OR REPLACE INTO scenario_results (id, scenario_id, payback_months, npv, irr_annual, tco, roi_percent, monthly_cashflows, monthly_mrr, monthly_customers, calculated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        resultsId,
        scenarioId,
        results.paybackMonths,
        results.npv,
        results.irrAnnual,
        results.tco,
        results.roiPercent,
        JSON.stringify(results.timeline.map(t => t.netCashFlow)),
        JSON.stringify(results.timeline.map(t => t.revenue)),
        JSON.stringify(results.timeline.map(t => t.customers)),
        now
      );

      return {
        content: [{ 
          type: "text", 
          text: `Scenario '${args.name}' created with ID: ${scenarioId}. Projections calculated (NPV: $${results.npv}, IRR: ${results.irrAnnual !== null ? (results.irrAnnual * 100).toFixed(1) + '%' : 'N/A'}).` 
        }]
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "get_scenario",
  "Retrieve full details of an existing scenario by ID, including its growth parameters, attached services/plans, Capex/Opex costs, and ROI results.",
  { id: z.string() },
  async (args) => {
    try {
      const scenario = getFullScenario(args.id);
      if (!scenario) {
        return { content: [{ type: "text", text: `Scenario '${args.id}' not found` }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(scenario, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "update_scenario",
  "Modify parameters of an existing scenario by ID.",
  {
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    projection_months: z.number().int().min(12).max(120).optional(),
    discount_rate: z.number().min(0).max(1).optional(),
    scope_type: z.enum(["all_clients", "verticals", "cohorts"]).optional()
  },
  async (args) => {
    try {
      db.transaction(() => {
        const current = db.prepare("SELECT * FROM scenarios WHERE id = ?").get(args.id) as any;
        if (!current) {
          throw new Error("Scenario not found");
        }
        const name = args.name !== undefined ? args.name : current.name;
        const description = args.description !== undefined ? args.description : current.description;
        const projection_months = args.projection_months !== undefined ? args.projection_months : current.projection_months;
        const discount_rate = args.discount_rate !== undefined ? args.discount_rate : current.discount_rate;
        const scope_type = args.scope_type !== undefined ? args.scope_type : current.scope_type;
        const now = new Date().toISOString();

        db.prepare(`
          UPDATE scenarios
          SET name = ?, description = ?, projection_months = ?, discount_rate = ?, scope_type = ?, updated_at = ?
          WHERE id = ?
        `).run(name, description, projection_months, discount_rate, scope_type, now, args.id);
      })();

      // Re-calculate projections after modification
      const fullScenario = getFullScenario(args.id)!;
      const providers = getProviders();
      const { currency, exchangeRates } = loadCurrencyContext();
      const { scenario: normalizedScenario, providers: normalizedProviders } = normalizeScenarioCurrency(
        fullScenario,
        providers,
        currency,
        exchangeRates
      );
      const results = calculateScenario(normalizedScenario, normalizedProviders);
      const now = new Date().toISOString();

      db.prepare(`
        INSERT OR REPLACE INTO scenario_results (id, scenario_id, payback_months, npv, irr_annual, tco, roi_percent, monthly_cashflows, monthly_mrr, monthly_customers, calculated_at)
        VALUES ((SELECT id FROM scenario_results WHERE scenario_id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        args.id,
        args.id,
        results.paybackMonths,
        results.npv,
        results.irrAnnual,
        results.tco,
        results.roiPercent,
        JSON.stringify(results.timeline.map(t => t.netCashFlow)),
        JSON.stringify(results.timeline.map(t => t.revenue)),
        JSON.stringify(results.timeline.map(t => t.customers)),
        now
      );

      return { content: [{ type: "text", text: `Scenario '${fullScenario.name}' updated successfully and ROI re-projected.` }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "delete_scenario",
  "Delete an existing scenario by ID.",
  { id: z.string() },
  async (args) => {
    try {
      const current = db.prepare("SELECT * FROM scenarios WHERE id = ?").get(args.id);
      if (!current) {
        return { content: [{ type: "text", text: "Scenario not found" }], isError: true };
      }
      db.prepare("DELETE FROM scenarios WHERE id = ?").run(args.id);
      return { content: [{ type: "text", text: `Scenario with ID ${args.id} deleted successfully.` }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// 5. Financial Computation Tools
server.tool(
  "calculate_roi",
  "Execute NPV/IRR/TCO ROI calculations for a scenario and save results to cache",
  {
    id: z.string()
  },
  async (args) => {
    try {
      const scenario = getFullScenario(args.id);
      if (!scenario) {
        return { content: [{ type: "text", text: `Scenario '${args.id}' not found` }], isError: true };
      }

      const providers = getProviders();
      const { currency, exchangeRates } = loadCurrencyContext();
      const { scenario: normalizedScenario, providers: normalizedProviders } = normalizeScenarioCurrency(
        scenario,
        providers,
        currency,
        exchangeRates
      );
      const results = calculateScenario(normalizedScenario, normalizedProviders);

      // Save results
      const now = new Date().toISOString();
      db.prepare(`
        INSERT OR REPLACE INTO scenario_results (id, scenario_id, payback_months, npv, irr_annual, tco, roi_percent, monthly_cashflows, monthly_mrr, monthly_customers, calculated_at)
        VALUES ((SELECT id FROM scenario_results WHERE scenario_id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        args.id,
        args.id,
        results.paybackMonths,
        results.npv,
        results.irrAnnual,
        results.tco,
        results.roiPercent,
        JSON.stringify(results.timeline.map(t => t.netCashFlow)),
        JSON.stringify(results.timeline.map(t => t.revenue)),
        JSON.stringify(results.timeline.map(t => t.customers)),
        now
      );

      return {
        content: [{
          type: "text",
          text: `ROI Results calculated successfully:\n- NPV: ${results.npv.toLocaleString()} ${currency}\n- IRR (Annualized): ${results.irrAnnual !== null ? (results.irrAnnual * 100).toFixed(2) + '%' : 'N/A'}\n- Payback Period: ${results.paybackMonths !== null ? results.paybackMonths + ' months' : 'Never'}\n- TCO: ${results.tco.toLocaleString()} ${currency}\n- ROI%: ${(results.roiPercent * 100).toFixed(1)}%`
        }]
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "run_sensitivity",
  "Compute scenario sensitivity results (NPV deviation parameters) varying key metrics by ±10%",
  {
    id: z.string(),
    variation_percent: z.number().default(0.10)
  },
  async (args) => {
    try {
      const scenario = getFullScenario(args.id);
      if (!scenario) {
        return { content: [{ type: "text", text: `Scenario '${args.id}' not found` }], isError: true };
      }

      const providers = getProviders();
      const { currency, exchangeRates } = loadCurrencyContext();
      const { scenario: normalizedScenario, providers: normalizedProviders } = normalizeScenarioCurrency(
        scenario,
        providers,
        currency,
        exchangeRates
      );
      const sensitivity = runSensitivityAnalysis(normalizedScenario, normalizedProviders, args.variation_percent);

      let md = `### Sensitivity Analysis (Tornado Chart Data) for ${scenario.name}\n`;
      md += `*Base NPV: ${sensitivity.baseNpv.toLocaleString()} ${currency}*\n\n`;
      md += `| Parameter | Variation | Low NPV | High NPV | Impact Range |\n`;
      md += `|---|---|---|---|---|\n`;

      for (const res of sensitivity.results) {
        md += `| ${res.parameter} | ±${args.variation_percent * 100}% | ${res.lowNpv.toLocaleString()} ${currency} | ${res.highNpv.toLocaleString()} ${currency} | ${res.impactRange.toLocaleString()} ${currency} |\n`;
      }

      return {
        content: [{ type: "text", text: md }]
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "compare_scenarios",
  "Compare financial highlights and compute opportunity cost / NPV delta between multiple scenario IDs",
  {
    ids: z.array(z.string())
  },
  async (args) => {
    try {
      if (args.ids.length < 2) {
        return { content: [{ type: "text", text: "Comparison requires at least two scenario IDs." }], isError: true };
      }

      const providers = getProviders();
      const { currency, exchangeRates } = loadCurrencyContext();
      const scenarios: { scenario: Scenario; results: CalculationResult }[] = [];

      for (const id of args.ids) {
        const scenario = getFullScenario(id);
        if (!scenario) {
          return { content: [{ type: "text", text: `Scenario '${id}' not found.` }], isError: true };
        }
        const { scenario: normalizedScenario, providers: normalizedProviders } = normalizeScenarioCurrency(
          scenario,
          providers,
          currency,
          exchangeRates
        );
        const results = calculateScenario(normalizedScenario, normalizedProviders);
        scenarios.push({ scenario, results });
      }

      // Sort by NPV descending to find opportunity cost leaders
      scenarios.sort((a, b) => b.results.npv - a.results.npv);

      let md = `### Scenario Comparison & Opportunity Cost analysis\n\n`;
      md += `| Scenario Name | NPV | IRR | Payback | TCO | ROI% |\n`;
      md += `|---|---|---|---|---|---|\n`;

      for (const s of scenarios) {
        md += `| ${s.scenario.name} | **${s.results.npv.toLocaleString()} ${currency}** | ${s.results.irrAnnual !== null ? (s.results.irrAnnual * 100).toFixed(1) + '%' : 'N/A'} | ${s.results.paybackMonths !== null ? s.results.paybackMonths + ' mo' : 'Never'} | ${s.results.tco.toLocaleString()} ${currency} | ${(s.results.roiPercent * 100).toFixed(1)}% |\n`;
      }

      md += `\n#### Opportunity Cost Breakdown:\n`;
      const best = scenarios[0];
      for (let i = 1; i < scenarios.length; i++) {
        const comparison = scenarios[i];
        const deltaNpv = best.results.npv - comparison.results.npv;
        md += `- Choosing **${comparison.scenario.name}** instead of **${best.scenario.name}** carries an NPV opportunity cost of **${deltaNpv.toLocaleString()} ${currency}**.\n`;
      }

      return {
        content: [{ type: "text", text: md }]
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

// 6. Natural Language Description Scenario Generator
server.tool(
  "generate_scenario_from_description",
  "Intelligently construct a scenario and cohort model from a plain-text description",
  {
    description: z.string()
  },
  async (args) => {
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
      if (nameMatch) scenarioName = nameMatch[1];

      const churnMatch = d.match(/(\d+(?:\.\d+)?)\s*%\s*churn/);
      if (churnMatch) monthlyChurnRate = parseFloat(churnMatch[1]) / 100;

      const arpuMatch = d.match(/(?:arpu|price|revenue)\s*(?:is|of\s*)?\$?(\d+(?:\.\d+)?)/);
      if (arpuMatch) baseArpu = parseFloat(arpuMatch[1]);

      const usersMatch = d.match(/(\d+)\s*(?:starting|initial|current|base)\s*users/);
      if (usersMatch) currentUsers = parseInt(usersMatch[1]);

      const acqMatch = d.match(/(\d+)\s*(?:new|acquired)\s*(?:users|customers|cohort)/);
      if (acqMatch) monthlyAcquisition = parseInt(acqMatch[1]);

      const discountMatch = d.match(/(\d+(?:\.\d+)?)\s*%\s*(?:discount|wacc|rate)/);
      if (discountMatch) discountRate = parseFloat(discountMatch[1]) / 100;

      const horizonMatch = d.match(/(\d+)\s*(?:months?|horizon|period)/);
      if (horizonMatch) projectionMonths = parseInt(horizonMatch[1]);

      const adoptionMatch = d.match(/(\d+(?:\.\d+)?)\s*%\s*(?:adoption|adoption\s*rate)/);
      if (adoptionMatch) aiAdoptionRate = parseFloat(adoptionMatch[1]) / 100;

      // Resolve Service mapping (scan database services and match name queries)
      const dbServices = db.prepare("SELECT id, name FROM services").all() as { id: string; name: string }[];
      const serviceRollouts: { id: string; rollout_month: number }[] = [];

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
      const fullScenario = getFullScenario(scenarioId)!;
      const providers = getProviders();
      const { currency, exchangeRates } = loadCurrencyContext();
      const { scenario: normalizedScenario, providers: normalizedProviders } = normalizeScenarioCurrency(
        fullScenario,
        providers,
        currency,
        exchangeRates
      );
      const results = calculateScenario(normalizedScenario, normalizedProviders);
      const resultsId = crypto.randomUUID();

      db.prepare(`
        INSERT OR REPLACE INTO scenario_results (id, scenario_id, payback_months, npv, irr_annual, tco, roi_percent, monthly_cashflows, monthly_mrr, monthly_customers, calculated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        resultsId,
        scenarioId,
        results.paybackMonths,
        results.npv,
        results.irrAnnual,
        results.tco,
        results.roiPercent,
        JSON.stringify(results.timeline.map(t => t.netCashFlow)),
        JSON.stringify(results.timeline.map(t => t.revenue)),
        JSON.stringify(results.timeline.map(t => t.customers)),
        now
      );

      let responseText = `### Successfully parsed natural language description & created scenario: **${scenarioName}**\n\n`;
      responseText += `#### Extracted Cohort Settings:\n`;
      responseText += `- Starting Users: **${currentUsers}**\n`;
      responseText += `- Monthly Acquisition: **${monthlyAcquisition}**\n`;
      responseText += `- Churn Rate: **${(monthlyChurnRate * 100).toFixed(1)}%**\n`;
      responseText += `- Base ARPU: **${baseArpu} ${currency}/mo**\n`;
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
      } else {
        responseText += `*No matching catalog services found in description; created scenario with cohort settings only.*\n\n`;
      }

      responseText += `#### Simulated ROI Summary:\n`;
      responseText += `- **NPV**: ${results.npv.toLocaleString()} ${currency}\n`;
      responseText += `- **IRR**: ${results.irrAnnual !== null ? (results.irrAnnual * 100).toFixed(1) + '%' : 'N/A'}\n`;
      responseText += `- **Payback period**: ${results.paybackMonths !== null ? results.paybackMonths + ' months' : 'Never'}\n`;
      responseText += `- **TCO**: ${results.tco.toLocaleString()} ${currency}\n`;
      responseText += `\n*Scenario ID: \`${scenarioId}\`. View this scenario inside the SvelteKit dashboard.*`;

      return {
        content: [{ type: "text", text: responseText }]
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

// ============================================================
// RESOURCES DEFINITION
// ============================================================

// 1. Scenario Results Resource: sherpa://scenarios/{id}/results
const scenarioResultsTemplate = new ResourceTemplate(
  "sherpa://scenarios/{id}/results",
  {
    list: undefined
  }
);

server.resource(
  "scenario_results",
  scenarioResultsTemplate,
  async (uri, variables) => {
    try {
      const scenarioId = variables.id;
      if (typeof scenarioId !== 'string') {
        throw new Error("Missing or invalid scenario ID parameter.");
      }

      const row = db.prepare(`
        SELECT id, scenario_id, payback_months, npv, irr_annual, tco, roi_percent, monthly_cashflows, monthly_mrr, monthly_customers, calculated_at
        FROM scenario_results
        WHERE scenario_id = ?
      `).get(scenarioId) as any;

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
    } catch (err: any) {
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({ error: err.message })
        }]
      };
    }
  }
);

// 2. Summary Dashboard Resource: sherpa://dashboard/summary
server.resource(
  "dashboard_summary",
  "sherpa://dashboard/summary",
  async (uri) => {
    try {
      const rows = db.prepare(`
        SELECT s.id, s.name, s.projection_months, s.discount_rate,
               r.payback_months, r.npv, r.irr_annual, r.tco, r.roi_percent
        FROM scenarios s
        LEFT JOIN scenario_results r ON s.id = r.scenario_id
        ORDER BY s.name ASC
      `).all() as any[];

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
    } catch (err: any) {
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({ error: err.message })
        }]
      };
    }
  }
);

// ============================================================
// PROMPTS DEFINITION
// ============================================================

server.prompt(
  "sherpa-catalog-manager",
  "Assists with managing the AI service catalog, feature packs, pricing plans, and LLM model parameters.",
  async () => {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `## Core Concepts

**Sherpa Catalog Structure**:
1. **AI Services**: Individual AI features (e.g. Chatbot, Translator, Semantic Search). Each service defines:
    - Input tokens (\`avg_input_tokens\`) and Output tokens (\`avg_output_tokens\`) per request.
    - Expected monthly requests per user (\`avg_requests_per_user_month\`).
    - Fixed monthly costs (\`fixed_cost_per_month\`).
    - A Provider (\`provider_id\`) which determines the pricing tier for LLM tokens.
2. **Feature Packs**: Bundles of AI services (e.g., "AI Basics Pack" containing Chatbot and Translation, "AI Advanced Pack" containing Semantic Search).
3. **Pricing Plans**: SaaS subscription plans (e.g. Starter, Growth, Enterprise). A plan has a monthly subscription base price (\`base_price\`) and maps to one or more Feature Packs or individual AI Services.
4. **Global Settings**: Global parameters like \`company_name\`, \`currency\`, \`default_discount_rate\`, and default \`projection_horizon_months\`.

## Workflow Patterns

### 1. Catalog Management (Services)
- **List services**: The tool \`list_services\` retrieves current catalog items and their provider IDs.
- **Create service**: The tool \`create_service\` registers a new service.
  - Arguments: \`{ name, provider_id, avg_input_tokens, avg_output_tokens, avg_requests_per_user_month, status, fixed_cost_per_month }\`
- **Update service**: The tool \`update_service\` modifies service specifications (e.g., adjusting average token parameters).

### 2. Feature Packaging (Packs)
- **List Packs**: The tool \`list_packs\` retrieves existing service groups.
- **Create Pack**: The tool \`create_pack\` groups multiple services.
  - Arguments: \`{ name, description, service_ids: ["id1", "id2", ...] }\`

### 3. Subscription & Pricing Setup (Plans)
- **List Plans**: The tool \`list_plans\` retrieves existing tiers.
- **Create Plan**: The tool \`create_plan\` links pricing to packs or services.
  - Arguments: \`{ name, base_price, pack_ids: ["pack1", ...], service_ids: ["service1", ...] }\`

### 4. Global Settings
- **Get Settings**: The tool \`get_settings\` retrieves current company settings.
- **Update Settings**: The tool \`update_settings\` updates settings (e.g., currency, default discount rate, or projection horizon).

## Design Details
- A service status can be "planned" or "existing".
- Predefined LLM providers (e.g., OpenAI, Anthropic) are available in the database to determine cost estimates.`
          }
        }
      ]
    };
  }
);

server.prompt(
  "sherpa-financial-analyst",
  "Provides context and tools for calculating and analyzing ROI, NPV, IRR, TCO, and sensitivity for scenarios.",
  async () => {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `## Core Concepts

**Financial Engine Metrics**:
- **NPV (Net Present Value)**: The total present value of discounted net cash flows.
- **IRR (Internal Rate of Return)**: The annualized return rate of the project.
- **Payback Period**: The number of months it takes for cumulative net cash flow to turn positive.
- **TCO (Total Cost of Ownership)**: Includes Capex/Opex infrastructure, development costs, and LLM model usage (input and output token fees).
- **ROI%**: Percentage return on investment, estimated as \`(Total Revenue - TCO) / TCO\`.

## Workflow Patterns

### 1. Calculation & Result Retrieval
- The tool \`calculate_roi\` runs the calculations for a scenario ID to ensure the cached values are up-to-date.
  - Arguments: \`{ id: "scenario-uuid" }\`
- Scenario results (monthly cashflows, customer growth, MRR) are available via the resource URI: \`sherpa://scenarios/{id}/results\`

### 2. Sensitivity Analysis
- The tool \`run_sensitivity\` evaluates how fluctuations in model parameters impact Net Present Value.
  - Arguments: \`{ id: "scenario-uuid", variation_percent: 0.10 }\`
- High impact ranges highlight variables (e.g., churn, ARPU, adoption, or token costs) representing high leverage or risk.

## Standard Report Components
Financial reports typically include:
- A summary table displaying key metrics (NPV, IRR, Payback, TCO, ROI%).
- A timeline narrative indicating the break-even month (Payback Period).
- Risk mitigation analysis identifying critical parameter sensitivities.`
          }
        }
      ]
    };
  }
);

server.prompt(
  "sherpa-scenario-comparator",
  "Provides context for comparing SaaS ROI scenarios and evaluating opportunity costs.",
  async () => {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `## Core Concepts

**Opportunity Cost in Sherpa**: When evaluating multiple product strategies, choosing a sub-optimal scenario instead of the one with the highest NPV results in an opportunity cost.
- **Delta NPV (ΔNPV)**: The difference in Net Present Value between the highest-NPV scenario and a given alternative.
- **Tradeoff Analysis**: Balances higher ARPU (revenue) against higher Capex/Opex or LLM token usage (costs).

## Workflow Patterns

### 1. High-level Dashboard Review
- The general dashboard summary (names, discount rates, projection horizons, and cached results) is available via the resource URI: \`sherpa://dashboard/summary\`

### 2. Multi-scenario Comparison
- The tool \`compare_scenarios\` performs side-by-side financial comparisons and calculates opportunity costs.
  - Arguments: \`{ ids: ["uuid-1", "uuid-2", ...] }\`
  - Output: Markdown comparison table detailing Net Present Value differences.

## Strategic Comparison Guidelines
SaaS scenario evaluations generally consider:
- The optimal candidate, which is the scenario that maximizes NPV.
- Hurdle rate compatibility, ensuring the annualized IRR exceeds the WACC or discount rate.
- Cash flow and liquidity risk, comparing payback periods (e.g., short vs. long break-even).
- Infrastructure cost volatility, noting sensitivities to high-cost LLM providers under high adoption rates.`
          }
        }
      ]
    };
  }
);

server.prompt(
  "sherpa-scenario-manager",
  "Provides context for creating and configuring SaaS ROI scenarios from text or structured metrics.",
  async () => {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `## Core Concepts

**SaaS Cohort Model**: Sherpa uses a cohort-based model to project revenue and calculate LLM/Infrastructure costs over time. A cohort is defined by:
- **Starting/Current Users** (\`current_users\`): Initial user base.
- **Monthly Acquisition** (\`monthly_acquisition\`): New users added each month.
- **Acquisition Growth Rate** (\`acquisition_growth_rate\`): Growth of the acquisition channel.
- **Monthly Churn Rate** (\`monthly_churn_rate\`): Customer churn.
- **Retention Floor** (\`retention_floor\`): Minimum percentage of users retained in the long term.
- **AI Adoption Rate** (\`ai_adoption_rate\`): The fraction of users within the cohort who adopt and trigger the active AI features.
- **Base ARPU** (\`base_arpu\`): Average Revenue Per User.

## Workflow Patterns

### 1. Natural Language Scenario Generation
- The tool \`generate_scenario_from_description\` parses natural language text to automatically create the scenario, cohort configuration, and link catalog services.
  - Argument: \`{ description: "A plain text description" }\`
  - Example: "Utwórz scenariusz 'Chatbot Pro' z 5000 początkowych użytkowników, churnem 4% i ARPU 150$. Wprowadzamy usługę summarization w 3 miesiącu."

### 2. Structured Scenario Creation
- The tool \`create_scenario\` is available for structured metrics or exact service mappings.
  - Key Fields:
    - \`name\`: Scenario name.
    - \`projection_months\`: Duration of analysis (typically 36 or 60).
    - \`discount_rate\`: Annual discount rate (default is 10%/0.10).
    - \`cohort_config\`: Object defining user acquisition, churn, ARPU, and adoption.
    - \`services\`: Array of \`{ id: string, rollout_month: number }\` to attach.
    - \`cost_ids\`: Array of Capex/Opex fixed cost item IDs to attach.

## Configuration Details
- **Rollout Month**: Represents when a service starts. A rollout month of \`0\` starts immediately, while \`6\` defers costs until month 6.
- **AI Adoption Rate**: Expressed as a decimal (e.g., 0.3 for 30%) to control what percentage of users incur model token costs.
- **Discount Rate (WACC)**: Normally ranges between 0.08 and 0.15 to discount future cash flows.`
          }
        }
      ]
    };
  }
);

server.tool(
  "open_dashboard",
  "Open the Sherpa web dashboard in the user's browser. Use when the user asks to open/show/launch the dashboard or wants to see results visually. Optionally pass a path to deep-link, e.g. /scenarios/<id> right after calculate_roi.",
  { path: z.string().optional() },
  async (args) => {
    try {
      let sub = '';
      if (args.path) {
        if (!/^(?!.*\/{2})\/[a-zA-Z0-9\-_/]*$/.test(args.path)) {
          return {
            content: [{ type: "text", text: "Error: Unsafe path parameter provided. Only alphanumeric characters, hyphens, underscores, and forward slashes are allowed." }],
            isError: true
          };
        }
        sub = args.path;
      }
      const { port, reused } = await ensureDashboard();
      const url = `http://127.0.0.1:${port}${sub}`;
      openBrowser(url);
      return { content: [{ type: "text", text:
        `Dashboard ${reused ? 'already running' : 'started'} — served in-process by this MCP server (stays available as long as Claude Desktop keeps the extension running). Opened ${url} in the browser (database: ${dbPath}). If no window appeared, open the URL manually.` }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "close_dashboard",
  "Stop the locally running Sherpa dashboard server.",
  {},
  async () => {
    try {
      const { stopped, message } = await stopDashboard();
      return { content: [{ type: "text", text: message }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

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
