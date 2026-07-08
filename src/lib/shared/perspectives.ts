import type { Scenario, Provider, CreditSettings, ModelingType, RevenueCarrier, CohortConfig, CompositeBreakdown } from './types.js';
import { cloneScenario, validateRevenueIntegrity, computeImpliedPopulation, calculateScenario, resolveCarrier, resolveCompositeComponents } from './financial-math.js';

export type PerspectiveModule = 'cohort' | 'plan' | 'monetization' | 'pool';

export interface PerspectiveResult {
  module: PerspectiveModule;
  carrier: RevenueCarrier;
  isActive: boolean;
  filled: boolean;
  integrity: { status: string; severity: string; message: string | null };
  npvUpper: number;
  npvLower: number;
  paybackUpper: number | null;
  paybackLower: number | null;
  piUpper: number;
  piLower: number;
  irr: any;
  revenuePv: number;
}

export interface PerspectiveDelta {
  fromModule: PerspectiveModule | 'composite';
  toModule: PerspectiveModule;
  deltaNpvUpper: number;
  deltaRevenuePv: number;
  explanation: string;
}

export interface PerspectiveRelation {
  moduleA: PerspectiveModule;
  moduleB: PerspectiveModule;
  kind: 'additive' | 'contained' | 'exclusive_billing' | 'cross_check' | 'blocked';
  incommensurable: boolean;
  reason: string;
}

export interface TriangulationResult {
  activeModule: PerspectiveModule | 'composite';
  activeMode: 'single' | 'composite';
  perspectives: PerspectiveResult[];
  deltas: PerspectiveDelta[];
  relations: PerspectiveRelation[];
  compositeBreakdown?: CompositeBreakdown | null;
}

export function isModuleFilled(scenario: Scenario, module: PerspectiveModule): boolean {
  switch (module) {
    case 'cohort':
      return (scenario.scope_cohorts ?? []).some(c =>
        (c.arpu_uplift ?? 0) > 0 ||
        (c.arpu_uplift_percent ?? 0) > 0 ||
        (c.churn_reduction ?? 0) > 0 ||
        (c.acquisition_uplift ?? 0) > 0
      );
    case 'plan':
      return (scenario.plans ?? []).some(p => (p.seats ?? 0) > 0);
    case 'monetization':
      return (scenario.services ?? []).some(s => s.monetization && s.monetization.monetization_type !== 'none');
    case 'pool':
      return !!scenario.pool_tier_id && (!scenario.pool_burn_rates || scenario.pool_burn_rates.length > 0);
  }
}

export function getActiveModule(scenario: Scenario): PerspectiveModule | 'composite' {
  // Same resolution the engine gates on — never re-derive the carrier from
  // modeling_type alone (an (appraisal, plan) pair is invariant-consistent and
  // reachable via duplication, and used to fall through to 'cohort' here).
  const carrier = resolveCarrier(scenario.modeling_type, scenario.revenue_carrier);
  switch (carrier) {
    case 'composite': return 'composite';
    case 'plan': return 'plan';
    case 'feature':
    case 'pack': return 'monetization';
    case 'pool': return 'pool';
    case 'cohort':
    default: return 'cohort';
  }
}

export function buildPerspectiveVariant(assembled: Scenario, module: PerspectiveModule): Scenario {
  const cloned = cloneScenario(assembled);
  if (module === 'cohort') {
    cloned.modeling_type = 'incremental';
    cloned.revenue_carrier = 'cohort';
    cloned.revenue_bridge = null;
    cloned.plans = (cloned.plans ?? []).map(p => ({ ...p, seats: 0 }));
    cloned.services = (cloned.services ?? []).map(s => {
      if (s.service_type !== 'agent' && s.monetization) {
        return {
          ...s,
          monetization: {
            ...s.monetization,
            monetization_type: 'none'
          }
        };
      }
      return s;
    });
  } else if (module === 'plan') {
    cloned.modeling_type = 'gtm';
    cloned.revenue_carrier = 'plan';
  } else if (module === 'monetization') {
    cloned.modeling_type = 'appraisal';
    cloned.revenue_carrier = 'feature';
  } else if (module === 'pool') {
    cloned.modeling_type = 'appraisal';
    cloned.revenue_carrier = 'pool';
  }
  return cloned;
}

