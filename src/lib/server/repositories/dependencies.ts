import db from '../db';
import type { ServiceDependency, DependencyType } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export const dependenciesRepository = {
  getAll(): ServiceDependency[] {
    const rows = db.prepare(`
      SELECT d.id, d.source_id, d.target_id, d.dependency_type,
             src.name as source_name, tgt.name as target_name
      FROM service_dependencies d
      JOIN services src ON d.source_id = src.id
      JOIN services tgt ON d.target_id = tgt.id
    `).all() as any[];

    return rows.map(r => ({
      id: r.id,
      source_id: r.source_id,
      target_id: r.target_id,
      dependency_type: r.dependency_type as DependencyType,
      source_name: r.source_name,
      target_name: r.target_name
    }));
  },

  create(data: Omit<ServiceDependency, 'id'>): ServiceDependency {
    const id = uuidv4();
    
    // Check if adding this dependency creates a cycle (only for hard dependencies / 'requires')
    if (data.dependency_type === 'requires' && this.wouldCreateCycle(data.source_id, data.target_id)) {
      throw new Error(`Creating dependency from ${data.source_id} to ${data.target_id} would create a circular dependency.`);
    }

    db.prepare(`
      INSERT INTO service_dependencies (id, source_id, target_id, dependency_type)
      VALUES (?, ?, ?, ?)
    `).run(id, data.source_id, data.target_id, data.dependency_type);

    return {
      id,
      ...data
    };
  },

  delete(id: string): void {
    db.prepare("DELETE FROM service_dependencies WHERE id = ?").run(id);
  },

  deleteByEdge(sourceId: string, targetId: string): void {
    db.prepare("DELETE FROM service_dependencies WHERE source_id = ? AND target_id = ?").run(sourceId, targetId);
  },

  wouldCreateCycle(sourceId: string, targetId: string): boolean {
    // If sourceId and targetId are the same, it is a self-cycle
    if (sourceId === targetId) return true;

    // Search for a path from targetId to sourceId in the dependency graph
    // (i.e. does targetId depend on sourceId?)
    const visited = new Set<string>();
    const queue: string[] = [targetId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === sourceId) return true;

      if (!visited.has(current)) {
        visited.add(current);
        
        // Find all nodes that current node depends on (current requires node)
        const deps = db.prepare(`
          SELECT target_id 
          FROM service_dependencies 
          WHERE source_id = ? AND dependency_type = 'requires'
        `).all(current) as { target_id: string }[];

        for (const dep of deps) {
          queue.push(dep.target_id);
        }
      }
    }

    return false;
  }
};
