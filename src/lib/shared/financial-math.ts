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
  MonetizationRevenueResult
} from './types.js';

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
export function calculateIRR(cashFlows: number[]): number | null {
  // Check if we have at least one positive and one negative cash flow
  let hasPositive = false;
  let hasNegative = false;
  for (const cf of cashFlows) {
    if (cf > 0) hasPositive = true;
    if (cf < 0) hasNegative = true;
  }
  if (!hasPositive || !hasNegative) return null;

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
        // Annualize: (1 + r_monthly)^12 - 1
        const annualizedIrr = Math.pow(1 + nextR, 12) - 1;
        if (!isNaN(annualizedIrr) && isFinite(annualizedIrr)) {
          return parseFloat(annualizedIrr.toFixed(4));
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
      const annualizedIrr = Math.pow(1 + mid, 12) - 1;
      if (!isNaN(annualizedIrr) && isFinite(annualizedIrr)) {
        return parseFloat(annualizedIrr.toFixed(4));
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
  const revenueSource = scenario.revenue_source ?? 'cohort';

  if (!scenario.scope_cohorts || scenario.scope_cohorts.length === 0) {
    throw new Error(`Scenario '${scenario.name}' has no cohort configurations.`);
  }

  // 1. Generate baseline (without AI) and with-AI cohort timelines using adopter/non-adopter split
  const baselineResults = scenario.scope_cohorts.map(cc => {
    const { adopter, nonAdopter } = splitCohortForAi({
      ...cc,
      churn_reduction: 0,
      acquisition_uplift: 0,
      arpu_uplift_percent: 0,
      arpu_uplift: 0
    });
    return {
      adopterModel: buildCohortModel(adopter, projectionMonths),
      nonAdopterModel: buildCohortModel(nonAdopter, projectionMonths)
    };
  });
  const splitResults = scenario.scope_cohorts.map(cc => {
    const { adopter, nonAdopter } = splitCohortForAi(cc);
    return {
      adopterModel: buildCohortModel(adopter, projectionMonths),
      nonAdopterModel: buildCohortModel(nonAdopter, projectionMonths)
    };
  });

  // 2. Build provider lookup map
  const providersMap = new Map<string, Provider>();
  for (const prov of allProviders) {
    providersMap.set(prov.id, prov);
  }

  const timeline: MonthlyBreakdown[] = [];
  let cumulativeCashFlow = 0;

  // 3. Loop through projection months
  for (let t = 0; t < projectionMonths; t++) {
    let activeCustomers = 0;
    let activeAiUsers = 0;
    let grossRevenue = 0;
    let baselineRevenue = 0;
    let baselineCustomers = 0;

    // Aggregate over all cohort models for month t
    for (let i = 0; i < scenario.scope_cohorts.length; i++) {
      const baseRes = baselineResults[i];
      const { adopterModel, nonAdopterModel } = splitResults[i];

      const baseAdopterMonth = baseRes.adopterModel.timeline[t];
      const baseNonAdopterMonth = baseRes.nonAdopterModel.timeline[t];
      const adopterMonth = adopterModel.timeline[t];
      const nonAdopterMonth = nonAdopterModel.timeline[t];

      if (adopterMonth) {
        activeCustomers += adopterMonth.activeCustomers;
        activeAiUsers += adopterMonth.activeCustomers; // exact adopters
        grossRevenue += adopterMonth.mrr;
      }
      if (nonAdopterMonth) {
        activeCustomers += nonAdopterMonth.activeCustomers;
        grossRevenue += nonAdopterMonth.mrr;
      }
      if (baseAdopterMonth) {
        baselineCustomers += baseAdopterMonth.activeCustomers;
        baselineRevenue += baseAdopterMonth.mrr;
      }
      if (baseNonAdopterMonth) {
        baselineCustomers += baseNonAdopterMonth.activeCustomers;
        baselineRevenue += baseNonAdopterMonth.mrr;
      }
    }

    // Cohort ΔRevenue — incremental MRR uplift from AI adoption.
    const cohortRevenue = grossRevenue - baselineRevenue;

    // AI monetization revenue — direct sales of AI features, when enabled for this scenario.
    let monetization: MonetizationRevenueResult = {
      totalRevenue: 0, addonRevenue: 0, usageRevenue: 0, hybridBaseRevenue: 0, overchargeRevenue: 0
    };
    if (revenueSource === 'monetization' || revenueSource === 'both') {
      const activeServices = (scenario.services ?? []).filter(s => t >= (s.rollout_month ?? 0));
      monetization = calculateMonetizationRevenue(activeAiUsers, activeServices, creditSettings, providersMap);
    }

    let revenue: number;
    switch (revenueSource) {
      case 'monetization':
        revenue = monetization.totalRevenue;
        break;
      case 'both':
        revenue = cohortRevenue + monetization.totalRevenue;
        break;
      default:
        revenue = cohortRevenue;
    }

    let opex = 0;
    let capex = 0;
    let tokenCosts = 0;

    // A. Direct AI Services Costs (from scenario_services rollout)
    if (scenario.services) {
      for (const service of scenario.services) {
        const rolloutMonth = service.rollout_month ?? 0;
        // Only active if month is at or after rollout month
        if (t >= rolloutMonth) {
          let serviceTokenCost = 0;
          if (service.provider_id && providersMap.has(service.provider_id)) {
            const provider = providersMap.get(service.provider_id)!;
            const inputPrice = provider.input_price / 1000000;
            const outputPrice = provider.output_price / 1000000;

            // Monthly service execution token cost
            serviceTokenCost = activeAiUsers *
              (service.avg_requests_per_user_month || 0) *
              ((service.avg_input_tokens || 0) * inputPrice + (service.avg_output_tokens || 0) * outputPrice);
          }

          const serviceFixedCost = service.fixed_cost_per_month || 0;
          tokenCosts += serviceTokenCost + serviceFixedCost;
        }
      }
    }

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
            capex += item.amount;
          } else {
            opex += item.amount;
          }
        }
      }
    }

    // Direct token costs count as opex infrastructure
    const totalCosts = opex + capex + tokenCosts;
    const netCashFlow = revenue - totalCosts;
    cumulativeCashFlow += netCashFlow;

    timeline.push({
      month: t,
      revenue: parseFloat(revenue.toFixed(2)),
      customers: activeCustomers,
      aiUsers: activeAiUsers,
      opex: parseFloat(opex.toFixed(2)),
      capex: parseFloat(capex.toFixed(2)),
      tokenCosts: parseFloat(tokenCosts.toFixed(2)),
      totalCosts: parseFloat(totalCosts.toFixed(2)),
      netCashFlow: parseFloat(netCashFlow.toFixed(2)),
      cumulativeCashFlow: parseFloat(cumulativeCashFlow.toFixed(2)),
      grossRevenue: parseFloat(grossRevenue.toFixed(2)),
      baselineRevenue: parseFloat(baselineRevenue.toFixed(2)),
      baselineCustomers: Math.round(baselineCustomers),
      monetizationRevenue: parseFloat(monetization.totalRevenue.toFixed(2)),
      addonRevenue: parseFloat(monetization.addonRevenue.toFixed(2)),
      usageRevenue: parseFloat(monetization.usageRevenue.toFixed(2)),
      hybridBaseRevenue: parseFloat(monetization.hybridBaseRevenue.toFixed(2)),
      overchargeRevenue: parseFloat(monetization.overchargeRevenue.toFixed(2))
    });
  }

  // 4. Calculate aggregate KPIs
  const cashFlows = timeline.map(m => m.netCashFlow);
  const paybackMonths = calculatePaybackPeriod(cashFlows, annualDiscountRate);
  const npv = calculateNPV(cashFlows, annualDiscountRate);
  const irrAnnual = calculateIRR(cashFlows);
  const tco = calculateTCO(timeline);

  const totalRevenue = timeline.reduce((acc, curr) => acc + curr.revenue, 0);
  const totalCost = tco;
  // ROI = (Total Revenue - Total Cost) / Total Cost
  const roiPercent = totalCost > 0 ? parseFloat(((totalRevenue - totalCost) / totalCost).toFixed(4)) : 0;

  return {
    timeline,
    paybackMonths,
    npv,
    irrAnnual,
    tco,
    roiPercent
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

  const revenueSource = scenario.revenue_source ?? 'cohort';
  const monetizationActive =
    (revenueSource === 'monetization' || revenueSource === 'both') &&
    (scenario.services ?? []).some(s => s.monetization && s.monetization.monetization_type !== 'none');

  const baseResult = calculateScenario(scenario, allProviders, creditSettings);
  const baseNpv = baseResult.npv;

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
      lowNpv: resLow.npv,
      highNpv: resHigh.npv,
      lowIrr: resLow.irrAnnual,
      highIrr: resHigh.irrAnnual,
      lowPayback: resLow.paybackMonths,
      highPayback: resHigh.paybackMonths,
      impactRange: Math.abs(resHigh.npv - resLow.npv)
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
      lowNpv: resLow.npv,
      highNpv: resHigh.npv,
      lowIrr: resLow.irrAnnual,
      highIrr: resHigh.irrAnnual,
      lowPayback: resLow.paybackMonths,
      highPayback: resHigh.paybackMonths,
      impactRange: Math.abs(resHigh.npv - resLow.npv)
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
      lowNpv: resLow.npv,
      highNpv: resHigh.npv,
      lowIrr: resLow.irrAnnual,
      highIrr: resHigh.irrAnnual,
      lowPayback: resLow.paybackMonths,
      highPayback: resHigh.paybackMonths,
      impactRange: Math.abs(resHigh.npv - resLow.npv)
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
      lowNpv: resLow.npv,
      highNpv: resHigh.npv,
      lowIrr: resLow.irrAnnual,
      highIrr: resHigh.irrAnnual,
      lowPayback: resLow.paybackMonths,
      highPayback: resHigh.paybackMonths,
      impactRange: Math.abs(resHigh.npv - resLow.npv)
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
      lowNpv: resLow.npv,
      highNpv: resHigh.npv,
      lowIrr: resLow.irrAnnual,
      highIrr: resHigh.irrAnnual,
      lowPayback: resLow.paybackMonths,
      highPayback: resHigh.paybackMonths,
      impactRange: Math.abs(resLow.npv - resHigh.npv)
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
      lowNpv: resLow.npv,
      highNpv: resHigh.npv,
      lowIrr: resLow.irrAnnual,
      highIrr: resHigh.irrAnnual,
      lowPayback: resLow.paybackMonths,
      highPayback: resHigh.paybackMonths,
      impactRange: Math.abs(resLow.npv - resHigh.npv)
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
      lowNpv: resLow.npv,
      highNpv: resHigh.npv,
      lowIrr: resLow.irrAnnual,
      highIrr: resHigh.irrAnnual,
      lowPayback: resLow.paybackMonths,
      highPayback: resHigh.paybackMonths,
      impactRange: Math.abs(resLow.npv - resHigh.npv)
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
        lowNpv: resLow.npv,
        highNpv: resHigh.npv,
        lowIrr: resLow.irrAnnual,
        highIrr: resHigh.irrAnnual,
        lowPayback: resLow.paybackMonths,
        highPayback: resHigh.paybackMonths,
        impactRange: Math.abs(resHigh.npv - resLow.npv)
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
        lowNpv: resLow.npv,
        highNpv: resHigh.npv,
        lowIrr: resLow.irrAnnual,
        highIrr: resHigh.irrAnnual,
        lowPayback: resLow.paybackMonths,
        highPayback: resHigh.paybackMonths,
        impactRange: Math.abs(resHigh.npv - resLow.npv)
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
        lowNpv: resLow.npv,
        highNpv: resHigh.npv,
        lowIrr: resLow.irrAnnual,
        highIrr: resHigh.irrAnnual,
        lowPayback: resLow.paybackMonths,
        highPayback: resHigh.paybackMonths,
        impactRange: Math.abs(resHigh.npv - resLow.npv)
      });
    }
  }

  // Sort by impact range descending (standard Tornado chart sorting)
  results.sort((a, b) => b.impactRange - a.impactRange);

  return {
    scenarioId: scenario.id,
    baseNpv,
    baseIrr: baseResult.irrAnnual,
    basePayback: baseResult.paybackMonths,
    results
  };
}
