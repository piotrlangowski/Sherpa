import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import db from '$lib/server/db';
import { providersRepository } from '$lib/server/repositories/providers';
import { verticalsRepository } from '$lib/server/repositories/verticals';
import { cohortsRepository } from '$lib/server/repositories/cohorts';
import { servicesRepository } from '$lib/server/repositories/services';
import { dependenciesRepository } from '$lib/server/repositories/dependencies';
import { packsRepository } from '$lib/server/repositories/packs';
import { plansRepository } from '$lib/server/repositories/plans';
import { costsRepository } from '$lib/server/repositories/costs';
import { scenariosRepository } from '$lib/server/repositories/scenarios';
import { runAndSaveScenario } from '$lib/server/services/financial-engine';
import { monetizationRepository } from '$lib/server/repositories/monetization';
import { entityOverridesRepository } from '$lib/server/repositories/entity-overrides';
import { poolTiersRepository } from '$lib/server/repositories/pool-tiers';
import { MonetizationConfigSchema } from '$lib/types/schemas';
import type { MonetizationConfig, EntityOverride } from '$lib/types';

// Zod schemas for snapshot validation
const ProviderSchema = z.object({
  name: z.string(),
  model_name: z.string(),
  input_price: z.number(),
  output_price: z.number(),
  is_predefined: z.boolean().optional(),
  input_tokens_per_credit: z.number().optional(),
  output_tokens_per_credit: z.number().optional()
});

const ServiceDependencySchema = z.object({
  dependency_type: z.enum(['requires', 'enhanced_by', 'replaces']),
  source_name: z.string().optional(),
  target_name: z.string().optional()
});

const ServiceSchema = z.object({
  name: z.string(),
  description: z.string().nullable().optional(),
  status: z.enum(['planned', 'existing']),
  avg_input_tokens: z.number().optional(),
  avg_output_tokens: z.number().optional(),
  avg_requests_per_user_month: z.number().optional(),
  fixed_cost_per_month: z.number().nullable().optional(),
  rollout_month: z.number().optional(),
  provider: ProviderSchema.nullable().optional(),
  dependencies: z.array(ServiceDependencySchema).optional(),
  monetization: MonetizationConfigSchema.optional()
});

const PackSchema = z.object({
  name: z.string(),
  description: z.string().nullable().optional(),
  rollout_month: z.number().optional(),
  services: z.array(z.union([z.string(), z.object({ id: z.string(), name: z.string() })])).optional(),
  monetization: MonetizationConfigSchema.optional()
});

const PlanSchema = z.object({
  name: z.string(),
  description: z.string().nullable().optional(),
  base_price: z.number(),
  rollout_month: z.number().optional(),
  seats: z.number().optional(),
  services: z.array(z.union([z.string(), z.object({ id: z.string(), name: z.string() })])).optional(),
  packs: z.array(z.union([z.string(), z.object({ id: z.string(), name: z.string() })])).optional(),
  monetization: MonetizationConfigSchema.optional()
});

/** Per-scenario entity override entry in a snapshot. Keyed by entity NAME (+ provider model) for portability. */
const EntityOverrideEntrySchema = z.object({
  entity_type: z.enum(['service', 'cost', 'provider', 'plan']),
  entity_name: z.string(),
  entity_model_name: z.string().optional(),
  override: z.object({
    avg_input_tokens: z.number().nullable().optional(),
    avg_output_tokens: z.number().nullable().optional(),
    avg_requests_per_user_month: z.number().nullable().optional(),
    fixed_cost_per_month: z.number().nullable().optional(),
    amount: z.number().nullable().optional(),
    frequency: z.enum(['one_time', 'monthly', 'yearly']).nullable().optional(),
    input_price: z.number().nullable().optional(),
    output_price: z.number().nullable().optional(),
    base_price: z.number().nullable().optional()
  })
});

// Revenue modeling (ADR 0001–0004) + credit pool (ADR 0010) — round-trip fields.
const ModelingTypeSchema = z.enum(['incremental', 'gtm', 'appraisal']);
const RevenueCarrierSchema = z.enum(['cohort', 'plan', 'pack', 'feature', 'pool']);
const RevenueBridgeSchema = z.enum(['upsell_on_cohort', 'separate_market']);

