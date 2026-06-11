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
        updated_at: ''
      } : null
    }));
  },

  getById(id: string): Service | null {
    const r = db.prepare(`
      SELECT s.id, s.name, s.description, s.status, s.provider_id, 
             s.avg_input_tokens, s.avg_output_tokens, s.avg_requests_per_user_month,
             s.fixed_cost_per_month, s.fixed_cost_currency, s.created_at, s.updated_at,
             p.name as provider_name, p.model_name as provider_model_name,
             p.input_price as provider_input_price, p.output_price as provider_output_price,
             p.currency as provider_currency
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
      INSERT INTO services (id, name, description, status, provider_id, avg_input_tokens, avg_output_tokens, avg_requests_per_user_month, fixed_cost_per_month, fixed_cost_currency, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      now,
      now
    );
    
    return {
      id,
      ...data,
      fixed_cost_currency,
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
    const now = new Date().toISOString();
    
    db.prepare(`
      UPDATE services
      SET name = ?, description = ?, status = ?, provider_id = ?, 
          avg_input_tokens = ?, avg_output_tokens = ?, avg_requests_per_user_month = ?, 
          fixed_cost_per_month = ?, fixed_cost_currency = ?, updated_at = ?
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
      db.prepare("DELETE FROM cost_items WHERE service_id = ?").run(id);
      db.prepare("DELETE FROM scenario_services WHERE service_id = ?").run(id);
      db.prepare("DELETE FROM services WHERE id = ?").run(id);
    })();
  }
};
