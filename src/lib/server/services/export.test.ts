import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

// The DB singleton (src/lib/server/db.ts) initializes against SHERPA_DB_PATH at first
// import, and static `import` declarations are evaluated before any of this file's own
// top-level statements — so every DB-touching module must be loaded dynamically, after the
// env var below is set, or this test would run against the real dev data/sherpa.db.
const scratchDbPath = path.join(os.tmpdir(), `sherpa-export-roundtrip-${crypto.randomUUID()}.db`);
process.env.SHERPA_DB_PATH = scratchDbPath;

let providersRepository: typeof import('../repositories/providers').providersRepository;
let cohortsRepository: typeof import('../repositories/cohorts').cohortsRepository;
let servicesRepository: typeof import('../repositories/services').servicesRepository;
let scenariosRepository: typeof import('../repositories/scenarios').scenariosRepository;
let monetizationRepository: typeof import('../repositories/monetization').monetizationRepository;
let poolTiersRepository: typeof import('../repositories/pool-tiers').poolTiersRepository;
let exportScenarioToJSON: typeof import('./export').exportScenarioToJSON;
let importPOST: typeof import('../../../routes/api/import/+server').POST;

beforeAll(async () => {
  ({ providersRepository } = await import('../repositories/providers'));
  ({ cohortsRepository } = await import('../repositories/cohorts'));
  ({ servicesRepository } = await import('../repositories/services'));
  ({ scenariosRepository } = await import('../repositories/scenarios'));
  ({ monetizationRepository } = await import('../repositories/monetization'));
  ({ poolTiersRepository } = await import('../repositories/pool-tiers'));
  ({ exportScenarioToJSON } = await import('./export'));
  ({ POST: importPOST } = await import('../../../routes/api/import/+server'));
});

afterAll(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(scratchDbPath + suffix); } catch { /* best-effort cleanup */ }
  }
});

describe('scenario JSON export/import round-trip', () => {
  it('preserves modeling_type, revenue_carrier, and pool tier config (ADR 0001–0004, 0010)', async () => {
    const provider = providersRepository.create({
      name: 'Anthropic',
      model_name: 'Claude Fable 5',
      input_price: 10,
      output_price: 50,
      is_predefined: false,
      currency: 'USD',
      input_tokens_per_credit: 100000,
      output_tokens_per_credit: 20000
    });

    const cohort = cohortsRepository.create({
      name: 'Pool Round-Trip Cohort',
      vertical_id: null,
      current_users: 1000,
      monthly_acquisition: 40,
      acquisition_growth_rate: 0,
      monthly_churn_rate: 0.04,
      retention_floor: 0.6,
      monthly_expansion_rate: 0.02,
      ai_adoption_rate: 0.3,
      base_arpu: 20
    });

    const service = servicesRepository.create({
      name: 'Fable 5 (Included Pool)',
      status: 'planned',
      provider_id: provider.id,
      avg_input_tokens: 8000,
      avg_output_tokens: 3000,
      avg_requests_per_user_month: 40,
      service_type: 'copilot'
    });
    monetizationRepository.upsert('service', service.id, {
      monetization_type: 'usage',
      usage_variant: 'payg',
      price_per_credit: 1
    });

    const poolTier = poolTiersRepository.create({
      name: 'Fable 5 Included Pool',
      monthly_fee: 20,
      credit_pool_size: 2.5,
      capture: 0.3,
      burn_rates: [{ service_id: service.id, burn_rate: 1 }]
    });

    const scenario = scenariosRepository.create({
      name: 'Pool Round-Trip Scenario',
      description: 'export/import round-trip coverage for ADR 0001-0004 + 0010 fields',
      projection_months: 12,
      discount_rate: 0.1,
      scope_type: 'cohorts',
      cohort_config_ids: [cohort.id],
      services: [{ id: service.id, rollout_month: 0 }],
      modeling_type: 'appraisal',
      revenue_carrier: 'pool',
      pool_tier_id: poolTier.id
    });

    // 1. Export must include the carrier + pool fields (previously silently dropped).
    const json = exportScenarioToJSON(scenario.id);
    const snapshot = JSON.parse(json);
    expect(snapshot.scenario.modeling_type).toBe('appraisal');
    expect(snapshot.scenario.revenue_carrier).toBe('pool');
    expect(snapshot.scenario.pool_tier).toMatchObject({
      name: 'Fable 5 Included Pool',
      monthly_fee: 20,
      credit_pool_size: 2.5,
      capture: 0.3
    });
    expect(snapshot.scenario.pool_burn_rates).toEqual([
      { service_name: 'Fable 5 (Included Pool)', burn_rate: 1 }
    ]);

    // 2. Re-importing that JSON must reconstruct the same carrier + pool config under new ids.
    const importRequest = new Request('http://localhost/api/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: json
    });
    const response = await importPOST({ request: importRequest } as Parameters<typeof importPOST>[0]);
    const importResult = await response.json();
    expect(importResult.success).toBe(true);
    expect(importResult.scenarioId).not.toBe(scenario.id);

    // Pool tiers are deduped by name on import, same as every other catalog entity in this
    // route (providers/cohorts/services/packs/plans/costs) — a same-DB round-trip reattaches
    // to the existing tier rather than cloning it, so the id is expected to be unchanged.
    const imported = scenariosRepository.getById(importResult.scenarioId);
    expect(imported?.modeling_type).toBe('appraisal');
    expect(imported?.revenue_carrier).toBe('pool');
    expect(imported?.pool_tier_id).toBe(poolTier.id);

    const importedTier = poolTiersRepository.getById(imported!.pool_tier_id!);
    expect(importedTier).toMatchObject({
      name: 'Fable 5 Included Pool',
      monthly_fee: 20,
      credit_pool_size: 2.5,
      capture: 0.3
    });

    const importedBurnRates = poolTiersRepository.getBurnRates(imported!.pool_tier_id!);
    expect(importedBurnRates).toHaveLength(1);
    expect(importedBurnRates[0].burn_rate).toBe(1);
    expect(importedBurnRates[0].service_name).toBe('Fable 5 (Included Pool)');
  });
});