const PoolTierSchema = z.object({
  name: z.string(),
  monthly_fee: z.number(),
  credit_pool_size: z.number(),
  capture: z.number().nullable().optional(),
  fee_basis: z.enum(['flat', 'per_member', 'per_customer']).optional(),
  pool_size_basis: z.enum(['absolute', 'per_member']).optional()
});

const PoolBurnRateEntrySchema = z.object({
  service_name: z.string(),
  burn_rate: z.number()
});

const CostItemSchema = z.object({
  name: z.string(),
  category: z.enum(['capex', 'opex']),
  subcategory: z.string().nullable().optional(),
  amount: z.number(),
  frequency: z.enum(['one_time', 'monthly', 'yearly']),
  service_name: z.string().optional()
});

const VerticalSchema = z.object({
  name: z.string(),
  description: z.string().nullable().optional(),
  tam_users: z.number().optional(),
  sam_users: z.number().optional(),
  som_users: z.number().optional()
});

const CohortConfigSchema = z.object({
  name: z.string(),
  current_users: z.number(),
  monthly_acquisition: z.number(),
  acquisition_growth_rate: z.number(),
  monthly_churn_rate: z.number(),
  retention_floor: z.number(),
  monthly_expansion_rate: z.number(),
  ai_adoption_rate: z.number(),
  base_arpu: z.number(),
  arpu_uplift: z.number().optional(),
  arpu_uplift_percent: z.number().optional(),
  churn_reduction: z.number().optional(),
  acquisition_uplift: z.number().optional(),
  vertical: VerticalSchema.optional()
});

const ScopeOverrideSchema = z.object({
  target_type: z.enum(['all_clients', 'vertical', 'cohort']),
  target_name: z.string().nullable().optional(), // We use name for matching during import
  monthly_churn_rate: z.number().nullable().optional(),
  monthly_acquisition: z.number().nullable().optional(),
  acquisition_growth_rate: z.number().nullable().optional(),
  ai_adoption_rate: z.number().nullable().optional(),
  retention_floor: z.number().nullable().optional(),
  expansion_rate: z.number().nullable().optional(),
  arpu_override: z.number().nullable().optional(),
  arpu_uplift: z.number().nullable().optional(),
  arpu_uplift_percent: z.number().nullable().optional(),
  churn_reduction: z.number().nullable().optional(),
  acquisition_uplift: z.number().nullable().optional()
});

const ScenarioSchema = z.object({
  name: z.string(),
  description: z.string().nullable().optional(),
  projection_months: z.number(),
  discount_rate: z.number(),
  scope_type: z.enum(['all_clients', 'verticals', 'cohorts']),
  scope_verticals: z.array(VerticalSchema).optional(),
  scope_cohorts: z.array(CohortConfigSchema).optional(),
  scope_overrides: z.array(ScopeOverrideSchema).optional(),
  services: z.array(ServiceSchema).optional(),
  packs: z.array(PackSchema).optional(),
  plans: z.array(PlanSchema).optional(),
  costs: z.array(CostItemSchema).optional(),
  monetization_overrides: z.array(z.object({
    entity_type: z.enum(['service', 'pack', 'plan']),
    entity_name: z.string(),
    config: MonetizationConfigSchema
  })).optional(),
  entity_overrides: z.array(EntityOverrideEntrySchema).optional(),
  evc_nba_annual_value: z.number().nullable().optional(),
  evc_extra_positive_value: z.number().nullable().optional(),
  evc_negative_value: z.number().nullable().optional(),
  evc_capture_ceiling_pct: z.number().nullable().optional(),
  evc_capture_target_pct: z.number().nullable().optional(),
  evc_capture_floor_pct: z.number().nullable().optional(),
  modeling_type: ModelingTypeSchema.optional(),
  revenue_carrier: RevenueCarrierSchema.nullable().optional(),
  revenue_bridge: RevenueBridgeSchema.nullable().optional(),
  pool_tier: PoolTierSchema.nullable().optional(),
  pool_burn_rates: z.array(PoolBurnRateEntrySchema).optional()
});

const SnapshotSchema = z.object({
  version: z.string(),
  scenario: ScenarioSchema
});

