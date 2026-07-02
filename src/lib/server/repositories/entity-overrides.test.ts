import { describe, it, expect } from 'vitest';
import { entityOverridesRepository } from './entity-overrides';

// Write-time whitelist for cohort-scoped overrides (ADR 0009 Track B / Corridor Precision Pass).
// Both rejection paths throw before any SQL runs, so no scenario fixtures are needed and the
// tests leave no rows behind.
describe('entityOverridesRepository cohort-scope whitelist', () => {
	it('rejects cohort-scoped overrides on non-whitelisted fields', () => {
		expect(() =>
			entityOverridesRepository.upsert('scen-x', 'service', 'svc-x', { baseline_fte: 5 }, 'cohort-x')
		).toThrow(/not allowed for cohort-scoped overrides/);
	});

	it('rejects cohort scope on non-service entities', () => {
		expect(() =>
			entityOverridesRepository.upsert('scen-x', 'cost', 'cost-x', { amount: 100 }, 'cohort-x')
		).toThrow(/only allowed for entity_type 'service'/);
	});
});
