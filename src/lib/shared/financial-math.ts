/**
 * Shared financial math functions for the Sherpa ROI Calculator.
 *
 * This module contains all pure computation logic (zero side effects, no DB access).
 * It is the single source of truth shared between the main SvelteKit app
 * and the MCP Server, eliminating code duplication.
 */

import type {
  Provider,
  Service,
  Scenario,
  CohortConfig,
  ScopeOverride,
  MonthlyBreakdown,
  CalculationResult,
  CohortTimelineResult,
  CohortModelResult,
  SensitivityParamResult,
  SensitivityAnalysisResult,
  MonetizationConfig,
  CreditSettings,
  MonetizationRevenueResult,
  IrrResult,
  ModelingType,
  RevenueCarrier,
  RevenueIntegrityResult,
  RevenueIntegrityStatus,
  Settings,
  ScenarioDiagnostic
} from './types.js';

/**
 * Advisory configuration sanity checks ("dead ends") for a scenario.
 *
 * Pure and additive: unlike `validateRevenueIntegrity` (which can hard-`block`
 * a calculation), every diagnostic here is non-blocking (`info`/`warn`). The
 * scenario still computes; these only surface configurations that quietly
 * produce structurally meaningless or misleading numbers (a percentage uplift
 * on a $0 base, a plan carrier with 0 seats, an adoption ramp longer than the
 * horizon, etc.).
 *
 * Operates on `scenario.scope_cohorts` already resolved by the caller (same
 * contract as `validateRevenueIntegrity`). `result` is optional and unlocks the
 * one result-dependent check (#4, zero benefit despite uplifts).
 */
export function validateScenarioConfig(
  scenario: Scenario,
  settings: Settings,
  providers: Provider[],
  creditSettings?: CreditSettings,
  result?: CalculationResult,
): ScenarioDiagnostic[] {
  const diagnostics: ScenarioDiagnostic[] = [];
  const EPS = 1e-9;
  const cs = creditSettings ?? DEFAULT_CREDIT_SETTINGS;

  const cohorts = scenario.scope_cohorts ?? [];
  const plans = scenario.plans ?? [];
  const services = scenario.services ?? [];
  const projectionMonths = scenario.projection_months ?? 36;
  const carrier = resolveCarrier(scenario.modeling_type ?? 'appraisal', scenario.revenue_carrier);

  // ── Tier 1: dead revenue carrier ─────────────────────────────────────────

  // #1 A percentage ARPU uplift on a $0 base contributes exactly $0 (30% × 0 = 0).
  for (const c of cohorts) {
    if (Math.abs(c.base_arpu ?? 0) < EPS && (c.arpu_uplift_percent ?? 0) > 0) {
      diagnostics.push({
        code: 'dead_arpu_uplift',
        severity: 'warn',
        field: `cohort:${c.id}`,
        message: `Cohort "${c.name}": a ${((c.arpu_uplift_percent ?? 0) * 100).toFixed(0)}% ARPU uplift on a $0 base contributes $0. Set a non-zero base ARPU, or use a flat uplift (arpu_uplift) instead of a percentage.`
      });
    }
  }

  // #2 A plan-carrier scenario with no seats has a revenue source that produces $0.
  if (carrier === 'plan') {
    const totalSeats = plans.reduce((sum, p) => sum + (p.seats ?? 0), 0);
    if (totalSeats <= 0) {
      diagnostics.push({
        code: 'carrier_no_revenue',
        severity: 'warn',
        field: 'plans',
        message: `Revenue carrier is "plan" but total plan seats = 0, so the designated revenue source produces $0 — the scenario is pure cost. Set seats on at least one plan.`
      });
    }
  }

  // #3 Cohort ARPU is silently dropped when the carrier isn't the cohort.
  if (carrier !== 'cohort') {
    for (const c of cohorts) {
      if ((c.base_arpu ?? 0) > EPS) {
        diagnostics.push({
          code: 'cohort_revenue_dropped',
          severity: 'warn',
          field: `cohort:${c.id}`,
          message: `Cohort "${c.name}" has ARPU $${(c.base_arpu ?? 0).toFixed(0)} but the revenue carrier is "${carrier}", so its revenue is ignored (only its cost remains). Switch the carrier to "cohort" to book it, or keep this cohort as context only.`
        });
      }
    }
  }

  // ── Tier 2: context-less levers ──────────────────────────────────────────

  // #4 Uplift levers configured, yet the modeled benefit is structurally zero.
  if (result?.timeline && result.timeline.length > 0) {
    const hasUplifts = cohorts.some(c =>
      (c.arpu_uplift_percent ?? 0) > 0 ||
      (c.arpu_uplift ?? 0) > 0 ||
      (c.churn_reduction ?? 0) > 0 ||
      (c.acquisition_uplift ?? 0) > 0
    );
    const benefitZero = result.timeline.every(t => Math.abs(t.revenue) < 0.01);
    if (hasUplifts && benefitZero) {
      diagnostics.push({
        code: 'zero_benefit_despite_uplifts',
        severity: 'warn',
        message: `Uplift levers are configured but the modeled benefit is ~0 (PI ≈ 0). The per-user value is likely $0 (e.g. base ARPU = 0), so retention/expansion/acquisition levers have nothing to act on.`
      });
    }
  }

  // #5 Adoption ramp at least as long as the horizon never reaches its target.
  for (const c of cohorts) {
    const ramp = c.adoption_ramp_months ?? 0;
    if (ramp > 0 && ramp >= projectionMonths) {
      diagnostics.push({
        code: 'ramp_exceeds_horizon',
        severity: 'warn',
        field: `cohort:${c.id}`,
        message: `Cohort "${c.name}": adoption ramp (${ramp} mo) ≥ projection horizon (${projectionMonths} mo), so the target ${((c.ai_adoption_rate ?? 0) * 100).toFixed(0)}% adoption is never reached — the headline adoption is overstated.`
      });
    }
  }

  // #6 Churn reduction above a soft ceiling implies near-immortal customers.
  for (const c of cohorts) {
    const cr = c.churn_reduction ?? 0;
    if (cr > 1.0) {
      diagnostics.push({
        code: 'churn_reduction_high',
        severity: 'warn',
        field: `cohort:${c.id}`,
        message: `Cohort "${c.name}": churn reduction of ${(cr * 100).toFixed(0)}% exceeds 100% — clamp it to at most 1.0.`
      });
    } else if (cr > 0.7) {
      diagnostics.push({
        code: 'churn_reduction_high',
        severity: 'warn',
        field: `cohort:${c.id}`,
        message: `Cohort "${c.name}": churn reduction of ${(cr * 100).toFixed(0)}% implies near-immortal customers; values above ~70% are rarely defensible.`
      });
    }
  }

  // #7 A 0% discount rate turns NPV into the undiscounted sum (NPV → −TCO).
  if (scenario.discount_rate === 0) {
    diagnostics.push({
      code: 'discount_rate_zero',
      severity: 'warn',
      field: 'discount_rate',
      message: `Discount rate is 0%: the time value of money is off, so NPV collapses toward −TCO. Set a non-zero rate (e.g. 0.10 for 10%).`
    });
  }

  // ── Tier 3: consistency ──────────────────────────────────────────────────

  const providersMap = new Map(providers.map(p => [p.id, p]));

  // #9 Per-credit price detached from provider token cost → negative unit margin.
  for (const service of services) {
    const config = service.monetization;
    if (!config || config.monetization_type === 'none') continue;
    const provider = service.provider_id ? providersMap.get(service.provider_id) : undefined;
    if (!provider) continue;

    const costPerUserMonth = (service.avg_requests_per_user_month || 0) * (
      (service.avg_input_tokens || 0) * (provider.input_price / 1_000_000) +
      (service.avg_output_tokens || 0) * (provider.output_price / 1_000_000)
    );
    if (costPerUserMonth <= EPS) continue;

    const pricePerCredit = config.price_per_credit ?? cs.defaultPricePerCredit;
    const creditsPerUser = calculateCreditsPerUserMonth(service, provider, cs);
    let revenuePerUserMonth = 0;
    if (config.monetization_type === 'usage') revenuePerUserMonth = creditsPerUser * pricePerCredit;
    else if (config.monetization_type === 'addon') revenuePerUserMonth = config.addon_monthly_fee ?? 0;
    else if (config.monetization_type === 'hybrid') revenuePerUserMonth = config.hybrid_monthly_fee ?? 0;

    if (revenuePerUserMonth + EPS < costPerUserMonth) {
      const detail = config.monetization_type === 'usage' && creditsPerUser > EPS
        ? `$${pricePerCredit.toFixed(4)}/credit revenue vs ~$${(costPerUserMonth / creditsPerUser).toFixed(4)}/credit provider token cost`
        : `~$${revenuePerUserMonth.toFixed(2)}/user-mo revenue vs ~$${costPerUserMonth.toFixed(2)}/user-mo provider token cost`;
      diagnostics.push({
        code: 'negative_unit_margin',
        severity: 'warn',
        field: `service:${service.id}`,
        message: `Service "${service.name}": negative unit economics — ${detail}. Each unit of usage loses money.`
      });
    }
  }

  // #10 Mixed currencies in one scenario are silently converted — note it.
  const base = settings.currency;
  const foreign = new Set<string>();
  for (const service of services) {
    const prov = service.provider_id ? providersMap.get(service.provider_id) : undefined;
    if (prov?.currency && prov.currency !== base) foreign.add(prov.currency);
    if (service.fixed_cost_currency && service.fixed_cost_currency !== base) foreign.add(service.fixed_cost_currency);
  }
  for (const cost of scenario.costs ?? []) {
    if (cost.currency && cost.currency !== base) foreign.add(cost.currency);
  }
  if (foreign.size > 0) {
    diagnostics.push({
      code: 'mixed_currency',
      severity: 'info',
      message: `This scenario mixes currencies (${[base, ...foreign].join(', ')}); foreign amounts are converted to ${base} at stored exchange rates (as of ${settings.exchange_rates_as_of}). CAPEX contingency applies after conversion.`
    });
  }

  return diagnostics;
}