export function calculateRevenuePv(timeline: { revenue: number }[], annualDiscountRate: number): number {
  const rMonthly = Math.pow(1 + annualDiscountRate, 1 / 12) - 1;
  let pv = 0;
  for (let t = 0; t < timeline.length; t++) {
    pv += (timeline[t].revenue || 0) / Math.pow(1 + rMonthly, t);
  }
  return parseFloat(pv.toFixed(2));
}

const MODULE_SHORT_CODES: Record<PerspectiveModule, string> = {
  cohort: 'INC',
  plan: 'GTM',
  monetization: 'USE',
  pool: 'POOL'
};

// Half a cent — avoids "more"/"less" flapping on floating-point rounding dust
// when the two perspectives land within a cent of each other.
const DELTA_EPS = 0.005;

/**
 * Explains a perspective delta in the direction and magnitude actually observed
 * (deltaNpvUpper), not just a static description of the target module — a sentence
 * that doesn't reference the delta can't tell the reader whether the alternative
 * perspective is better or worse than the active one.
 */
export function generateExplanation(
  fromModule: PerspectiveModule | 'composite',
  toModule: PerspectiveModule,
  scenario: Scenario,
  deltaNpvUpper: number
): string {
  const impliedPop = Math.round(computeImpliedPopulation(scenario.scope_cohorts ?? []));
  const plans = scenario.plans ?? [];
  const totalSeats = plans.reduce((sum, p) => sum + (p.seats ?? 0), 0);
  const avgPrice = plans.length > 0 ? parseFloat((plans.reduce((sum, p) => sum + (p.base_price ?? 0), 0) / plans.length).toFixed(2)) : 0;

  const cohorts = scenario.scope_cohorts ?? [];
  const avgUpliftPercent = cohorts.length > 0 ? (cohorts.reduce((sum, c) => sum + (c.arpu_uplift_percent ?? 0), 0) / cohorts.length * 100).toFixed(1) : '0';
  const avgUplift = cohorts.length > 0 ? (cohorts.reduce((sum, c) => sum + (c.arpu_uplift ?? 0), 0) / cohorts.length).toFixed(2) : '0';

  const fromCode = fromModule === 'composite' ? 'CMP' : MODULE_SHORT_CODES[fromModule];
  const toCode = MODULE_SHORT_CODES[toModule];
  const comparison = deltaNpvUpper > DELTA_EPS
    ? `${toCode} books more NPV than the active ${fromCode} perspective`
    : deltaNpvUpper < -DELTA_EPS
      ? `${toCode} books less NPV than the active ${fromCode} perspective`
      : `${toCode} books about the same NPV as the active ${fromCode} perspective`;

  let driver = '';
  if (toModule === 'cohort') {
    driver = `the modeled ARPU uplift on the existing client base (avg +${avgUpliftPercent}% / ${avgUplift} per customer); plan seats are inactive here`;
  } else if (toModule === 'plan') {
    driver = `${totalSeats} plan seats at an average price of ${avgPrice}/seat/month (implied EVC/adoption population: ${impliedPop} users)`;
  } else if (toModule === 'monetization') {
    const servicesCount = (scenario.services ?? []).filter(s => s.monetization && s.monetization.monetization_type !== 'none').length;
    driver = `the metered/add-on price on ${servicesCount} service${servicesCount === 1 ? '' : 's'}, billed directly on user interactions`;
  } else if (toModule === 'pool') {
    const tier = scenario.pool_tier;
    driver = tier
      ? `the "${tier.name}" credit-pool tier (flat fee ${tier.monthly_fee}/mo, ${tier.credit_pool_size} included credits) instead of per-module accounting`
      : `a shared credit-pool tier billed as one flat fee instead of per-module accounting`;
  }

  return `${comparison} — ${driver}.`;
}

