import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

// Same DB-isolation pattern as export.test.ts: the DB singleton initializes against
// SHERPA_DB_PATH at first import, so every DB-touching module must load dynamically,
// after the env var below is set, or this would run against the real dev data/sherpa.db.
const scratchDbPath = path.join(os.tmpdir(), `sherpa-scenarios-repo-${crypto.randomUUID()}.db`);
process.env.SHERPA_DB_PATH = scratchDbPath;

let scenariosRepository: typeof import('./scenarios').scenariosRepository;
let cohortsRepository: typeof import('./cohorts').cohortsRepository;
let plansRepository: typeof import('./plans').plansRepository;
let poolTiersRepository: typeof import('./pool-tiers').poolTiersRepository;
let runAndSaveScenario: typeof import('../services/financial-engine').runAndSaveScenario;

beforeAll(async () => {
  ({ scenariosRepository } = await import('./scenarios'));
  ({ cohortsRepository } = await import('./cohorts'));
  ({ plansRepository } = await import('./plans'));
  ({ poolTiersRepository } = await import('./pool-tiers'));
  ({ runAndSaveScenario } = await import('../services/financial-engine'));
});

afterAll(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(scratchDbPath + suffix); } catch { /* best-effort cleanup */ }
  }
});

describe('scenariosRepository — modeling_type/revenue_carrier coercion (resolveRevenueModel wiring)', () => {
  function makeCohort() {
    return cohortsRepository.create({
      name: 'Coercion Test Cohort',
      vertical_id: null,
      current_users: 100,
      monthly_acquisition: 0,
      acquisition_growth_rate: 0,
      monthly_churn_rate: 0,
      retention_floor: 0,
      monthly_expansion_rate: 0,
      ai_adoption_rate: 0.5,
      base_arpu: 10
    });
  }

  it('coerces an incompatible modeling_type + revenue_carrier pair on create (incremental + pool -> appraisal)', () => {
    const cohort = makeCohort();
    const scenario = scenariosRepository.create({
      name: 'Create Coercion',
      projection_months: 3,
      discount_rate: 0.1,
      scope_type: 'cohorts',
      cohort_config_ids: [cohort.id],
      modeling_type: 'incremental',
      revenue_carrier: 'pool'
    });

    const stored = scenariosRepository.getById(scenario.id);
    // resolveCarrier('incremental', 'pool') !== 'pool' -> modeling_type is re-derived via
    // deriveModelingType('pool') = 'appraisal'; the explicit revenue_carrier stays authoritative.
    expect(stored?.modeling_type).toBe('appraisal');
    expect(stored?.revenue_carrier).toBe('pool');
  });

  it('leaves a compatible pair untouched on create (gtm + plan)', () => {
    const cohort = makeCohort();
    const scenario = scenariosRepository.create({
      name: 'Create Compatible',
      projection_months: 3,
      discount_rate: 0.1,
      scope_type: 'cohorts',
      cohort_config_ids: [cohort.id],
      modeling_type: 'gtm',
      revenue_carrier: 'plan'
    });

    const stored = scenariosRepository.getById(scenario.id);
    expect(stored?.modeling_type).toBe('gtm');
    expect(stored?.revenue_carrier).toBe('plan');
  });

  it('re-derives modeling_type on update when only revenue_carrier changes', () => {
    const cohort = makeCohort();
    const scenario = scenariosRepository.create({
      name: 'Update Coercion',
      projection_months: 3,
      discount_rate: 0.1,
      scope_type: 'cohorts',
      cohort_config_ids: [cohort.id],
      modeling_type: 'incremental',
      revenue_carrier: 'cohort'
    });
    expect(scenariosRepository.getById(scenario.id)?.modeling_type).toBe('incremental');

    // Supplying only revenue_carrier: 'plan' must re-derive modeling_type to 'gtm' (the stored
    // 'incremental' no longer resolves to the 'plan' carrier), matching the MCP update handler.
    scenariosRepository.update(scenario.id, { revenue_carrier: 'plan' });

    const updated = scenariosRepository.getById(scenario.id);
    expect(updated?.modeling_type).toBe('gtm');
    expect(updated?.revenue_carrier).toBe('plan');
  });
});

describe('scenariosRepository — cache invalidation on linked-entity mutation', () => {
  function makeCohort() {
    return cohortsRepository.create({
      name: 'Invalidation Test Cohort',
      vertical_id: null,
      current_users: 100,
      monthly_acquisition: 0,
      acquisition_growth_rate: 0,
      monthly_churn_rate: 0,
      retention_floor: 0,
      monthly_expansion_rate: 0,
      ai_adoption_rate: 0.5,
      base_arpu: 10
    });
  }

  it('invalidates cached results when a linked plan is updated', () => {
    const cohort = makeCohort();
    const plan = plansRepository.create({ name: 'Invalidation Plan', base_price: 50 });
    const scenario = scenariosRepository.create({
      name: 'Plan Invalidation Scenario',
      projection_months: 3,
      discount_rate: 0.1,
      scope_type: 'cohorts',
      cohort_config_ids: [cohort.id],
      modeling_type: 'gtm',
      revenue_carrier: 'plan',
      plans: [{ id: plan.id, rollout_month: 0, seats: 10 }]
    });

    runAndSaveScenario(scenario.id);
    expect(scenariosRepository.getResults(scenario.id)).not.toBeNull();

    plansRepository.update(plan.id, { base_price: 75 });

    expect(scenariosRepository.getResults(scenario.id)).toBeNull();
  });

  it('invalidates cached results when a linked pool tier is deleted', () => {
    const cohort = makeCohort();
    const tier = poolTiersRepository.create({ name: 'Invalidation Tier', monthly_fee: 20, credit_pool_size: 100 });
    const scenario = scenariosRepository.create({
      name: 'Pool Tier Invalidation Scenario',
      projection_months: 3,
      discount_rate: 0.1,
      scope_type: 'cohorts',
      cohort_config_ids: [cohort.id],
      modeling_type: 'appraisal',
      revenue_carrier: 'pool',
      pool_tier_id: tier.id
    });

    runAndSaveScenario(scenario.id);
    expect(scenariosRepository.getResults(scenario.id)).not.toBeNull();

    poolTiersRepository.delete(tier.id);

    expect(scenariosRepository.getResults(scenario.id)).toBeNull();
  });
});