/**
 * Sensible global credit defaults. The DB-aware wrappers pass real settings in;
 * these keep the pure functions usable standalone (tests, MCP) and backwards-compatible.
 */
export const DEFAULT_CREDIT_SETTINGS: CreditSettings = {
  defaultPricePerCredit: 0.02,
  defaultOverchargeMarkup: 1.5,
  defaultOverchargeUserPct: 0.2,
  defaultAvgOverchargePct: 0.5,
  defaultInputTokensPerCredit: 1000000,
  defaultOutputTokensPerCredit: 333333
};

// ============================================================
// Revenue Integrity (ADR 0001–0004)
// ============================================================

/**
 * If plan seats exceed implied_population × TOLERANCE for a cohort-carrier
 * scenario, saving is hard-blocked until the bridge is set to 'separate_market'
 * or seats are reduced.
 */
export const REVENUE_INTEGRITY_TOLERANCE = 1.2;

/**
 * Sum of (current_users × ai_adoption_rate) across all cohorts.
 * Represents the implied population that a plan's seats should be anchored to.
 */
export function computeImpliedPopulation(cohorts: CohortConfig[]): number {
  return cohorts.reduce((sum, c) => sum + (c.current_users || 0) * (c.ai_adoption_rate || 0), 0);
}

/**
 * Deterministically resolves the revenue carrier from the scenario's
 * modeling type and explicit carrier setting.
 *   - incremental → always 'cohort'
 *   - gtm         → always 'plan'
 *   - appraisal   → uses the explicit carrier ('cohort' | 'plan' | 'pack' | 'feature')
 */
export function resolveCarrier(
  modelingType: ModelingType | undefined,
  revenueCarrier: RevenueCarrier | null | undefined
): RevenueCarrier {
  switch (modelingType) {
    case 'incremental': return 'cohort';
    case 'gtm':         return 'plan';
    case 'appraisal':   return revenueCarrier ?? 'cohort';
    default:            return revenueCarrier ?? 'cohort';
  }
}

/**
 * Validates that a scenario's revenue configuration doesn't double-count.
 * Returns 'block' when saving should be prevented, 'warn' when the user
 * should be alerted, and 'ok' when everything is anchored properly.
 */
export function validateRevenueIntegrity(scenario: Scenario): RevenueIntegrityResult {
  const mt = scenario.modeling_type ?? 'appraisal';
  const carrier = resolveCarrier(mt, scenario.revenue_carrier);

  // ADR 0001 — incremental scenarios must not have monetization or seats
  if (mt === 'incremental') {
    const hasMonetization = (scenario.services ?? []).some(
      s => s.monetization && s.monetization.monetization_type !== 'none'
    );
    if (hasMonetization) {
      return {
        status: 'block',
        severity: 'block',
        message: 'Incremental scenarios cannot have monetization overrides. Remove monetization or switch to appraisal/GTM modeling.'
      };
    }
    const totalSeats = (scenario.plans ?? []).reduce((sum, p) => sum + (p.seats ?? 0), 0);
    if (totalSeats > 0) {
      return {
        status: 'block',
        severity: 'block',
        message: 'Incremental scenarios cannot use plan seats as a revenue source. Remove seats or switch to GTM modeling.'
      };
    }
    return { status: 'ok', severity: 'ok', message: null };
  }

  // ADR 0004 — cohort carrier with plan seats: check bridge
  if (carrier === 'cohort') {
    const totalSeats = (scenario.plans ?? []).reduce((sum, p) => sum + (p.seats ?? 0), 0);
    if (totalSeats > 0) {
      const bridge = scenario.revenue_bridge;
      if (bridge === 'separate_market') {
        return { status: 'ok', severity: 'ok', message: null };
      }
      const impliedPop = computeImpliedPopulation(scenario.scope_cohorts ?? []);
      if (!bridge) {
        return {
          status: 'block',
          severity: 'block',
          message: `Scenario has ${totalSeats} plan seats with a cohort-based carrier but no revenue bridge defined. Choose 'Upsell on Cohort' or 'Separate Market'.`
        };
      }
      // bridge === 'upsell_on_cohort'
      if (totalSeats > impliedPop * REVENUE_INTEGRITY_TOLERANCE) {
        return {
          status: 'block',
          severity: 'block',
          message: `Plan seats (${totalSeats}) exceed implied population (${Math.round(impliedPop)}) × ${REVENUE_INTEGRITY_TOLERANCE}. Reduce seats or set bridge to 'Separate Market'.`
        };
      }
      return {
        status: 'warn',
        severity: 'warn',
        message: `Plan seats (${totalSeats}) overlap with cohort population (${Math.round(impliedPop)}). Revenue is counted from cohort uplift only; plan subscription is informational.`
      };
    }
  }

  return { status: 'ok', severity: 'ok', message: null };
}

// ============================================================
// Scope Override Cascade
// ============================================================

/**
 * Applies a three-level override cascade (global → vertical → cohort) to a list of CohortConfigs.
 * Pure function — callers are responsible for loading the correct cohorts and overrides from DB.
 */
export function applyScopeOverrides(cohorts: CohortConfig[], overrides: ScopeOverride[]): CohortConfig[] {
  if (cohorts.length === 0) return [];

  const applyOverride = (config: CohortConfig, override: ScopeOverride | undefined): CohortConfig => {
    if (!override) return config;
    const c = { ...config };
    if (override.monthly_churn_rate !== null && override.monthly_churn_rate !== undefined) c.monthly_churn_rate = override.monthly_churn_rate;
    if (override.monthly_acquisition !== null && override.monthly_acquisition !== undefined) c.monthly_acquisition = override.monthly_acquisition;
    if (override.acquisition_growth_rate !== null && override.acquisition_growth_rate !== undefined) c.acquisition_growth_rate = override.acquisition_growth_rate;
    if (override.ai_adoption_rate !== null && override.ai_adoption_rate !== undefined) c.ai_adoption_rate = override.ai_adoption_rate;
    if (override.retention_floor !== null && override.retention_floor !== undefined) c.retention_floor = override.retention_floor;
    if (override.expansion_rate !== null && override.expansion_rate !== undefined) c.monthly_expansion_rate = override.expansion_rate;
    if (override.arpu_override !== null && override.arpu_override !== undefined) c.base_arpu = override.arpu_override;
    if (override.arpu_uplift !== null && override.arpu_uplift !== undefined) c.arpu_uplift = override.arpu_uplift;
    if (override.arpu_uplift_percent !== null && override.arpu_uplift_percent !== undefined) c.arpu_uplift_percent = override.arpu_uplift_percent;
    if (override.churn_reduction !== null && override.churn_reduction !== undefined) c.churn_reduction = override.churn_reduction;
    if (override.acquisition_uplift !== null && override.acquisition_uplift !== undefined) c.acquisition_uplift = override.acquisition_uplift;
    if (override.gross_margin !== null && override.gross_margin !== undefined) c.gross_margin = override.gross_margin;
    if (override.adoption_ramp_months !== null && override.adoption_ramp_months !== undefined) c.adoption_ramp_months = override.adoption_ramp_months;
    return c;
  };

  const globalOverride = overrides.find(o => o.target_type === 'all_clients');
  const verticalOverrides = new Map(overrides.filter(o => o.target_type === 'vertical').map(o => [o.target_id, o]));
  const cohortOverrides = new Map(overrides.filter(o => o.target_type === 'cohort').map(o => [o.target_id, o]));

  return cohorts.map(cohort => {
    let c = { ...cohort };
    c = applyOverride(c, globalOverride);
    if (c.vertical_id) c = applyOverride(c, verticalOverrides.get(c.vertical_id));
    c = applyOverride(c, cohortOverrides.get(c.id));
    return c;
  });
}

/**
 * Splits a cohort configuration into two sub-cohort configurations: AI Adopters and Non-Adopters.
 */