export const POST: RequestHandler = async ({ request }) => {
  try {
    const rawBody = await request.json();
    const parseResult = SnapshotSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return json({ success: false, errors: parseResult.error.flatten() }, { status: 400 });
    }

    const { scenario } = parseResult.data;
    let newScenarioId: string | null = null;

    // Use a database transaction to ensure atomicity
    db.transaction(() => {
      // 1. Import Providers
      const providerIdMap = new Map<string, string>(); // (name + model_name) -> ID
      if (scenario.services) {
        for (const s of scenario.services) {
          if (s.provider) {
            const key = `${s.provider.name}::${s.provider.model_name}`;
            if (!providerIdMap.has(key)) {
              // Check if exists in DB
              const existing = db.prepare('SELECT id FROM providers WHERE name = ? AND model_name = ?')
                .get(s.provider.name, s.provider.model_name) as { id: string } | undefined;

              if (existing) {
                providerIdMap.set(key, existing.id);
              } else {
                const created = providersRepository.create({
                  name: s.provider.name,
                  model_name: s.provider.model_name,
                  input_price: s.provider.input_price,
                  output_price: s.provider.output_price,
                  is_predefined: s.provider.is_predefined ?? false,
                  currency: 'USD',
                  input_tokens_per_credit: s.provider.input_tokens_per_credit ?? 1000000,
                  output_tokens_per_credit: s.provider.output_tokens_per_credit ?? 333333
                });
                providerIdMap.set(key, created.id);
              }
            }
          }
        }
      }

      // 2. Import Verticals
      const verticalIdMap = new Map<string, string>();
      const verticalIds: string[] = [];
      if (scenario.scope_verticals) {
        for (const v of scenario.scope_verticals) {
          const existingV = db.prepare('SELECT id FROM verticals WHERE name = ?')
            .get(v.name) as { id: string } | undefined;

          let vId = '';
          if (existingV) {
            vId = existingV.id;
          } else {
            const createdV = verticalsRepository.create({
              name: v.name,
              description: v.description || '',
              tam_users: v.tam_users ?? 0,
              sam_users: v.sam_users ?? 0,
              som_users: v.som_users ?? 0
            });
            vId = createdV.id;
          }
          verticalIdMap.set(v.name, vId);
          verticalIds.push(vId);
        }
      }

      // 3. Import Cohorts
      const cohortIdMap = new Map<string, string>();
      const cohortIds: string[] = [];
      if (scenario.scope_cohorts) {
        for (const cc of scenario.scope_cohorts) {
          let vId: string | null = null;
          if (cc.vertical) {
            if (verticalIdMap.has(cc.vertical.name)) {
              vId = verticalIdMap.get(cc.vertical.name)!;
            } else {
              const existingV = db.prepare('SELECT id FROM verticals WHERE name = ?')
                .get(cc.vertical.name) as { id: string } | undefined;
              if (existingV) {
                vId = existingV.id;
                verticalIdMap.set(cc.vertical.name, vId);
              } else {
                const createdV = verticalsRepository.create({
                  name: cc.vertical.name,
                  description: cc.vertical.description || '',
                  tam_users: cc.vertical.tam_users ?? 0,
                  sam_users: cc.vertical.sam_users ?? 0,
                  som_users: cc.vertical.som_users ?? 0
                });
                vId = createdV.id;
                verticalIdMap.set(cc.vertical.name, vId);
              }
            }
          }

          const existingCc = db.prepare('SELECT id FROM cohort_configs WHERE name = ?')
            .get(cc.name) as { id: string } | undefined;

          let cId = '';
          if (existingCc) {
            cId = existingCc.id;
          } else {
            const createdCc = cohortsRepository.create({
              name: cc.name,
              vertical_id: vId,
              current_users: cc.current_users,
              monthly_acquisition: cc.monthly_acquisition,
              acquisition_growth_rate: cc.acquisition_growth_rate,
              monthly_churn_rate: cc.monthly_churn_rate,
              retention_floor: cc.retention_floor,
              monthly_expansion_rate: cc.monthly_expansion_rate,
              ai_adoption_rate: cc.ai_adoption_rate,
              base_arpu: cc.base_arpu,
              arpu_uplift: cc.arpu_uplift ?? 0,
              arpu_uplift_percent: cc.arpu_uplift_percent ?? 0,
              churn_reduction: cc.churn_reduction ?? 0,
              acquisition_uplift: cc.acquisition_uplift ?? 0
            });
            cId = createdCc.id;
          }
          cohortIdMap.set(cc.name, cId);
          cohortIds.push(cId);
        }
      }

      // 4. Import Services & Resolve Dependencies
      const serviceIdMap = new Map<string, string>(); // service name -> database ID
      const serviceRollouts: { id: string; rollout_month: number }[] = [];
      const serviceDepsToCreate: { sourceName: string; targetName: string; type: 'requires' | 'enhanced_by' | 'replaces' }[] = [];

      if (scenario.services) {
        for (const s of scenario.services) {
          const existingS = db.prepare('SELECT id FROM services WHERE name = ?')
            .get(s.name) as { id: string } | undefined;

          let sId = '';
          if (existingS) {
            sId = existingS.id;
          } else {
            const providerId = s.provider ? (providerIdMap.get(`${s.provider.name}::${s.provider.model_name}`) || null) : null;
            const createdS = servicesRepository.create({
              name: s.name,
              description: s.description || '',
              status: s.status,
              provider_id: providerId,
              avg_input_tokens: s.avg_input_tokens ?? 0,
              avg_output_tokens: s.avg_output_tokens ?? 0,
              avg_requests_per_user_month: s.avg_requests_per_user_month ?? 0,
              fixed_cost_per_month: s.fixed_cost_per_month ?? null
            });
            sId = createdS.id;
            if (s.monetization) monetizationRepository.upsert('service', sId, s.monetization as MonetizationConfig);
          }

          serviceIdMap.set(s.name, sId);
          serviceRollouts.push({ id: sId, rollout_month: s.rollout_month ?? 0 });

          // Accumulate dependencies to resolve in second pass
          if (s.dependencies) {
            for (const dep of s.dependencies) {
              const targetName = dep.target_name || (dep as any).target_id; // backward compatibility
              if (targetName) {
                serviceDepsToCreate.push({
                  sourceName: s.name,
                  targetName,
                  type: dep.dependency_type
                });
              }
            }
          }
        }
      }

      // Create Service Dependencies
      for (const dep of serviceDepsToCreate) {
        const sourceId = serviceIdMap.get(dep.sourceName);
        const targetId = serviceIdMap.get(dep.targetName);

        if (sourceId && targetId) {
          const existingDep = db.prepare('SELECT id FROM service_dependencies WHERE source_id = ? AND target_id = ?')
            .get(sourceId, targetId);

          if (!existingDep) {
            try {
              dependenciesRepository.create({
                source_id: sourceId,
                target_id: targetId,
                dependency_type: dep.type
              });
            } catch (err) {
              console.error(`Skipped dependency creation from ${dep.sourceName} to ${dep.targetName}:`, err);
            }
          }
        }
      }

      // 5. Import Packs
      const packIdMap = new Map<string, string>(); // pack name -> database ID
      const packRollouts: { id: string; rollout_month: number }[] = [];
      if (scenario.packs) {
        for (const p of scenario.packs) {
          const existingP = db.prepare('SELECT id FROM packs WHERE name = ?')
            .get(p.name) as { id: string } | undefined;

          let pId = '';
          if (existingP) {
            pId = existingP.id;
          } else {
            // Resolve service IDs
            const serviceIds: string[] = [];
            if (p.services) {
              for (const ps of p.services) {
                const sName = typeof ps === 'string' ? ps : ps.name;
                const sId = serviceIdMap.get(sName) || (typeof ps === 'object' ? ps.id : null);
                if (sId) serviceIds.push(sId);
              }
            }

            const createdP = packsRepository.create({
              name: p.name,
              description: p.description || '',
              service_ids: serviceIds
            });
            pId = createdP.id;
            if (p.monetization) monetizationRepository.upsert('pack', pId, p.monetization as MonetizationConfig);
          }

          packIdMap.set(p.name, pId);
          packRollouts.push({ id: pId, rollout_month: p.rollout_month ?? 0 });
        }
      }

      // 6. Import Plans
      const planIdMap = new Map<string, string>(); // plan name -> database ID
      const planRollouts: { id: string; rollout_month: number; seats: number }[] = [];
      if (scenario.plans) {
        for (const pl of scenario.plans) {
          const existingPl = db.prepare('SELECT id FROM plans WHERE name = ?')
            .get(pl.name) as { id: string } | undefined;

          let plId = '';
          if (existingPl) {
            plId = existingPl.id;
          } else {
            // Resolve service and pack IDs
            const serviceIds: string[] = [];
            const packIds: string[] = [];

            if (pl.services) {
              for (const s of pl.services) {
                const sName = typeof s === 'string' ? s : s.name;
                const sId = serviceIdMap.get(sName) || (typeof s === 'object' ? s.id : null);
                if (sId) serviceIds.push(sId);
              }
            }

            if (pl.packs) {
              for (const pk of pl.packs) {
                const pkName = typeof pk === 'string' ? pk : pk.name;
                const pkId = packIdMap.get(pkName) || (typeof pk === 'object' ? pk.id : null);
                if (pkId) packIds.push(pkId);
              }
            }

            const createdPl = plansRepository.create({
              name: pl.name,
              description: pl.description || '',
              base_price: pl.base_price,
              service_ids: serviceIds,
              pack_ids: packIds
            });
            plId = createdPl.id;
            if (pl.monetization) monetizationRepository.upsert('plan', plId, pl.monetization as MonetizationConfig);
          }

          planIdMap.set(pl.name, plId);
          planRollouts.push({ id: plId, rollout_month: pl.rollout_month ?? 0, seats: pl.seats ?? 0 });
        }
      }

      // 7. Import Cost Items
      const costIds: string[] = [];
      const costIdMap = new Map<string, string>(); // cost name -> database ID
      if (scenario.costs) {
        for (const c of scenario.costs) {
          const existingC = db.prepare('SELECT id FROM cost_items WHERE name = ?')
            .get(c.name) as { id: string } | undefined;

          let cId = '';
          if (existingC) {
            cId = existingC.id;
          } else {
            const serviceId = c.service_name ? (serviceIdMap.get(c.service_name) || null) : null;
            const createdC = costsRepository.create({
              name: c.name,
              category: c.category,
              subcategory: c.subcategory || '',
              amount: c.amount,
              frequency: c.frequency,
              currency: 'USD',
              service_id: serviceId
            });
            cId = createdC.id;
          }
          costIds.push(cId);
          costIdMap.set(c.name, cId);
        }
      }

      // 7.5 Import Pool Tier (ADR 0010) — after services, so burn rates can map service_name -> id.
      let poolTierId: string | null = null;
      if (scenario.pool_tier) {
        const burnRates = (scenario.pool_burn_rates ?? [])
          .map((br) => ({ service_id: serviceIdMap.get(br.service_name), burn_rate: br.burn_rate }))
          .filter((br): br is { service_id: string; burn_rate: number } => !!br.service_id);

        const existingTier = db.prepare('SELECT id FROM pool_tiers WHERE name = ?')
          .get(scenario.pool_tier.name) as { id: string } | undefined;

        if (existingTier) {
          poolTierId = existingTier.id;
        } else {
          const createdTier = poolTiersRepository.create({
            name: scenario.pool_tier.name,
            monthly_fee: scenario.pool_tier.monthly_fee,
            credit_pool_size: scenario.pool_tier.credit_pool_size,
            capture: scenario.pool_tier.capture ?? null,
            fee_basis: scenario.pool_tier.fee_basis ?? 'flat',
            pool_size_basis: scenario.pool_tier.pool_size_basis ?? 'absolute',
            burn_rates: burnRates
          });
          poolTierId = createdTier.id;
        }
      }

      // 8. Find Unique Name for Scenario
      let baseName = scenario.name;
      if (db.prepare('SELECT id FROM scenarios WHERE name = ?').get(baseName)) {
        baseName = `${baseName} (Imported)`;
      }

      let uniqueName = baseName;
      let counter = 2;
      while (db.prepare('SELECT id FROM scenarios WHERE name = ?').get(uniqueName)) {
        uniqueName = `${baseName} ${counter}`;
        counter++;
      }

      // 9. Prepare Overrides
      const overrides: any[] = [];
      if (scenario.scope_overrides) {
        for (const ov of scenario.scope_overrides) {
          let targetId = null;
          if (ov.target_name) {
            if (ov.target_type === 'vertical') targetId = verticalIdMap.get(ov.target_name) || null;
            if (ov.target_type === 'cohort') targetId = cohortIdMap.get(ov.target_name) || null;
          }
          
          overrides.push({
            target_type: ov.target_type,
            target_id: targetId,
            monthly_churn_rate: ov.monthly_churn_rate,
            monthly_acquisition: ov.monthly_acquisition,
            acquisition_growth_rate: ov.acquisition_growth_rate,
            ai_adoption_rate: ov.ai_adoption_rate,
            retention_floor: ov.retention_floor,
            expansion_rate: ov.expansion_rate,
            arpu_override: ov.arpu_override,
            arpu_uplift: ov.arpu_uplift,
            arpu_uplift_percent: ov.arpu_uplift_percent,
            churn_reduction: ov.churn_reduction,
            acquisition_uplift: ov.acquisition_uplift
          });
        }
      }

      // 10. Create the Scenario
      const createdScenario = scenariosRepository.create({
        name: uniqueName,
        description: scenario.description || '',
        projection_months: scenario.projection_months,
        discount_rate: scenario.discount_rate,
        scope_type: scenario.scope_type,
        vertical_ids: verticalIds,
        cohort_config_ids: cohortIds,
        scope_overrides: overrides,
        services: serviceRollouts,
        packs: packRollouts,
        plans: planRollouts,
        cost_ids: costIds,
        evc_nba_annual_value: scenario.evc_nba_annual_value ?? null,
        evc_extra_positive_value: scenario.evc_extra_positive_value ?? null,
        evc_negative_value: scenario.evc_negative_value ?? null,
        evc_capture_ceiling_pct: scenario.evc_capture_ceiling_pct ?? null,
        evc_capture_target_pct: scenario.evc_capture_target_pct ?? null,
        evc_capture_floor_pct: scenario.evc_capture_floor_pct ?? null,
        modeling_type: scenario.modeling_type,
        revenue_carrier: scenario.revenue_carrier ?? null,
        revenue_bridge: scenario.revenue_bridge ?? null,
        pool_tier_id: poolTierId
      });

      newScenarioId = createdScenario.id;

      // Recreate scenario-level monetization overrides (entity name → newly created id).
      if (scenario.monetization_overrides) {
        for (const ov of scenario.monetization_overrides) {
          const mappedId =
            ov.entity_type === 'service' ? serviceIdMap.get(ov.entity_name) :
            ov.entity_type === 'pack' ? packIdMap.get(ov.entity_name) :
            planIdMap.get(ov.entity_name);
          if (mappedId) {
            monetizationRepository.upsert(ov.entity_type, mappedId, ov.config as MonetizationConfig, newScenarioId);
          }
        }
      }

      // Recreate scenario-level entity overrides (entity name → newly created id).
      // Providers match by name + model_name (the same key used when importing providers above).
      if (scenario.entity_overrides) {
        for (const eo of scenario.entity_overrides) {
          let mappedId: string | undefined;
          if (eo.entity_type === 'service') mappedId = serviceIdMap.get(eo.entity_name);
          else if (eo.entity_type === 'plan') mappedId = planIdMap.get(eo.entity_name);
          else if (eo.entity_type === 'cost') mappedId = costIdMap.get(eo.entity_name);
          else if (eo.entity_type === 'provider') mappedId = providerIdMap.get(`${eo.entity_name}::${eo.entity_model_name ?? ''}`);
          if (mappedId && newScenarioId) {
            entityOverridesRepository.upsert(newScenarioId, eo.entity_type, mappedId, eo.override as EntityOverride);
          }
        }
      }

      // 9. Run ROI calculation
      runAndSaveScenario(newScenarioId);
    })();

    return json({ success: true, scenarioId: newScenarioId });
  } catch (err: any) {
    console.error('Scenario import error:', err);
    return json({ success: false, message: err.message }, { status: 500 });
  }
};
