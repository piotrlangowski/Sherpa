import type { Scenario, Provider, CreditSettings, ModelingType, RevenueCarrier, CohortConfig } from './types.js';
import { cloneScenario, validateRevenueIntegrity, computeImpliedPopulation, calculateScenario, resolveCarrier } from './financial-math.js';

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
  fromModule: PerspectiveModule;
  toModule: PerspectiveModule;
  deltaNpvUpper: number;
  deltaRevenuePv: number;
  explanation: string;
}

export interface TriangulationResult {
  activeModule: PerspectiveModule;
  perspectives: PerspectiveResult[];
  deltas: PerspectiveDelta[];
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

export function getActiveModule(scenario: Scenario): PerspectiveModule {
  // Same resolution the engine gates on — never re-derive the carrier from
  // modeling_type alone (an (appraisal, plan) pair is invariant-consistent and
  // reachable via duplication, and used to fall through to 'cohort' here).
  const carrier = resolveCarrier(scenario.modeling_type, scenario.revenue_carrier);
  switch (carrier) {
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
  fromModule: PerspectiveModule,
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

  const fromCode = MODULE_SHORT_CODES[fromModule];
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

export function computePerspectives(
  assembled: Scenario,
  allProviders: Provider[],
  creditSettings: CreditSettings
): TriangulationResult {
  const activeModule = getActiveModule(assembled);
  const modules: PerspectiveModule[] = ['cohort', 'plan', 'monetization', 'pool'];
  
  const perspectives: PerspectiveResult[] = [];
  const activeRate = assembled.discount_rate ?? 0.10;

  for (const mod of modules) {
    const filled = isModuleFilled(assembled, mod);
    const isActive = mod === activeModule;
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

  const activeRes = perspectives.find(p => p.isActive && p.integrity.status !== 'block');
  const deltas: PerspectiveDelta[] = [];

  if (activeRes) {
    for (const p of perspectives) {
      if (p.filled && p.integrity.status !== 'block' && !p.isActive) {
        const deltaNpvUpper = p.npvUpper - activeRes.npvUpper;
        deltas.push({
          fromModule: activeModule,
          toModule: p.module,
          deltaNpvUpper,
          deltaRevenuePv: p.revenuePv - activeRes.revenuePv,
          explanation: generateExplanation(activeModule, p.module, assembled, deltaNpvUpper)
        });
      }
    }
  }

  return {
    activeModule,
    perspectives,
    deltas
  };
}