export function splitCohortForAi(config: CohortConfig): { adopter: CohortConfig; nonAdopter: CohortConfig } {
  const a = config.ai_adoption_rate || 0;
  const churnReduction = config.churn_reduction || 0;
  const acquisitionUplift = config.acquisition_uplift || 0;
  const arpuUpliftPercent = config.arpu_uplift_percent || 0;
  const arpuUplift = config.arpu_uplift || 0;

  const adopter: CohortConfig = {
    ...config,
    current_users: config.current_users * a,
    monthly_acquisition: config.monthly_acquisition * (1 + acquisitionUplift) * a,
    monthly_churn_rate: config.monthly_churn_rate * (1 - churnReduction),
    base_arpu: config.base_arpu * (1 + arpuUpliftPercent) + arpuUplift,
    ai_adoption_rate: 1.0
  };

  const nonAdopter: CohortConfig = {
    ...config,
    current_users: config.current_users * (1 - a),
    monthly_acquisition: config.monthly_acquisition * (1 + acquisitionUplift) * (1 - a),
    monthly_churn_rate: config.monthly_churn_rate,
    base_arpu: config.base_arpu,
    ai_adoption_rate: 0.0
  };

  return { adopter, nonAdopter };
}

// ============================================================
// Cohort Model
// ============================================================

/**
 * Builds the cohort-based revenue model projections.
 *
 * Retention model: R(age) = max(retention_floor, (1 - churn_rate)^age)
 * Expansion model: ARPU(age) = base_arpu * (1 + expansion_rate)^age
 */
export function buildCohortModel(
  config: CohortConfig,
  projectionMonths: number
): CohortModelResult {
  const timeline: CohortTimelineResult[] = [];
  let totalRevenue = 0;

  const currentUsers = config.current_users || 0;
  const baseAcquisition = config.monthly_acquisition || 0;
  const growthRate = config.acquisition_growth_rate || 0;
  const churnRate = config.monthly_churn_rate || 0;
  const retentionFloor = config.retention_floor || 0;
  const expansionRate = config.monthly_expansion_rate || 0;
  const aiAdoptionRate = config.ai_adoption_rate || 0;
  const baseArpu = config.base_arpu || 0;

  // Track initial sizes for new cohorts acquired at each month index (1-based index)
  // cohortSizes[0] represents the starting cohort (age t at month t)
  const cohortSizes: number[] = [currentUsers];

  for (let m = 1; m <= projectionMonths; m++) {
    // Cohort size acquired at month m:
    // Compound growth: size = baseAcquisition * (1 + growthRate)^(m-1)
    const acquiredSize = baseAcquisition * Math.pow(1 + growthRate, m - 1);
    cohortSizes.push(acquiredSize);
  }

  // Generate monthly timeline (month 0 to projectionMonths - 1)
  for (let t = 0; t < projectionMonths; t++) {
    let activeCustomers = 0;
    let mrr = 0;
    const newUsersAcquired = t === 0 ? 0 : cohortSizes[t];

    // Calculate active customers and MRR at month t by summing over all active cohorts
    for (let s = 0; s <= t; s++) {
      const cohortSize = cohortSizes[s];
      if (cohortSize <= 0) continue;

      const age = t - s; // Age of the cohort at month t

      // Retention: fraction of users remaining
      const retentionFraction = Math.max(retentionFloor, Math.pow(1 - churnRate, age));
      const activeInCohort = cohortSize * retentionFraction;

      // Expansion: ARPU grows over cohort age
      const arpu = baseArpu * Math.pow(1 + expansionRate, age);
      const cohortRevenue = activeInCohort * arpu;

      activeCustomers += activeInCohort;
      mrr += cohortRevenue;
    }

    const activeAiUsers = activeCustomers * aiAdoptionRate;
    const arr = mrr * 12;

    timeline.push({
      month: t,
      activeCustomers: Math.round(activeCustomers),
      activeAiUsers: Math.round(activeAiUsers),
      mrr: parseFloat(mrr.toFixed(2)),
      arr: parseFloat(arr.toFixed(2)),
      newUsersAcquired: Math.round(newUsersAcquired)
    });

    totalRevenue += mrr;
  }

  const endingCustomers = timeline.length > 0 ? timeline[timeline.length - 1].activeCustomers : 0;
  const endingMrr = timeline.length > 0 ? timeline[timeline.length - 1].mrr : 0;

  return {
    timeline,
    totalRevenue: parseFloat(totalRevenue.toFixed(2)),
    endingMrr,
    endingCustomers
  };
}

// ============================================================
// Core Financial Functions
// ============================================================

/**
 * Calculates Net Present Value (NPV) for a series of cash flows.
 * Monthly discounting formula: r_monthly = (1 + r_annual)^(1/12) - 1
 */
export function calculateNPV(cashFlows: number[], annualDiscountRate: number): number {
  const rMonthly = Math.pow(1 + annualDiscountRate, 1 / 12) - 1;
  let npv = 0;
  for (let t = 0; t < cashFlows.length; t++) {
    npv += cashFlows[t] / Math.pow(1 + rMonthly, t);
  }
  return parseFloat(npv.toFixed(2));
}

/**
 * Calculates Payback Period in months.
 * Supports fractional months by interpolating between the last negative month and first positive month.
 */
export function calculatePaybackPeriod(cashFlows: number[], annualDiscountRate: number = 0): number | null {
  if (cashFlows.length === 0) return null;
  const rMonthly = annualDiscountRate > 0 ? Math.pow(1 + annualDiscountRate, 1 / 12) - 1 : 0;
  
  // Calculate cumulative cashflows
  const cumulativeCf: number[] = [];
  let currentSum = 0;
  let hasNegative = false;
  for (let t = 0; t < cashFlows.length; t++) {
    const discountedCf = cashFlows[t] / Math.pow(1 + rMonthly, t);
    currentSum += discountedCf;
    cumulativeCf.push(currentSum);
    if (currentSum < 0) {
      hasNegative = true;
    }
  }

  // If there are no negative cumulative cashflows at all (starts and stays positive/zero)
  if (!hasNegative) {
    return 0;
  }

  // Find where it crosses from negative to positive
  for (let t = 0; t < cashFlows.length; t++) {
    const cf = cashFlows[t];
    const discountedCf = cf / Math.pow(1 + rMonthly, t);
    const cum = cumulativeCf[t];
    const prevCum = t > 0 ? cumulativeCf[t - 1] : 0;

    if (cum >= 0 && prevCum < 0) {
      const fraction = -prevCum / discountedCf;
      return parseFloat((t - 1 + fraction).toFixed(1));
    }
  }

  return null; // Never pays back within the horizon
}

/**
 * Calculates Internal Rate of Return (IRR) for a series of cash flows.
 * Uses Newton-Raphson method with Bisection fallback.
 * Returns annualized IRR: (1 + r_monthly)^12 - 1
 */
export function countSignChanges(stream: number[]): number {
  let count = 0;
  let prevSign = 0;
  for (const val of stream) {
    if (Math.abs(val) < 1e-10) continue;
    const sign = val > 0 ? 1 : -1;
    if (prevSign !== 0 && sign !== prevSign) {
      count++;
    }
    prevSign = sign;
  }
  return count;
}

