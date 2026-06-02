import db from '../db';
import type { Scenario, ScenarioResult } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export const scenariosRepository = {
  getAll(): Scenario[] {
    const rows = db.prepare(`
      SELECT s.id, s.name, s.description, s.projection_months, s.discount_rate, s.cohort_config_id, s.created_at, s.updated_at,
             c.name as cohort_config_name,
             r.payback_months, r.npv, r.irr_annual, r.tco, r.roi_percent
      FROM scenarios s
      LEFT JOIN cohort_configs c ON s.cohort_config_id = c.id
      LEFT JOIN scenario_results r ON s.id = r.scenario_id
      ORDER BY s.updated_at DESC
    `).all() as any[];

    return rows.map(r => {
      // Load services
      const serviceRows = db.prepare(`
        SELECT s.id, s.name, s.status, ss.rollout_month
        FROM services s
        JOIN scenario_services ss ON s.id = ss.service_id
        WHERE ss.scenario_id = ?
      `).all(r.id) as any[];

      // Load packs
      const packRows = db.prepare(`
        SELECT p.id, p.name, sp.rollout_month
        FROM packs p
        JOIN scenario_packs sp ON p.id = sp.pack_id
        WHERE sp.scenario_id = ?
      `).all(r.id) as any[];

      // Load plans
      const planRows = db.prepare(`
        SELECT pl.id, pl.name, spl.rollout_month
        FROM plans pl
        JOIN scenario_plans spl ON pl.id = spl.plan_id
        WHERE spl.scenario_id = ?
      `).all(r.id) as any[];

      return {
        id: r.id,
        name: r.name,
        description: r.description || '',
        projection_months: r.projection_months,
        discount_rate: r.discount_rate,
        cohort_config_id: r.cohort_config_id,
        created_at: r.created_at,
        updated_at: r.updated_at,
        cohort_config: r.cohort_config_id ? {
          id: r.cohort_config_id,
          name: r.cohort_config_name,
          vertical_id: '',
          current_users: 0,
          monthly_acquisition: 0,
          acquisition_growth_rate: 0,
          monthly_churn_rate: 0,
          retention_floor: 0,
          monthly_expansion_rate: 0,
          ai_adoption_rate: 0,
          base_arpu: 0,
          created_at: '',
          updated_at: ''
        } : null,
        services: serviceRows,
        packs: packRows,
        plans: planRows,
        results: r.payback_months !== undefined ? {
          payback_months: r.payback_months,
          npv: r.npv,
          irr_annual: r.irr_annual,
          tco: r.tco,
          roi_percent: r.roi_percent
        } : undefined
      } as any;
    });
  },

  getById(id: string): Scenario | null {
    const r = db.prepare(`
      SELECT s.id, s.name, s.description, s.projection_months, s.discount_rate, s.cohort_config_id, s.created_at, s.updated_at,
             c.name as cohort_config_name, c.vertical_id as cohort_vertical_id, c.current_users as cohort_current_users,
             c.monthly_acquisition as cohort_monthly_acquisition, c.acquisition_growth_rate as cohort_acquisition_growth_rate,
             c.monthly_churn_rate as cohort_monthly_churn_rate, c.retention_floor as cohort_retention_floor,
             c.monthly_expansion_rate as cohort_monthly_expansion_rate, c.ai_adoption_rate as cohort_ai_adoption_rate,
             c.base_arpu as cohort_base_arpu
      FROM scenarios s
      LEFT JOIN cohort_configs c ON s.cohort_config_id = c.id
      WHERE s.id = ?
    `).get(id) as any;

    if (!r) return null;

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
      cohort_config_id: r.cohort_config_id,
      created_at: r.created_at,
      updated_at: r.updated_at,
      cohort_config: r.cohort_config_id ? {
        id: r.cohort_config_id,
        name: r.cohort_config_name,
        vertical_id: r.cohort_vertical_id,
        current_users: r.cohort_current_users,
        monthly_acquisition: r.cohort_monthly_acquisition,
        acquisition_growth_rate: r.cohort_acquisition_growth_rate,
        monthly_churn_rate: r.cohort_monthly_churn_rate,
        retention_floor: r.cohort_retention_floor,
        monthly_expansion_rate: r.cohort_monthly_expansion_rate,
        ai_adoption_rate: r.cohort_ai_adoption_rate,
        base_arpu: r.cohort_base_arpu,
        created_at: '',
        updated_at: ''
      } : null,
      services: serviceRows,
      packs: packRows,
      plans: planRows,
      costs: costRows
    } as any;
  },

  create(data: Omit<Scenario, 'id' | 'created_at' | 'updated_at' | 'services' | 'packs' | 'plans' | 'costs' | 'results'> & {
    services?: { id: string; rollout_month: number }[];
    packs?: { id: string; rollout_month: number }[];
    plans?: { id: string; rollout_month: number }[];
    cost_ids?: string[];
  }): Scenario {
    const id = uuidv4();
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare(`
        INSERT INTO scenarios (id, name, description, projection_months, discount_rate, cohort_config_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, data.name, data.description || null, data.projection_months, data.discount_rate, data.cohort_config_id || null, now, now);

      if (data.services && data.services.length > 0) {
        const insertServiceLink = db.prepare("INSERT INTO scenario_services (scenario_id, service_id, rollout_month) VALUES (?, ?, ?)");
        for (const s of data.services) {
          insertServiceLink.run(id, s.id, s.rollout_month);
        }
      }

      if (data.packs && data.packs.length > 0) {
        const insertPackLink = db.prepare("INSERT INTO scenario_packs (scenario_id, pack_id, rollout_month) VALUES (?, ?, ?)");
        for (const p of data.packs) {
          insertPackLink.run(id, p.id, p.rollout_month);
        }
      }

      if (data.plans && data.plans.length > 0) {
        const insertPlanLink = db.prepare("INSERT INTO scenario_plans (scenario_id, plan_id, rollout_month) VALUES (?, ?, ?)");
        for (const pl of data.plans) {
          insertPlanLink.run(id, pl.id, pl.rollout_month);
        }
      }

      if (data.cost_ids && data.cost_ids.length > 0) {
        const insertCostLink = db.prepare("INSERT INTO scenario_costs (scenario_id, cost_item_id) VALUES (?, ?)");
        for (const cId of data.cost_ids) {
          insertCostLink.run(id, cId);
        }
      }
    })();

    return this.getById(id)!;
  },

  update(id: string, data: Partial<Omit<Scenario, 'id' | 'created_at' | 'updated_at' | 'services' | 'packs' | 'plans' | 'costs' | 'results'>> & {
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
    const cohort_config_id = data.cohort_config_id !== undefined ? data.cohort_config_id : current.cohort_config_id;
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare(`
        UPDATE scenarios
        SET name = ?, description = ?, projection_months = ?, discount_rate = ?, cohort_config_id = ?, updated_at = ?
        WHERE id = ?
      `).run(name, description || null, projection_months, discount_rate, cohort_config_id || null, now, id);

      if (data.services !== undefined) {
        db.prepare("DELETE FROM scenario_services WHERE scenario_id = ?").run(id);
        if (data.services.length > 0) {
          const insertServiceLink = db.prepare("INSERT INTO scenario_services (scenario_id, service_id, rollout_month) VALUES (?, ?, ?)");
          for (const s of data.services) {
            insertServiceLink.run(id, s.id, s.rollout_month);
          }
        }
      }

      if (data.packs !== undefined) {
        db.prepare("DELETE FROM scenario_packs WHERE scenario_id = ?").run(id);
        if (data.packs.length > 0) {
          const insertPackLink = db.prepare("INSERT INTO scenario_packs (scenario_id, pack_id, rollout_month) VALUES (?, ?, ?)");
          for (const p of data.packs) {
            insertPackLink.run(id, p.id, p.rollout_month);
          }
        }
      }

      if (data.plans !== undefined) {
        db.prepare("DELETE FROM scenario_plans WHERE scenario_id = ?").run(id);
        if (data.plans.length > 0) {
          const insertPlanLink = db.prepare("INSERT INTO scenario_plans (scenario_id, plan_id, rollout_month) VALUES (?, ?, ?)");
          for (const pl of data.plans) {
            insertPlanLink.run(id, pl.id, pl.rollout_month);
          }
        }
      }

      if (data.cost_ids !== undefined) {
        db.prepare("DELETE FROM scenario_costs WHERE scenario_id = ?").run(id);
        if (data.cost_ids.length > 0) {
          const insertCostLink = db.prepare("INSERT INTO scenario_costs (scenario_id, cost_item_id) VALUES (?, ?)");
          for (const cId of data.cost_ids) {
            insertCostLink.run(id, cId);
          }
        }
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

  findScenarioIdsByCohortId(cohortId: string): string[] {
    return (db.prepare(`SELECT id FROM scenarios WHERE cohort_config_id = ?`).all(cohortId) as any[])
      .map(r => r.id);
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
