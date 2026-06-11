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

function formatSemanticError(err: unknown, context: string): { content: { type: "text"; text: string }[]; isError: true } {
  let message = `Błąd wykonania w akcji '${context}':\n`;
  if (err instanceof z.ZodError) {
    message += `Niepoprawne parametry wejściowe (błąd walidacji schematu):\n`;
    for (const issue of err.issues) {
      const path = issue.path.join(".");
      message += `- Pole '${path}': ${issue.message}. (Oczekiwano innego formatu lub brak wymaganej wartości).\n`;
    }
  } else if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes("FOREIGN KEY constraint failed")) {
      message += `Błąd spójności bazy danych: Jedno z podanych ID referencyjnych (np. vertical_id, provider_id, service_id) nie istnieje w bazie danych.\nRozwiązanie: Wywołaj odpowiednią akcję 'list' (np. vertical_action z akcją 'list' lub provider_action z akcją 'list'), aby pobrać poprawne identyfikatory i spróbuj ponownie z prawidłowym ID.\n`;
    } else if (msg.includes("UNIQUE constraint failed")) {
      message += `Błąd unikalności: Rekord o podanych kluczach unikalnych (np. nazwa lub identyfikator) już istnieje w bazie danych.\nRozwiązanie: Użyj innej nazwy lub wykonaj akcję 'update' zamiast 'create'.\n`;
    } else {
      message += `Szczegóły błędu: ${msg}\n`;
    }
  } else {
    message += `Nieznany błąd: ${String(err)}\n`;
  }
  return {
    content: [{ type: "text", text: message }],
    isError: true
  };
}

// ============================================================
// TOOLS DEFINITION
// ============================================================

// 1. Settings CRUD
server.tool(
  "settings_action",
  "Read or update global workspace settings (currency, discount rate, company name). Use this tool to inspect current settings or modify defaults like projection horizon, exchange rates, and the home currency. Always specify the 'action' parameter ('get' or 'update'). Do not call this tool unless you need to view or modify workspace configuration settings.",
  {
    action: z.enum(["get", "update"]).describe("The action to perform: 'get' to read current settings, 'update' to modify them."),
    company_name: z.string().optional().describe("Company name to display on reports."),
    currency: z.enum(["USD", "EUR", "PLN", "GBP"]).optional().describe("Primary currency for all financial computations (default: USD). Changing this will invalidate cached results."),
    default_discount_rate: z.number().min(0).max(1).optional().describe("Annual discount rate (WACC) as a decimal (e.g. 0.10 for 10%), used in NPV calculations."),
    projection_horizon_months: z.number().min(12).max(120).optional().describe("Default financial projection duration in months (e.g. 36 or 60)."),
    exchange_rates: z.record(z.enum(["USD", "EUR", "PLN", "GBP"]), z.number()).optional().describe("Exchange rates relative to USD. Modifying this invalidates cached results."),
    exchange_rates_as_of: z.string().optional().describe("ISO timestamp or date string indicating when exchange rates were last updated.")
  },
  async (args) => {
    try {
      if (args.action === "get") {
        const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
        const settings: Record<string, string> = {};
        for (const row of rows) {
          settings[row.key] = row.value;
        }
        return {
          content: [{ type: "text", text: JSON.stringify(settings, null, 2) }]
        };
      } else {
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
      }
    } catch (err: any) {
      return formatSemanticError(err, "settings_action");
    }
  }
);

server.tool(
  "client_base_action",
  "Retrieve or modify the global customer base parameters (total users, ARPU, acquisition, churn, and AI adoption rates). These global settings serve as defaults when creating new cohorts or scenarios. Always specify the 'action' parameter ('get' or 'update'). Do not use this tool unless you need to view or modify default client base properties.",
  {
    action: z.enum(["get", "update"]).describe("The action to perform: 'get' to retrieve the current client base default parameters, 'update' to modify them."),
    total_users: z.number().int().nonnegative().optional().describe("Initial total customer count in the default user base."),
    default_arpu: z.number().nonnegative().optional().describe("Default Average Revenue Per User per month."),
    default_monthly_churn_rate: z.number().min(0).max(1).optional().describe("Default monthly customer churn rate as a decimal (e.g. 0.05 for 5%)."),
    default_monthly_acquisition: z.number().int().nonnegative().optional().describe("Default number of new customers acquired monthly."),
    default_acquisition_growth_rate: z.number().min(0).max(1).optional().describe("Default monthly growth rate of the acquisition channel (e.g. 0.02 for 2% growth per month)."),
    default_ai_adoption_rate: z.number().min(0).max(1).optional().describe("Default fraction of the user base adopting AI features (e.g. 0.30 for 30%)."),
    default_retention_floor: z.number().min(0).max(1).optional().describe("Default minimum customer retention percentage below which churn stops."),
    default_expansion_rate: z.number().min(0).max(1).optional().describe("Default monthly expansion revenue rate (upsell/expansion) as a decimal.")
  },
  async (args) => {
    try {
      if (args.action === "get") {
        const row = db.prepare("SELECT * FROM client_base WHERE id = 'singleton'").get() as any;
        if (!row) {
          throw new Error("Client base singleton row not found.");
        }
        const { created_at, updated_at, ...filtered } = row;
        return {
          content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }]
        };
      } else {
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

          const row = db.prepare("SELECT * FROM client_base WHERE id = 'singleton'").get() as any;
          const { created_at, updated_at, ...filtered } = row;
          updatedRow = filtered;
        })();

        return {
          content: [{ type: "text", text: `Client base parameters updated successfully:\n${JSON.stringify(updatedRow, null, 2)}` }]
        };
      }
    } catch (err: any) {
      return formatSemanticError(err, "client_base_action");
    }
  }
);

