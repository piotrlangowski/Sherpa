import db from '../db';
import type { Scenario, ScenarioResult, ScopeType, ScopeOverride } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export const scenariosRepository = {
  getAll(): Scenario[] {
    const rows = db.prepare(`
      SELECT s.id, s.name, s.description, s.projection_months, s.discount_rate, s.scope_type, s.created_at, s.updated_at,
             r.payback_months, r.npv, r.irr_annual, r.tco, r.roi_percent
      FROM scenarios s
      LEFT JOIN scenario_results r ON s.id = r.scenario_id
      ORDER BY s.updated_at DESC
    `).all() as any[];

    if (rows.length === 0) return [];

    const scenarioIds = rows.map((r: any) => r.id);
    const placeholders = scenarioIds.map(() => '?').join(',');

    const serviceRows = db.prepare(`
      SELECT ss.scenario_id, s.id, s.name, s.status, ss.rollout_month
      FROM services s
      JOIN scenario_services ss ON s.id = ss.service_id
      WHERE ss.scenario_id IN (${placeholders})
    `).all(...scenarioIds) as any[];

    const packRows = db.prepare(`
      SELECT sp.scenario_id, p.id, p.name, sp.rollout_month
      FROM packs p
      JOIN scenario_packs sp ON p.id = sp.pack_id
      WHERE sp.scenario_id IN (${placeholders})
    `).all(...scenarioIds) as any[];

    const planRows = db.prepare(`
      SELECT spl.scenario_id, pl.id, pl.name, spl.rollout_month
      FROM plans pl
      JOIN scenario_plans spl ON pl.id = spl.plan_id
      WHERE spl.scenario_id IN (${placeholders})
    `).all(...scenarioIds) as any[];

    const verticalRows = db.prepare(`
      SELECT sv.scenario_id, v.id, v.name
      FROM verticals v
      JOIN scenario_verticals sv ON v.id = sv.vertical_id
      WHERE sv.scenario_id IN (${placeholders})
    `).all(...scenarioIds) as any[];

    const cohortRows = db.prepare(`
      SELECT sc.scenario_id, c.id, c.name, v.name as vertical_name
      FROM cohort_configs c
      JOIN scenario_cohorts sc ON c.id = sc.cohort_config_id
      LEFT JOIN verticals v ON c.vertical_id = v.id
      WHERE sc.scenario_id IN (${placeholders})
    `).all(...scenarioIds) as any[];

    const groupByScenario = (arr: any[]) => {
      const map: Record<string, any[]> = {};
      for (const row of arr) {
        if (!map[row.scenario_id]) map[row.scenario_id] = [];
        const { scenario_id, ...data } = row;
        map[scenario_id].push(data);
      }
      return map;
    };

    const srvMap = groupByScenario(serviceRows);
    const pckMap = groupByScenario(packRows);
    const plnMap = groupByScenario(planRows);
    const vrtMap = groupByScenario(verticalRows);
    const cohMap = groupByScenario(cohortRows);

    return rows.map(r => {
      return {
        id: r.id,
        name: r.name,
        description: r.description || '',
        projection_months: r.projection_months,
        discount_rate: r.discount_rate,
        scope_type: r.scope_type as ScopeType,
        created_at: r.created_at,
        updated_at: r.updated_at,
        scope_verticals: vrtMap[r.id] || [],
        scope_cohorts: cohMap[r.id] || [],
        scope_overrides: [], // Not loaded in getAll to keep it light
        services: srvMap[r.id] || [],
        packs: pckMap[r.id] || [],
        plans: plnMap[r.id] || [],
        costs: [],
        results: r.payback_months !== undefined && r.payback_months !== null ? {
          id: r.id,
          scenario_id: r.id,
          payback_months: r.payback_months,
          npv: r.npv,
          irr_annual: r.irr_annual,
          tco: r.tco,
          roi_percent: r.roi_percent,
          monthly_cashflows: [],
          monthly_mrr: [],
          monthly_customers: [],
          calculated_at: r.updated_at
        } : undefined
      } as Scenario;
    });
  },

  getById(id: string): Scenario | null {
    const r = db.prepare(`
      SELECT s.id, s.name, s.description, s.projection_months, s.discount_rate, s.scope_type, s.created_at, s.updated_at
      FROM scenarios s
      WHERE s.id = ?
    `).get(id) as any;

    if (!r) return null;

    // Load verticals
    const verticalRows = db.prepare(`
      SELECT v.* 
      FROM verticals v
      JOIN scenario_verticals sv ON v.id = sv.vertical_id
      WHERE sv.scenario_id = ?
    `).all(id) as any[];

    // Load cohorts
    const cohortRows = db.prepare(`
      SELECT c.id, c.name, c.vertical_id, c.current_users, c.monthly_acquisition, 
             c.acquisition_growth_rate, c.monthly_churn_rate, c.retention_floor, 
             c.monthly_expansion_rate, c.ai_adoption_rate, c.base_arpu, c.created_at, c.updated_at,
             v.name as vertical_name
      FROM cohort_configs c
      JOIN scenario_cohorts sc ON c.id = sc.cohort_config_id
      LEFT JOIN verticals v ON c.vertical_id = v.id
      WHERE sc.scenario_id = ?
    `).all(id) as any[];

    // Load scope overrides
    const overrideRows = db.prepare(`
      SELECT id, scenario_id, target_type, target_id, monthly_churn_rate, monthly_acquisition,
             acquisition_growth_rate, ai_adoption_rate, retention_floor, expansion_rate, arpu_override
      FROM scenario_scope_overrides
      WHERE scenario_id = ?
    `).all(id) as any[];

    // Load services in scenario
    const serviceRows = db.prepare(`
      SELECT s.id, s.name, s.status, s.provider_id, s.avg_input_tokens, s.avg_output_tokens,
             s.avg_requests_per_user_month, s.fixed_cost_per_month, ss.rollout_month
      FROM services s
      JOIN scenario_services ss ON s.id = ss.service_id
      WHERE ss.scenario_id = ?
      ORDER BY ss.rollout_month ASC
    `).all(id) as any[];

    // Load packs in scenario
    const packRows = db.prepare(`
      SELECT p.id, p.name, sp.rollout_month
      FROM packs p
      JOIN scenario_packs sp ON p.id = sp.pack_id
      WHERE sp.scenario_id = ?
      ORDER BY sp.rollout_month ASC
    `).all(id) as any[];

    // Load plans in scenario
    const planRows = db.prepare(`
      SELECT pl.id, pl.name, spl.rollout_month
      FROM plans pl
      JOIN scenario_plans spl ON pl.id = spl.plan_id
      WHERE spl.scenario_id = ?
      ORDER BY spl.rollout_month ASC
    `).all(id) as any[];

    // Load cost items in scenario
    const costRows = db.prepare(`
      SELECT c.id, c.name, c.category, c.subcategory, c.amount, c.frequency, c.service_id, c.created_at, c.updated_at
      FROM cost_items c
      JOIN scenario_costs sc ON c.id = sc.cost_item_id
      WHERE sc.scenario_id = ?
    `).all(id) as any[];

    return {
      id: r.id,
      name: r.name,
      description: r.description || '',
      projection_months: r.projection_months,
      discount_rate: r.discount_rate,
      scope_type: r.scope_type as ScopeType,
      created_at: r.created_at,
      updated_at: r.updated_at,
      scope_verticals: verticalRows,
      scope_cohorts: cohortRows,
      scope_overrides: overrideRows,
      services: serviceRows,
      packs: packRows,
      plans: planRows,
      costs: costRows
    } as Scenario;
  },

  create(data: Omit<Scenario, 'id' | 'created_at' | 'updated_at' | 'services' | 'packs' | 'plans' | 'costs' | 'results' | 'scope_verticals' | 'scope_cohorts' | 'scope_overrides'> & {
    scope_type: ScopeType;
    vertical_ids?: string[];
    cohort_config_ids?: string[];
    scope_overrides?: Omit<ScopeOverride, 'id' | 'scenario_id'>[];
    services?: { id: string; rollout_month: number }[];
    packs?: { id: string; rollout_month: number }[];
    plans?: { id: string; rollout_month: number }[];
    cost_ids?: string[];
  }): Scenario {
    const id = uuidv4();
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare(`
        INSERT INTO scenarios (id, name, description, projection_months, discount_rate, scope_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, data.name, data.description || null, data.projection_months, data.discount_rate, data.scope_type, now, now);

      if (data.vertical_ids && data.vertical_ids.length > 0) {
        const insertLink = db.prepare("INSERT INTO scenario_verticals (scenario_id, vertical_id) VALUES (?, ?)");
        for (const vId of data.vertical_ids) insertLink.run(id, vId);
      }

      if (data.cohort_config_ids && data.cohort_config_ids.length > 0) {
        const insertLink = db.prepare("INSERT INTO scenario_cohorts (scenario_id, cohort_config_id) VALUES (?, ?)");
        for (const cId of data.cohort_config_ids) insertLink.run(id, cId);
      }

      if (data.scope_overrides && data.scope_overrides.length > 0) {
        const insertOverride = db.prepare(`
          INSERT INTO scenario_scope_overrides (
            id, scenario_id, target_type, target_id, monthly_churn_rate, monthly_acquisition,
            acquisition_growth_rate, ai_adoption_rate, retention_floor, expansion_rate, arpu_override
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const ov of data.scope_overrides) {
          insertOverride.run(
            uuidv4(), id, ov.target_type, ov.target_id || null, 
            ov.monthly_churn_rate ?? null, ov.monthly_acquisition ?? null,
            ov.acquisition_growth_rate ?? null, ov.ai_adoption_rate ?? null,
            ov.retention_floor ?? null, ov.expansion_rate ?? null, ov.arpu_override ?? null
          );
        }
      }

      if (data.services && data.services.length > 0) {
        const insertServiceLink = db.prepare("INSERT INTO scenario_services (scenario_id, service_id, rollout_month) VALUES (?, ?, ?)");
        for (const s of data.services) insertServiceLink.run(id, s.id, s.rollout_month);
      }

      if (data.packs && data.packs.length > 0) {
        const insertPackLink = db.prepare("INSERT INTO scenario_packs (scenario_id, pack_id, rollout_month) VALUES (?, ?, ?)");
        for (const p of data.packs) insertPackLink.run(id, p.id, p.rollout_month);
      }

      if (data.plans && data.plans.length > 0) {
        const insertPlanLink = db.prepare("INSERT INTO scenario_plans (scenario_id, plan_id, rollout_month) VALUES (?, ?, ?)");
        for (const pl of data.plans) insertPlanLink.run(id, pl.id, pl.rollout_month);
      }

      if (data.cost_ids && data.cost_ids.length > 0) {
        const insertCostLink = db.prepare("INSERT INTO scenario_costs (scenario_id, cost_item_id) VALUES (?, ?)");
        for (const cId of data.cost_ids) insertCostLink.run(id, cId);
      }
    })();

    return this.getById(id)!;
  },

  update(id: string, data: Partial<Omit<Scenario, 'id' | 'created_at' | 'updated_at' | 'services' | 'packs' | 'plans' | 'costs' | 'results' | 'scope_verticals' | 'scope_cohorts' | 'scope_overrides'>> & {
    scope_type?: ScopeType;
    vertical_ids?: string[];
    cohort_config_ids?: string[];
    scope_overrides?: Omit<ScopeOverride, 'id' | 'scenario_id'>[];
    services?: { id: string; rollout_month: number }[];
    packs?: { id: string; rollout_month: number }[];
    plans?: { id: string; rollout_month: number }[];
    cost_ids?: string[];
  }): void {
    const current = this.getById(id);
    if (!current) throw new Error(`Scenario not found: ${id}`);

    const name = data.name !== undefined ? data.name : current.name;
    const description = data.description !== undefined ? data.description : current.description;
    const projection_months = data.projection_months !== undefined ? data.projection_months : current.projection_months;
    const discount_rate = data.discount_rate !== undefined ? data.discount_rate : current.discount_rate;
    const scope_type = data.scope_type !== undefined ? data.scope_type : current.scope_type;
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare(`
        UPDATE scenarios
        SET name = ?, description = ?, projection_months = ?, discount_rate = ?, scope_type = ?, updated_at = ?
        WHERE id = ?
      `).run(name, description || null, projection_months, discount_rate, scope_type, now, id);

      if (data.vertical_ids !== undefined) {
        db.prepare("DELETE FROM scenario_verticals WHERE scenario_id = ?").run(id);
        const insertLink = db.prepare("INSERT INTO scenario_verticals (scenario_id, vertical_id) VALUES (?, ?)");
        for (const vId of data.vertical_ids) insertLink.run(id, vId);
      }

      if (data.cohort_config_ids !== undefined) {
        db.prepare("DELETE FROM scenario_cohorts WHERE scenario_id = ?").run(id);
        const insertLink = db.prepare("INSERT INTO scenario_cohorts (scenario_id, cohort_config_id) VALUES (?, ?)");
        for (const cId of data.cohort_config_ids) insertLink.run(id, cId);
      }

      if (data.scope_overrides !== undefined) {
        db.prepare("DELETE FROM scenario_scope_overrides WHERE scenario_id = ?").run(id);
        const insertOverride = db.prepare(`
          INSERT INTO scenario_scope_overrides (
            id, scenario_id, target_type, target_id, monthly_churn_rate, monthly_acquisition,
            acquisition_growth_rate, ai_adoption_rate, retention_floor, expansion_rate, arpu_override
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const ov of data.scope_overrides) {
          insertOverride.run(
            uuidv4(), id, ov.target_type, ov.target_id || null, 
            ov.monthly_churn_rate ?? null, ov.monthly_acquisition ?? null,
            ov.acquisition_growth_rate ?? null, ov.ai_adoption_rate ?? null,
            ov.retention_floor ?? null, ov.expansion_rate ?? null, ov.arpu_override ?? null
          );
        }
      }

      if (data.services !== undefined) {
        db.prepare("DELETE FROM scenario_services WHERE scenario_id = ?").run(id);
        const insertServiceLink = db.prepare("INSERT INTO scenario_services (scenario_id, service_id, rollout_month) VALUES (?, ?, ?)");
        for (const s of data.services) insertServiceLink.run(id, s.id, s.rollout_month);
      }

      if (data.packs !== undefined) {
        db.prepare("DELETE FROM scenario_packs WHERE scenario_id = ?").run(id);
        const insertPackLink = db.prepare("INSERT INTO scenario_packs (scenario_id, pack_id, rollout_month) VALUES (?, ?, ?)");
        for (const p of data.packs) insertPackLink.run(id, p.id, p.rollout_month);
      }

      if (data.plans !== undefined) {
        db.prepare("DELETE FROM scenario_plans WHERE scenario_id = ?").run(id);
        const insertPlanLink = db.prepare("INSERT INTO scenario_plans (scenario_id, plan_id, rollout_month) VALUES (?, ?, ?)");
        for (const pl of data.plans) insertPlanLink.run(id, pl.id, pl.rollout_month);
      }

      if (data.cost_ids !== undefined) {
        db.prepare("DELETE FROM scenario_costs WHERE scenario_id = ?").run(id);
        const insertCostLink = db.prepare("INSERT INTO scenario_costs (scenario_id, cost_item_id) VALUES (?, ?)");
        for (const cId of data.cost_ids) insertCostLink.run(id, cId);
      }

      // Invalidate cached results – they are now stale
      db.prepare("DELETE FROM scenario_results WHERE scenario_id = ?").run(id);
    })();
  },

  delete(id: string): void {
    db.transaction(() => {
      db.prepare("DELETE FROM scenario_services WHERE scenario_id = ?").run(id);
      db.prepare("DELETE FROM scenario_packs WHERE scenario_id = ?").run(id);
      db.prepare("DELETE FROM scenario_plans WHERE scenario_id = ?").run(id);
      db.prepare("DELETE FROM scenario_costs WHERE scenario_id = ?").run(id);
      db.prepare("DELETE FROM scenario_verticals WHERE scenario_id = ?").run(id);
      db.prepare("DELETE FROM scenario_cohorts WHERE scenario_id = ?").run(id);
      db.prepare("DELETE FROM scenario_scope_overrides WHERE scenario_id = ?").run(id);
      db.prepare("DELETE FROM scenario_results WHERE scenario_id = ?").run(id);
      db.prepare("DELETE FROM scenarios WHERE id = ?").run(id);
    })();
  },

  getResults(scenarioId: string): ScenarioResult | null {
    const r = db.prepare(`
      SELECT id, scenario_id, payback_months, npv, irr_annual, tco, roi_percent, monthly_cashflows, monthly_mrr, monthly_customers, calculated_at
      FROM scenario_results
      WHERE scenario_id = ?
    `).get(scenarioId) as any;

    if (!r) return null;
    return {
      id: r.id,
      scenario_id: r.scenario_id,
      payback_months: r.payback_months,
      npv: r.npv,
      irr_annual: r.irr_annual,
      tco: r.tco,
      roi_percent: r.roi_percent,
      monthly_cashflows: JSON.parse(r.monthly_cashflows || '[]'),
      monthly_mrr: JSON.parse(r.monthly_mrr || '[]'),
      monthly_customers: JSON.parse(r.monthly_customers || '[]'),
      calculated_at: r.calculated_at
    };
  },

  saveResults(results: ScenarioResult): void {
    const id = results.id || uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT OR REPLACE INTO scenario_results (id, scenario_id, payback_months, npv, irr_annual, tco, roi_percent, monthly_cashflows, monthly_mrr, monthly_customers, calculated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      results.scenario_id,
      results.payback_months,
      results.npv,
      results.irr_annual,
      results.tco,
      results.roi_percent,
      JSON.stringify(results.monthly_cashflows),
      JSON.stringify(results.monthly_mrr),
      JSON.stringify(results.monthly_customers),
      now
    );
  },

  invalidateResults(scenarioIds: string[]): void {
    if (scenarioIds.length === 0) return;
    const placeholders = scenarioIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM scenario_results WHERE scenario_id IN (${placeholders})`).run(...scenarioIds);
  },

  findScenarioIdsByServiceId(serviceId: string): string[] {
    return (db.prepare(`SELECT scenario_id FROM scenario_services WHERE service_id = ?`).all(serviceId) as any[])
      .map(r => r.scenario_id);
  },

  findScenarioIdsByVerticalId(verticalId: string): string[] {
    return (db.prepare(`SELECT scenario_id FROM scenario_verticals WHERE vertical_id = ?`).all(verticalId) as any[])
      .map(r => r.scenario_id);
  },

  findScenarioIdsByCohortId(cohortId: string): string[] {
    return (db.prepare(`SELECT scenario_id FROM scenario_cohorts WHERE cohort_config_id = ?`).all(cohortId) as any[])
      .map(r => r.scenario_id);
  },

  findScenarioIdsByCostItemId(costItemId: string): string[] {
    return (db.prepare(`SELECT scenario_id FROM scenario_costs WHERE cost_item_id = ?`).all(costItemId) as any[])
      .map(r => r.scenario_id);
  },

  findScenarioIdsByProviderId(providerId: string): string[] {
    return (db.prepare(`
      SELECT DISTINCT ss.scenario_id
      FROM scenario_services ss
      JOIN services s ON ss.service_id = s.id
      WHERE s.provider_id = ?
    `).all(providerId) as any[])
      .map(r => r.scenario_id);
  }
};