export function classifyPerspectiveRelations(scenario: Scenario): PerspectiveRelation[] {
  const relations: PerspectiveRelation[] = [];
  const cohorts = scenario.scope_cohorts ?? [];
  const plans = scenario.plans ?? [];
  const services = scenario.services ?? [];
  const poolBurnRates = scenario.pool_burn_rates ?? [];
  const hasCohort = cohorts.length > 0;
  const totalSeats = plans.reduce((sum, p) => sum + (p.seats ?? 0), 0);
  const hasPool = !!scenario.pool_tier_id;
  const poolServiceIds = new Set(poolBurnRates.map(br => br.service_id));

  const impliedPop = computeImpliedPopulation(cohorts);
  const incommensurable = totalSeats > 0 && impliedPop > 0 && (totalSeats > impliedPop * 1.2 || impliedPop > totalSeats * 1.2);

  // Sourced from resolveCompositeComponents (financial-math.ts) — the same classifier the
  // composite calculation uses to build compositeBreakdown — so this relations panel can never
  // disagree with the Composite Revenue Breakdown table for the identical scenario (ADR 0014).
  const resComp = resolveCompositeComponents(scenario);

  // 1. Cohort <-> Plan relation
  if (hasCohort && totalSeats > 0) {
    switch (resComp.plan.role) {
      case 'books':
        relations.push({
          moduleA: 'cohort',
          moduleB: 'plan',
          kind: 'additive',
          incommensurable,
          reason: `Plan bills separate market (${totalSeats} seats) outside cohort base (${Math.round(impliedPop)} users)`
        });
        break;
      case 'folded':
        relations.push({
          moduleA: 'cohort',
          moduleB: 'plan',
          kind: 'contained',
          incommensurable,
          reason: `Plan seats are an upsell on cohort; subscriptions are folded into cohort uplift`
        });
        break;
      case 'blocked':
        relations.push({
          moduleA: 'cohort',
          moduleB: 'plan',
          kind: 'blocked',
          incommensurable,
          reason: `Plan seats (${totalSeats}) are configured but no revenue bridge is selected — choose 'Upsell on Cohort' or 'Separate Market' to resolve this pairing`
        });
        break;
    }
  }

  // 2. Cohort <-> Copilot Monetization
  if (hasCohort) {
    switch (resComp.copilotMonetization.role) {
      case 'folded':
        relations.push({
          moduleA: 'cohort',
          moduleB: 'monetization',
          kind: 'contained',
          incommensurable: false,
          reason: `Copilot monetization is folded (cross-checked) into cohort uplift (default behavior)`
        });
        break;
      case 'books':
        relations.push({
          moduleA: 'cohort',
          moduleB: 'monetization',
          kind: 'additive',
          incommensurable: false,
          reason: `Copilot monetization books separate additive revenue alongside cohort uplift`
        });
        break;
    }
  }

  // 3. Cohort <-> Agent Monetization (Streams disjoint)
  const hasAgentMon = services.some(s => s.service_type === 'agent' && s.monetization && s.monetization.monetization_type !== 'none' && s.monetization.monetization_type !== 'outcome');
  if (hasCohort && hasAgentMon) {
    relations.push({
      moduleA: 'cohort',
      moduleB: 'monetization',
      kind: 'additive',
      incommensurable: false,
      reason: `Agent monetization and cohort ARPU uplift are disjoint streams (additive)`
    });
  }

  // 4. Pool <-> Monetization (Pool Billed vs Additive)
  if (hasPool) {
    const servicesInPool = services.filter(s => poolServiceIds.has(s.id));
    const servicesOutsidePool = services.filter(s => s.monetization && s.monetization.monetization_type !== 'none' && !poolServiceIds.has(s.id));

    if (servicesInPool.length > 0) {
      relations.push({
        moduleA: 'pool',
        moduleB: 'monetization',
        kind: 'exclusive_billing',
        incommensurable: false,
        reason: `Pool billing unifies/replaces monetization for services: ${servicesInPool.map(s => s.name).join(', ')}`
      });
    }
    if (servicesOutsidePool.length > 0) {
      relations.push({
        moduleA: 'pool',
        moduleB: 'monetization',
        kind: 'additive',
        incommensurable: false,
        reason: `Services outside the pool (${servicesOutsidePool.map(s => s.name).join(', ')}) book separate monetization revenue`
      });
    }
  }

  return relations;
}

