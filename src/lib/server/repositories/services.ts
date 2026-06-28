import db from '../db';
import type { Service, ServiceStatus, ServiceDependency, DependencyType, Currency } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { scenariosRepository } from './scenarios';

export const servicesRepository = {
  getAll(): Service[] {
    const rows = db.prepare(`
      SELECT s.id, s.name, s.description, s.status, s.provider_id, 
             s.avg_input_tokens, s.avg_output_tokens, s.avg_requests_per_user_month,
             s.fixed_cost_per_month, s.fixed_cost_currency, s.created_at, s.updated_at,
             s.service_type, s.interaction_driver_type, s.monthly_volume,
             s.volume_growth_rate, s.interactions_per_customer_month,
             s.fully_loaded_cost_per_fte_month, s.productive_hours_per_fte_month,
             s.average_handle_time_seconds, s.baseline_fte,
             s.staffing_realization_lag_months, s.containment_rate,
             s.containment_start_rate, s.containment_ramp_months,
             s.escalation_rate, s.failed_deflection_penalty, s.churn_rate_uplift,
             s.value_per_outcome,
             p.name as provider_name, p.model_name as provider_model_name
      FROM services s
      LEFT JOIN providers p ON s.provider_id = p.id
      ORDER BY s.status DESC, s.name ASC
    `).all() as any[];

    return rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description || '',
      status: r.status as ServiceStatus,
      provider_id: r.provider_id,
      avg_input_tokens: r.avg_input_tokens,
      avg_output_tokens: r.avg_output_tokens,
      avg_requests_per_user_month: r.avg_requests_per_user_month,
      fixed_cost_per_month: r.fixed_cost_per_month,
      fixed_cost_currency: (r.fixed_cost_currency as Currency) || 'USD',
      service_type: r.service_type || 'copilot',
      interaction_driver_type: r.interaction_driver_type || 'flat',
      monthly_volume: r.monthly_volume || 0,
      volume_growth_rate: r.volume_growth_rate || 0,
      interactions_per_customer_month: r.interactions_per_customer_month || 0,
      fully_loaded_cost_per_fte_month: r.fully_loaded_cost_per_fte_month || 0,
      productive_hours_per_fte_month: r.productive_hours_per_fte_month ?? 120,
      average_handle_time_seconds: r.average_handle_time_seconds || 0,
      baseline_fte: r.baseline_fte || 0,
      staffing_realization_lag_months: r.staffing_realization_lag_months || 0,
      containment_rate: r.containment_rate || 0,
      containment_start_rate: r.containment_start_rate || 0,
      containment_ramp_months: r.containment_ramp_months || 0,
      escalation_rate: r.escalation_rate || 0,
      failed_deflection_penalty: r.failed_deflection_penalty || 0,
      churn_rate_uplift: r.churn_rate_uplift || 0,
      value_per_outcome: r.value_per_outcome,
      created_at: r.created_at,
      updated_at: r.updated_at,
      provider: r.provider_id ? {
        id: r.provider_id,
        name: r.provider_name,
        model_name: r.provider_model_name,
        input_price: 0,
        output_price: 0,
        is_predefined: false,
        currency: 'USD',
        input_tokens_per_credit: 1000000,
        output_tokens_per_credit: 333333,
        updated_at: ''
      } : null
    }));
  },

  getById(id: string): Service | null {
    const r = db.prepare(`
      SELECT s.id, s.name, s.description, s.status, s.provider_id, 
             s.avg_input_tokens, s.avg_output_tokens, s.avg_requests_per_user_month,
             s.fixed_cost_per_month, s.fixed_cost_currency, s.created_at, s.updated_at,
             s.service_type, s.interaction_driver_type, s.monthly_volume,
             s.volume_growth_rate, s.interactions_per_customer_month,
             s.fully_loaded_cost_per_fte_month, s.productive_hours_per_fte_month,
             s.average_handle_time_seconds, s.baseline_fte,
             s.staffing_realization_lag_months, s.containment_rate,
             s.containment_start_rate, s.containment_ramp_months,
             s.escalation_rate, s.failed_deflection_penalty, s.churn_rate_uplift,
             s.value_per_outcome,
             p.name as provider_name, p.model_name as provider_model_name,
             p.input_price as provider_input_price, p.output_price as provider_output_price,
             p.currency as provider_currency,
             p.input_tokens_per_credit as provider_input_tokens_per_credit,
             p.output_tokens_per_credit as provider_output_tokens_per_credit
      FROM services s
      LEFT JOIN providers p ON s.provider_id = p.id
      WHERE s.id = ?
    `).get(id) as any;
    
    if (!r) return null;
    
    // Get dependencies
    const depRows = db.prepare(`
      SELECT d.id, d.source_id, d.target_id, d.dependency_type,
             src.name as source_name, tgt.name as target_name
      FROM service_dependencies d
      JOIN services src ON d.source_id = src.id
      JOIN services tgt ON d.target_id = tgt.id
      WHERE d.source_id = ? OR d.target_id = ?
    `).all(id, id) as any[];

    const dependencies: ServiceDependency[] = depRows.map(dr => ({
      id: dr.id,
      source_id: dr.source_id,
      target_id: dr.target_id,
      dependency_type: dr.dependency_type as DependencyType,
      source_name: dr.source_name,
      target_name: dr.target_name
    }));

    return {
      id: r.id,
      name: r.name,
      description: r.description || '',
      status: r.status as ServiceStatus,
      provider_id: r.provider_id,
      avg_input_tokens: r.avg_input_tokens,
      avg_output_tokens: r.avg_output_tokens,
      avg_requests_per_user_month: r.avg_requests_per_user_month,
      fixed_cost_per_month: r.fixed_cost_per_month,
      fixed_cost_currency: (r.fixed_cost_currency as Currency) || 'USD',
      service_type: r.service_type || 'copilot',
      interaction_driver_type: r.interaction_driver_type || 'flat',
      monthly_volume: r.monthly_volume || 0,
      volume_growth_rate: r.volume_growth_rate || 0,
      interactions_per_customer_month: r.interactions_per_customer_month || 0,
      fully_loaded_cost_per_fte_month: r.fully_loaded_cost_per_fte_month || 0,
      productive_hours_per_fte_month: r.productive_hours_per_fte_month ?? 120,
      average_handle_time_seconds: r.average_handle_time_seconds || 0,
      baseline_fte: r.baseline_fte || 0,
      staffing_realization_lag_months: r.staffing_realization_lag_months || 0,
      containment_rate: r.containment_rate || 0,
      containment_start_rate: r.containment_start_rate || 0,
      containment_ramp_months: r.containment_ramp_months || 0,
      escalation_rate: r.escalation_rate || 0,
      failed_deflection_penalty: r.failed_deflection_penalty || 0,
      churn_rate_uplift: r.churn_rate_uplift || 0,
      value_per_outcome: r.value_per_outcome,
      created_at: r.created_at,
      updated_at: r.updated_at,
      provider: r.provider_id ? {
        id: r.provider_id,
        name: r.provider_name,
        model_name: r.provider_model_name,
        input_price: r.provider_input_price,
        output_price: r.provider_output_price,
        is_predefined: false,
        currency: (r.provider_currency as Currency) || 'USD',
        input_tokens_per_credit: r.provider_input_tokens_per_credit ?? 1000000,
        output_tokens_per_credit: r.provider_output_tokens_per_credit ?? 333333,
        updated_at: ''
      } : null,
      dependencies
    };
  },

  create(data: Omit<Service, 'id' | 'created_at' | 'updated_at'>): Service {
    const id = uuidv4();
    const now = new Date().toISOString();
    const fixed_cost_currency = data.fixed_cost_currency || 'USD';
    
    db.prepare(`
      INSERT INTO services (
        id, name, description, status, provider_id, avg_input_tokens, avg_output_tokens, avg_requests_per_user_month, fixed_cost_per_month, fixed_cost_currency,
        service_type, interaction_driver_type, monthly_volume, volume_growth_rate, interactions_per_customer_month,
        fully_loaded_cost_per_fte_month, productive_hours_per_fte_month, average_handle_time_seconds, baseline_fte,
        staffing_realization_lag_months, containment_rate, containment_start_rate, containment_ramp_months,
        escalation_rate, failed_deflection_penalty, churn_rate_uplift, value_per_outcome, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.name,
      data.description || null,
      data.status,
      data.provider_id || null,
      data.avg_input_tokens,
      data.avg_output_tokens,
      data.avg_requests_per_user_month,
      data.fixed_cost_per_month === undefined ? null : data.fixed_cost_per_month,
      fixed_cost_currency,
      data.service_type || 'copilot',
      data.interaction_driver_type || 'flat',
      data.monthly_volume || 0,
      data.volume_growth_rate || 0,
      data.interactions_per_customer_month || 0,
      data.fully_loaded_cost_per_fte_month || 0,
      data.productive_hours_per_fte_month ?? 120,
      data.average_handle_time_seconds || 0,
      data.baseline_fte || 0,
      data.staffing_realization_lag_months || 0,
      data.containment_rate || 0,
      data.containment_start_rate || 0,
      data.containment_ramp_months || 0,
      data.escalation_rate || 0,
      data.failed_deflection_penalty || 0,
      data.churn_rate_uplift || 0,
      data.value_per_outcome ?? null,
      now,
      now
    );

    return {
      id,
      ...data,
      fixed_cost_currency,
      service_type: data.service_type || 'copilot',
      interaction_driver_type: data.interaction_driver_type || 'flat',
      monthly_volume: data.monthly_volume || 0,
      volume_growth_rate: data.volume_growth_rate || 0,
      interactions_per_customer_month: data.interactions_per_customer_month || 0,
      fully_loaded_cost_per_fte_month: data.fully_loaded_cost_per_fte_month || 0,
      productive_hours_per_fte_month: data.productive_hours_per_fte_month ?? 120,
      average_handle_time_seconds: data.average_handle_time_seconds || 0,
      baseline_fte: data.baseline_fte || 0,
      staffing_realization_lag_months: data.staffing_realization_lag_months || 0,
      containment_rate: data.containment_rate || 0,
      containment_start_rate: data.containment_start_rate || 0,
      containment_ramp_months: data.containment_ramp_months || 0,
      escalation_rate: data.escalation_rate || 0,
      failed_deflection_penalty: data.failed_deflection_penalty || 0,
      churn_rate_uplift: data.churn_rate_uplift || 0,
      value_per_outcome: data.value_per_outcome ?? null,
      created_at: now,
      updated_at: now
    };
  },

  update(id: string, data: Partial<Omit<Service, 'id' | 'created_at' | 'updated_at'>>): void {
    const current = this.getById(id);
    if (!current) throw new Error(`Service not found: ${id}`);
    
    const name = data.name !== undefined ? data.name : current.name;
    const description = data.description !== undefined ? data.description : current.description;
    const status = data.status !== undefined ? data.status : current.status;
    const provider_id = data.provider_id !== undefined ? data.provider_id : current.provider_id;
    const avg_input_tokens = data.avg_input_tokens !== undefined ? data.avg_input_tokens : current.avg_input_tokens;
    const avg_output_tokens = data.avg_output_tokens !== undefined ? data.avg_output_tokens : current.avg_output_tokens;
    const avg_requests_per_user_month = data.avg_requests_per_user_month !== undefined ? data.avg_requests_per_user_month : current.avg_requests_per_user_month;
    const fixed_cost_per_month = data.fixed_cost_per_month !== undefined ? data.fixed_cost_per_month : current.fixed_cost_per_month;
    const fixed_cost_currency = data.fixed_cost_currency !== undefined ? data.fixed_cost_currency : current.fixed_cost_currency;

    const service_type = data.service_type !== undefined ? data.service_type : current.service_type;
    const interaction_driver_type = data.interaction_driver_type !== undefined ? data.interaction_driver_type : current.interaction_driver_type;
    const monthly_volume = data.monthly_volume !== undefined ? data.monthly_volume : current.monthly_volume;
    const volume_growth_rate = data.volume_growth_rate !== undefined ? data.volume_growth_rate : current.volume_growth_rate;
    const interactions_per_customer_month = data.interactions_per_customer_month !== undefined ? data.interactions_per_customer_month : current.interactions_per_customer_month;
    const fully_loaded_cost_per_fte_month = data.fully_loaded_cost_per_fte_month !== undefined ? data.fully_loaded_cost_per_fte_month : current.fully_loaded_cost_per_fte_month;
    const productive_hours_per_fte_month = data.productive_hours_per_fte_month !== undefined ? data.productive_hours_per_fte_month : current.productive_hours_per_fte_month;
    const average_handle_time_seconds = data.average_handle_time_seconds !== undefined ? data.average_handle_time_seconds : current.average_handle_time_seconds;
    const baseline_fte = data.baseline_fte !== undefined ? data.baseline_fte : current.baseline_fte;
    const staffing_realization_lag_months = data.staffing_realization_lag_months !== undefined ? data.staffing_realization_lag_months : current.staffing_realization_lag_months;
    const containment_rate = data.containment_rate !== undefined ? data.containment_rate : current.containment_rate;
    const containment_start_rate = data.containment_start_rate !== undefined ? data.containment_start_rate : current.containment_start_rate;
    const containment_ramp_months = data.containment_ramp_months !== undefined ? data.containment_ramp_months : current.containment_ramp_months;
    const escalation_rate = data.escalation_rate !== undefined ? data.escalation_rate : current.escalation_rate;
    const failed_deflection_penalty = data.failed_deflection_penalty !== undefined ? data.failed_deflection_penalty : current.failed_deflection_penalty;
    const churn_rate_uplift = data.churn_rate_uplift !== undefined ? data.churn_rate_uplift : current.churn_rate_uplift;
    const value_per_outcome = data.value_per_outcome !== undefined ? data.value_per_outcome : current.value_per_outcome;

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE services
      SET name = ?, description = ?, status = ?, provider_id = ?,
          avg_input_tokens = ?, avg_output_tokens = ?, avg_requests_per_user_month = ?,
          fixed_cost_per_month = ?, fixed_cost_currency = ?,
          service_type = ?, interaction_driver_type = ?, monthly_volume = ?,
          volume_growth_rate = ?, interactions_per_customer_month = ?,
          fully_loaded_cost_per_fte_month = ?, productive_hours_per_fte_month = ?,
          average_handle_time_seconds = ?, baseline_fte = ?,
          staffing_realization_lag_months = ?, containment_rate = ?,
          containment_start_rate = ?, containment_ramp_months = ?,
          escalation_rate = ?, failed_deflection_penalty = ?, churn_rate_uplift = ?,
          value_per_outcome = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name,
      description || null,
      status,
      provider_id || null,
      avg_input_tokens,
      avg_output_tokens,
      avg_requests_per_user_month,
      fixed_cost_per_month,
      fixed_cost_currency,
      service_type,
      interaction_driver_type,
      monthly_volume,
      volume_growth_rate,
      interactions_per_customer_month,
      fully_loaded_cost_per_fte_month,
      productive_hours_per_fte_month,
      average_handle_time_seconds,
      baseline_fte,
      staffing_realization_lag_months,
      containment_rate,
      containment_start_rate,
      containment_ramp_months,
      escalation_rate,
      failed_deflection_penalty,
      churn_rate_uplift,
      value_per_outcome ?? null,
      now,
      id
    );

    // Invalidate cached results for scenarios using this service
    const affectedScenarios = scenariosRepository.findScenarioIdsByServiceId(id);
    scenariosRepository.invalidateResults(affectedScenarios);
  },

  delete(id: string): void {
    db.transaction(() => {
      // Dependencies will be deleted cascade automatically if schema configured, 
      // but let's double check or explicitly delete from join tables just in case.
      db.prepare("DELETE FROM pack_services WHERE service_id = ?").run(id);
      db.prepare("DELETE FROM plan_services WHERE service_id = ?").run(id);
      db.prepare("DELETE FROM service_dependencies WHERE source_id = ? OR target_id = ?").run(id, id);
      // Clean scenario overrides of the cost items that cascade-delete with this service.
      db.prepare("DELETE FROM scenario_entity_overrides WHERE entity_type = 'cost' AND entity_id IN (SELECT id FROM cost_items WHERE service_id = ?)").run(id);
      db.prepare("DELETE FROM cost_items WHERE service_id = ?").run(id);
      db.prepare("DELETE FROM scenario_services WHERE service_id = ?").run(id);
      db.prepare("DELETE FROM monetization_configs WHERE entity_type = 'service' AND entity_id = ?").run(id);
      db.prepare("DELETE FROM scenario_entity_overrides WHERE entity_type = 'service' AND entity_id = ?").run(id);
      db.prepare("DELETE FROM services WHERE id = ?").run(id);
    })();
  }
};