export function solveMonthlyIRR(cashFlows: number[]): number | null {
  // 1. Newton-Raphson Method
  let r = 0.01; // initial guess (1% monthly rate)
  const maxIterations = 100;
  const tolerance = 1e-7;

  for (let i = 0; i < maxIterations; i++) {
    let fVal = 0;
    let fDeriv = 0;

    for (let t = 0; t < cashFlows.length; t++) {
      const denom = Math.pow(1 + r, t);
      fVal += cashFlows[t] / denom;
      if (t > 0) {
        fDeriv -= (t * cashFlows[t]) / Math.pow(1 + r, t + 1);
      }
    }

    if (Math.abs(fDeriv) < 1e-12) break; // avoid division by zero

    const nextR = r - fVal / fDeriv;
    if (Math.abs(nextR - r) < tolerance) {
      // Verify convergence
      let checkVal = 0;
      for (let t = 0; t < cashFlows.length; t++) {
        checkVal += cashFlows[t] / Math.pow(1 + nextR, t);
      }
      if (Math.abs(checkVal) < 1e-5) {
        if (!isNaN(nextR) && isFinite(nextR)) {
          return nextR;
        }
      }
    }
    r = nextR;
  }

  // 2. Bisection Fallback
  let low = -0.99; // minimum possible monthly rate is -100%
  let high = 2.0; // max monthly rate guess
  let mid = 0;

  for (let i = 0; i < 100; i++) {
    mid = (low + high) / 2;
    let fVal = 0;

    for (let t = 0; t < cashFlows.length; t++) {
      fVal += cashFlows[t] / Math.pow(1 + mid, t);
    }

    if (Math.abs(fVal) < tolerance) {
      if (!isNaN(mid) && isFinite(mid)) {
        return mid;
      }
    }

    // Determine sign change
    let fLow = 0;
    for (let t = 0; t < cashFlows.length; t++) {
      fLow += cashFlows[t] / Math.pow(1 + low, t);
    }

    if (fVal * fLow < 0) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return null;
}

export function calculateIRRGuarded(cashFlows: number[], paybackMonths: number | null): IrrResult {
  let hasPositive = false;
  let hasNegative = false;
  for (const cf of cashFlows) {
    if (cf > 0) hasPositive = true;
    if (cf < 0) hasNegative = true;
  }
  if (!hasPositive || !hasNegative) {
    return { monthly: null, annualNominal: null, status: 'undefined_no_sign_change', displayable: false };
  }

  const cumulativeCf: number[] = [];
  let sum = 0;
  for (const cf of cashFlows) {
    sum += cf;
    cumulativeCf.push(sum);
  }
  
  if (countSignChanges(cumulativeCf) > 1) {
    return { monthly: null, annualNominal: null, status: 'ambiguous_multiple_roots', displayable: false };
  }

  const monthly = solveMonthlyIRR(cashFlows);
  if (monthly === null || monthly > 1.0) {
    return { monthly: null, annualNominal: null, status: 'non_converged', displayable: false };
  }

  const annualNominal = parseFloat((monthly * 12).toFixed(4));
  
  if (paybackMonths !== null && paybackMonths < 12) {
    return { monthly, annualNominal, status: 'unstable_short_payback', displayable: false };
  }

  return { monthly, annualNominal, status: 'ok', displayable: true };
}

export function calculateIRR(cashFlows: number[]): number | null {
  const monthly = solveMonthlyIRR(cashFlows);
  if (monthly === null) return null;
  return parseFloat((Math.pow(1 + monthly, 12) - 1).toFixed(4));
}

/**
 * Calculates Total Cost of Ownership (TCO)
 */
export function calculateTCO(timeline: MonthlyBreakdown[]): number {
  const total = timeline.reduce((acc, curr) => acc + curr.totalCosts, 0);
  return parseFloat(total.toFixed(2));
}

// ============================================================
// AI Monetization Revenue
// ============================================================

/**
 * Credits consumed per AI user per month for a service, derived from its token
 * usage and the provider's token→credit ratios.
 *
 *   creditsPerRequest = avg_input_tokens / input_tokens_per_credit
 *                     + avg_output_tokens / output_tokens_per_credit
 *   creditsPerUserMonth = creditsPerRequest * avg_requests_per_user_month
 */
export function calculateCreditsPerUserMonth(
  service: Service,
  provider: Provider | undefined,
  creditSettings: CreditSettings = DEFAULT_CREDIT_SETTINGS
): number {
  if (!provider) return 0;
  // Use provider-specific ratios when available, otherwise fall back to global defaults.
  const inputTpc = provider.input_tokens_per_credit || creditSettings.defaultInputTokensPerCredit || 1;
  const outputTpc = provider.output_tokens_per_credit || creditSettings.defaultOutputTokensPerCredit || 1;
  const requests = service.avg_requests_per_user_month || 0;
  const creditsPerRequest =
    (service.avg_input_tokens || 0) / inputTpc +
    (service.avg_output_tokens || 0) / outputTpc;
  return creditsPerRequest * requests;
}

/**
 * Revenue from users exceeding their included pool / usage limit.
 * Shared by add-on (with limit) and hybrid models.
 *
 *   overchargingUsers      = aiUsers * overcharge_user_pct
 *   extraCreditsPerUser    = normalCreditsPerUser * avg_overcharge_pct
 *   revenue                = overchargingUsers * extraCreditsPerUser * pricePerCredit * markup
 */
function calculateOverchargeRevenue(
  service: Service,
  config: MonetizationConfig,
  aiUsers: number,
  pricePerCredit: number,
  creditSettings: CreditSettings,
  provider: Provider | undefined
): number {
  const normalCredits = calculateCreditsPerUserMonth(service, provider, creditSettings);
  if (normalCredits <= 0) return 0;

  // Determine the pool/limit from the config (hybrid: included_credits, addon: usage_limit).
  // If a user's normal consumption doesn't exceed the pool, there's no overage.
  const pool = config.monetization_type === 'hybrid'
    ? (config.hybrid_included_credits ?? 0)
    : (config.addon_usage_limit ?? 0);

  // When pool is set to 0 (or unset), fall back to the percentage-based model.
  // Otherwise, overage only occurs for the fraction of users whose consumption exceeds the pool.
  const userPct = config.overcharge_user_pct ?? creditSettings.defaultOverchargeUserPct;
  const avgPct = config.avg_overcharge_pct ?? creditSettings.defaultAvgOverchargePct;
  const markup = config.overcharge_markup ?? creditSettings.defaultOverchargeMarkup;
  const overchargingUsers = aiUsers * userPct;

  let extraCreditsPerUser: number;
  if (pool > 0) {
    // Pool-aware: overage = (normal × (1 + avgPct)) − pool, floored at 0.
    // An overcharging user consumes normalCredits × (1 + avgPct) on average.
    const overuserConsumption = normalCredits * (1 + avgPct);
    extraCreditsPerUser = Math.max(0, overuserConsumption - pool);
  } else {
    // Poolless (legacy / unset): pure percentage-based overage.
    extraCreditsPerUser = normalCredits * avgPct;
  }

  // M4: If policy is 'credit_pack', users purchase overage in fixed credit packs (e.g. blocks of 100 credits)
  const policy = config.monetization_type === 'hybrid'
    ? config.hybrid_overcharge_policy
    : config.addon_overcharge_policy;
  
  if (policy === 'credit_pack' && extraCreditsPerUser > 0) {
    const packSize = 100;
    extraCreditsPerUser = Math.ceil(extraCreditsPerUser / packSize) * packSize;
  }

  return overchargingUsers * extraCreditsPerUser * pricePerCredit * markup;
}

/**
 * Computes a single month's AI monetization revenue across all active services.
 * Each service carries its already-resolved effective config in `service.monetization`
 * (the DB-aware wrapper resolves the Plan→Pack→Service inheritance + scenario override).
 */
export function calculateMonetizationRevenue(
  aiUsers: number,
  services: Array<Service & { monetization?: MonetizationConfig }>,
  creditSettings: CreditSettings,
  providersMap: Map<string, Provider>
): MonetizationRevenueResult {
  let addonRevenue = 0;
  let usageRevenue = 0;
  let hybridBaseRevenue = 0;
  let overchargeRevenue = 0;

  for (const service of services) {
    const config = service.monetization;
    if (!config || config.monetization_type === 'none') continue;

    const provider = service.provider_id ? providersMap.get(service.provider_id) : undefined;
    const pricePerCredit = config.price_per_credit ?? creditSettings.defaultPricePerCredit;

    switch (config.monetization_type) {
      case 'addon':
        // Flat fee per AI user; optional overage when a usage limit is exceeded.
        addonRevenue += (config.addon_monthly_fee ?? 0) * aiUsers;
        if (config.addon_has_usage_limit && config.addon_overcharge_policy && config.addon_overcharge_policy !== 'hard_stop') {
          overchargeRevenue += calculateOverchargeRevenue(service, config, aiUsers, pricePerCredit, creditSettings, provider);
        }
        break;

      case 'usage': {
        // Pure pay-per-credit: consumed credits × sale price.
        const creditsPerUser = calculateCreditsPerUserMonth(service, provider, creditSettings);
        // M3: If variant is prepaid, users purchase in blocks of 100 credits
        const credits = (config.usage_variant === 'prepaid'
          ? Math.ceil(creditsPerUser / 100) * 100
          : creditsPerUser) * aiUsers;
        usageRevenue += credits * pricePerCredit;
        break;
      }

      case 'hybrid':
        // Monthly fee for an included pool (counted at 100% — the user paid for it),
        // plus overage once the pool is exceeded.
        hybridBaseRevenue += (config.hybrid_monthly_fee ?? 0) * aiUsers;
        if (config.hybrid_overcharge_policy && config.hybrid_overcharge_policy !== 'hard_stop') {
          overchargeRevenue += calculateOverchargeRevenue(service, config, aiUsers, pricePerCredit, creditSettings, provider);
        }
        break;
    }
  }

  const totalRevenue = addonRevenue + usageRevenue + hybridBaseRevenue + overchargeRevenue;
  return { totalRevenue, addonRevenue, usageRevenue, hybridBaseRevenue, overchargeRevenue };
}

// ============================================================
// Scenario Calculation
// ============================================================

/**
 * Runs the full financial engine calculations for a Scenario.
 * This is a pure function – it requires providers to be passed in
 * rather than querying the database directly.
 */
export function calculateScenario(
  scenario: Scenario,
  allProviders: Provider[],
  creditSettings: CreditSettings = DEFAULT_CREDIT_SETTINGS
): CalculationResult {
  const projectionMonths = scenario.projection_months ?? 36;
  const annualDiscountRate = scenario.discount_rate ?? 0.10;

  if (!scenario.scope_cohorts || scenario.scope_cohorts.length === 0) {
    throw new Error(`Scenario '${scenario.name}' has no cohort configurations.`);
  }

  const sumAgentChurnUplift = (scenario.services ?? [])
    .filter(s => s.service_type === 'agent')
    .reduce((acc, s) => acc + (s.churn_rate_uplift || 0), 0);

  // 1. Generate baseline, full-adoption, and uplift-only cohort timelines
  const cohortProjections = scenario.scope_cohorts.map(cc => {
    const baselineModel = buildCohortModel({
      ...cc,
      ai_adoption_rate: 0,
      churn_reduction: 0,
      acquisition_uplift: 0,
      arpu_uplift: 0,
      arpu_uplift_percent: 0
    }, projectionMonths);

    const fullAdoptModel = buildCohortModel({
      ...cc,
      ai_adoption_rate: 1.0,
      monthly_acquisition: cc.monthly_acquisition * (1 + (cc.acquisition_uplift || 0)),
      monthly_churn_rate: Math.max(0, cc.monthly_churn_rate * (1 - (cc.churn_reduction || 0)) + sumAgentChurnUplift),
      base_arpu: cc.base_arpu * (1 + (cc.arpu_uplift_percent || 0)) + (cc.arpu_uplift || 0)
    }, projectionMonths);

    const upliftOnlyModel = buildCohortModel({
      ...cc,
      ai_adoption_rate: 1.0,
      monthly_churn_rate: Math.max(0, cc.monthly_churn_rate * (1 - (cc.churn_reduction || 0)) + sumAgentChurnUplift),
      base_arpu: cc.base_arpu * (1 + (cc.arpu_uplift_percent || 0)) + (cc.arpu_uplift || 0)
    }, projectionMonths);

    return {
      baselineModel,
      fullAdoptModel,
      upliftOnlyModel,
      grossMargin: cc.gross_margin !== undefined ? cc.gross_margin : 1.0,
      adoptionRate: cc.ai_adoption_rate || 0,
      rampMonths: cc.adoption_ramp_months || 0
    };
  });

  // 2. Build provider lookup map
  const providersMap = new Map<string, Provider>();
  for (const prov of allProviders) {
    providersMap.set(prov.id, prov);
  }

  const timeline: MonthlyBreakdown[] = [];
  let cumulativeCashFlow = 0;
  let cumulativeCashFlowLower = 0;
  const cashFlowsLower: number[] = [];
  let totalRevenueLowerSum = 0;

  const serviceRealizableHistory = new Map<string, number[]>();

  // 3. Loop through projection months
  for (let t = 0; t < projectionMonths; t++) {
    let activeCustomers = 0;
    let activeAiUsers = 0;
    let grossRevenue = 0;
    let baselineRevenue = 0;
    let baselineCustomers = 0;
    let upliftOnlyRevenue = 0;

    let upperMarginSum = 0;
    let lowerMarginSum = 0;

    // Aggregate over all cohort models for month t
    for (let i = 0; i < scenario.scope_cohorts.length; i++) {
      const proj = cohortProjections[i];
      const target = proj.adoptionRate;
      const rampMonths = proj.rampMonths;
      
      const a = rampMonths === 0 ? target : Math.min(1, (t + 1) / rampMonths) * target;
      
      const baseMonth = proj.baselineModel.timeline[t];
      const fullMonth = proj.fullAdoptModel.timeline[t];
      const upliftOnlyMonth = proj.upliftOnlyModel.timeline[t];

      if (fullMonth && baseMonth) {
        const cohortCustomers = a * fullMonth.activeCustomers + (1 - a) * baseMonth.activeCustomers;
        const cohortAiUsers = a * fullMonth.activeCustomers;
        const cohortGrossRev = a * fullMonth.mrr + (1 - a) * baseMonth.mrr;

        activeCustomers += cohortCustomers;
        activeAiUsers += cohortAiUsers;
        grossRevenue += cohortGrossRev;

        const incrementalUpper = cohortGrossRev - baseMonth.mrr;
        upperMarginSum += proj.grossMargin * incrementalUpper;
      }
      if (upliftOnlyMonth && baseMonth) {
        const cohortUpliftOnlyRev = a * upliftOnlyMonth.mrr + (1 - a) * baseMonth.mrr;
        upliftOnlyRevenue += cohortUpliftOnlyRev;

        const incrementalLower = cohortUpliftOnlyRev - baseMonth.mrr;
        lowerMarginSum += proj.grossMargin * incrementalLower;
      }
      if (baseMonth) {
        baselineCustomers += baseMonth.activeCustomers;
        baselineRevenue += baseMonth.mrr;
      }
    }

    // AI monetization revenue
    let monetization: MonetizationRevenueResult = {
      totalRevenue: 0, addonRevenue: 0, usageRevenue: 0, hybridBaseRevenue: 0, overchargeRevenue: 0
    };
    let planSubscriptionRevenue = 0;

    // Carrier-based revenue gating (ADR 0001–0004)
    const carrier = resolveCarrier(scenario.modeling_type, scenario.revenue_carrier);
    const carrierIncludesMonetization = carrier === 'plan' || carrier === 'feature' || carrier === 'pack';
    const carrierIncludesCohort = carrier === 'cohort';

    if (carrierIncludesMonetization) {
      const activeServices = (scenario.services ?? []).filter(s => t >= (s.rollout_month ?? 0));
      monetization = calculateMonetizationRevenue(activeAiUsers, activeServices, creditSettings, providersMap);
    }

    if (carrier === 'plan' || (carrier === 'cohort' && scenario.revenue_bridge === 'separate_market')) {
      for (const plan of scenario.plans ?? []) {
        if (t >= (plan.rollout_month ?? 0)) {
          planSubscriptionRevenue += (plan.base_price ?? 0) * (plan.seats ?? 0);
        }
      }
    }

    let upperRevenue: number;
    let lowerRevenue: number;
    switch (carrier) {
      case 'feature':
      case 'pack':
        // Revenue comes solely from monetization (addon/usage/hybrid)
        upperRevenue = monetization.totalRevenue;
        lowerRevenue = monetization.totalRevenue;
        break;
      case 'plan':
        // Revenue = plan subscription + monetization on plan-inherited services
        upperRevenue = monetization.totalRevenue + planSubscriptionRevenue;
        lowerRevenue = monetization.totalRevenue + planSubscriptionRevenue;
        break;
      case 'cohort':
      default:
        // Revenue = incremental cohort MRR (upper/lower bands)
        // If bridge is 'separate_market', plan subscription is additive
        upperRevenue = upperMarginSum + planSubscriptionRevenue;
        lowerRevenue = lowerMarginSum + planSubscriptionRevenue;
    }

    totalRevenueLowerSum += lowerRevenue;

    let opex = 0;
    let capex = 0;
    let tokenCosts = 0;

    let monthTotalInteractions = 0;
    let monthDeflectedInteractions = 0;
    let monthLaborSavingsCash = 0;
    let monthLaborSavingsCapacity = 0;
    let monthFailedDeflectionCost = 0;
    let monthAgentTokenCosts = 0;

    // A. Direct AI Services Costs (from scenario_services rollout)
    if (scenario.services) {
      for (const service of scenario.services) {
        const rolloutMonth = service.rollout_month ?? 0;
        if (service.service_type === 'agent') {
          if (t >= rolloutMonth) {
            const driver = service.interaction_driver_type || 'flat';
            let serviceInteractions = 0;
            if (driver === 'flat') {
              serviceInteractions = (service.monthly_volume || 0) * Math.pow(1 + (service.volume_growth_rate || 0), t);
            } else if (driver === 'per_customer') {
              serviceInteractions = activeCustomers * (service.interactions_per_customer_month || 0);
            }

            const ramp = service.containment_ramp_months || 0;
            const containmentRate = service.containment_rate || 0;
            const containmentStartRate = service.containment_start_rate || 0;
            const escalationRate = service.escalation_rate || 0;

            let contain_t = containmentRate;
            if (ramp > 0 && t < ramp) {
              contain_t = containmentStartRate + ((t + 1) / ramp) * (containmentRate - containmentStartRate);
            }
            const escal_t = escalationRate + Math.max(0, containmentRate - contain_t);
            const failed_t = Math.max(0, 1 - contain_t - escal_t);

            const deflected = serviceInteractions * contain_t;
            const failed = serviceInteractions * failed_t;

            const averageHandleTime = service.average_handle_time_seconds || 0;
            const productiveHours = service.productive_hours_per_fte_month || 120;
            const baselineFte = service.baseline_fte || 0;
            const fullyLoadedCost = service.fully_loaded_cost_per_fte_month || 0;

            const hoursSaved = (deflected * averageHandleTime) / 3600;
            const fteSaved = hoursSaved / productiveHours;
            const realizable = baselineFte > 0 ? Math.min(fteSaved, baselineFte) : fteSaved;

            let realizableHistory = serviceRealizableHistory.get(service.id);
            if (!realizableHistory) {
              realizableHistory = [];
              serviceRealizableHistory.set(service.id, realizableHistory);
            }
            realizableHistory.push(realizable);

            const lag = service.staffing_realization_lag_months || 0;
            // Defer cash recognition by `lag` months: until the staffing reduction
            // is actually realised, the freed FTE is capacity, not cash. For the
            // first `lag` months there is no realised headcount yet (src = 0).
            const src = t - lag >= 0 ? realizableHistory[t - lag] : 0;

            const serviceLaborCash = Math.floor(src) * fullyLoadedCost;
            const serviceLaborCapacity = (realizable - Math.floor(src)) * fullyLoadedCost;

            const failedCost = failed * (service.failed_deflection_penalty || 0);

            let serviceTokenCost = 0;
            if (service.provider_id && providersMap.has(service.provider_id)) {
              const provider = providersMap.get(service.provider_id)!;
              const inputPrice = provider.input_price / 1000000;
              const outputPrice = provider.output_price / 1000000;

              serviceTokenCost = serviceInteractions *
                ((service.avg_input_tokens || 0) * inputPrice + (service.avg_output_tokens || 0) * outputPrice);
            }
            const serviceFixedCost = service.fixed_cost_per_month || 0;
            const totalAgentTokenCost = serviceTokenCost + serviceFixedCost;

            monthTotalInteractions += serviceInteractions;
            monthDeflectedInteractions += deflected;
            monthLaborSavingsCash += serviceLaborCash;
            monthLaborSavingsCapacity += serviceLaborCapacity;
            monthFailedDeflectionCost += failedCost;
            monthAgentTokenCosts += totalAgentTokenCost;

            tokenCosts += totalAgentTokenCost;
            opex += failedCost;
          } else {
            let realizableHistory = serviceRealizableHistory.get(service.id);
            if (!realizableHistory) {
              realizableHistory = [];
              serviceRealizableHistory.set(service.id, realizableHistory);
            }
            realizableHistory.push(0);
          }
        } else {
          // Copilot (default)
          if (t >= rolloutMonth) {
            let serviceTokenCost = 0;
            if (service.provider_id && providersMap.has(service.provider_id)) {
              const provider = providersMap.get(service.provider_id)!;
              const inputPrice = provider.input_price / 1000000;
              const outputPrice = provider.output_price / 1000000;

              serviceTokenCost = activeAiUsers *
                (service.avg_requests_per_user_month || 0) *
                ((service.avg_input_tokens || 0) * inputPrice + (service.avg_output_tokens || 0) * outputPrice);
            }

            const serviceFixedCost = service.fixed_cost_per_month || 0;
            tokenCosts += serviceTokenCost + serviceFixedCost;
          }
        }
      }
    }

    // Add labor savings cash (Decision 2: labor cash in BOTH bands)
    upperRevenue += monthLaborSavingsCash;
    lowerRevenue += monthLaborSavingsCash;

    // B. OPEX / CAPEX Line Items (from scenario_costs)
    if (scenario.costs) {
      for (const item of scenario.costs) {
        let isApplicable = false;

        if (item.frequency === 'one_time' && t === 0) {
          isApplicable = true;
        } else if (item.frequency === 'monthly') {
          isApplicable = true;
        } else if (item.frequency === 'yearly' && t % 12 === 0) {
          isApplicable = true;
        }

        if (isApplicable) {
          if (item.category === 'capex') {
            capex += item.amount * (1 + (scenario.capex_contingency_pct || 0));
          } else {
            opex += item.amount;
          }
        }
      }
    }

    const totalCosts = opex + capex + tokenCosts;
    const netCashFlow = upperRevenue - totalCosts;
    const netCashFlowLower = lowerRevenue - totalCosts;
    cumulativeCashFlow += netCashFlow;
    cumulativeCashFlowLower += netCashFlowLower;

    timeline.push({
      month: t,
      revenue: parseFloat(upperRevenue.toFixed(2)),
      customers: activeCustomers,
      aiUsers: activeAiUsers,
      opex: parseFloat(opex.toFixed(2)),
      capex: parseFloat(capex.toFixed(2)),
      tokenCosts: parseFloat(tokenCosts.toFixed(2)),
      totalCosts: parseFloat(totalCosts.toFixed(2)),
      netCashFlow: parseFloat(netCashFlow.toFixed(2)),
      cumulativeCashFlow: parseFloat(cumulativeCashFlow.toFixed(2)),
      cumulativeCashFlowLower: parseFloat(cumulativeCashFlowLower.toFixed(2)),
      grossRevenue: parseFloat(grossRevenue.toFixed(2)),
      baselineRevenue: parseFloat(baselineRevenue.toFixed(2)),
      baselineCustomers: Math.round(baselineCustomers),
      monetizationRevenue: parseFloat(monetization.totalRevenue.toFixed(2)),
      addonRevenue: parseFloat(monetization.addonRevenue.toFixed(2)),
      usageRevenue: parseFloat(monetization.usageRevenue.toFixed(2)),
      hybridBaseRevenue: parseFloat(monetization.hybridBaseRevenue.toFixed(2)),
      overchargeRevenue: parseFloat(monetization.overchargeRevenue.toFixed(2)),
      // Agent archetype fields
      totalInteractions: parseFloat(monthTotalInteractions.toFixed(2)),
      deflectedInteractions: parseFloat(monthDeflectedInteractions.toFixed(2)),
      laborSavingsCash: parseFloat(monthLaborSavingsCash.toFixed(2)),
      laborSavingsCapacity: parseFloat(monthLaborSavingsCapacity.toFixed(2)),
      failedDeflectionCost: parseFloat(monthFailedDeflectionCost.toFixed(2)),
      agentTokenCosts: parseFloat(monthAgentTokenCosts.toFixed(2))
    });

    cashFlowsLower.push(parseFloat(netCashFlowLower.toFixed(2)));
  }

  // 4. Calculate aggregate KPIs
  const cashFlowsUpper = timeline.map(m => m.netCashFlow);
  const paybackUpper = calculatePaybackPeriod(cashFlowsUpper, annualDiscountRate);
  const npvUpper = calculateNPV(cashFlowsUpper, annualDiscountRate);

  const paybackLower = calculatePaybackPeriod(cashFlowsLower, annualDiscountRate);
  const npvLower = calculateNPV(cashFlowsLower, annualDiscountRate);

  const tco = calculateTCO(timeline);

  const rMonthly = Math.pow(1 + annualDiscountRate, 1 / 12) - 1;
  const pvCosts = timeline.reduce((acc, curr) => acc + curr.totalCosts / Math.pow(1 + rMonthly, curr.month), 0);

  const piUpper = pvCosts > 0 ? parseFloat((npvUpper / pvCosts + 1).toFixed(4)) : 0;
  const piLower = pvCosts > 0 ? parseFloat((npvLower / pvCosts + 1).toFixed(4)) : 0;

  const irr = calculateIRRGuarded(cashFlowsUpper, paybackUpper);

  return {
    timeline,
    paybackUpper,
    paybackLower,
    npvUpper,
    npvLower,
    piUpper,
    piLower,
    irr,
    tco
  };
}

// ============================================================
// Sensitivity Analysis
// ============================================================

/**
 * Helper to clone the scenario object deeply to avoid mutating DB-cached records.
 */
function cloneScenario(scenario: Scenario): Scenario {
  return JSON.parse(JSON.stringify(scenario));
}

/**
 * Runs sensitivity analysis on a Scenario by varying each parameter by ±variationPercent.
 * Pure function – requires providers to be passed in.
 */
export function runSensitivityAnalysis(
  scenario: Scenario,
  allProviders: Provider[],
  variationPercent: number = 0.1,
  creditSettings: CreditSettings = DEFAULT_CREDIT_SETTINGS
): SensitivityAnalysisResult {
  if (!scenario.scope_cohorts || scenario.scope_cohorts.length === 0) {
    return {
      scenarioId: scenario.id,
      baseNpv: 0,
      baseIrr: null,
      basePayback: null,
      results: []
    };
  }

  const carrier = resolveCarrier(scenario.modeling_type, scenario.revenue_carrier);
  const monetizationActive =
    (carrier === 'plan' || carrier === 'feature' || carrier === 'pack') &&
    (scenario.services ?? []).some(s => s.monetization && s.monetization.monetization_type !== 'none');

  const baseResult = calculateScenario(scenario, allProviders, creditSettings);
  const baseNpv = baseResult.npvUpper;

  const results: SensitivityParamResult[] = [];

  // Helper to format percentage change
  const varLabelLow = `-${(variationPercent * 100).toFixed(0)}%`;
  const varLabelHigh = `+${(variationPercent * 100).toFixed(0)}%`;

  // 1. Churn Reduction Uplift (Positive Impact: Higher reduction => Higher NPV)
  {
    const cloneLow = cloneScenario(scenario);
    for (const cc of cloneLow.scope_cohorts!) {
      cc.churn_reduction = (cc.churn_reduction ?? 0) * (1 - variationPercent);
    }
    const resLow = calculateScenario(cloneLow, allProviders, creditSettings);

    const cloneHigh = cloneScenario(scenario);
    for (const cc of cloneHigh.scope_cohorts!) {
      cc.churn_reduction = (cc.churn_reduction ?? 0) * (1 + variationPercent);
    }
    const resHigh = calculateScenario(cloneHigh, allProviders, creditSettings);

    results.push({
      parameter: 'Churn Reduction Uplift',
      key: 'churn_reduction',
      lowValueText: varLabelLow,
      highValueText: varLabelHigh,
      lowNpv: resLow.npvUpper,
      highNpv: resHigh.npvUpper,
      lowIrr: resLow.irr.annualNominal,
      highIrr: resHigh.irr.annualNominal,
      lowPayback: resLow.paybackUpper,
      highPayback: resHigh.paybackUpper,
      impactRange: Math.abs(resHigh.npvUpper - resLow.npvUpper)
    });
  }

  // 2. Acquisition Uplift (Positive Impact: Higher uplift => Higher NPV)
  {
    const cloneLow = cloneScenario(scenario);
    for (const cc of cloneLow.scope_cohorts!) {
      cc.acquisition_uplift = (cc.acquisition_uplift ?? 0) * (1 - variationPercent);
    }
    const resLow = calculateScenario(cloneLow, allProviders, creditSettings);

    const cloneHigh = cloneScenario(scenario);
    for (const cc of cloneHigh.scope_cohorts!) {
      cc.acquisition_uplift = (cc.acquisition_uplift ?? 0) * (1 + variationPercent);
    }
    const resHigh = calculateScenario(cloneHigh, allProviders, creditSettings);

    results.push({
      parameter: 'Acquisition Uplift',
      key: 'acquisition_uplift',
      lowValueText: varLabelLow,
      highValueText: varLabelHigh,
      lowNpv: resLow.npvUpper,
      highNpv: resHigh.npvUpper,
      lowIrr: resLow.irr.annualNominal,
      highIrr: resHigh.irr.annualNominal,
      lowPayback: resLow.paybackUpper,
      highPayback: resHigh.paybackUpper,
      impactRange: Math.abs(resHigh.npvUpper - resLow.npvUpper)
    });
  }

  // 3. ARPU Uplift (Positive Impact: Higher ARPU uplift => Higher NPV)
  {
    const cloneLow = cloneScenario(scenario);
    for (const cc of cloneLow.scope_cohorts!) {
      cc.arpu_uplift = (cc.arpu_uplift ?? 0) * (1 - variationPercent);
      cc.arpu_uplift_percent = (cc.arpu_uplift_percent ?? 0) * (1 - variationPercent);
    }
    const resLow = calculateScenario(cloneLow, allProviders, creditSettings);

    const cloneHigh = cloneScenario(scenario);
    for (const cc of cloneHigh.scope_cohorts!) {
      cc.arpu_uplift = (cc.arpu_uplift ?? 0) * (1 + variationPercent);
      cc.arpu_uplift_percent = (cc.arpu_uplift_percent ?? 0) * (1 + variationPercent);
    }
    const resHigh = calculateScenario(cloneHigh, allProviders, creditSettings);

    results.push({
      parameter: 'ARPU Uplift',
      key: 'arpu_uplift',
      lowValueText: varLabelLow,
      highValueText: varLabelHigh,
      lowNpv: resLow.npvUpper,
      highNpv: resHigh.npvUpper,
      lowIrr: resLow.irr.annualNominal,
      highIrr: resHigh.irr.annualNominal,
      lowPayback: resLow.paybackUpper,
      highPayback: resHigh.paybackUpper,
      impactRange: Math.abs(resHigh.npvUpper - resLow.npvUpper)
    });
  }

  // 4. AI Adoption Rate
  {
    const cloneLow = cloneScenario(scenario);
    for (const cc of cloneLow.scope_cohorts!) {
      cc.ai_adoption_rate = cc.ai_adoption_rate * (1 - variationPercent);
    }
    const resLow = calculateScenario(cloneLow, allProviders, creditSettings);

    const cloneHigh = cloneScenario(scenario);
    for (const cc of cloneHigh.scope_cohorts!) {
      cc.ai_adoption_rate = cc.ai_adoption_rate * (1 + variationPercent);
    }
    const resHigh = calculateScenario(cloneHigh, allProviders, creditSettings);

    results.push({
      parameter: 'AI Adoption Rate',
      key: 'adoption',
      lowValueText: varLabelLow,
      highValueText: varLabelHigh,
      lowNpv: resLow.npvUpper,
      highNpv: resHigh.npvUpper,
      lowIrr: resLow.irr.annualNominal,
      highIrr: resHigh.irr.annualNominal,
      lowPayback: resLow.paybackUpper,
      highPayback: resHigh.paybackUpper,
      impactRange: Math.abs(resHigh.npvUpper - resLow.npvUpper)
    });
  }

  // 5. Discount Rate (Negative Impact: Higher discount => Lower NPV)
  {
    const baseVal = scenario.discount_rate ?? 0.10;
    const lowVal = baseVal * (1 - variationPercent);
    const highVal = baseVal * (1 + variationPercent);

    const cloneLow = cloneScenario(scenario);
    cloneLow.discount_rate = lowVal;
    const resLow = calculateScenario(cloneLow, allProviders, creditSettings);

    const cloneHigh = cloneScenario(scenario);
    cloneHigh.discount_rate = highVal;
    const resHigh = calculateScenario(cloneHigh, allProviders, creditSettings);

    results.push({
      parameter: 'Discount Rate',
      key: 'discount_rate',
      lowValueText: `${(lowVal * 100).toFixed(1)}%`,
      highValueText: `${(highVal * 100).toFixed(1)}%`,
      lowNpv: resLow.npvUpper,
      highNpv: resHigh.npvUpper,
      lowIrr: resLow.irr.annualNominal,
      highIrr: resHigh.irr.annualNominal,
      lowPayback: resLow.paybackUpper,
      highPayback: resHigh.paybackUpper,
      impactRange: Math.abs(resLow.npvUpper - resHigh.npvUpper)
    });
  }

  // 6. Non-Token Costs (OPEX & CAPEX)
  if (scenario.costs && scenario.costs.length > 0) {
    const cloneLow = cloneScenario(scenario);
    for (const c of cloneLow.costs!) {
      c.amount = c.amount * (1 - variationPercent);
    }
    const resLow = calculateScenario(cloneLow, allProviders, creditSettings);

    const cloneHigh = cloneScenario(scenario);
    for (const c of cloneHigh.costs!) {
      c.amount = c.amount * (1 + variationPercent);
    }
    const resHigh = calculateScenario(cloneHigh, allProviders, creditSettings);

    results.push({
      parameter: 'Operating & Capital Expenses',
      key: 'fixed_costs',
      lowValueText: `-${(variationPercent * 100).toFixed(0)}%`,
      highValueText: `+${(variationPercent * 100).toFixed(0)}%`,
      lowNpv: resLow.npvUpper,
      highNpv: resHigh.npvUpper,
      lowIrr: resLow.irr.annualNominal,
      highIrr: resHigh.irr.annualNominal,
      lowPayback: resLow.paybackUpper,
      highPayback: resHigh.paybackUpper,
      impactRange: Math.abs(resLow.npvUpper - resHigh.npvUpper)
    });
  }

  // 7. AI Token Pricing / Usage
  if (scenario.services && scenario.services.length > 0) {
    const cloneLow = cloneScenario(scenario);
    for (const s of cloneLow.services!) {
      s.avg_input_tokens = Math.round(s.avg_input_tokens * (1 - variationPercent));
      s.avg_output_tokens = Math.round(s.avg_output_tokens * (1 - variationPercent));
      if (s.fixed_cost_per_month) {
        s.fixed_cost_per_month = s.fixed_cost_per_month * (1 - variationPercent);
      }
    }
    const resLow = calculateScenario(cloneLow, allProviders, creditSettings);

    const cloneHigh = cloneScenario(scenario);
    for (const s of cloneHigh.services!) {
      s.avg_input_tokens = Math.round(s.avg_input_tokens * (1 + variationPercent));
      s.avg_output_tokens = Math.round(s.avg_output_tokens * (1 + variationPercent));
      if (s.fixed_cost_per_month) {
        s.fixed_cost_per_month = s.fixed_cost_per_month * (1 + variationPercent);
      }
    }
    const resHigh = calculateScenario(cloneHigh, allProviders, creditSettings);

    results.push({
      parameter: 'AI Token Costs',
      key: 'token_costs',
      lowValueText: `-${(variationPercent * 100).toFixed(0)}%`,
      highValueText: `+${(variationPercent * 100).toFixed(0)}%`,
      lowNpv: resLow.npvUpper,
      highNpv: resHigh.npvUpper,
      lowIrr: resLow.irr.annualNominal,
      highIrr: resHigh.irr.annualNominal,
      lowPayback: resLow.paybackUpper,
      highPayback: resHigh.paybackUpper,
      impactRange: Math.abs(resLow.npvUpper - resHigh.npvUpper)
    });
  }

  // 8. AI Monetization parameters — only when the scenario actually sells AI.
  if (monetizationActive) {
    // 8a. Credit Price (scales explicit per-config price + the global default)
    {
      const csLow = { ...creditSettings, defaultPricePerCredit: creditSettings.defaultPricePerCredit * (1 - variationPercent) };
      const cloneLow = cloneScenario(scenario);
      for (const s of cloneLow.services ?? []) {
        if (s.monetization?.price_per_credit != null) s.monetization.price_per_credit *= (1 - variationPercent);
      }
      const resLow = calculateScenario(cloneLow, allProviders, csLow);

      const csHigh = { ...creditSettings, defaultPricePerCredit: creditSettings.defaultPricePerCredit * (1 + variationPercent) };
      const cloneHigh = cloneScenario(scenario);
      for (const s of cloneHigh.services ?? []) {
        if (s.monetization?.price_per_credit != null) s.monetization.price_per_credit *= (1 + variationPercent);
      }
      const resHigh = calculateScenario(cloneHigh, allProviders, csHigh);

      results.push({
        parameter: 'Credit Price',
        key: 'price_per_credit',
        lowValueText: varLabelLow,
        highValueText: varLabelHigh,
        lowNpv: resLow.npvUpper,
        highNpv: resHigh.npvUpper,
        lowIrr: resLow.irr.annualNominal,
        highIrr: resHigh.irr.annualNominal,
        lowPayback: resLow.paybackUpper,
        highPayback: resHigh.paybackUpper,
        impactRange: Math.abs(resHigh.npvUpper - resLow.npvUpper)
      });
    }

    // 8b. Monetization Fees (add-on + hybrid monthly fees)
    {
      const cloneLow = cloneScenario(scenario);
      for (const s of cloneLow.services ?? []) {
        if (!s.monetization) continue;
        if (s.monetization.addon_monthly_fee != null) s.monetization.addon_monthly_fee *= (1 - variationPercent);
        if (s.monetization.hybrid_monthly_fee != null) s.monetization.hybrid_monthly_fee *= (1 - variationPercent);
      }
      const resLow = calculateScenario(cloneLow, allProviders, creditSettings);

      const cloneHigh = cloneScenario(scenario);
      for (const s of cloneHigh.services ?? []) {
        if (!s.monetization) continue;
        if (s.monetization.addon_monthly_fee != null) s.monetization.addon_monthly_fee *= (1 + variationPercent);
        if (s.monetization.hybrid_monthly_fee != null) s.monetization.hybrid_monthly_fee *= (1 + variationPercent);
      }
      const resHigh = calculateScenario(cloneHigh, allProviders, creditSettings);

      results.push({
        parameter: 'Monetization Fees',
        key: 'monetization_fees',
        lowValueText: varLabelLow,
        highValueText: varLabelHigh,
        lowNpv: resLow.npvUpper,
        highNpv: resHigh.npvUpper,
        lowIrr: resLow.irr.annualNominal,
        highIrr: resHigh.irr.annualNominal,
        lowPayback: resLow.paybackUpper,
        highPayback: resHigh.paybackUpper,
        impactRange: Math.abs(resHigh.npvUpper - resLow.npvUpper)
      });
    }

    // 8c. Overcharge Users % (share of users exceeding their pool/limit)
    {
      const cloneLow = cloneScenario(scenario);
      for (const s of cloneLow.services ?? []) {
        if (s.monetization) s.monetization.overcharge_user_pct = (s.monetization.overcharge_user_pct ?? creditSettings.defaultOverchargeUserPct) * (1 - variationPercent);
      }
      const resLow = calculateScenario(cloneLow, allProviders, creditSettings);

      const cloneHigh = cloneScenario(scenario);
      for (const s of cloneHigh.services ?? []) {
        if (s.monetization) s.monetization.overcharge_user_pct = (s.monetization.overcharge_user_pct ?? creditSettings.defaultOverchargeUserPct) * (1 + variationPercent);
      }
      const resHigh = calculateScenario(cloneHigh, allProviders, creditSettings);

      results.push({
        parameter: 'Overcharge Users %',
        key: 'overcharge_user_pct',
        lowValueText: varLabelLow,
        highValueText: varLabelHigh,
        lowNpv: resLow.npvUpper,
        highNpv: resHigh.npvUpper,
        lowIrr: resLow.irr.annualNominal,
        highIrr: resHigh.irr.annualNominal,
        lowPayback: resLow.paybackUpper,
        highPayback: resHigh.paybackUpper,
        impactRange: Math.abs(resHigh.npvUpper - resLow.npvUpper)
      });
    }
  }

  const hasAgent = (scenario.services ?? []).some(s => s.service_type === 'agent');
  if (hasAgent) {
    // 9a. Containment Rate
    {
      const cloneLow = cloneScenario(scenario);
      for (const s of cloneLow.services ?? []) {
        if (s.service_type === 'agent') {
          s.containment_rate = (s.containment_rate || 0) * (1 - variationPercent);
          s.containment_start_rate = (s.containment_start_rate || 0) * (1 - variationPercent);
        }
      }
      const resLow = calculateScenario(cloneLow, allProviders, creditSettings);

      const cloneHigh = cloneScenario(scenario);
      for (const s of cloneHigh.services ?? []) {
        if (s.service_type === 'agent') {
          s.containment_rate = Math.min(1.0, (s.containment_rate || 0) * (1 + variationPercent));
          s.containment_start_rate = Math.min(1.0, (s.containment_start_rate || 0) * (1 + variationPercent));
        }
      }
      const resHigh = calculateScenario(cloneHigh, allProviders, creditSettings);

      results.push({
        parameter: 'Agent Containment Rate',
        key: 'containment_rate',
        lowValueText: varLabelLow,
        highValueText: varLabelHigh,
        lowNpv: resLow.npvUpper,
        highNpv: resHigh.npvUpper,
        lowIrr: resLow.irr.annualNominal,
        highIrr: resHigh.irr.annualNominal,
        lowPayback: resLow.paybackUpper,
        highPayback: resHigh.paybackUpper,
        impactRange: Math.abs(resHigh.npvUpper - resLow.npvUpper)
      });
    }

    // 9b. Agent Interaction Volume (both monthly_volume and interactions_per_customer_month)
    {
      const cloneLow = cloneScenario(scenario);
      for (const s of cloneLow.services ?? []) {
        if (s.service_type === 'agent') {
          s.monthly_volume = (s.monthly_volume || 0) * (1 - variationPercent);
          s.interactions_per_customer_month = (s.interactions_per_customer_month || 0) * (1 - variationPercent);
        }
      }
      const resLow = calculateScenario(cloneLow, allProviders, creditSettings);

      const cloneHigh = cloneScenario(scenario);
      for (const s of cloneHigh.services ?? []) {
        if (s.service_type === 'agent') {
          s.monthly_volume = (s.monthly_volume || 0) * (1 + variationPercent);
          s.interactions_per_customer_month = (s.interactions_per_customer_month || 0) * (1 + variationPercent);
        }
      }
      const resHigh = calculateScenario(cloneHigh, allProviders, creditSettings);

      results.push({
        parameter: 'Agent Interaction Volume',
        key: 'agent_volume',
        lowValueText: varLabelLow,
        highValueText: varLabelHigh,
        lowNpv: resLow.npvUpper,
        highNpv: resHigh.npvUpper,
        lowIrr: resLow.irr.annualNominal,
        highIrr: resHigh.irr.annualNominal,
        lowPayback: resLow.paybackUpper,
        highPayback: resHigh.paybackUpper,
        impactRange: Math.abs(resHigh.npvUpper - resLow.npvUpper)
      });
    }

    // 9c. Average Handle Time (AHT)
    {
      const cloneLow = cloneScenario(scenario);
      for (const s of cloneLow.services ?? []) {
        if (s.service_type === 'agent') {
          s.average_handle_time_seconds = Math.round((s.average_handle_time_seconds || 0) * (1 - variationPercent));
        }
      }
      const resLow = calculateScenario(cloneLow, allProviders, creditSettings);

      const cloneHigh = cloneScenario(scenario);
      for (const s of cloneHigh.services ?? []) {
        if (s.service_type === 'agent') {
          s.average_handle_time_seconds = Math.round((s.average_handle_time_seconds || 0) * (1 + variationPercent));
        }
      }
      const resHigh = calculateScenario(cloneHigh, allProviders, creditSettings);

      results.push({
        parameter: 'Agent Average Handle Time',
        key: 'average_handle_time_seconds',
        lowValueText: varLabelLow,
        highValueText: varLabelHigh,
        lowNpv: resLow.npvUpper,
        highNpv: resHigh.npvUpper,
        lowIrr: resLow.irr.annualNominal,
        highIrr: resHigh.irr.annualNominal,
        lowPayback: resLow.paybackUpper,
        highPayback: resHigh.paybackUpper,
        impactRange: Math.abs(resHigh.npvUpper - resLow.npvUpper)
      });
    }

    // 9d. Fully Loaded FTE Cost
    {
      const cloneLow = cloneScenario(scenario);
      for (const s of cloneLow.services ?? []) {
        if (s.service_type === 'agent') {
          s.fully_loaded_cost_per_fte_month = (s.fully_loaded_cost_per_fte_month || 0) * (1 - variationPercent);
        }
      }
      const resLow = calculateScenario(cloneLow, allProviders, creditSettings);

      const cloneHigh = cloneScenario(scenario);
      for (const s of cloneHigh.services ?? []) {
        if (s.service_type === 'agent') {
          s.fully_loaded_cost_per_fte_month = (s.fully_loaded_cost_per_fte_month || 0) * (1 + variationPercent);
        }
      }
      const resHigh = calculateScenario(cloneHigh, allProviders, creditSettings);

      results.push({
        parameter: 'Fully Loaded FTE Cost',
        key: 'fully_loaded_cost_per_fte_month',
        lowValueText: varLabelLow,
        highValueText: varLabelHigh,
        lowNpv: resLow.npvUpper,
        highNpv: resHigh.npvUpper,
        lowIrr: resLow.irr.annualNominal,
        highIrr: resHigh.irr.annualNominal,
        lowPayback: resLow.paybackUpper,
        highPayback: resHigh.paybackUpper,
        impactRange: Math.abs(resHigh.npvUpper - resLow.npvUpper)
      });
    }
  }

  // Sort by impact range descending (standard Tornado chart sorting)
  results.sort((a, b) => b.impactRange - a.impactRange);

  return {
    scenarioId: scenario.id,
    baseNpv,
    baseIrr: baseResult.irr.annualNominal,
    basePayback: baseResult.paybackUpper,
    results
  };
}