// 1.5 Providers CRUD
server.tool(
  "provider_action",
  "List, create, update, or delete AI model providers (e.g. OpenAI, Anthropic, Google) and their pricing per million tokens. Always specify the 'action' parameter. To prevent accidental data loss, deletions require setting 'confirm' to true. Note that predefined providers cannot be deleted.",
  {
    action: z.enum(["list", "create", "update", "delete"]).describe("The action to perform: 'list' to view providers, 'create' to add a new provider, 'update' to edit details, 'delete' to remove a provider."),
    id: z.string().optional().describe("Unique UUID of the provider. Required for 'update' and 'delete' actions."),
    name: z.string().optional().describe("Display name of the provider (e.g. 'Anthropic'). Required for 'create' action."),
    model_name: z.string().optional().describe("Identifier of the specific LLM model (e.g. 'claude-3-5-sonnet'). Required for 'create' action."),
    input_price: z.number().nonnegative().optional().describe("Price per million input tokens in the specified currency. Required for 'create' action."),
    output_price: z.number().nonnegative().optional().describe("Price per million output tokens in the specified currency. Required for 'create' action."),
    currency: z.enum(["USD", "EUR", "PLN", "GBP"]).optional().describe("Currency for token pricing (default: USD)."),
    confirm: z.boolean().optional().describe("Confirmation flag for deletion. Must be set to true to execute a 'delete' action.")
  },
  async (args) => {
    try {
      if (args.action === "list") {
        const providers = db.prepare("SELECT id, name, model_name, input_price, output_price, is_predefined, currency FROM providers ORDER BY name ASC").all() as any[];
        return { content: [{ type: "text", text: JSON.stringify(providers, null, 2) }] };
      }
      if (args.action === "create") {
        if (!args.name) {
          throw new z.ZodError([{ code: "custom", path: ["name"], message: "Nazwa jest wymagana przy tworzeniu dostawcy." }]);
        }
        if (!args.model_name) {
          throw new z.ZodError([{ code: "custom", path: ["model_name"], message: "Nazwa modelu (model_name) jest wymagana przy tworzeniu dostawcy." }]);
        }
        if (args.input_price === undefined) {
          throw new z.ZodError([{ code: "custom", path: ["input_price"], message: "Cena za input (input_price) jest wymagana." }]);
        }
        if (args.output_price === undefined) {
          throw new z.ZodError([{ code: "custom", path: ["output_price"], message: "Cena za output (output_price) jest wymagana." }]);
        }
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO providers (id, name, model_name, input_price, output_price, is_predefined, currency, updated_at)
          VALUES (?, ?, ?, ?, ?, 0, ?, ?)
        `).run(id, args.name, args.model_name, args.input_price, args.output_price, args.currency || "USD", now);
        return { content: [{ type: "text", text: `Provider '${args.name}' (${args.model_name}) created with ID: ${id}` }] };
      }
      if (args.action === "update") {
        if (!args.id) {
          throw new z.ZodError([{ code: "custom", path: ["id"], message: "Identyfikator 'id' jest wymagany do modyfikacji dostawcy." }]);
        }
        const current = db.prepare("SELECT * FROM providers WHERE id = ?").get(args.id) as any;
        if (!current) {
          return { content: [{ type: "text", text: `Provider with ID '${args.id}' not found.` }], isError: true };
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
      }
      if (args.action === "delete") {
        if (!args.id) {
          throw new z.ZodError([{ code: "custom", path: ["id"], message: "Identyfikator 'id' jest wymagany do usunięcia dostawcy." }]);
        }
        const current = db.prepare("SELECT * FROM providers WHERE id = ?").get(args.id) as any;
        if (!current) {
          return { content: [{ type: "text", text: `Provider with ID '${args.id}' not found.` }], isError: true };
        }
        if (current.is_predefined === 1 || current.is_predefined === true) {
          return { content: [{ type: "text", text: "Cannot delete a predefined provider." }], isError: true };
        }
        if (!args.confirm) {
          return {
            content: [{
              type: "text",
              text: `Ostrzeżenie: Ta operacja usunie custom provider '${current.name}' (ID: ${args.id}) z katalogu. Jest to akcja destrukcyjna. Aby kontynuować, wywołaj ponownie to narzędzie przekazując parametr 'confirm: true'.`
            }]
          };
        }
        db.prepare("DELETE FROM providers WHERE id = ?").run(args.id);
        return { content: [{ type: "text", text: `Provider with ID ${args.id} deleted successfully.` }] };
      }
      throw new Error(`Nieobsługiwana akcja: ${args.action}`);
    } catch (err: any) {
      return formatSemanticError(err, "provider_action");
    }
  }
);

server.tool(
  "vertical_action",
  "List, create, update, or delete customer vertical markets (e.g. LegalTech, E-commerce) in the catalog. Verticals help categorize customer cohorts and track total addressable market (TAM/SAM/SOM). Always specify the 'action' parameter. For safety, deletions require setting 'confirm' to true.",
  {
    action: z.enum(["list", "create", "update", "delete"]).describe("The action to perform: 'list' to view verticals, 'create' to add a new vertical, 'update' to edit details, 'delete' to remove a vertical."),
    id: z.string().optional().describe("Unique UUID of the vertical. Required for 'update' and 'delete' actions."),
    name: z.string().optional().describe("Unique display name of the vertical (e.g. 'LegalTech'). Required for 'create' action."),
    description: z.string().optional().describe("Detailed description of the vertical market."),
    tam_users: z.number().int().nonnegative().optional().describe("Total Addressable Market in user count."),
    sam_users: z.number().int().nonnegative().optional().describe("Serviceable Addressable Market in user count."),
    som_users: z.number().int().nonnegative().optional().describe("Serviceable Obtainable Market in user count."),
    confirm: z.boolean().optional().describe("Confirmation flag for deletion. Must be set to true to execute a 'delete' action.")
  },
  async (args) => {
    try {
      if (args.action === "list") {
        const verticals = db.prepare("SELECT id, name, description, tam_users, sam_users, som_users FROM verticals ORDER BY name ASC").all() as any[];
        return { content: [{ type: "text", text: JSON.stringify(verticals, null, 2) }] };
      }
      if (args.action === "create") {
        if (!args.name) {
          throw new z.ZodError([{ code: "custom", path: ["name"], message: "Nazwa jest wymagana przy tworzeniu branży." }]);
        }
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
      }
      if (args.action === "update") {
        if (!args.id) {
          throw new z.ZodError([{ code: "custom", path: ["id"], message: "Identyfikator 'id' jest wymagany do modyfikacji branży." }]);
        }
        const current = db.prepare("SELECT * FROM verticals WHERE id = ?").get(args.id) as any;
        if (!current) {
          return { content: [{ type: "text", text: `Vertical with ID '${args.id}' not found.` }], isError: true };
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
      }
      if (args.action === "delete") {
        if (!args.id) {
          throw new z.ZodError([{ code: "custom", path: ["id"], message: "Identyfikator 'id' jest wymagany do usunięcia branży." }]);
        }
        const current = db.prepare("SELECT name FROM verticals WHERE id = ?").get(args.id) as any;
        if (!current) {
          return { content: [{ type: "text", text: `Vertical with ID '${args.id}' not found.` }], isError: true };
        }
        if (!args.confirm) {
          return {
            content: [{
              type: "text",
              text: `Ostrzeżenie: Ta operacja usunie vertical '${current.name}' (ID: ${args.id}) z katalogu. Jest to akcja destrukcyjna. Aby kontynuować, wywołaj ponownie to narzędzie przekazując parametr 'confirm: true'.`
            }]
          };
        }
        db.prepare("DELETE FROM verticals WHERE id = ?").run(args.id);
        return { content: [{ type: "text", text: `Vertical with ID ${args.id} deleted successfully.` }] };
      }
      throw new Error(`Nieobsługiwana akcja: ${args.action}`);
    } catch (err: any) {
      return formatSemanticError(err, "vertical_action");
    }
  }
);

server.tool(
  "cohort_action",
  "List, create, update, or delete customer cohorts. Cohorts define customer growth models (initial users, acquisition, churn, ARPU, expansion, and AI adoption rates) over the projection horizon. Always specify the 'action' parameter. For safety, deletions require setting 'confirm' to true.",
  {
    action: z.enum(["list", "create", "update", "delete"]).describe("The action to perform: 'list' to view cohorts, 'create' to add a new cohort, 'update' to edit details, 'delete' to remove a cohort."),
    id: z.string().optional().describe("Unique UUID of the cohort config. Required for 'update' and 'delete' actions."),
    name: z.string().optional().describe("Display name of the cohort configuration (e.g. 'SME Cohort'). Required for 'create' action."),
    vertical_id: z.string().nullable().optional().describe("Associated vertical market UUID from vertical catalog."),
    current_users: z.number().int().nonnegative().optional().describe("Initial total customer count in this cohort. Required for 'create' action."),
    monthly_acquisition: z.number().int().nonnegative().optional().describe("Number of new customers acquired monthly. Required for 'create' action."),
    acquisition_growth_rate: z.number().min(0).max(1).optional().describe("Monthly growth rate of the acquisition channel (e.g. 0.02 for 2% growth per month)."),
    monthly_churn_rate: z.number().min(0).max(1).optional().describe("Monthly customer churn rate as a decimal (e.g. 0.05 for 5% churn)."),
    retention_floor: z.number().min(0).max(1).optional().describe("Minimum customer retention percentage below which churn stops (e.g. 0.60)."),
    monthly_expansion_rate: z.number().min(0).max(1).optional().describe("Monthly expansion revenue rate (upsell/expansion) as a decimal (e.g. 0.02)."),
    ai_adoption_rate: z.number().min(0).max(1).optional().describe("Fraction of the user base in this cohort adopting AI features (e.g. 0.30 for 30%)."),
    base_arpu: z.number().nonnegative().optional().describe("Average Revenue Per User per month (e.g. 100)."),
    confirm: z.boolean().optional().describe("Confirmation flag for deletion. Must be set to true to execute a 'delete' action.")
  },
  async (args) => {
    try {
      if (args.action === "list") {
        const cohorts = db.prepare("SELECT id, name, vertical_id, current_users, monthly_acquisition, acquisition_growth_rate, monthly_churn_rate, retention_floor, monthly_expansion_rate, ai_adoption_rate, base_arpu FROM cohort_configs ORDER BY name ASC").all() as any[];
        return { content: [{ type: "text", text: JSON.stringify(cohorts, null, 2) }] };
      }
      if (args.action === "create") {
        if (!args.name) {
          throw new z.ZodError([{ code: "custom", path: ["name"], message: "Nazwa jest wymagana przy tworzeniu kohorty." }]);
        }
        if (args.current_users === undefined) {
          throw new z.ZodError([{ code: "custom", path: ["current_users"], message: "Początkowa liczba użytkowników (current_users) jest wymagana." }]);
        }
        if (args.monthly_acquisition === undefined) {
          throw new z.ZodError([{ code: "custom", path: ["monthly_acquisition"], message: "Miesięczna akwizycja (monthly_acquisition) jest wymagana." }]);
        }
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO cohort_configs (
            id, name, vertical_id, current_users, monthly_acquisition, acquisition_growth_rate,
            monthly_churn_rate, retention_floor, monthly_expansion_rate, ai_adoption_rate, base_arpu,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, args.name, args.vertical_id || null, args.current_users, args.monthly_acquisition, args.acquisition_growth_rate ?? 0,
          args.monthly_churn_rate ?? 0.05, args.retention_floor ?? 0.60, args.monthly_expansion_rate ?? 0.02, args.ai_adoption_rate ?? 0.30, args.base_arpu ?? 100,
          now, now
        );
        return { content: [{ type: "text", text: `Cohort '${args.name}' created with ID: ${id}` }] };
      }
      if (args.action === "update") {
        if (!args.id) {
          throw new z.ZodError([{ code: "custom", path: ["id"], message: "Identyfikator 'id' jest wymagany do modyfikacji kohorty." }]);
        }
        const current = db.prepare("SELECT * FROM cohort_configs WHERE id = ?").get(args.id) as any;
        if (!current) {
          return { content: [{ type: "text", text: `Cohort with ID '${args.id}' not found.` }], isError: true };
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
      }
      if (args.action === "delete") {
        if (!args.id) {
          throw new z.ZodError([{ code: "custom", path: ["id"], message: "Identyfikator 'id' jest wymagany do usunięcia kohorty." }]);
        }
        const current = db.prepare("SELECT name FROM cohort_configs WHERE id = ?").get(args.id) as any;
        if (!current) {
          return { content: [{ type: "text", text: `Cohort with ID '${args.id}' not found.` }], isError: true };
        }
        if (!args.confirm) {
          return {
            content: [{
              type: "text",
              text: `Ostrzeżenie: Ta operacja usunie cohort config '${current.name}' (ID: ${args.id}). Jest to akcja destrukcyjna. Aby kontynuować, wywołaj ponownie to narzędzie przekazując parametr 'confirm: true'.`
            }]
          };
        }
        db.prepare("DELETE FROM cohort_configs WHERE id = ?").run(args.id);
        return { content: [{ type: "text", text: `Cohort with ID ${args.id} deleted successfully.` }] };
      }
      throw new Error(`Nieobsługiwana akcja: ${args.action}`);
    } catch (err: any) {
      return formatSemanticError(err, "cohort_action");
    }
  }
);

server.tool(
  "cost_item_action",
  "List, create, update, or delete fixed infrastructure, development, or operating cost items (Capex/Opex). Fixed cost items are attached to scenarios to compute total cost of ownership (TCO). Always specify the 'action' parameter. For safety, deletions require setting 'confirm' to true.",
  {
    action: z.enum(["list", "create", "update", "delete"]).describe("The action to perform: 'list' to view cost items, 'create' to add a new cost item, 'update' to edit details, 'delete' to remove a cost item."),
    id: z.string().optional().describe("Unique UUID of the fixed cost item. Required for 'update' and 'delete' actions."),
    name: z.string().optional().describe("Unique display name of the cost item (e.g. 'Database Server License'). Required for 'create' action."),
    category: z.enum(["capex", "opex"]).optional().describe("Cost category: capex (capital expenditure) or opex (operational expenditure). Required for 'create' action."),
    subcategory: z.string().optional().describe("Optional subcategory for detailed reporting."),
    amount: z.number().nonnegative().optional().describe("Financial cost amount in specified currency. Required for 'create' action."),
    frequency: z.enum(["one_time", "monthly", "yearly"]).optional().describe("Frequency of the cost (one-time, monthly, or yearly). Required for 'create' action."),
    currency: z.enum(["USD", "EUR", "PLN", "GBP"]).optional().describe("Currency of the cost amount (default: USD)."),
    service_id: z.string().nullable().optional().describe("Optional link to a specific service UUID if the cost is tied to it."),
    confirm: z.boolean().optional().describe("Confirmation flag for deletion. Must be set to true to execute a 'delete' action.")
  },
  async (args) => {
    try {
      if (args.action === "list") {
        const costs = db.prepare("SELECT id, name, category, subcategory, amount, frequency, currency, service_id FROM cost_items ORDER BY name ASC").all() as any[];
        return { content: [{ type: "text", text: JSON.stringify(costs, null, 2) }] };
      }
      if (args.action === "create") {
        if (!args.name) {
          throw new z.ZodError([{ code: "custom", path: ["name"], message: "Nazwa jest wymagana przy tworzeniu pozycji kosztowej." }]);
        }
        if (!args.category) {
          throw new z.ZodError([{ code: "custom", path: ["category"], message: "Kategoria kosztu (category: capex/opex) jest wymagana." }]);
        }
        if (args.amount === undefined) {
          throw new z.ZodError([{ code: "custom", path: ["amount"], message: "Kwota kosztu (amount) jest wymagana." }]);
        }
        if (!args.frequency) {
          throw new z.ZodError([{ code: "custom", path: ["frequency"], message: "Częstotliwość kosztu (frequency: one_time/monthly/yearly) jest wymagana." }]);
        }
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO cost_items (id, name, category, subcategory, amount, frequency, currency, service_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, args.name, args.category, args.subcategory || null, args.amount, args.frequency, args.currency || "USD", args.service_id || null, now, now);
        return { content: [{ type: "text", text: `Cost item '${args.name}' created with ID: ${id}` }] };
      }
      if (args.action === "update") {
        if (!args.id) {
          throw new z.ZodError([{ code: "custom", path: ["id"], message: "Identyfikator 'id' jest wymagany do modyfikacji pozycji kosztowej." }]);
        }
        const current = db.prepare("SELECT * FROM cost_items WHERE id = ?").get(args.id) as any;
        if (!current) {
          return { content: [{ type: "text", text: `Cost item with ID '${args.id}' not found.` }], isError: true };
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
      }
      if (args.action === "delete") {
        if (!args.id) {
          throw new z.ZodError([{ code: "custom", path: ["id"], message: "Identyfikator 'id' jest wymagany do usunięcia pozycji kosztowej." }]);
        }
        const current = db.prepare("SELECT name FROM cost_items WHERE id = ?").get(args.id) as any;
        if (!current) {
          return { content: [{ type: "text", text: `Cost item with ID '${args.id}' not found.` }], isError: true };
        }
        if (!args.confirm) {
          return {
            content: [{
              type: "text",
              text: `Ostrzeżenie: Ta operacja usunie fixed cost item '${current.name}' (ID: ${args.id}) z katalogu. Jest to akcja destrukcyjna. Aby kontynuować, wywołaj ponownie to narzędzie przekazując parametr 'confirm: true'.`
            }]
          };
        }
        db.prepare("DELETE FROM cost_items WHERE id = ?").run(args.id);
        return { content: [{ type: "text", text: `Cost item with ID ${args.id} deleted successfully.` }] };
      }
      throw new Error(`Nieobsługiwana akcja: ${args.action}`);
    } catch (err: any) {
      return formatSemanticError(err, "cost_item_action");
    }
  }
);

// 2. Services CRUD
server.tool(
  "service_action",
  "List, create, update, or delete AI services in the catalog. Each service tracks token usage parameters (input/output tokens) and cost info used for ROI modeling. Always specify the 'action' parameter. To prevent accidental data loss, deletions require setting 'confirm' to true. Do not use this tool unless you need to read or modify AI services.",
  {
    action: z.enum(["list", "create", "update", "delete"]).describe("The action to perform: 'list' to view services, 'create' to add a new service, 'update' to edit details, 'delete' to remove a service."),
    id: z.string().optional().describe("Unique UUID of the service. Required for 'update' and 'delete' actions."),
    name: z.string().optional().describe("Unique display name of the service (e.g. 'Customer Support Chatbot'). Required for 'create' action."),
    description: z.string().optional().describe("Detailed description of what the service does."),
    status: z.enum(["planned", "existing"]).optional().describe("Launch status of the service (default: planned)."),
    provider_id: z.string().nullable().optional().describe("Associated AI provider UUID determining model token costs."),
    avg_input_tokens: z.number().optional().describe("Average number of input tokens sent per LLM call (e.g. 1500)."),
    avg_output_tokens: z.number().optional().describe("Average number of output tokens received per LLM call (e.g. 800)."),
    avg_requests_per_user_month: z.number().optional().describe("Expected average number of service calls made by a single user per month (e.g. 50)."),
    fixed_cost_per_month: z.number().nullable().optional().describe("Fixed monthly charge associated with this service (excluding token costs)."),
    fixed_cost_currency: z.enum(["USD", "EUR", "PLN", "GBP"]).optional().describe("Currency for fixed costs (default: USD)."),
    confirm: z.boolean().optional().describe("Confirmation flag for deletion. Must be set to true to execute a 'delete' action.")
  },
  async (args) => {
    try {
      if (args.action === "list") {
        const services = db.prepare(`
          SELECT s.id, s.name, s.description, s.status, s.provider_id, 
                 s.avg_input_tokens, s.avg_output_tokens, s.avg_requests_per_user_month,
                 s.fixed_cost_per_month, s.fixed_cost_currency,
                 p.name as provider_name, p.model_name as provider_model_name
          FROM services s
          LEFT JOIN providers p ON s.provider_id = p.id
          ORDER BY s.name ASC
        `).all() as any[];
        return {
          content: [{ type: "text", text: JSON.stringify(services, null, 2) }]
        };
      }

      if (args.action === "create") {
        if (!args.name) {
          throw new z.ZodError([{ code: "custom", path: ["name"], message: "Nazwa jest wymagana przy tworzeniu usługi." }]);
        }
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO services (id, name, description, status, provider_id, avg_input_tokens, avg_output_tokens, avg_requests_per_user_month, fixed_cost_per_month, fixed_cost_currency, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          args.name,
          args.description || null,
          args.status || "planned",
          args.provider_id || null,
          args.avg_input_tokens ?? 0,
          args.avg_output_tokens ?? 0,
          args.avg_requests_per_user_month ?? 0,
          args.fixed_cost_per_month ?? null,
          args.fixed_cost_currency || "USD",
          now,
          now
        );
        return {
          content: [{ type: "text", text: `Service '${args.name}' created with ID: ${id}` }]
        };
      }

      if (args.action === "update") {
        if (!args.id) {
          throw new z.ZodError([{ code: "custom", path: ["id"], message: "Identyfikator 'id' jest wymagany do modyfikacji usługi." }]);
        }
        const current = db.prepare("SELECT * FROM services WHERE id = ?").get(args.id) as any;
        if (!current) {
          return { content: [{ type: "text", text: `Service with ID '${args.id}' not found.` }], isError: true };
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
      }

      if (args.action === "delete") {
        if (!args.id) {
          throw new z.ZodError([{ code: "custom", path: ["id"], message: "Identyfikator 'id' jest wymagany do usunięcia usługi." }]);
        }
        const current = db.prepare("SELECT name FROM services WHERE id = ?").get(args.id) as any;
        if (!current) {
          return { content: [{ type: "text", text: `Service with ID '${args.id}' not found.` }], isError: true };
        }
        if (!args.confirm) {
          return {
            content: [{
              type: "text",
              text: `Ostrzeżenie: Ta operacja usunie AI service '${current.name}' (ID: ${args.id}) z katalogu. Jest to akcja destrukcyjna. Aby kontynuować, wywołaj ponownie to narzędzie przekazując parametr 'confirm: true'.`
            }]
          };
        }
        db.prepare("DELETE FROM services WHERE id = ?").run(args.id);
        return {
          content: [{ type: "text", text: `Service '${current.name}' (ID: ${args.id}) deleted successfully.` }]
        };
      }

      throw new Error(`Nieobsługiwana akcja: ${args.action}`);
    } catch (err: any) {
      return formatSemanticError(err, "service_action");
    }
  }
);

// 3. Packs & Plans Tools
server.tool(
  "pack_action",
  "List, create, update, or delete feature packs in the catalog. Feature packs group multiple AI services together to bundle them into plans. Always specify the 'action' parameter. For safety, deletions require setting 'confirm' to true. Do not use this tool unless you need to view or modify feature packs.",
  {
    action: z.enum(["list", "create", "update", "delete"]).describe("The action to perform: 'list' to view packs, 'create' to add a new pack, 'update' to edit details, 'delete' to remove a pack."),
    id: z.string().optional().describe("Unique UUID of the feature pack. Required for 'update' and 'delete' actions."),
    name: z.string().optional().describe("Display name of the feature pack (e.g. 'Advanced AI Pack'). Required for 'create' action."),
    description: z.string().optional().describe("Brief description of the feature pack's contents."),
    service_ids: z.array(z.string()).optional().describe("Array of service UUIDs to assign to this pack. Required for 'create' action."),
    confirm: z.boolean().optional().describe("Confirmation flag for deletion. Must be set to true to execute a 'delete' action.")
  },
  async (args) => {
    try {
      if (args.action === "list") {
        const packs = db.prepare("SELECT id, name, description FROM packs").all() as any[];
        for (const p of packs) {
          p.services = db.prepare(`
            SELECT s.id, s.name, s.status
            FROM services s
            JOIN pack_services ps ON s.id = ps.service_id
            WHERE ps.pack_id = ?
          `).all(p.id) as any[];
        }
        return {
          content: [{ type: "text", text: JSON.stringify(packs, null, 2) }]
        };
      }

      if (args.action === "create") {
        if (!args.name) {
          throw new z.ZodError([{ code: "custom", path: ["name"], message: "Nazwa jest wymagana przy tworzeniu pakietu." }]);
        }
        if (!args.service_ids) {
          throw new z.ZodError([{ code: "custom", path: ["service_ids"], message: "Lista service_ids jest wymagana przy tworzeniu pakietu." }]);
        }
        const id = crypto.randomUUID();
        const now = new Date().toISOString();

        db.transaction(() => {
          db.prepare("INSERT INTO packs (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
            .run(id, args.name, args.description || null, now, now);

          const insertLink = db.prepare("INSERT INTO pack_services (pack_id, service_id) VALUES (?, ?)");
          for (const sId of args.service_ids!) {
            insertLink.run(id, sId);
          }
        })();

        return {
          content: [{ type: "text", text: `Pack '${args.name}' created with ID: ${id}` }]
        };
      }

      if (args.action === "update") {
        if (!args.id) {
          throw new z.ZodError([{ code: "custom", path: ["id"], message: "Identyfikator 'id' jest wymagany do modyfikacji pakietu." }]);
        }
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
      }

      if (args.action === "delete") {
        if (!args.id) {
          throw new z.ZodError([{ code: "custom", path: ["id"], message: "Identyfikator 'id' jest wymagany do usunięcia pakietu." }]);
        }
        const current = db.prepare("SELECT name FROM packs WHERE id = ?").get(args.id) as any;
        if (!current) {
          return { content: [{ type: "text", text: "Pack not found" }], isError: true };
        }
        if (!args.confirm) {
          return {
            content: [{
              type: "text",
              text: `Ostrzeżenie: Ta operacja usunie feature pack '${current.name}' (ID: ${args.id}) z katalogu. Jest to akcja destrukcyjna. Aby kontynuować, wywołaj ponownie to narzędzie przekazując parametr 'confirm: true'.`
            }]
          };
        }
        db.prepare("DELETE FROM packs WHERE id = ?").run(args.id);
        return { content: [{ type: "text", text: `Pack '${current.name}' (ID: ${args.id}) deleted successfully.` }] };
      }

      throw new Error(`Nieobsługiwana akcja: ${args.action}`);
    } catch (err: any) {
      return formatSemanticError(err, "pack_action");
    }
  }
);

server.tool(
  "plan_action",
  "List, create, update, or delete SaaS pricing plans (e.g. Starter, Growth, Enterprise). Pricing plans wrap individual services or feature packs and define base MRR. Always specify the 'action' parameter. For safety, deletions require setting 'confirm' to true. Do not use this tool unless you need to view or modify pricing plans.",
  {
    action: z.enum(["list", "create", "update", "delete"]).describe("The action to perform: 'list' to view plans, 'create' to add a new plan, 'update' to edit details, 'delete' to remove a plan."),
    id: z.string().optional().describe("Unique UUID of the pricing plan. Required for 'update' and 'delete' actions."),
    name: z.string().optional().describe("Display name of the pricing plan (e.g. 'Enterprise Plan'). Required for 'create' action."),
    description: z.string().optional().describe("Detailed description of the pricing plan."),
    base_price: z.number().optional().describe("Monthly base subscription price of this plan. Required for 'create' action."),
    service_ids: z.array(z.string()).optional().describe("Array of individual service UUIDs included in this plan."),
    pack_ids: z.array(z.string()).optional().describe("Array of feature pack UUIDs included in this plan."),
    confirm: z.boolean().optional().describe("Confirmation flag for deletion. Must be set to true to execute a 'delete' action.")
  },
  async (args) => {
    try {
      if (args.action === "list") {
        const plans = db.prepare("SELECT id, name, description, base_price FROM plans").all() as any[];
        for (const p of plans) {
          p.services = db.prepare(`
            SELECT s.id, s.name FROM services s
            JOIN plan_services ps ON s.id = ps.service_id
            WHERE ps.plan_id = ?
          `).all(p.id) as any[];
          
          p.packs = db.prepare(`
            SELECT pk.id, pk.name FROM packs pk
            JOIN plan_packs pp ON pk.id = pp.pack_id
            WHERE pp.plan_id = ?
          `).all(p.id) as any[];
        }
        return {
          content: [{ type: "text", text: JSON.stringify(plans, null, 2) }]
        };
      }

      if (args.action === "create") {
        if (!args.name) {
          throw new z.ZodError([{ code: "custom", path: ["name"], message: "Nazwa jest wymagana przy tworzeniu planu cenowego." }]);
        }
        if (args.base_price === undefined) {
          throw new z.ZodError([{ code: "custom", path: ["base_price"], message: "Cena bazowa (base_price) jest wymagana przy tworzeniu planu cenowego." }]);
        }
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

      if (args.action === "update") {
        if (!args.id) {
          throw new z.ZodError([{ code: "custom", path: ["id"], message: "Identyfikator 'id' jest wymagany do modyfikacji planu cenowego." }]);
        }
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
      }

      if (args.action === "delete") {
        if (!args.id) {
          throw new z.ZodError([{ code: "custom", path: ["id"], message: "Identyfikator 'id' jest wymagany do usunięcia planu cenowego." }]);
        }
        const current = db.prepare("SELECT name FROM plans WHERE id = ?").get(args.id) as any;
        if (!current) {
          return { content: [{ type: "text", text: "Plan not found" }], isError: true };
        }
        if (!args.confirm) {
          return {
            content: [{
              type: "text",
              text: `Ostrzeżenie: Ta operacja usunie pricing plan '${current.name}' (ID: ${args.id}) z katalogu. Jest to akcja destrukcyjna. Aby kontynuować, wywołaj ponownie to narzędzie przekazując parametr 'confirm: true'.`
            }]
          };
        }
        db.prepare("DELETE FROM plans WHERE id = ?").run(args.id);
        return { content: [{ type: "text", text: `Plan '${current.name}' (ID: ${args.id}) deleted successfully.` }] };
      }

      throw new Error(`Nieobsługiwana akcja: ${args.action}`);
    } catch (err: any) {
      return formatSemanticError(err, "plan_action");
    }
  }
);

server.tool(
  "scenario_action",
  "List, create, retrieve, update, or delete SaaS ROI scenarios, or execute scenario projections (calculating NPV/IRR, performing sensitivity analysis, comparing scenarios, and parsing natural language descriptions). Scenarios map pricing plans, services, and Capex/Opex costs to user growth cohorts. Always specify the 'action' parameter. For safety, deletions require setting 'confirm' to true.",
  {
    action: z.enum(["list", "get", "create", "update", "delete", "calculate", "compare", "sensitivity", "generate"]).describe("The action to perform: 'list' to view scenarios, 'get' to inspect a scenario, 'create' to add a scenario, 'update' to edit details, 'delete' to remove a scenario, 'calculate' to compute ROI, 'compare' to analyze multiple scenarios, 'sensitivity' for tornado charts, or 'generate' to parse natural language descriptions."),
    id: z.string().optional().describe("Unique UUID of the scenario. Required for 'get', 'update', 'delete', 'calculate', and 'sensitivity' actions."),
    ids: z.array(z.string()).optional().describe("Array of scenario UUIDs to compare. Required for 'compare' action."),
    name: z.string().optional().describe("Name of the scenario (e.g. 'Standard rollout'). Required for 'create' action."),
    description: z.string().optional().describe("Detailed description of the scenario, or plain-text description for action 'generate'."),
    projection_months: z.number().int().min(12).max(120).optional().describe("Projection horizon in months (default: 36)."),
    discount_rate: z.number().min(0).max(1).optional().describe("Annual discount rate as a decimal (default: 0.10 for 10%)."),
    scope_type: z.enum(["all_clients", "verticals", "cohorts"]).optional().describe("Scope type (default: cohorts)."),
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
    }).optional().describe("Embedded cohort configuration. Required for 'create' action."),
    services: z.array(z.object({ id: z.string(), rollout_month: z.number().default(0) })).optional().describe("AI services to attach, with rollout month offsets."),
    packs: z.array(z.object({ id: z.string(), rollout_month: z.number().default(0) })).optional().describe("Feature packs to attach, with rollout month offsets."),
    plans: z.array(z.object({ id: z.string(), rollout_month: z.number().default(0) })).optional().describe("Pricing plans to attach, with rollout month offsets."),
    cost_ids: z.array(z.string()).optional().describe("Array of fixed cost item UUIDs to link to the scenario."),
    variation_percent: z.number().optional().describe("Sensitivity analysis variation percent (default: 0.10 for 10% variation)."),
    confirm: z.boolean().optional().describe("Confirmation flag for deletion. Must be set to true to execute a 'delete' action.")
  },
  async (args) => {
    try {
      if (args.action === "list") {
        const scenarios = db.prepare(`
          SELECT s.id, s.name, s.description, s.projection_months, s.discount_rate, s.scope_type,
                 r.payback_months, r.npv, r.irr_annual, r.tco, r.roi_percent
          FROM scenarios s
          LEFT JOIN scenario_results r ON s.id = r.scenario_id
          ORDER BY s.updated_at DESC
        `).all() as any[];
        return {
          content: [{ type: "text", text: JSON.stringify(scenarios, null, 2) }]
        };
      }

      if (args.action === "get") {
        if (!args.id) {
          throw new z.ZodError([{ code: "custom", path: ["id"], message: "Identyfikator 'id' jest wymagany dla akcji 'get'." }]);
        }
        const scenario = getFullScenario(args.id);
        if (!scenario) {
          return { content: [{ type: "text", text: `Scenario '${args.id}' not found` }], isError: true };
        }
        const { created_at, updated_at, ...filtered } = scenario as any;
        if (filtered.services) {
          filtered.services = filtered.services.map(({ created_at, updated_at, ...rest }: any) => rest);
        }
        if (filtered.costs) {
          filtered.costs = filtered.costs.map(({ created_at, updated_at, ...rest }: any) => rest);
        }
        if (filtered.scope_cohorts) {
          filtered.scope_cohorts = filtered.scope_cohorts.map(({ created_at, updated_at, ...rest }: any) => rest);
        }
        return { content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }] };
      }

      if (args.action === "create") {
        if (!args.name) {
          throw new z.ZodError([{ code: "custom", path: ["name"], message: "Nazwa jest wymagana przy tworzeniu scenariusza." }]);
        }
        if (!args.cohort_config) {
          throw new z.ZodError([{ code: "custom", path: ["cohort_config"], message: "Konfiguracja kohorty (cohort_config) jest wymagana przy tworzeniu scenariusza." }]);
        }
        const scenarioId = crypto.randomUUID();
        const cohortId = crypto.randomUUID();
        const now = new Date().toISOString();

        db.transaction(() => {
          const cc = args.cohort_config!;
          db.prepare(`
            INSERT INTO cohort_configs (id, name, vertical_id, current_users, monthly_acquisition, acquisition_growth_rate, monthly_churn_rate, retention_floor, monthly_expansion_rate, ai_adoption_rate, base_arpu, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(cohortId, cc.name, cc.vertical_id || null, cc.current_users, cc.monthly_acquisition, cc.acquisition_growth_rate ?? 0, cc.monthly_churn_rate ?? 0.05, cc.retention_floor ?? 0.60, cc.monthly_expansion_rate ?? 0.02, cc.ai_adoption_rate ?? 0.30, cc.base_arpu ?? 100, now, now);

          db.prepare(`
            INSERT INTO scenarios (id, name, description, projection_months, discount_rate, scope_type, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'cohorts', ?, ?)
          `).run(scenarioId, args.name, args.description || null, args.projection_months ?? 36, args.discount_rate ?? 0.10, now, now);

          db.prepare(`INSERT INTO scenario_cohorts (scenario_id, cohort_config_id) VALUES (?, ?)`)
            .run(scenarioId, cohortId);

          if (args.services) {
            const insertServ = db.prepare("INSERT INTO scenario_services (scenario_id, service_id, rollout_month) VALUES (?, ?, ?)");
            for (const s of args.services) {
              insertServ.run(scenarioId, s.id, s.rollout_month);
            }
          }
          if (args.packs) {
            const insertPack = db.prepare("INSERT INTO scenario_packs (scenario_id, pack_id, rollout_month) VALUES (?, ?, ?)");
            for (const p of args.packs) {
              insertPack.run(scenarioId, p.id, p.rollout_month);
            }
          }
          if (args.plans) {
            const insertPlan = db.prepare("INSERT INTO scenario_plans (scenario_id, plan_id, rollout_month) VALUES (?, ?, ?)");
            for (const pl of args.plans) {
              insertPlan.run(scenarioId, pl.id, pl.rollout_month);
            }
          }
          if (args.cost_ids) {
            const insertCost = db.prepare("INSERT INTO scenario_costs (scenario_id, cost_item_id) VALUES (?, ?)");
            for (const cId of args.cost_ids) {
              insertCost.run(scenarioId, cId);
            }
          }
        })();

        // Calculate and cache results
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
          resultsId, scenarioId, results.paybackMonths, results.npv, results.irrAnnual, results.tco, results.roiPercent,
          JSON.stringify(results.timeline.map(t => t.netCashFlow)), JSON.stringify(results.timeline.map(t => t.revenue)), JSON.stringify(results.timeline.map(t => t.customers)), now
        );

        return {
          content: [{ 
            type: "text", 
            text: `Scenario '${args.name}' created with ID: ${scenarioId}. Projections calculated (NPV: ${results.npv.toLocaleString()} ${currency}, IRR: ${results.irrAnnual !== null ? (results.irrAnnual * 100).toFixed(1) + '%' : 'N/A'}).` 
          }]
        };
      }

      if (args.action === "update") {
        if (!args.id) {
          throw new z.ZodError([{ code: "custom", path: ["id"], message: "Identyfikator 'id' jest wymagany do modyfikacji scenariusza." }]);
        }
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
          args.id, args.id, results.paybackMonths, results.npv, results.irrAnnual, results.tco, results.roiPercent,
          JSON.stringify(results.timeline.map(t => t.netCashFlow)), JSON.stringify(results.timeline.map(t => t.revenue)), JSON.stringify(results.timeline.map(t => t.customers)), now
        );

        return { content: [{ type: "text", text: `Scenario '${fullScenario.name}' updated successfully and ROI re-projected.` }] };
      }

      if (args.action === "delete") {
        if (!args.id) {
          throw new z.ZodError([{ code: "custom", path: ["id"], message: "Identyfikator 'id' jest wymagany do usunięcia scenariusza." }]);
        }
        const current = db.prepare("SELECT name FROM scenarios WHERE id = ?").get(args.id) as any;
        if (!current) {
          return { content: [{ type: "text", text: "Scenario not found" }], isError: true };
        }
        if (!args.confirm) {
          return {
            content: [{
              type: "text",
              text: `Ostrzeżenie: Ta operacja usunie scenariusz '${current.name}' (ID: ${args.id}) z bazy danych wraz z powiązanymi wynikami. Jest to akcja destrukcyjna. Aby kontynuować, wywołaj ponownie to narzędzie przekazując parametr 'confirm: true'.`
            }]
          };
        }
        db.prepare("DELETE FROM scenarios WHERE id = ?").run(args.id);
        return { content: [{ type: "text", text: `Scenario with ID ${args.id} deleted successfully.` }] };
      }

      if (args.action === "calculate") {
        if (!args.id) {
          throw new z.ZodError([{ code: "custom", path: ["id"], message: "Identyfikator 'id' jest wymagany do obliczeń." }]);
        }
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
        const now = new Date().toISOString();
        db.prepare(`
          INSERT OR REPLACE INTO scenario_results (id, scenario_id, payback_months, npv, irr_annual, tco, roi_percent, monthly_cashflows, monthly_mrr, monthly_customers, calculated_at)
          VALUES ((SELECT id FROM scenario_results WHERE scenario_id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          args.id, args.id, results.paybackMonths, results.npv, results.irrAnnual, results.tco, results.roiPercent,
          JSON.stringify(results.timeline.map(t => t.netCashFlow)), JSON.stringify(results.timeline.map(t => t.revenue)), JSON.stringify(results.timeline.map(t => t.customers)), now
        );
        return {
          content: [{
            type: "text",
            text: `ROI Results calculated successfully:\n- NPV: ${results.npv.toLocaleString()} ${currency}\n- IRR (Annualized): ${results.irrAnnual !== null ? (results.irrAnnual * 100).toFixed(2) + '%' : 'N/A'}\n- Payback Period: ${results.paybackMonths !== null ? results.paybackMonths + ' months' : 'Never'}\n- TCO: ${results.tco.toLocaleString()} ${currency}\n- ROI%: ${(results.roiPercent * 100).toFixed(1)}%`
          }]
        };
      }

      if (args.action === "sensitivity") {
        if (!args.id) {
          throw new z.ZodError([{ code: "custom", path: ["id"], message: "Identyfikator 'id' jest wymagany do analizy wrażliwości." }]);
        }
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
        const varPercent = args.variation_percent ?? 0.10;
        const sensitivity = runSensitivityAnalysis(normalizedScenario, normalizedProviders, varPercent);

        let md = `### Sensitivity Analysis (Tornado Chart Data) for ${scenario.name}\n`;
        md += `*Base NPV: ${sensitivity.baseNpv.toLocaleString()} ${currency}*\n\n`;
        md += `| Parameter | Variation | Low NPV | High NPV | Impact Range |\n`;
        md += `|---|---|---|---|---|\n`;
        for (const res of sensitivity.results) {
          md += `| ${res.parameter} | ±${varPercent * 100}% | ${res.lowNpv.toLocaleString()} ${currency} | ${res.highNpv.toLocaleString()} ${currency} | ${res.impactRange.toLocaleString()} ${currency} |\n`;
        }
        return { content: [{ type: "text", text: md }] };
      }

      if (args.action === "compare") {
        if (!args.ids || args.ids.length < 2) {
          throw new z.ZodError([{ code: "custom", path: ["ids"], message: "Porównanie wymaga podania co najmniej dwóch identyfikatorów w tablicy 'ids'." }]);
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

        // Sort by NPV descending
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
        return { content: [{ type: "text", text: md }] };
      }

      if (args.action === "generate") {
        if (!args.description) {
          throw new z.ZodError([{ code: "custom", path: ["description"], message: "Opis (description) jest wymagany dla akcji 'generate'." }]);
        }
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

        // Resolve Service mapping
        const dbServices = db.prepare("SELECT id, name FROM services").all() as { id: string; name: string }[];
        const serviceRollouts: { id: string; rollout_month: number }[] = [];

        for (const service of dbServices) {
          if (d.includes(service.name.toLowerCase())) {
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
          resultsId, scenarioId, results.paybackMonths, results.npv, results.irrAnnual, results.tco, results.roiPercent,
          JSON.stringify(results.timeline.map(t => t.netCashFlow)), JSON.stringify(results.timeline.map(t => t.revenue)), JSON.stringify(results.timeline.map(t => t.customers)), now
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
      }

      throw new Error(`Nieobsługiwana akcja: ${args.action}`);
    } catch (err: any) {
      return formatSemanticError(err, "scenario_action");
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

All actions are grouped into consolidated entity tools. Always provide the \`action\` parameter.

### 1. Catalog Management (Services)
- Use \`service_action\` to list, create, update, or delete services.
  - Arguments: \`{ action: "list" | "create" | "update" | "delete", id?, name?, description?, status?, provider_id?, avg_input_tokens?, avg_output_tokens?, avg_requests_per_user_month?, fixed_cost_per_month?, fixed_cost_currency?, confirm? }\`
  - Deletions require \`confirm: true\`.

### 2. Feature Packaging (Packs)
- Use \`pack_action\` to manage feature packs.
  - Arguments: \`{ action: "list" | "create" | "update" | "delete", id?, name?, description?, service_ids?, confirm? }\`
  - Deletions require \`confirm: true\`.

### 3. Subscription & Pricing Setup (Plans)
- Use \`plan_action\` to manage pricing plans.
  - Arguments: \`{ action: "list" | "create" | "update" | "delete", id?, name?, description?, base_price?, service_ids?, pack_ids?, confirm? }\`
  - Deletions require \`confirm: true\`.

### 4. Providers & Verticals
- Use \`provider_action\` to manage AI token pricing providers.
  - Arguments: \`{ action: "list" | "create" | "update" | "delete", id?, name?, model_name?, input_price?, output_price?, currency?, confirm? }\`
- Use \`vertical_action\` to manage vertical markets.
  - Arguments: \`{ action: "list" | "create" | "update" | "delete", id?, name?, description?, tam_users?, sam_users?, som_users?, confirm? }\`

### 5. Settings & Client Base Defaults
- Use \`settings_action\` to view/edit settings.
  - Arguments: \`{ action: "get" | "update", company_name?, currency?, default_discount_rate?, projection_horizon_months?, exchange_rates?, exchange_rates_as_of? }\`
- Use \`client_base_action\` to view/edit default client base metrics.
  - Arguments: \`{ action: "get" | "update", total_users?, default_arpu?, default_monthly_churn_rate?, default_monthly_acquisition?, default_acquisition_growth_rate?, default_ai_adoption_rate?, default_retention_floor?, default_expansion_rate? }\``
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
- Use \`scenario_action\` with \`action: "calculate"\` to run cashflow projections and update cache.
  - Arguments: \`{ action: "calculate", id: "scenario-uuid" }\`
- Scenario results (monthly cashflows, customer growth, MRR) are available via the resource URI: \`sherpa://scenarios/{id}/results\`

### 2. Sensitivity Analysis
- Use \`scenario_action\` with \`action: "sensitivity"\` to perform tornado-chart sensitivity analysis.
  - Arguments: \`{ action: "sensitivity", id: "scenario-uuid", variation_percent?: number }\`
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
- Use \`scenario_action\` with \`action: "compare"\` to perform side-by-side financial comparisons and calculate opportunity costs.
  - Arguments: \`{ action: "compare", ids: ["uuid-1", "uuid-2", ...] }\`
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
- Use \`scenario_action\` with \`action: "generate"\` to parse natural language text and automatically create the scenario, cohort configuration, and link catalog services.
  - Arguments: \`{ action: "generate", description: "A plain text description" }\`
  - Example: "Utwórz scenariusz 'Chatbot Pro' z 5000 początkowych użytkowników, churnem 4% i ARPU 150$. Wprowadzamy usługę summarization w 3 miesiącu."

### 2. Structured Scenario Lifecycle
- Use \`scenario_action\` with \`action: "create" | "get" | "update" | "delete" | "list"\` to manage scenario records.
  - Key Fields for \`action: "create"\`:
    - \`name\`: Scenario name.
    - \`projection_months\` (optional): Duration of analysis (typically 36 or 60).
    - \`discount_rate\` (optional): Annual discount rate (default is 10%/0.10).
    - \`cohort_config\`: Object defining user acquisition, churn, ARPU, and adoption.
    - \`services\` (optional): Array of \`{ id: string, rollout_month?: number }\` to attach.
    - \`packs\` (optional): Array of \`{ id: string, rollout_month?: number }\` to attach.
    - \`plans\` (optional): Array of \`{ id: string, rollout_month?: number }\` to attach.
    - \`cost_ids\` (optional): Array of Capex/Opex fixed cost item IDs to attach.
  - Deletions (\`action: "delete"\`) require \`confirm: true\`.

## Configuration Details
- **Rollout Month**: Represents when a service starts. A rollout month of \`0\` starts immediately, while \`6\` defers costs until month 6.
- **AI Adoption Rate**: Expressed as a decimal (e.g., 0.3 for 30%) to control what percentage of users incur model token costs.
- **Discount Rate (WACC)**: Normally ranges between 0.08 and 0.15 to discount future cash flows.\``
          }
        }
      ]
    };
  }
);

server.tool(
  "dashboard_action",
  "Launch or stop the local Sherpa web dashboard interface, which displays cashflow graphs and scenario comparisons. Use the 'open' action to deep-link to specific routes (e.g. /scenarios/<id>) in the default browser, or 'close' to terminate the local server. Always specify the 'action' parameter. Do not call this tool unless the user explicitly asks to view or manage the dashboard.",
  {
    action: z.enum(["open", "close"]).describe("The action to perform: 'open' to launch the local server and open a browser tab, 'close' to stop the local dashboard server."),
    path: z.string().optional().describe("Optional deep-link path to redirect the browser to (e.g. '/scenarios/<uuid>'). Only used with 'open' action.")
  },
  async (args) => {
    try {
      if (args.action === "open") {
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
      }

      if (args.action === "close") {
        const { stopped, message } = await stopDashboard();
        return { content: [{ type: "text", text: message }] };
      }

      throw new Error(`Nieobsługiwana akcja: ${args.action}`);
    } catch (err: any) {
      return formatSemanticError(err, "dashboard_action");
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