export function computePerspectives(
  assembled: Scenario,
  allProviders: Provider[],
  creditSettings: CreditSettings
): TriangulationResult {
  const activeModule = getActiveModule(assembled);
  const activeCarrier = resolveCarrier(assembled.modeling_type, assembled.revenue_carrier);
  const activeMode = activeCarrier === 'composite' ? 'composite' : 'single';
  const modules: PerspectiveModule[] = ['cohort', 'plan', 'monetization', 'pool'];
  
  const perspectives: PerspectiveResult[] = [];
  const activeRate = assembled.discount_rate ?? 0.10;

  for (const mod of modules) {
    const filled = isModuleFilled(assembled, mod);
    const isActive = activeMode !== 'composite' && mod === activeModule;
    const carrier = mod === 'cohort' ? 'cohort' : mod === 'plan' ? 'plan' : mod === 'monetization' ? 'feature' : 'pool';

    // The ACTIVE module is always computed, filled or not — it is by definition
    // what the scenario itself books (e.g. a plan carrier with 0 seats still
    // books monetization riding on it), so its row must match the headline KPIs.
    // `filled` only gates ALTERNATIVE perspectives.
    if (!filled && !isActive) {
      perspectives.push({
        module: mod,
        carrier,
        isActive,
        filled,
        integrity: { status: 'ok', severity: 'ok', message: null },
        npvUpper: 0,
        npvLower: 0,
        paybackUpper: null,
        paybackLower: null,
        piUpper: 0,
        piLower: 0,
        irr: null,
        revenuePv: 0
      });
      continue;
    }

    const variant = buildPerspectiveVariant(assembled, mod);
    const integrity = validateRevenueIntegrity(variant);
    
    if (integrity.status === 'block') {
      perspectives.push({
        module: mod,
        carrier,
        isActive,
        filled,
        integrity: {
          status: integrity.status,
          severity: integrity.severity || 'block',
          message: integrity.message
        },
        npvUpper: 0,
        npvLower: 0,
        paybackUpper: null,
        paybackLower: null,
        piUpper: 0,
        piLower: 0,
        irr: null,
        revenuePv: 0
      });
      continue;
    }

    try {
      const calc = calculateScenario(variant, allProviders, creditSettings);
      const revPv = calculateRevenuePv(calc.timeline, activeRate);
      perspectives.push({
        module: mod,
        carrier,
        isActive,
        filled,
        integrity: {
          status: integrity.status,
          severity: integrity.severity || 'ok',
          message: integrity.message
        },
        npvUpper: calc.npvUpper,
        npvLower: calc.npvLower,
        paybackUpper: calc.paybackUpper,
        paybackLower: calc.paybackLower,
        piUpper: calc.piUpper,
        piLower: calc.piLower,
        irr: calc.irr,
        revenuePv: revPv
      });
    } catch (err: any) {
      perspectives.push({
        module: mod,
        carrier,
        isActive,
        filled,
        integrity: { status: 'block', severity: 'block', message: err.message || 'Calculation failure' },
        npvUpper: 0,
        npvLower: 0,
        paybackUpper: null,
        paybackLower: null,
        piUpper: 0,
        piLower: 0,
        irr: null,
        revenuePv: 0
      });
    }
  }

  let baselineNpv = 0;
  let baselineRevenuePv = 0;
  let compositeBreakdown = null;

  if (activeMode === 'composite') {
    try {
      const calcActive = calculateScenario(assembled, allProviders, creditSettings);
      baselineNpv = calcActive.npvUpper;
      baselineRevenuePv = calculateRevenuePv(calcActive.timeline, activeRate);
      compositeBreakdown = calcActive.compositeBreakdown ?? null;
    } catch (e) {}
  } else {
    const activeRes = perspectives.find(p => p.isActive && p.integrity.status !== 'block');
    if (activeRes) {
      baselineNpv = activeRes.npvUpper;
      baselineRevenuePv = activeRes.revenuePv;
    }
  }

  const deltas: PerspectiveDelta[] = [];
  const relations = classifyPerspectiveRelations(assembled);

  for (const p of perspectives) {
    if (p.filled && p.integrity.status !== 'block' && !p.isActive) {
      const deltaNpvUpper = p.npvUpper - baselineNpv;
      deltas.push({
        fromModule: activeMode === 'composite' ? 'composite' : (activeModule as PerspectiveModule),
        toModule: p.module,
        deltaNpvUpper,
        deltaRevenuePv: p.revenuePv - baselineRevenuePv,
        explanation: generateExplanation(activeMode === 'composite' ? 'composite' : (activeModule as PerspectiveModule), p.module, assembled, deltaNpvUpper)
      });
    }
  }

  return {
    activeModule: activeMode === 'composite' ? 'composite' : activeModule,
    activeMode,
    perspectives,
    deltas,
    relations,
    compositeBreakdown
  };
}
