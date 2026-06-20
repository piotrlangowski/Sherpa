import db from '../db';
import type { Scenario, ScenarioResult, ScopeType, ScopeOverride, RevenueSource, ModelingType, RevenueCarrier, RevenueBridge } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export const scenariosRepository = {
  getAll(): Scenario[] {
    const rows = db.prepare(`
      SELECT s.id, s.name, s.description, s.projection_months, s.discount_rate, s.scope_type, s.revenue_source, s.created_at, s.updated_at,
             s.capex_contingency_pct, s.modeling_type, s.revenue_carrier, s.revenue_bridge,
             r.payback_months, r.npv, r.irr_annual, r.tco, r.profitability_index, r.calculated_at,
             r.payback_months_lower, r.npv_lower, r.profitability_index_lower, r.irr_monthly, r.irr_annual_nominal, r.irr_status
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
      SELECT spl.scenario_id, pl.id, pl.name, pl.base_price, spl.rollout_month, spl.seats
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
        revenue_source: (r.revenue_source as RevenueSource) || 'cohort',
        capex_contingency_pct: r.capex_contingency_pct || 0,
        modeling_type: (r.modeling_type as ModelingType) || 'appraisal',
        revenue_carrier: (r.revenue_carrier as RevenueCarrier) || null,
        revenue_bridge: (r.revenue_bridge as RevenueBridge) || null,
        created_at: r.created_at,
        updated_at: r.updated_at,
        scope_verticals: vrtMap[r.id] || [],
        scope_cohorts: cohMap[r.id] || [],
        scope_overrides: [], // Not loaded in getAll to keep it light
        services: srvMap[r.id] || [],
        packs: pckMap[r.id] || [],
        plans: plnMap[r.id] || [],
        costs: [],
        // A cached result exists iff the LEFT JOIN matched a row (calculated_at is NOT NULL).
        // Keying off payback_months is wrong: it is legitimately null for "Never pays back".
        results: r.calculated_at != null ? {
          id: r.id,
          scenario_id: r.id,
          payback_months: r.payback_months,
          npv: r.npv,
          irr_annual: r.irr_annual,
          tco: r.tco,
          profitability_index: r.profitability_index,
          payback_months_lower: r.payback_months_lower,
          npv_lower: r.npv_lower,
          profitability_index_lower: r.profitability_index_lower,
          irr_monthly: r.irr_monthly,
          irr_annual_nominal: r.irr_annual_nominal,
          irr_status: r.irr_status,
          monthly_cashflows: [],
          monthly_mrr: [],
          monthly_customers: [],
          calculated_at: r.calculated_at
        } : undefined
      } as Scenario;
    });
  },

  getById(id: string): Scenario | null {
    const r = db.prepare(`
      SELECT s.id, s.name, s.description, s.projection_months, s.discount_rate, s.scope_type, s.revenue_source, s.capex_contingency_pct,
             s.modeling_type, s.revenue_carrier, s.revenue_bridge,
             s.created_at, s.updated_at
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
             c.monthly_expansion_rate, c.ai_adoption_rate, c.base_arpu,
             c.arpu_uplift, c.arpu_uplift_percent, c.churn_reduction, c.acquisition_uplift,
             c.gross_margin, c.adoption_ramp_months,
             c.created_at, c.updated_at,
             v.name as vertical_name
      FROM cohort_configs c
      JOIN scenario_cohorts sc ON c.id = sc.cohort_config_id
      LEFT JOIN verticals v ON c.vertical_id = v.id
      WHERE sc.scenario_id = ?
    `).all(id) as any[];

    // Load scope overrides with resolved target names and base values
    const overrideRows = db.prepare(`
      SELECT 
        o.id, o.scenario_id, o.target_type, o.target_id, o.monthly_churn_rate, o.monthly_acquisition,
        o.acquisition_growth_rate, o.ai_adoption_rate, o.retention_floor, o.expansion_rate, o.arpu_override,
        o.arpu_uplift, o.arpu_uplift_percent, o.churn_reduction, o.acquisition_uplift,
        o.gross_margin, o.adoption_ramp_months,
        CASE 
          WHEN o.target_type = 'cohort' THEN c.name 
          WHEN o.target_type = 'vertical' THEN v.name
          ELSE 'Global Client Base'
        END as target_name,
        c.base_arpu as cohort_base_arpu,
        c.monthly_churn_rate as cohort_base_monthly_churn_rate,
        c.monthly_acquisition as cohort_base_monthly_acquisition,
        c.acquisition_growth_rate as cohort_base_acquisition_growth_rate,
        c.ai_adoption_rate as cohort_base_ai_adoption_rate,
        c.retention_floor as cohort_base_retention_floor,
        c.monthly_expansion_rate as cohort_base_expansion_rate,
        c.arpu_uplift as cohort_base_arpu_uplift,
        c.arpu_uplift_percent as cohort_base_arpu_uplift_percent,
        c.churn_reduction as cohort_base_churn_reduction,
        c.acquisition_uplift as cohort_base_acquisition_uplift,
        c.gross_margin as cohort_base_gross_margin,
        c.adoption_ramp_months as cohort_base_adoption_ramp_months,
        cb.default_arpu as global_base_arpu,
        cb.default_monthly_churn_rate as global_base_monthly_churn_rate,
        cb.default_monthly_acquisition as global_base_monthly_acquisition,
        cb.default_acquisition_growth_rate as global_base_acquisition_growth_rate,
        cb.default_ai_adoption_rate as global_base_ai_adoption_rate,
        cb.default_retention_floor as global_base_retention_floor,
        cb.default_expansion_rate as global_base_expansion_rate,
        cb.default_arpu_uplift as global_base_arpu_uplift,
        cb.default_arpu_uplift_percent as global_base_arpu_uplift_percent,
        cb.default_churn_reduction as global_base_churn_reduction,
        cb.default_acquisition_uplift as global_base_acquisition_uplift,
        cb.default_gross_margin as global_base_gross_margin,
        cb.default_adoption_ramp_months as global_base_adoption_ramp_months
      FROM scenario_scope_overrides o
      LEFT JOIN cohort_configs c ON o.target_type = 'cohort' AND o.target_id = c.id
      LEFT JOIN verticals v ON o.target_type = 'vertical' AND o.target_id = v.id
      LEFT JOIN client_base cb ON o.target_type = 'all_clients'
      WHERE o.scenario_id = ?
    `).all(id) as any[];

    const mappedOverrides = overrideRows.map((row: any) => {
      let base_values = null;
      if (row.target_type === 'cohort') {
        base_values = {
          monthly_churn_rate: row.cohort_base_monthly_churn_rate,
          monthly_acquisition: row.cohort_base_monthly_acquisition,
          acquisition_growth_rate: row.cohort_base_acquisition_growth_rate,
          ai_adoption_rate: row.cohort_base_ai_adoption_rate,
          retention_floor: row.cohort_base_retention_floor,
          expansion_rate: row.cohort_base_expansion_rate,
          arpu_override: row.cohort_base_arpu,
          arpu_uplift: row.cohort_base_arpu_uplift,
          arpu_uplift_percent: row.cohort_base_arpu_uplift_percent,
          churn_reduction: row.cohort_base_churn_reduction,
          acquisition_uplift: row.cohort_base_acquisition_uplift,
          gross_margin: row.cohort_base_gross_margin,
          adoption_ramp_months: row.cohort_base_adoption_ramp_months
        };
      } else if (row.target_type === 'all_clients') {
        base_values = {
          monthly_churn_rate: row.global_base_monthly_churn_rate,
          monthly_acquisition: row.global_base_monthly_acquisition,
          acquisition_growth_rate: row.global_base_acquisition_growth_rate,
          ai_adoption_rate: row.global_base_ai_adoption_rate,
          retention_floor: row.global_base_retention_floor,
          expansion_rate: row.global_base_expansion_rate,
          arpu_override: row.global_base_arpu,
          arpu_uplift: row.global_base_arpu_uplift,
          arpu_uplift_percent: row.global_base_arpu_uplift_percent,
          churn_reduction: row.global_base_churn_reduction,
          acquisition_uplift: row.global_base_acquisition_uplift,
          gross_margin: row.global_base_gross_margin,
          adoption_ramp_months: row.global_base_adoption_ramp_months
        };
      }

      return {
        id: row.id,
        scenario_id: row.scenario_id,
        target_type: row.target_type,
        target_id: row.target_id,
        monthly_churn_rate: row.monthly_churn_rate,
        monthly_acquisition: row.monthly_acquisition,
        acquisition_growth_rate: row.acquisition_growth_rate,
        ai_adoption_rate: row.ai_adoption_rate,
        retention_floor: row.retention_floor,
        expansion_rate: row.expansion_rate,
        arpu_override: row.arpu_override,
        arpu_uplift: row.arpu_uplift,
        arpu_uplift_percent: row.arpu_uplift_percent,
        churn_reduction: row.churn_reduction,
        acquisition_uplift: row.acquisition_uplift,
        gross_margin: row.gross_margin,
        adoption_ramp_months: row.adoption_ramp_months,
        target_name: row.target_name || (row.target_type === 'all_clients' ? 'Global Client Base' : row.target_id),
        base_values
      };
    });

    // Load services in scenario
    const serviceRows = db.prepare(`
      SELECT s.id, s.name, s.status, s.provider_id, s.avg_input_tokens, s.avg_output_tokens,
             s.avg_requests_per_user_month, s.fixed_cost_per_month, s.fixed_cost_currency, ss.rollout_month
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
      SELECT pl.id, pl.name, pl.base_price, spl.rollout_month, spl.seats
      FROM plans pl
      JOIN scenario_plans spl ON pl.id = spl.plan_id
      WHERE spl.scenario_id = ?
      ORDER BY spl.rollout_month ASC
    `).all(id) as any[];

    // Load cost items in scenario
    const costRows = db.prepare(`
      SELECT c.id, c.name, c.category, c.subcategory, c.amount, c.frequency, c.currency, c.service_id, c.created_at, c.updated_at
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
      revenue_source: (r.revenue_source as RevenueSource) || 'cohort',
      capex_contingency_pct: r.capex_contingency_pct || 0,
      modeling_type: (r.modeling_type as ModelingType) || 'appraisal',
      revenue_carrier: (r.revenue_carrier as RevenueCarrier) || null,
      revenue_bridge: (r.revenue_bridge as RevenueBridge) || null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      scope_verticals: verticalRows,
      scope_cohorts: cohortRows,
      scope_overrides: mappedOverrides,
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
    plans?: { id: string; rollout_month: number; seats?: number }[];
    cost_ids?: string[];
  }): Scenario {
    const id = uuidv4();
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare(`
        INSERT INTO scenarios (id, name, description, projection_months, discount_rate, scope_type, revenue_source, capex_contingency_pct, modeling_type, revenue_carrier, revenue_bridge, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, data.name, data.description || null, data.projection_months, data.discount_rate, data.scope_type, data.revenue_source || 'cohort', data.capex_contingency_pct ?? 0, data.modeling_type || 'appraisal', data.revenue_carrier || null, data.revenue_bridge || null, now, now);

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
            acquisition_growth_rate, ai_adoption_rate, retention_floor, expansion_rate, arpu_override,
            arpu_uplift, arpu_uplift_percent, churn_reduction, acquisition_uplift,
            gross_margin, adoption_ramp_months
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const ov of data.scope_overrides) {
          insertOverride.run(
            uuidv4(), id, ov.target_type, ov.target_id || null, 
            ov.monthly_churn_rate ?? null, ov.monthly_acquisition ?? null,
            ov.acquisition_growth_rate ?? null, ov.ai_adoption_rate ?? null,
            ov.retention_floor ?? null, ov.expansion_rate ?? null, ov.arpu_override ?? null,
            ov.arpu_uplift ?? null, ov.arpu_uplift_percent ?? null,
            ov.churn_reduction ?? null, ov.acquisition_uplift ?? null,
            ov.gross_margin ?? null, ov.adoption_ramp_months ?? null
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
        const insertPlanLink = db.prepare("INSERT INTO scenario_plans (scenario_id, plan_id, rollout_month, seats) VALUES (?, ?, ?, ?)");
        for (const pl of data.plans) insertPlanLink.run(id, pl.id, pl.rollout_month, pl.seats ?? 0);
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
    plans?: { id: string; rollout_month: number; seats?: number }[];
    cost_ids?: string[];
  }): void {
    const current = this.getById(id);
    if (!current) throw new Error(`Scenario not found: ${id}`);

    const name = data.name !== undefined ? data.name : current.name;
    const description = data.description !== undefined ? data.description : current.description;
    const projection_months = data.projection_months !== undefined ? data.projection_months : current.projection_months;
    const discount_rate = data.discount_rate !== undefined ? data.discount_rate : current.discount_rate;
    const scope_type = data.scope_type !== undefined ? data.scope_type : current.scope_type;
    const revenue_source = data.revenue_source !== undefined ? data.revenue_source : (current.revenue_source || 'cohort');
    const modeling_type = data.modeling_type !== undefined ? data.modeling_type : (current.modeling_type || 'appraisal');
    const revenue_carrier = data.revenue_carrier !== undefined ? data.revenue_carrier : current.revenue_carrier;
    const revenue_bridge = data.revenue_bridge !== undefined ? data.revenue_bridge : current.revenue_bridge;
    const now = new Date().toISOString();

    db.transaction(() => {
      const capex_contingency_pct = data.capex_contingency_pct !== undefined ? data.capex_contingency_pct : current.capex_contingency_pct;
      db.prepare(`
        UPDATE scenarios
        SET name = ?, description = ?, projection_months = ?, discount_rate = ?, scope_type = ?, revenue_source = ?, capex_contingency_pct = ?, modeling_type = ?, revenue_carrier = ?, revenue_bridge = ?, updated_at = ?
        WHERE id = ?
      `).run(name, description || null, projection_months, discount_rate, scope_type, revenue_source, capex_contingency_pct, modeling_type, revenue_carrier || null, revenue_bridge || null, now, id);

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
            acquisition_growth_rate, ai_adoption_rate, retention_floor, expansion_rate, arpu_override,
            arpu_uplift, arpu_uplift_percent, churn_reduction, acquisition_uplift,
            gross_margin, adoption_ramp_months
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const ov of data.scope_overrides) {
          insertOverride.run(
            uuidv4(), id, ov.target_type, ov.target_id || null, 
            ov.monthly_churn_rate ?? null, ov.monthly_acquisition ?? null,
            ov.acquisition_growth_rate ?? null, ov.ai_adoption_rate ?? null,
            ov.retention_floor ?? null, ov.expansion_rate ?? null, ov.arpu_override ?? null,
            ov.arpu_uplift ?? null, ov.arpu_uplift_percent ?? null,
            ov.churn_reduction ?? null, ov.acquisition_uplift ?? null,
            ov.gross_margin ?? null, ov.adoption_ramp_months ?? null
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
        const insertPlanLink = db.prepare("INSERT INTO scenario_plans (scenario_id, plan_id, rollout_month, seats) VALUES (?, ?, ?, ?)");
        for (const pl of data.plans) insertPlanLink.run(id, pl.id, pl.rollout_month, pl.seats ?? 0);
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
      db.prepare("DELETE FROM monetization_configs WHERE scenario_id = ?").run(id);
      db.prepare("DELETE FROM scenario_results WHERE scenario_id = ?").run(id);
      db.prepare("DELETE FROM scenarios WHERE id = ?").run(id);
    })();
  },

  getResults(scenarioId: string): ScenarioResult | null {
    const r = db.prepare(`
      SELECT id, scenario_id, payback_months, npv, irr_annual, tco, profitability_index, monthly_cashflows, monthly_mrr, monthly_customers, calculated_at,
             payback_months_lower, npv_lower, profitability_index_lower, irr_monthly, irr_annual_nominal, irr_status,
             revenue_integrity_status, revenue_integrity_message
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
      profitability_index: r.profitability_index,
      monthly_cashflows: JSON.parse(r.monthly_cashflows || '[]'),
      monthly_mrr: JSON.parse(r.monthly_mrr || '[]'),
      monthly_customers: JSON.parse(r.monthly_customers || '[]'),
      calculated_at: r.calculated_at,
      payback_months_lower: r.payback_months_lower,
      npv_lower: r.npv_lower,
      profitability_index_lower: r.profitability_index_lower,
      irr_monthly: r.irr_monthly,
      irr_annual_nominal: r.irr_annual_nominal,
      irr_status: r.irr_status,
      revenue_integrity_status: r.revenue_integrity_status || null,
      revenue_integrity_message: r.revenue_integrity_message || null
    };
  },

  saveResults(results: ScenarioResult): void {
    const id = results.id || uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT OR REPLACE INTO scenario_results (
        id, scenario_id, payback_months, npv, irr_annual, tco, profitability_index, 
        monthly_cashflows, monthly_mrr, monthly_customers, calculated_at,
        payback_months_lower, npv_lower, profitability_index_lower, irr_monthly, irr_annual_nominal, irr_status,
        revenue_integrity_status, revenue_integrity_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      results.scenario_id,
      results.payback_months,
      results.npv,
      results.irr_annual,
      results.tco,
      results.profitability_index,
      JSON.stringify(results.monthly_cashflows),
      JSON.stringify(results.monthly_mrr),
      JSON.stringify(results.monthly_customers),
      now,
      results.payback_months_lower,
      results.npv_lower,
      results.profitability_index_lower,
      results.irr_monthly,
      results.irr_annual_nominal,
      results.irr_status,
      results.revenue_integrity_status || null,
      results.revenue_integrity_message || null
    );
  },

  invalidateResults(scenarioIds: string[]): void {
    if (scenarioIds.length === 0) return;
    const placeholders = scenarioIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM scenario_results WHERE scenario_id IN (${placeholders})`).run(...scenarioIds);
  },
  
  invalidateAllResults(): void {
    db.prepare("DELETE FROM scenario_results").run();
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
