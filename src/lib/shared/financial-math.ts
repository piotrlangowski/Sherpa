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
  MonetizationType,
  CreditSettings,
  MonetizationRevenueResult,
  IrrResult,
  ModelingType,
  RevenueCarrier,
  RevenueSource,
  RevenueBridge,
  RevenueIntegrityResult,
  RevenueIntegrityStatus,
  CompositeBreakdown,
  Settings,
  ScenarioDiagnostic,
  EvcInputs,
  EvcResult,
  Currency,
  CaptureCurveResult,
  CaptureCurvePoint,
  PricingCorridorPoint,
  PricingCorridorResult,
  PocketMarginWaterfallStep,
  PocketMarginWaterfallResult,
  DriverProfile,
  StreamMargins,
  PoolAttribution,
  PoolEconomics,
  EvcMultiplierSuggestion,
  AgentDeflectionCorridorPoint,
  AgentDeflectionCorridorResult,
  EntityOverride
} from './types.js';

/**
 * Currency symbol + position, mirroring `src/lib/utils/constants.ts` CURRENCIES.
 * Duplicated here (not imported) because the MCP build only symlinks
 * `src/lib/shared/`, not `src/lib/utils/`. Keep the two in sync when adding a currency.
 */
const CURRENCY_DISPLAY: Record<Currency, { symbol: string; position: 'prefix' | 'suffix' }> = {
  USD: { symbol: '$', position: 'prefix' },
  EUR: { symbol: '€', position: 'prefix' },
  PLN: { symbol: 'zł', position: 'suffix' },
  GBP: { symbol: '£', position: 'prefix' }
};

/**
 * Formats an amount already expressed in the workspace currency. Diagnostics
 * report engine outputs (revenue, EVC, token costs), which are normalized to
 * `settings.currency` upstream, so this only fixes the displayed symbol — it does
 * not convert. Pure (Intl only) so it is safe in the shared/MCP build.
 */
function formatMoney(value: number, currency: Currency, decimals = 0): string {
  const info = CURRENCY_DISPLAY[currency] ?? CURRENCY_DISPLAY.USD;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
  return info.position === 'prefix' ? `${info.symbol}${formatted}` : `${formatted} ${info.symbol}`;
}

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
  // Amounts in messages are already in the workspace currency; render the symbol.
  const money = (value: number, decimals = 0) => formatMoney(value, settings.currency, decimals);

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
        message: `Cohort "${c.name}": a ${((c.arpu_uplift_percent ?? 0) * 100).toFixed(0)}% ARPU uplift on a ${money(0)} base contributes ${money(0)}. Set a non-zero base ARPU, or use a flat uplift (arpu_uplift) instead of a percentage.`
      });
    }
  }

  // #2 A plan-carrier scenario with no seats books $0 subscription. The plan
  // carrier also books service monetization, so "pure cost" is only true when
  // no service is monetized either.
  if (carrier === 'plan') {
    const totalSeats = plans.reduce((sum, p) => sum + (p.seats ?? 0), 0);
    if (totalSeats <= 0) {
      const hasMonetization = services.some(s => s.monetization && s.monetization.monetization_type !== 'none');
      diagnostics.push({
        code: 'carrier_no_revenue',
        severity: hasMonetization ? 'info' : 'warn',
        field: 'plans',
        message: hasMonetization
          ? `Revenue carrier is "plan" but total plan seats = 0, so the subscription component books ${money(0)} — revenue comes only from service monetization riding on the plan carrier. Set seats on at least one plan to book subscription revenue too.`
          : `Revenue carrier is "plan" but total plan seats = 0, so the designated revenue source produces ${money(0)} — the scenario is pure cost. Set seats on at least one plan.`
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
          message: `Cohort "${c.name}" has ARPU ${money(c.base_arpu ?? 0)} but the revenue carrier is "${carrier}", so its revenue is ignored (only its cost remains). Switch the carrier to "cohort" to book it, or keep this cohort as context only.`
        });
      }
    }
  }

  // #3b Plan seats are informational under the pool carrier.
  if (carrier === 'pool') {
    const totalSeats = plans.reduce((sum, p) => sum + (p.seats ?? 0), 0);
    if (totalSeats > 0) {
      diagnostics.push({
        code: 'pool_seats_informational',
        severity: 'info',
        field: 'plans',
        message: 'Plan seats are informational under the pool carrier (revenue = tier fee and overage).'
      });
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
        message: `Uplift levers are configured but the modeled benefit is ~0 (PI ≈ 0). The per-user value is likely ${money(0)} (e.g. base ARPU = 0), so retention/expansion/acquisition levers have nothing to act on.`
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
        ? `${money(pricePerCredit, 4)}/credit revenue vs ~${money(costPerUserMonth / creditsPerUser, 4)}/credit provider token cost (per-credit figures use the provider's credit conversion (input_tokens_per_credit/output_tokens_per_credit), not pool burn rates)`
        : `~${money(revenuePerUserMonth, 2)}/user-mo revenue vs ~${money(costPerUserMonth, 2)}/user-mo provider token cost`;
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

  // ── Outcome-based Pricing Diagnostics (Gap A) ───────────────────────────
  for (const service of services) {
    const config = service.monetization;
    if (!config || config.monetization_type !== 'outcome') continue;

    const price = config.price_per_outcome ?? 0;
    if (price <= 0) {
      diagnostics.push({
        code: 'outcome_price_zero',
        severity: 'warn',
        field: `service:${service.id}`,
        message: `Service "${service.name}": outcome-based pricing is active but price per outcome is ${money(price, 2)}. Set a positive price per outcome.`
      });
    }

    if (config.outcome_basis === 'per_user') {
      const volume = config.outcomes_per_user_month ?? 0;
      if (volume <= 0) {
        diagnostics.push({
          code: 'outcome_volume_zero',
          severity: 'warn',
          field: `service:${service.id}`,
          message: `Service "${service.name}": outcome basis is "per_user" but outcomes per user month is ${volume}. Set a positive outcomes volume.`
        });
      }
    } else if (config.outcome_basis === 'deflected') {
      if (service.service_type !== 'agent') {
        diagnostics.push({
          code: 'outcome_deflected_non_agent',
          severity: 'warn',
          field: `service:${service.id}`,
          message: `Service "${service.name}": outcome basis is "deflected" but the service type is not "agent". Only agent services support deflected interaction metrics.`
        });
      }
    }
  }

  // ── Value-based / EVC Pricing Diagnostics (Gap B) ───────────────────────────
  if (result?.evc) {
    const evc = result.evc;
    if (evc.negativeValueTotal > evc.positiveValueTotal) {
      diagnostics.push({
        code: 'evc_negative_net_value',
        severity: 'info',
        message: `EVC analysis: The total negative value (${money(evc.negativeValueTotal)}) exceeds the positive value (${money(evc.positiveValueTotal)}). The net created value is negative (${money(evc.netCreatedValue)}).`
      });
    }

    // Sum first 12 months revenue of the scenario (m.revenue under upper bound)
    const first12Months = result.timeline.slice(0, 12);
    const annualizedPrice = first12Months.reduce((sum, m) => sum + m.revenue, 0);

    // If walk-away priceFloor exceeds the actual scenario pricing (underpricing)
    if (evc.priceFloor > annualizedPrice) {
      diagnostics.push({
        code: 'evc_price_under_floor',
        severity: 'info',
        message: `EVC analysis: Annualized scenario pricing (${money(annualizedPrice)}) is below the calculated walk-away price floor (${money(evc.priceFloor)}). You may be underpricing the solution.`
      });
    }
  }

  // ── Per-cohort EVC multiplier guardrails (ADR 0011 Track A) ─────────────────
  const referenceCohortId = scenario.evc_reference_cohort_id;
  const referenceCohort = referenceCohortId ? cohorts.find(c => c.id === referenceCohortId) : undefined;
  if (referenceCohort) {
    const selfMultiplierSet =
      (referenceCohort.evc_extra_value_multiplier !== undefined && referenceCohort.evc_extra_value_multiplier !== 1.0) ||
      (referenceCohort.evc_negative_value_multiplier !== undefined && referenceCohort.evc_negative_value_multiplier !== 1.0) ||
      (referenceCohort.evc_nba_multiplier !== undefined && referenceCohort.evc_nba_multiplier !== 1.0);
    if (selfMultiplierSet) {
      diagnostics.push({
        code: 'evc_reference_cohort_self_multiplier',
        severity: 'warn',
        field: `cohort:${referenceCohort.id}`,
        message: `Cohort "${referenceCohort.name}" is the EVC reference cohort but carries a non-1.0 multiplier override — it is 1.0 relative to itself by definition. Remove the override or pick a different reference cohort.`
      });
    }
  } else {
    for (const c of cohorts) {
      const hasMultiplier =
        (c.evc_extra_value_multiplier !== undefined && c.evc_extra_value_multiplier !== 1.0) ||
        (c.evc_negative_value_multiplier !== undefined && c.evc_negative_value_multiplier !== 1.0) ||
        (c.evc_nba_multiplier !== undefined && c.evc_nba_multiplier !== 1.0);
      if (hasMultiplier) {
        diagnostics.push({
          code: 'evc_multiplier_no_reference',
          severity: 'warn',
          field: `cohort:${c.id}`,
          message: `Cohort "${c.name}" has an EVC multiplier override set, but the scenario has no evc_reference_cohort_id — the multiplier is relative to an undefined baseline. Set a reference cohort.`
        });
      }
    }
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

/** Soft (warn-only) per-stream gross-margin floors (ADR 0009). Cascade: client_base global
 *  default → per-scenario override; these are the pure-engine fallback when no override is given. */
export const DEFAULT_COPILOT_MARGIN_THRESHOLD = 0.78;
export const DEFAULT_AGENT_MARGIN_THRESHOLD = 0.62;

/** ADR 0010 parameters (settled 2026-06-28): hybrid-billed pool overage carries a >1x markup. */
export const HYBRID_OVERAGE_MARKUP = 1.3;

/**
 * Classifies a scenario's service mix into a driver profile (ADR 0009): which
 * archetype(s) actually carry value. service_type defaults to 'copilot' (the DB
 * default) when unset, matching the rest of the engine's archetype branching.
 */
export function detectDriverProfile(
  scenario: Pick<Scenario, 'services' | 'plans' | 'modeling_type' | 'revenue_carrier' | 'revenue_bridge'>
): DriverProfile {
  const services = scenario.services ?? [];
  const hasAgent = services.some(s => s.service_type === 'agent');
  const hasCopilotService = services.some(s => (s.service_type ?? 'copilot') !== 'agent');
  // A seat-priced plan is the copilot/seat economy even with no literal copilot Service attached
  // (ADR 0009 Phase A: copilot seat-plan + agent per-resolution as one two-track scenario) — but
  // only when its seats actually book revenue (carrier 'plan', or 'cohort' bridged separate_market).
  const carrier = resolveCarrier(scenario.modeling_type, scenario.revenue_carrier);
  const seatPlanBooksRevenue = carrier === 'plan' || (carrier === 'cohort' && scenario.revenue_bridge === 'separate_market');
  const hasSeatPlan = seatPlanBooksRevenue && (scenario.plans ?? []).some(p => (p.seats ?? 0) > 0);
  const hasCopilot = hasCopilotService || hasSeatPlan;
  if (hasAgent && hasCopilot) return 'mixed';
  if (hasAgent) return 'interaction_only';
  return 'seat_only';
}

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
    case 'composite':   return 'composite';
    case 'appraisal':   return revenueCarrier ?? 'cohort';
    default:            return revenueCarrier ?? 'cohort';
  }
}

export interface ResolvedRevenueModel {
  modeling_type: ModelingType;
  revenue_carrier: RevenueCarrier;
}

/**
 * Derives a back-compat `modeling_type` label from the authoritative carrier.
 * A cohort carrier that also bridges plan seats stays `appraisal` (not
 * `incremental`) so the integrity check still permits the bridge.
 */
export function deriveModelingType(
  carrier: RevenueCarrier,
  revenueBridge?: RevenueBridge | null
): ModelingType {
  switch (carrier) {
    case 'composite': return 'composite';
    case 'plan':    return 'gtm';
    case 'pack':
    case 'feature':
    case 'pool':    return 'appraisal';
    case 'cohort':
    default:        return revenueBridge ? 'appraisal' : 'incremental';
  }
}

/**
 * Single, carrier-first source of truth for collapsing any combination of
 * revenue inputs — an explicit `revenue_carrier` (authoritative), a
 * `modeling_type`, or the deprecated `revenue_source` — into a consistent
 * `{ modeling_type, revenue_carrier }` pair satisfying the invariant
 * `resolveCarrier(modeling_type, revenue_carrier) === revenue_carrier` (so the
 * calc engine, which gates on `resolveCarrier`, agrees with the stored carrier).
 * Replaces the type→carrier collapse the MCP create/update handlers duplicated.
 */
export function resolveRevenueModel(input: {
  modeling_type?: ModelingType | null;
  revenue_carrier?: RevenueCarrier | null;
  revenue_source?: RevenueSource | null;
  revenue_bridge?: RevenueBridge | null;
}): ResolvedRevenueModel {
  // 1. An explicit carrier is authoritative (carrier-first). Keep a provided
  //    modeling_type only when it already resolves to that carrier; otherwise
  //    derive a consistent label.
  if (input.revenue_carrier) {
    const carrier = input.revenue_carrier;
    const modeling_type =
      input.modeling_type && resolveCarrier(input.modeling_type, carrier) === carrier
        ? input.modeling_type
        : deriveModelingType(carrier, input.revenue_bridge);
    return { modeling_type, revenue_carrier: carrier };
  }
  // 2. No carrier: a modeling_type drives it (incremental→cohort, gtm→plan,
  //    appraisal→cohort default).
  if (input.modeling_type) {
    return {
      modeling_type: input.modeling_type,
      revenue_carrier: resolveCarrier(input.modeling_type, null)
    };
  }
  // 3. Fall back to the deprecated revenue_source mapping.
  switch (input.revenue_source) {
    case 'monetization': return { modeling_type: 'appraisal',   revenue_carrier: 'feature' };
    case 'both':         return { modeling_type: 'appraisal',   revenue_carrier: 'cohort' };
    case 'cohort':       return { modeling_type: 'incremental', revenue_carrier: 'cohort' };
  }
  // 4. Nothing specified.
  return { modeling_type: 'incremental', revenue_carrier: 'cohort' };
}

export interface CompositeComponentResolution {
  role: 'books' | 'folded' | 'pool_billed' | 'blocked' | 'empty';
  reason: string;
}

export interface CompositeComponentsResolved {
  cohort: CompositeComponentResolution;
  plan: CompositeComponentResolution;
  copilotMonetization: CompositeComponentResolution;
  agentMonetization: CompositeComponentResolution;
  pool: CompositeComponentResolution;
  agentOutcome: CompositeComponentResolution;
  copilotOutcome: CompositeComponentResolution;
  unmonetizedLabor: CompositeComponentResolution;
}

export function resolveCompositeComponents(scenario: Scenario): CompositeComponentsResolved {
  const hasCohort = (scenario.scope_cohorts ?? []).length > 0;
  const totalSeats = (scenario.plans ?? []).reduce((sum, p) => sum + (p.seats ?? 0), 0);
  const bridge = scenario.revenue_bridge;
  const includesMon = scenario.arpu_uplift_includes_monetization ?? true;
  const poolServiceIds = new Set((scenario.pool_burn_rates ?? []).map(br => br.service_id));
  const hasPool = !!scenario.pool_tier_id;

  const hasCopilotMon = (scenario.services ?? []).some(s => s.service_type === 'copilot' && s.monetization && s.monetization.monetization_type !== 'none' && s.monetization.monetization_type !== 'outcome');
  const hasAgentMon = (scenario.services ?? []).some(s => s.service_type === 'agent' && s.monetization && s.monetization.monetization_type !== 'none' && s.monetization.monetization_type !== 'outcome');
  
  const hasCopilotOutcome = (scenario.services ?? []).some(s => s.service_type === 'copilot' && s.monetization?.monetization_type === 'outcome');
  const hasAgentOutcome = (scenario.services ?? []).some(s => s.service_type === 'agent' && s.monetization?.monetization_type === 'outcome');

  const hasUnmonetizedAgents = (scenario.services ?? []).some(s => s.service_type === 'agent' && (!s.monetization || s.monetization.monetization_type === 'none'));

  // 1. Cohort
  const cohort: CompositeComponentResolution = hasCohort
    ? { role: 'books', reason: 'Cohort adoption books ARPU uplift' }
    : { role: 'empty', reason: 'No cohorts configured' };

  // 2. Plan
  let plan: CompositeComponentResolution;
  if (totalSeats === 0) {
    plan = { role: 'empty', reason: 'No plan seats configured' };
  } else if (!bridge) {
    plan = { role: 'blocked', reason: 'Seats configured but no bridge selected' };
  } else if (bridge === 'separate_market') {
    plan = { role: 'books', reason: 'Plan books separate market subscriptions' };
  } else {
    plan = { role: 'folded', reason: 'Plan is upsell on cohort (folded into cohort uplift)' };
  }

  // 3. Copilot Monetization
  let copilotMonetization: CompositeComponentResolution;
  if (!hasCopilotMon) {
    copilotMonetization = { role: 'empty', reason: 'No copilot monetization configured' };
  } else if (includesMon) {
    copilotMonetization = { role: 'folded', reason: 'Copilot monetization is folded (cross-check) into cohort uplift' };
  } else {
    copilotMonetization = { role: 'books', reason: 'Copilot monetization books additive revenue' };
  }

  // 4. Agent Monetization
  let agentMonetization: CompositeComponentResolution;
  if (!hasAgentMon) {
    agentMonetization = { role: 'empty', reason: 'No agent monetization configured' };
  } else {
    const allInPool = (scenario.services ?? [])
      .filter(s => s.service_type === 'agent' && s.monetization && s.monetization.monetization_type !== 'none' && s.monetization.monetization_type !== 'outcome')
      .every(s => poolServiceIds.has(s.id));
    if (hasPool && allInPool) {
      agentMonetization = { role: 'pool_billed', reason: 'Agent monetization is pool-billed' };
    } else {
      agentMonetization = { role: 'books', reason: 'Agent monetization books additive revenue' };
    }
  }

  // 5. Pool
  const pool: CompositeComponentResolution = hasPool
    ? { role: 'books', reason: 'Pool tier fee and overage books revenue' }
    : { role: 'empty', reason: 'No credit pool tier configured' };

  // 6. Agent Outcome
  const agentOutcome: CompositeComponentResolution = hasAgentOutcome
    ? { role: 'books', reason: 'Agent outcome-based pricing books disjoint revenue' }
    : { role: 'empty', reason: 'No agent outcome monetization configured' };

  // 7. Copilot Outcome
  const copilotOutcome: CompositeComponentResolution = hasCopilotOutcome
    ? { role: 'books', reason: 'Copilot outcome-based pricing books disjoint revenue' }
    : { role: 'empty', reason: 'No copilot outcome monetization configured' };

  // 8. Unmonetized Labor
  const unmonetizedLabor: CompositeComponentResolution = hasUnmonetizedAgents
    ? { role: 'books', reason: 'Unmonetized agent labor savings book displaced cost value' }
    : { role: 'empty', reason: 'No unmonetized agent services' };

  return {
    cohort,
    plan,
    copilotMonetization,
    agentMonetization,
    pool,
    agentOutcome,
    copilotOutcome,
    unmonetizedLabor
  };
}

/**
 * Builds S-curve market penetration curves based on normalized logistic functions.
 * - withoutAi: slowly reaches baseline SOM (som)
 * - withAiLower: accelerated pace to the same baseline SOM (som)
 * - withAiUpper: accelerated pace to AI SOM (somAi = min(som * (1 + lift), sam))
 */
export function buildPenetrationCurve(params: {
  tam: number;
  sam: number;
  som: number;
  baselineMonths: number;
  accelerationFactor: number;
  somLiftPct: number;
  projectionMonths: number;
}): { withoutAi: number[]; withAiLower: number[]; withAiUpper: number[] } {
  const { tam, sam, som, baselineMonths, accelerationFactor, somLiftPct, projectionMonths } = params;
  const k = 0.3; // fixed steepness

  // Calculate midpoints
  const tMidBase = baselineMonths > 0 ? baselineMonths : 1;
  const tMidAi = tMidBase * (accelerationFactor > 0 ? accelerationFactor : 1.0);

  // Clamped AI SOM ceiling
  const somAi = Math.min(som * (1 + somLiftPct), sam);

  const withoutAi: number[] = [];
  const withAiLower: number[] = [];
  const withAiUpper: number[] = [];

  // Logistic function L(t, t_mid)
  const logistic = (t: number, tMid: number) => 1 / (1 + Math.exp(-k * (t - tMid)));

  // Normalize so that at t=0, P(0) = 0
  const l0Base = logistic(0, tMidBase);
  const l0Ai = logistic(0, tMidAi);

  const denomBase = 1 - l0Base;
  const denomAi = 1 - l0Ai;

  for (let t = 1; t <= projectionMonths; t++) {
    // Standard 1-based indexing for timeline months
    const valBase = denomBase > 0 ? (logistic(t, tMidBase) - l0Base) / denomBase : 1.0;
    const valAi = denomAi > 0 ? (logistic(t, tMidAi) - l0Ai) / denomAi : 1.0;

    withoutAi.push(Math.max(0, valBase * som));
    withAiLower.push(Math.max(0, valAi * som));
    withAiUpper.push(Math.max(0, valAi * somAi));
  }

  return { withoutAi, withAiLower, withAiUpper };
}

/**
 * Validates that a scenario's revenue configuration doesn't double-count.
 * Returns 'block' when saving should be prevented, 'warn' when the user
 * should be alerted, and 'ok' when everything is anchored properly.
 */
/**
 * ADR 0009 Decision 1 (disjointness doctrine) — a service's monetized revenue is
 * disjoint from the cohort/seat economy when it is an agent (per-interaction /
 * per-outcome) service: a different event class, and often a different payer,
 * than the seat subscription. A monetized *copilot* service shares the cohort's
 * per-seat event (same user, same billing unit), so summing it with cohort ARPU
 * would double-count — it is NOT disjoint.
 */
export function streamsDisjoint(scenario: Scenario): boolean {
  const monetizedServices = (scenario.services ?? []).filter(
    s => s.monetization && s.monetization.monetization_type !== 'none'
  );
  if (monetizedServices.length === 0) return true;
  return monetizedServices.every(s => s.service_type === 'agent');
}

export function validateRevenueIntegrity(scenario: Scenario): RevenueIntegrityResult {
  const mt = scenario.modeling_type ?? 'appraisal';
  const carrier = resolveCarrier(mt, scenario.revenue_carrier);

  // ADR 0010 & ADR 0014 — billing-homogeneity invariant.
  if (carrier === 'pool' || carrier === 'composite') {
    const poolServiceIds = new Set((scenario.pool_burn_rates ?? []).map(br => br.service_id));
    if (poolServiceIds.size > 0) {
      const types = new Set(
        (scenario.services ?? [])
          .filter(s => poolServiceIds.has(s.id))
          .map(s => s.monetization?.monetization_type)
          .filter((t): t is MonetizationType => !!t && t !== 'none')
      );
      if (types.size > 1 || types.has('outcome')) {
        return {
          status: 'block',
          severity: 'block',
          message: `Credit-pool scenarios require every pool service to share the same billing model (addon, usage, or hybrid) — found: ${types.size > 0 ? [...types].join(', ') : 'none'}. Outcome-based pricing is Approach A and is not compatible with a shared pool.`
        };
      }
    }
  }

  // ADR 0014 — composite carrier validations
  if (carrier === 'composite') {
    const totalSeats = (scenario.plans ?? []).reduce((sum, p) => sum + (p.seats ?? 0), 0);
    if (totalSeats > 0 && !scenario.revenue_bridge) {
      return {
        status: 'block',
        severity: 'block',
        message: `Composite scenario has ${totalSeats} plan seats but no revenue bridge defined. Choose 'Upsell on Cohort' or 'Separate Market'.`
      };
    }
    const hasCopilotMon = (scenario.services ?? []).some(
      s => s.service_type === 'copilot' && s.monetization && s.monetization.monetization_type !== 'none' && s.monetization.monetization_type !== 'outcome'
    );
    if (hasCopilotMon && (scenario.arpu_uplift_includes_monetization ?? true)) {
      return {
        status: 'warn',
        severity: 'warn',
        message: 'Copilot monetization is currently folded (cross-checked) into cohort uplift. Set "arpu_uplift_includes_monetization" to false to book separate additive revenue.'
      };
    }
    return { status: 'ok', severity: 'ok', message: null };
  }

  // ADR 0001 — incremental scenarios must not have non-disjoint monetization or seats.
  if (mt === 'incremental') {
    const hasMonetization = (scenario.services ?? []).some(
      s => s.monetization && s.monetization.monetization_type !== 'none'
    );
    if (hasMonetization && !streamsDisjoint(scenario)) {
      return {
        status: 'block',
        severity: 'block',
        message: 'Incremental scenarios cannot have copilot monetization overrides (same seat economy as cohort ARPU uplift). Remove monetization, switch the service to the agent archetype, or switch to appraisal/GTM modeling.'
      };
    }
    const totalSeats = (scenario.plans ?? []).reduce((sum, p) => sum + (p.seats ?? 0), 0);
    if (totalSeats > 0) {
      return {
        status: 'warn',
        severity: 'warn',
        message: 'Plan seats are inactive under the incremental (cohort) carrier — retained as perspective data, not booked as revenue.'
      };
    }
    if (hasMonetization) {
      return {
        status: 'warn',
        severity: 'warn',
        message: 'Monetized agent service(s) book outcome revenue alongside cohort ARPU uplift as a disjoint second stream (ADR 0009). Their labor savings are excluded from revenue (memo only) to avoid double-counting price against cost-avoidance.'
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
    if (override.usage_intensity !== null && override.usage_intensity !== undefined) c.usage_intensity = override.usage_intensity;
    // ADR 0011 Track A — EVC multipliers, relative to scenario.evc_reference_cohort_id.
    if (override.evc_extra_value_multiplier !== null && override.evc_extra_value_multiplier !== undefined) c.evc_extra_value_multiplier = override.evc_extra_value_multiplier;
    if (override.evc_negative_value_multiplier !== null && override.evc_negative_value_multiplier !== undefined) c.evc_negative_value_multiplier = override.evc_negative_value_multiplier;
    if (override.evc_nba_multiplier !== null && override.evc_nba_multiplier !== undefined) c.evc_nba_multiplier = override.evc_nba_multiplier;
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
    // Default EVC multipliers to 1.0 (no differentiation) when nothing in the cascade set them.
    if (c.evc_extra_value_multiplier === undefined) c.evc_extra_value_multiplier = 1.0;
    if (c.evc_negative_value_multiplier === undefined) c.evc_negative_value_multiplier = 1.0;
    if (c.evc_nba_multiplier === undefined) c.evc_nba_multiplier = 1.0;
    return c;
  });
}

/**
 * Data-derived suggested defaults for the Track A EVC extra-value multiplier (ADR 0011),
 * so the input isn't a blind guess. Relative to `scenario.evc_reference_cohort_id`; the
 * negative-value and NBA multipliers have no reliable auto-derivation and default to 1.0.
 * Pure — operates on already-resolved `scenario.scope_cohorts`.
 */
export function suggestEvcMultipliers(scenario: Scenario): EvcMultiplierSuggestion[] {
  const cohorts = scenario.scope_cohorts ?? [];
  const referenceId = scenario.evc_reference_cohort_id;
  const reference = referenceId ? cohorts.find(c => c.id === referenceId) : undefined;
  if (!reference) return [];

  const refArpu = reference.base_arpu || 0;
  const refIntensity = reference.usage_intensity ?? 1.0;

  return cohorts
    .filter(c => c.id !== reference.id)
    .map(c => {
      const arpuRatio = refArpu > 0 ? (c.base_arpu || 0) / refArpu : 1;
      const intensityRatio = refIntensity > 0 ? (c.usage_intensity ?? 1.0) / refIntensity : 1;
      const product = arpuRatio * intensityRatio;
      return {
        cohortId: c.id,
        cohortName: c.name,
        suggestedExtraValueMultiplier: product > 0 ? Math.sqrt(product) : 1.0,
        arpuRatio,
        intensityRatio
      };
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
  let outcomeRevenue = 0;

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

      case 'outcome':
        // Outcome revenue is accrued in the calculateScenario service loop, which is
        // band-aware (upper/lower) and where the 'deflected'/'interactions' bases need
        // the agent interaction metrics. No-op here to avoid double-counting 'per_user'.
        break;
    }
  }

  const totalRevenue = addonRevenue + usageRevenue + hybridBaseRevenue + overchargeRevenue + outcomeRevenue;
  return { totalRevenue, addonRevenue, usageRevenue, hybridBaseRevenue, overchargeRevenue, outcomeRevenue };
}

// ============================================================
// Scenario Calculation
// ============================================================

/**
 * Analytically calculates annualized labor savings per customer.
 */
export function calculateAnalyticalLaborSavings(
  scenario: Scenario
): number {
  const cohorts = scenario.scope_cohorts || [];
  if (cohorts.length === 0) return 0;

  const totalStartingCustomers = cohorts.reduce((sum, cc) => sum + (cc.current_users || 0), 0);
  const representativeCustomers = totalStartingCustomers > 0 ? totalStartingCustomers : 1;

  let totalMonthlySavings = 0;

  for (const service of scenario.services || []) {
    if (service.service_type !== 'agent') continue;

    const containmentRate = service.containment_rate || 0;
    const fullyLoadedCost = service.fully_loaded_cost_per_fte_month || 0;
    const averageHandleTime = service.average_handle_time_seconds || 0;
    const productiveHours = service.productive_hours_per_fte_month || 120;
    const baselineFte = service.baseline_fte || 0;

    let interactionsPerCustomerMonth = 0;
    if (service.interaction_driver_type === 'per_customer') {
      interactionsPerCustomerMonth = service.interactions_per_customer_month || 0;
    } else { // 'flat' or default
      interactionsPerCustomerMonth = (service.monthly_volume || 0) / representativeCustomers;
    }

    const deflected = interactionsPerCustomerMonth * containmentRate;
    const hoursSaved = (deflected * averageHandleTime) / 3600;
    const fteSaved = hoursSaved / productiveHours;
    const realizable = baselineFte > 0 ? Math.min(fteSaved, baselineFte / representativeCustomers) : fteSaved;

    totalMonthlySavings += realizable * fullyLoadedCost;
  }

  return totalMonthlySavings * 12; // Annualized
}

/** Per-cohort aggregate powering the Agent Cost-to-Serve / Deflection Value corridor (ADR 0009 Track B). */
export interface CohortAgentAggregate {
  customers: number;
  interactions: number;
  deflected: number;
  avoidedValue: number;
  realizableAvoidedValue: number;
  agentCogs: number;
  fixedCostAlloc: number;
  failedCost: number;
}

/**
 * Runs the full financial engine calculations for a Scenario.
 * This is a pure function – it requires providers to be passed in
 * rather than querying the database directly.
 */
export function calculateScenario(
  scenario: Scenario,
  allProviders: Provider[],
  creditSettings: CreditSettings = DEFAULT_CREDIT_SETTINGS,
  sweepParams?: { runtime_capture_pct?: number }
): CalculationResult {
  // Derive price overlay logic (Faza 2)
  if (
    scenario.price_from_evc &&
    scenario.evc_nba_annual_value !== undefined &&
    scenario.evc_nba_annual_value !== null
  ) {
    // 1. Calculate analytical labor savings
    const unitLaborSavingsAnnual = calculateAnalyticalLaborSavings(scenario);
    
    // 2. Compute EVC metrics analytically (no pre-pass scenario calculations!)
    // Compute weighted-average gross margin across cohorts for accurate vendor profit
    let weightedGrossMargin = 1.0;
    if (scenario.scope_cohorts && scenario.scope_cohorts.length > 0) {
      const totalUsers = scenario.scope_cohorts.reduce((s, cc) => s + (cc.current_users || 0), 0);
      if (totalUsers > 0) {
        weightedGrossMargin = scenario.scope_cohorts.reduce(
          (s, cc) => s + (cc.gross_margin !== undefined ? cc.gross_margin : 1.0) * (cc.current_users || 0), 0
        ) / totalUsers;
      } else {
        // Fallback: simple average when no users set
        weightedGrossMargin = scenario.scope_cohorts.reduce(
          (s, cc) => s + (cc.gross_margin !== undefined ? cc.gross_margin : 1.0), 0
        ) / scenario.scope_cohorts.length;
      }
    }

    const captureTargetPct = sweepParams?.runtime_capture_pct !== undefined ? sweepParams.runtime_capture_pct : (scenario.evc_capture_target_pct ?? 0.30);

    const evcInputs: EvcInputs = {
      nbaAnnualValue: scenario.evc_nba_annual_value,
      extraPositiveValue: scenario.evc_extra_positive_value ?? 0,
      negativeValue: scenario.evc_negative_value ?? 0,
      captureCeilingPct: scenario.evc_capture_ceiling_pct ?? 0.50,
      captureTargetPct,
      captureFloorPct: scenario.evc_capture_floor_pct ?? 0.15,
      unitLaborSavingsAnnual,
      grossMargin: weightedGrossMargin
    };
    const evcResult = calculateEVC([], evcInputs);
    const targetPrice = evcResult.targetCapturePerUserMonth;

    // 3. Clone scenario and apply pricing overlay to the correct carrier
    const overlaidScenario = cloneScenario(scenario);
    overlaidScenario.price_from_evc = false; // Prevent recursion in final call

    // ADR 0007 Decision 4 / ADR 0009 — derive price_per_outcome = captureTarget × value_per_outcome
    // for any outcome-monetized service that carries a per-outcome value. Independent of which
    // carrier books the seat-denominated price below (outcome revenue is a disjoint stream).
    if (overlaidScenario.services) {
      for (const s of overlaidScenario.services) {
        if (s.monetization?.monetization_type === 'outcome' && s.value_per_outcome != null) {
          s.monetization.price_per_outcome = captureTargetPct * s.value_per_outcome;
        }
      }
    }

    const carrier = resolveCarrier(overlaidScenario.modeling_type, overlaidScenario.revenue_carrier);

    if (carrier === 'cohort') {
      if (overlaidScenario.scope_cohorts) {
        const hasAnyValuePerOutcome = (overlaidScenario.services || []).some(s => s.value_per_outcome != null && s.value_per_outcome > 0);
        for (const cc of overlaidScenario.scope_cohorts) {
          let cohortTargetPrice = targetPrice;
          if (hasAnyValuePerOutcome) {
            const { netValue } = calculateCohortNetValue(cc, overlaidScenario);
            const referenceValue = (overlaidScenario.evc_nba_annual_value || 0) / 12;
            const capTarget = overlaidScenario.evc_capture_target_pct ?? 0.30;
            cohortTargetPrice = referenceValue + capTarget * netValue;
          }
          cc.arpu_uplift = cohortTargetPrice;
          cc.arpu_uplift_percent = 0; // reset percentage to avoid double calculation
        }
      }
    } else if (carrier === 'plan') {
      if (overlaidScenario.plans && overlaidScenario.plans.length > 0) {
        // Preserve tier differentiation: scale each plan's base_price proportionally
        // so the weighted-average price equals targetPrice.
        const totalSeats = overlaidScenario.plans.reduce((s, p) => s + (p.seats || 1), 0);
        const currentWeightedAvg = overlaidScenario.plans.reduce(
          (s, p) => s + (p.base_price || 0) * (p.seats || 1), 0
        ) / totalSeats;

        if (currentWeightedAvg > 0) {
          const scaleFactor = targetPrice / currentWeightedAvg;
          for (const plan of overlaidScenario.plans) {
            plan.base_price = (plan.base_price || 0) * scaleFactor;
          }
        } else {
          // No existing prices — fall back to uniform assignment
          for (const plan of overlaidScenario.plans) {
            plan.base_price = targetPrice;
          }
        }
      }
    } else {
      // Check for addon service monetization fee
      if (overlaidScenario.services) {
        for (const s of overlaidScenario.services) {
          if (s.monetization?.monetization_type === 'addon') {
            s.monetization.addon_monthly_fee = targetPrice;
          }
        }
      }
    }

    // 4. Calculate scenario using the overlaid parameters
    const finalResult = calculateScenario(overlaidScenario, allProviders, creditSettings, sweepParams);
    finalResult.evc = calculateEVC(finalResult.timeline, evcInputs);
    if (finalResult.evc) {
      finalResult.evc.pricingCorridor = buildPricingCorridor(scenario, finalResult.timeline, finalResult.evc, finalResult.cohortPriceMap);
      finalResult.evc.pocketMarginWaterfall = buildPocketMarginWaterfall(scenario, finalResult.timeline, finalResult.evc);
    }
    return finalResult;
  }

  const projectionMonths = scenario.projection_months ?? 36;
  const annualDiscountRate = scenario.discount_rate ?? 0.10;

  /** Resolves a cohort-scoped entity override for one agent service field, falling back to the service's own value. */
  const resolveCohortOverride = (
    serviceId: string,
    cohortId: string,
    field: 'interactions_per_customer_month' | 'containment_rate' | 'average_handle_time_seconds' | 'fully_loaded_cost_per_fte_month' | 'churn_rate_uplift',
    fallback: number
  ): number => {
    const ov = scenario.cohort_entity_overrides?.[`service:${serviceId}:${cohortId}`];
    const v = ov?.[field];
    return (v !== null && v !== undefined) ? v : fallback;
  };

  if (!scenario.scope_cohorts || scenario.scope_cohorts.length === 0) {
    throw new Error(`Scenario '${scenario.name}' has no cohort configurations.`);
  }

  // 1. Generate baseline, full-adoption, and uplift-only cohort timelines
  const cohortProjections = scenario.scope_cohorts.map(cc => {
    const sumAgentChurnUplift_c = (scenario.services ?? [])
      .filter(s => s.service_type === 'agent')
      .reduce((acc, s) => acc + resolveCohortOverride(s.id, cc.id, 'churn_rate_uplift', s.churn_rate_uplift || 0), 0);

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
      monthly_churn_rate: Math.max(0, cc.monthly_churn_rate * (1 - (cc.churn_reduction || 0)) + sumAgentChurnUplift_c),
      base_arpu: cc.base_arpu * (1 + (cc.arpu_uplift_percent || 0)) + (cc.arpu_uplift || 0)
    }, projectionMonths);

    const upliftOnlyModel = buildCohortModel({
      ...cc,
      ai_adoption_rate: 1.0,
      monthly_churn_rate: Math.max(0, cc.monthly_churn_rate + sumAgentChurnUplift_c),
      base_arpu: cc.base_arpu * (1 + (cc.arpu_uplift_percent || 0)) + (cc.arpu_uplift || 0)
    }, projectionMonths);

    // Apply adoption elasticity (Faza 3)
    const capture = sweepParams?.runtime_capture_pct !== undefined ? sweepParams.runtime_capture_pct : (scenario.evc_capture_target_pct ?? 0.30);
    const originalCaptureTarget = scenario.evc_capture_target_pct ?? 0.30;
    const epsilon = scenario.adoption_elasticity ?? 0;

    let target = cc.ai_adoption_rate || 0;
    let rampMonths = cc.adoption_ramp_months || 0;

    if (epsilon !== 0 && scenario.evc_capture_target_pct !== undefined && scenario.evc_capture_target_pct !== null) {
      target = Math.max(0, Math.min(1.0, target * (1 + epsilon * (originalCaptureTarget - capture))));
      rampMonths = Math.max(0, Math.round(rampMonths * (1 + epsilon * 0.5 * (capture - originalCaptureTarget))));
    }

    return {
      baselineModel,
      fullAdoptModel,
      upliftOnlyModel,
      grossMargin: cc.gross_margin !== undefined ? cc.gross_margin : 1.0,
      adoptionRate: target,
      rampMonths: rampMonths
    };
  });

  // 2. Build provider lookup map
  const providersMap = new Map<string, Provider>();
  for (const prov of allProviders) {
    providersMap.set(prov.id, prov);
  }

  // Credit pool (ADR 0010) — map of service -> credits burned per activity unit.
  const poolBurnRateMap = new Map((scenario.pool_burn_rates ?? []).map(br => [br.service_id, br.burn_rate]));

  const timeline: MonthlyBreakdown[] = [];
  let cumulativeCashFlow = 0;
  let cumulativeCashFlowLower = 0;
  const cashFlowsLower: number[] = [];
  let totalRevenueLowerSum = 0;
  // Credit pool (ADR 0010) — lifetime sums, used post-loop for the attribution split (Decision 3)
  // and the scenario-level pool economics summary.
  let sumPoolConsumedCreditsUpper = 0;
  let sumCopilotEvcValue = 0;
  let sumAgentEvcValue = 0;

  const cohortUpliftFlowUpper: number[] = [];
  const planSubscriptionFlowUpper: number[] = [];
  const copilotMonetizationFlowUpper: number[] = [];
  const agentMonetizationFlowUpper: number[] = [];
  const agentOutcomeFlowUpper: number[] = [];
  const copilotOutcomeFlowUpper: number[] = [];
  const unmonetizedLaborFlowUpper: number[] = [];
  const poolFeeFlowUpper: number[] = [];
  const poolOverageFlowUpper: number[] = [];

  const serviceRealizableHistory = new Map<string, number[]>();

  // ADR 0009 Track B — per-cohort agent deflection aggregates, snapshotted every month and
  // overwritten (only the final/steady-state month feeds buildAgentDeflectionCorridor, mirroring
  // how buildPricingCorridor only reads timeline[last]). Populated by the agent per_customer
  // branch below; stays empty when no service uses the per_customer driver.
  let lastMonthCohortAgentAgg = new Map<string, CohortAgentAggregate>();
  let lastMonthCohortPrice = new Map<string, number>();



  // 2b. Build penetration curve if expansion configured
  let expansionCurve: { withoutAi: number[]; withAiLower: number[]; withAiUpper: number[] } | null = null;
  if (scenario.expansion && scenario.expansion.expansion_vertical_id) {
    expansionCurve = buildPenetrationCurve({
      tam: scenario.expansion.tam_users ?? 0,
      sam: scenario.expansion.sam_users ?? 0,
      som: scenario.expansion.som_users ?? 0,
      baselineMonths: scenario.expansion.penetration_baseline_months,
      accelerationFactor: scenario.expansion.ai_acceleration_factor,
      somLiftPct: scenario.expansion.ai_som_lift_pct,
      projectionMonths
    });
  }

  // 3. Loop through projection months
  for (let t = 0; t < projectionMonths; t++) {
    let activeCustomers = 0;
    let activeAiUsers = 0;
    let weightedActiveAiUsers = 0;
    let grossRevenue = 0;
    let baselineRevenue = 0;
    let baselineCustomers = 0;
    let upliftOnlyRevenue = 0;

    let upperMarginSum = 0;
    let lowerMarginSum = 0;

    // Per-cohort active customer counts this month (ADR 0009 Track B) — consumed by the agent
    // per_customer branch below to bucket interactions/labor-savings/COGS per cohort instead of
    // the aggregate `activeCustomers`. Index-aligned with `scenario.scope_cohorts`.
    const perCohortCustomers: number[] = new Array(scenario.scope_cohorts.length).fill(0);

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

        perCohortCustomers[i] = cohortCustomers;
        activeCustomers += cohortCustomers;
        activeAiUsers += cohortAiUsers;
        
        const intensity = scenario.scope_cohorts[i].usage_intensity ?? 1.0;
        weightedActiveAiUsers += cohortAiUsers * intensity;

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

    const monthCohortPrice = new Map<string, number>();
    for (let i = 0; i < scenario.scope_cohorts.length; i++) {
      const proj = cohortProjections[i];
      const target = proj.adoptionRate;
      const rampMonths = proj.rampMonths;
      const a = rampMonths === 0 ? target : Math.min(1, (t + 1) / rampMonths) * target;
      const baseMonth = proj.baselineModel.timeline[t];
      const fullMonth = proj.fullAdoptModel.timeline[t];

      if (fullMonth && baseMonth) {
        const cohortCustomers = a * fullMonth.activeCustomers + (1 - a) * baseMonth.activeCustomers;
        const cohortGrossRev = a * fullMonth.mrr + (1 - a) * baseMonth.mrr;
        const price_c = cohortCustomers > 0
          ? proj.grossMargin * (cohortGrossRev - baseMonth.mrr) / cohortCustomers
          : 0;
        monthCohortPrice.set(scenario.scope_cohorts[i].id, price_c);
      }
    }

    let activeAiUsersUpper = activeAiUsers;
    let activeAiUsersLower = activeAiUsers;
    if (expansionCurve) {
      activeAiUsersUpper = expansionCurve.withAiUpper[t];
      activeAiUsersLower = expansionCurve.withAiLower[t];
    }

    const avgIntensity = activeAiUsers > 0 ? weightedActiveAiUsers / activeAiUsers : 1.0;
    const activeAiUsersWeightedUpper = activeAiUsersUpper * avgIntensity;
    const activeAiUsersWeightedLower = activeAiUsersLower * avgIntensity;

    // AI monetization revenue
    let monetizationUpper = { totalRevenue: 0, addonRevenue: 0, usageRevenue: 0, hybridBaseRevenue: 0, overchargeRevenue: 0, outcomeRevenue: 0 };
    let monetizationLower = { totalRevenue: 0, addonRevenue: 0, usageRevenue: 0, hybridBaseRevenue: 0, overchargeRevenue: 0, outcomeRevenue: 0 };
    let planSubscriptionRevenueUpper = 0;
    let planSubscriptionRevenueLower = 0;

    const carrier = resolveCarrier(scenario.modeling_type, scenario.revenue_carrier);
    const carrierIncludesMonetization = carrier === 'plan' || carrier === 'feature' || carrier === 'pack' || carrier === 'pool' || carrier === 'composite';

    if (carrierIncludesMonetization) {
      const activeServices = (scenario.services ?? [])
        .filter(s => t >= (s.rollout_month ?? 0))
        .filter(s => {
          if (carrier === 'pool' && poolBurnRateMap.has(s.id)) return false;
          if (carrier === 'composite') {
            if (poolBurnRateMap.has(s.id)) return false;
            if (s.service_type === 'copilot' && (scenario.arpu_uplift_includes_monetization ?? true) !== false) return false;
          }
          return true;
        });
      if (expansionCurve) {
        monetizationUpper = calculateMonetizationRevenue(activeAiUsersUpper, activeServices, creditSettings, providersMap);
        monetizationLower = calculateMonetizationRevenue(activeAiUsersLower, activeServices, creditSettings, providersMap);
      } else {
        monetizationUpper = calculateMonetizationRevenue(activeAiUsers, activeServices, creditSettings, providersMap);
        monetizationLower = monetizationUpper;
      }
    }

    if (expansionCurve) {
      for (const plan of scenario.plans ?? []) {
        if (t >= (plan.rollout_month ?? 0)) {
          const basePrice = plan.base_price ?? 0;
          // Incremental seats = (with AI - without AI)
          const seatsUpper = Math.max(0, expansionCurve.withAiUpper[t] - expansionCurve.withoutAi[t]);
          const seatsLower = Math.max(0, expansionCurve.withAiLower[t] - expansionCurve.withoutAi[t]);
          
          planSubscriptionRevenueUpper += basePrice * seatsUpper;
          planSubscriptionRevenueLower += basePrice * seatsLower;
        }
      }
    } else {
      let planSubscriptionRevenue = 0;
      for (const plan of scenario.plans ?? []) {
        if (t >= (plan.rollout_month ?? 0)) {
          planSubscriptionRevenue += (plan.base_price ?? 0) * (plan.seats ?? 0);
        }
      }
      planSubscriptionRevenueUpper = planSubscriptionRevenue;
      planSubscriptionRevenueLower = planSubscriptionRevenue;
    }

    const copilotNonPoolServices = (scenario.services ?? [])
      .filter(s => t >= (s.rollout_month ?? 0))
      .filter(s => s.service_type === 'copilot' && !poolBurnRateMap.has(s.id));
    const agentNonPoolServices = (scenario.services ?? [])
      .filter(s => t >= (s.rollout_month ?? 0))
      .filter(s => s.service_type === 'agent' && !poolBurnRateMap.has(s.id));

    let copilotMonUpper = 0;
    let agentMonUpper = 0;
    if (expansionCurve) {
      copilotMonUpper = calculateMonetizationRevenue(activeAiUsersUpper, copilotNonPoolServices, creditSettings, providersMap).totalRevenue;
      agentMonUpper = calculateMonetizationRevenue(activeAiUsersUpper, agentNonPoolServices, creditSettings, providersMap).totalRevenue;
    } else {
      copilotMonUpper = calculateMonetizationRevenue(activeAiUsers, copilotNonPoolServices, creditSettings, providersMap).totalRevenue;
      agentMonUpper = calculateMonetizationRevenue(activeAiUsers, agentNonPoolServices, creditSettings, providersMap).totalRevenue;
    }

    copilotMonetizationFlowUpper.push(copilotMonUpper);
    agentMonetizationFlowUpper.push(agentMonUpper);
    cohortUpliftFlowUpper.push(upperMarginSum);
    planSubscriptionFlowUpper.push(planSubscriptionRevenueUpper);

    let upperRevenue: number;
    let lowerRevenue: number;
    switch (carrier) {
      case 'feature':
      case 'pack':
        upperRevenue = monetizationUpper.totalRevenue;
        lowerRevenue = monetizationLower.totalRevenue;
        break;
      case 'plan':
        upperRevenue = monetizationUpper.totalRevenue + planSubscriptionRevenueUpper;
        lowerRevenue = monetizationLower.totalRevenue + planSubscriptionRevenueLower;
        break;
      case 'pool':
        upperRevenue = monetizationUpper.totalRevenue;
        lowerRevenue = monetizationLower.totalRevenue;
        break;
      case 'composite':
        upperRevenue = upperMarginSum + (scenario.revenue_bridge === 'separate_market' ? planSubscriptionRevenueUpper : 0) + monetizationUpper.totalRevenue;
        lowerRevenue = lowerMarginSum + (scenario.revenue_bridge === 'separate_market' ? planSubscriptionRevenueLower : 0) + monetizationLower.totalRevenue;
        break;
      case 'cohort':
      default:
        upperRevenue = upperMarginSum + (scenario.revenue_bridge === 'separate_market' ? planSubscriptionRevenueUpper : 0);
        lowerRevenue = lowerMarginSum + (scenario.revenue_bridge === 'separate_market' ? planSubscriptionRevenueLower : 0);
    }

    totalRevenueLowerSum += lowerRevenue;

    let opex = 0;
    let capex = 0;
    let tokenCostsUpper = 0;
    let tokenCostsLower = 0;

    let monthTotalInteractions = 0;
    let monthDeflectedInteractions = 0;
    // ADR 0009 Track B — per-cohort agent aggregates for this month, merged across every
    // per_customer-driver agent service. Overwrites `lastMonthCohortAgentAgg` at month end.
    const monthCohortAgentAgg = new Map<string, CohortAgentAggregate>();
    let monthLaborSavingsCash = 0;
    let monthLaborSavingsCapacity = 0;
    let monthFailedDeflectionCost = 0;
    let monthAgentTokenCosts = 0;
    let monthCopilotTokenCosts = 0;
    let monthOutcomeRevenueUpper = 0;
    let monthOutcomeRevenueLower = 0;
    let monthAgentOutcomeRevenueUpper = 0;
    let monthAgentOutcomeRevenueLower = 0;
    let monthCopilotOutcomeRevenueUpper = 0;
    let monthCopilotOutcomeRevenueLower = 0;
    // Credit pool (ADR 0010) — credits burned this month and the "value created" proxy
    // (value_per_outcome × activity, independent of capture) used for stream attribution.
    let monthPoolConsumedCreditsUpper = 0;
    let monthPoolConsumedCreditsLower = 0;
    let monthCopilotEvcValueUpper = 0;
    let monthAgentEvcValueUpper = 0;
    // Token cost of pool-MEMBER services only (ADR 0012 Decision 2 lets non-pool services share
    // the scenario, so tokenCostsUpper below is no longer pool-scoped — this accumulator keeps
    // the credit-value floor's numerator matched to its denominator, monthPoolConsumedCreditsUpper).
    let monthPoolTokenCostsUpper = 0;

    // A. Direct AI Services Costs (from scenario_services rollout)
    if (scenario.services) {
      for (const service of scenario.services) {
        const rolloutMonth = service.rollout_month ?? 0;
        if (service.service_type === 'agent') {
          if (t >= rolloutMonth) {
            const driver = service.interaction_driver_type || 'flat';
            const ramp = service.containment_ramp_months || 0;
            const containmentRate = service.containment_rate || 0;
            const containmentStartRate = service.containment_start_rate || 0;
            const escalationRate = service.escalation_rate || 0;
            const averageHandleTime = service.average_handle_time_seconds || 0;
            const productiveHours = service.productive_hours_per_fte_month || 120;
            const baselineFte = service.baseline_fte || 0;
            const fullyLoadedCost = service.fully_loaded_cost_per_fte_month || 0;

            let serviceInteractions = 0;
            let deflected = 0;
            let failed = 0;
            let hoursSaved = 0;
            let laborValueAtCohortRates = 0;

            if (driver === 'flat') {
              serviceInteractions = (service.monthly_volume || 0) * Math.pow(1 + (service.volume_growth_rate || 0), t);

              let contain_t = containmentRate;
              if (ramp > 0 && t < ramp) {
                contain_t = containmentStartRate + ((t + 1) / ramp) * (containmentRate - containmentStartRate);
              }
              const escal_t = escalationRate + Math.max(0, containmentRate - contain_t);
              const failed_t = Math.max(0, 1 - contain_t - escal_t);

              deflected = serviceInteractions * contain_t;
              failed = serviceInteractions * failed_t;
              hoursSaved = (deflected * averageHandleTime) / 3600;

              laborValueAtCohortRates = (hoursSaved / productiveHours) * fullyLoadedCost;
            } else if (driver === 'per_customer') {
              // ADR 0009 Track B — resolve interactions/containment/handle-time per cohort
              // (cohort_entity_overrides), summing additively into the cash pipeline below. When
              // no cohort override exists, every cohort resolves to the service's own field, so
              // the sums reconstruct today's single-formula aggregate exactly (regression-safe:
              // see the "sums back to aggregate" test). fully_loaded_cost_per_fte_month overrides
              // affect the cash NPV too (fteSaved-weighted blended rate), as resolved below.
              const tempCohortUpdates: Array<{
                cohortId: string;
                cohortCustomers: number;
                cohortInteractions: number;
                deflected_i: number;
                contain_t_i: number;
                avoidedValue_i: number;
                tokenCost_i: number;
                failedCost_i: number;
              }> = [];

              for (let ci = 0; ci < scenario.scope_cohorts.length; ci++) {
                const cohort = scenario.scope_cohorts[ci];
                const cohortCustomers = perCohortCustomers[ci] ?? 0;
                const interactionsPerCustomer_i = resolveCohortOverride(service.id, cohort.id, 'interactions_per_customer_month', service.interactions_per_customer_month || 0);
                const containmentRate_i = resolveCohortOverride(service.id, cohort.id, 'containment_rate', containmentRate);
                const avgHandleTime_i = resolveCohortOverride(service.id, cohort.id, 'average_handle_time_seconds', averageHandleTime);
                const fullyLoadedCost_i = resolveCohortOverride(service.id, cohort.id, 'fully_loaded_cost_per_fte_month', fullyLoadedCost);

                const cohortInteractions = cohortCustomers * interactionsPerCustomer_i;

                let contain_t_i = containmentRate_i;
                if (ramp > 0 && t < ramp) {
                  contain_t_i = containmentStartRate + ((t + 1) / ramp) * (containmentRate_i - containmentStartRate);
                }
                const escal_t_i = escalationRate + Math.max(0, containmentRate_i - contain_t_i);
                const failed_t_i = Math.max(0, 1 - contain_t_i - escal_t_i);

                const deflected_i = cohortInteractions * contain_t_i;
                const failed_i = cohortInteractions * failed_t_i;
                const hoursSaved_i = (deflected_i * avgHandleTime_i) / 3600;

                serviceInteractions += cohortInteractions;
                deflected += deflected_i;
                failed += failed_i;
                hoursSaved += hoursSaved_i;

                laborValueAtCohortRates += (hoursSaved_i / productiveHours) * fullyLoadedCost_i;

                let tokenCost_i = 0;
                if (service.provider_id && providersMap.has(service.provider_id)) {
                  const provider = providersMap.get(service.provider_id)!;
                  const inputPrice = provider.input_price / 1000000;
                  const outputPrice = provider.output_price / 1000000;
                  tokenCost_i = cohortInteractions * ((service.avg_input_tokens || 0) * inputPrice + (service.avg_output_tokens || 0) * outputPrice);
                }
                const failedCost_i = failed_i * (service.failed_deflection_penalty || 0);
                const avoidedValue_i = (hoursSaved_i / productiveHours) * fullyLoadedCost_i;

                tempCohortUpdates.push({
                  cohortId: cohort.id,
                  cohortCustomers,
                  cohortInteractions,
                  deflected_i,
                  contain_t_i,
                  avoidedValue_i,
                  tokenCost_i,
                  failedCost_i
                });
              }

              // Apply the baseline FTE cap pro-rata to avoided value before merging services
              const fteSavedService = hoursSaved / productiveHours;
              const r_s = baselineFte > 0 ? Math.min(1, baselineFte / fteSavedService) : 1;

              for (const update of tempCohortUpdates) {
                const realizableAvoidedValue_i = update.avoidedValue_i * r_s;
                const fixedCostAlloc_i = serviceInteractions > 0
                  ? (service.fixed_cost_per_month || 0) * update.cohortInteractions / serviceInteractions
                  : 0;

                const prevAgg = monthCohortAgentAgg.get(update.cohortId);
                monthCohortAgentAgg.set(update.cohortId, {
                  customers: update.cohortCustomers,
                  interactions: (prevAgg?.interactions ?? 0) + update.cohortInteractions,
                  deflected: (prevAgg?.deflected ?? 0) + update.deflected_i,
                  avoidedValue: (prevAgg?.avoidedValue ?? 0) + update.avoidedValue_i,
                  realizableAvoidedValue: (prevAgg?.realizableAvoidedValue ?? 0) + realizableAvoidedValue_i,
                  agentCogs: (prevAgg?.agentCogs ?? 0) + update.tokenCost_i,
                  fixedCostAlloc: (prevAgg?.fixedCostAlloc ?? 0) + fixedCostAlloc_i,
                  failedCost: (prevAgg?.failedCost ?? 0) + update.failedCost_i
                });
              }
            }

            // Credit pool (ADR 0010) — a resolved interaction is the agent's natural "activity"
            // unit; both bands share the same figure since agent volume doesn't depend on
            // activeAiUsersUpper/Lower (it's driven by monthly_volume / per-customer interactions).
            const poolBurnRate = poolBurnRateMap.get(service.id);
            if (poolBurnRate !== undefined) {
              monthPoolConsumedCreditsUpper += deflected * poolBurnRate;
              monthPoolConsumedCreditsLower += deflected * poolBurnRate;
              monthAgentEvcValueUpper += deflected * (service.value_per_outcome ?? 0);
            }

            const fteSaved = hoursSaved / productiveHours;
            const realizable = baselineFte > 0 ? Math.min(fteSaved, baselineFte) : fteSaved;

            let realizableHistory = serviceRealizableHistory.get(service.id);
            if (!realizableHistory) {
              realizableHistory = [];
              serviceRealizableHistory.set(service.id, realizableHistory);
            }
            realizableHistory.push(realizable);

            const lag = service.staffing_realization_lag_months || 0;
            const src = t - lag >= 0 ? realizableHistory[t - lag] : 0;

            // ADR 0009 Decision 4 covers any billing mechanism, not just outcome pricing — a pool-
            // billed agent (addon/usage/hybrid, ADR 0010) is monetized too, just via the shared
            // credit pool instead of a per-outcome price. isMonetizedOutcome stays narrower: it
            // only gates the per-outcome pricing block below, which is specific to that one mechanism.
            const isMonetized = !!service.monetization && service.monetization.monetization_type !== 'none';
            const isMonetizedOutcome = service.monetization?.monetization_type === 'outcome';

            // effective blended rate:
            const effRate = fteSaved > 0 ? laborValueAtCohortRates / fteSaved : fullyLoadedCost;

            const serviceLaborCash = Math.floor(src) * effRate;
            const serviceLaborCapacity = (realizable - Math.floor(src)) * effRate;

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
            // ADR 0009 Decision 4: a monetized agent's labor savings become a memo-only EVC anchor
            // (its real revenue is the price it's billed at, whatever the mechanism), not cash —
            // otherwise price and labor-savings would double-count the same value creation.
            if (isMonetized) {
              monthLaborSavingsCapacity += serviceLaborCash + serviceLaborCapacity;
            } else {
              monthLaborSavingsCash += serviceLaborCash;
              monthLaborSavingsCapacity += serviceLaborCapacity;
            }
            monthFailedDeflectionCost += failedCost;
            monthAgentTokenCosts += totalAgentTokenCost;

            tokenCostsUpper += totalAgentTokenCost;
            tokenCostsLower += totalAgentTokenCost;
            if (poolBurnRate !== undefined) {
              monthPoolTokenCostsUpper += totalAgentTokenCost;
            }
            opex += failedCost;

            // Outcome pricing logic for Agent — a disjoint second stream (ADR 0009 Decision 1),
            // booked regardless of revenue carrier.
            if (isMonetizedOutcome) {
              const config = service.monetization!;
              const price = config.price_per_outcome || 0;
              let revUpper = 0;
              let revLower = 0;
              if (config.outcome_basis === 'per_user') {
                revUpper = activeAiUsersUpper * (config.outcomes_per_user_month || 0) * price;
                revLower = activeAiUsersLower * (config.outcomes_per_user_month || 0) * price;
              } else if (config.outcome_basis === 'deflected') {
                revUpper = deflected * price;
                revLower = deflected * price;
              } else if (config.outcome_basis === 'interactions') {
                revUpper = serviceInteractions * price;
                revLower = serviceInteractions * price;
              }
              monthOutcomeRevenueUpper += revUpper;
              monthOutcomeRevenueLower += revLower;
              monthAgentOutcomeRevenueUpper += revUpper;
              monthAgentOutcomeRevenueLower += revLower;
            }
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
            let serviceTokenCostUpper = 0;
            let serviceTokenCostLower = 0;
            if (service.provider_id && providersMap.has(service.provider_id)) {
              const provider = providersMap.get(service.provider_id)!;
              const inputPrice = provider.input_price / 1000000;
              const outputPrice = provider.output_price / 1000000;

              const costMultiplier = (service.avg_requests_per_user_month || 0) *
                ((service.avg_input_tokens || 0) * inputPrice + (service.avg_output_tokens || 0) * outputPrice);

              serviceTokenCostUpper = activeAiUsersWeightedUpper * costMultiplier;
              serviceTokenCostLower = activeAiUsersWeightedLower * costMultiplier;
            }

            const serviceFixedCost = service.fixed_cost_per_month || 0;
            tokenCostsUpper += serviceTokenCostUpper + serviceFixedCost;
            tokenCostsLower += serviceTokenCostLower + serviceFixedCost;
            monthCopilotTokenCosts += serviceTokenCostUpper + serviceFixedCost;

            // Credit pool (ADR 0010) — a request is the copilot's natural "activity" unit.
            const poolBurnRate = poolBurnRateMap.get(service.id);
            if (poolBurnRate !== undefined) {
              const activityUpper = activeAiUsersWeightedUpper * (service.avg_requests_per_user_month || 0);
              const activityLower = activeAiUsersWeightedLower * (service.avg_requests_per_user_month || 0);
              monthPoolConsumedCreditsUpper += activityUpper * poolBurnRate;
              monthPoolConsumedCreditsLower += activityLower * poolBurnRate;
              monthCopilotEvcValueUpper += activityUpper * (service.value_per_outcome ?? 0);
              monthPoolTokenCostsUpper += serviceTokenCostUpper + serviceFixedCost;
            }

            // Outcome pricing logic for Copilot — a disjoint second stream (ADR 0009 Decision 1),
            // booked regardless of revenue carrier.
            if (service.monetization?.monetization_type === 'outcome') {
              const config = service.monetization;
              const price = config.price_per_outcome || 0;
              let revUpper = 0;
              let revLower = 0;
              if (config.outcome_basis === 'per_user') {
                revUpper = activeAiUsersWeightedUpper * (config.outcomes_per_user_month || 0) * price;
                revLower = activeAiUsersWeightedLower * (config.outcomes_per_user_month || 0) * price;
              } else if (config.outcome_basis === 'interactions') {
                const serviceInteractionsUpper = activeAiUsersWeightedUpper * (service.avg_requests_per_user_month || 0);
                const serviceInteractionsLower = activeAiUsersWeightedLower * (service.avg_requests_per_user_month || 0);
                revUpper = serviceInteractionsUpper * price;
                revLower = serviceInteractionsLower * price;
              }
              monthOutcomeRevenueUpper += revUpper;
              monthOutcomeRevenueLower += revLower;
              monthCopilotOutcomeRevenueUpper += revUpper;
              monthCopilotOutcomeRevenueLower += revLower;
            }
          }
        }
      }
    }

    // Add labor savings cash (Decision 2: labor cash in BOTH bands). Already excludes
    // monetized-outcome agents (ADR 0009 Decision 4 — their labor savings are memo-only above).
    upperRevenue += monthLaborSavingsCash;
    lowerRevenue += monthLaborSavingsCash;

    // Outcome revenue (copilot + agent) is a disjoint second stream — it books regardless of
    // the revenue carrier (ADR 0009 Decision 1), unlike addon/usage/hybrid monetization which
    // shares the cohort/plan seat economy and stays carrier-gated above.
    upperRevenue += monthOutcomeRevenueUpper;
    lowerRevenue += monthOutcomeRevenueLower;

    // Per-stream attribution (ADR 0009): agent stream = labor-savings cash (unmonetized) +
    // agent outcome revenue (monetized); copilot stream = copilot outcome revenue. The
    // seat/cohort economy above (upperMarginSum / planSubscriptionRevenue / monetization
    // totals) stays the existing carrier-resolved revenue, unattributed to either stream.
    // LIMITATION: In a mixed scenario where copilot value is carried solely by cohort ARPU uplift
    // (no plan seats or outcome monetization), copilotRevenue stays 0, resulting in
    // copilot stream margin = null. The copilot margin guardrail (e.g. 78%) is inactive in this case.
    const agentRevenueUpper = monthLaborSavingsCash + monthAgentOutcomeRevenueUpper;
    // Plan-seat subscription revenue is the seat economy (ADR 0009 Phase A: two-track hybrid
    // billing) — attributed to copilot whenever it's booked above (carrier 'plan', or 'cohort'
    // with a 'separate_market' bridge). Zero in every other case, so this is always safe to add.
    const copilotRevenueUpper = monthCopilotOutcomeRevenueUpper + planSubscriptionRevenueUpper;
    const agentCogs = monthAgentTokenCosts + monthFailedDeflectionCost;
    const copilotCogs = monthCopilotTokenCosts;

    // Credit pool (ADR 0010) — tier fee (Decision 2) + overage (Decision 4), gated on the credit
    // value hybrid (Decision 1). Stream attribution (Decision 3) happens after the full timeline
    // is built, since it's based on lifetime EVC weight, not this month's consumption alone.
    let monthPoolBreakageUpper = 0;
    let monthPoolTierFeeUpper = 0;
    let monthPoolOverageRevenueUpper = 0;

    if ((carrier === 'pool' || carrier === 'composite') && scenario.pool_tier) {
      const tier = scenario.pool_tier;
      const captureForPool = tier.capture ?? scenario.evc_capture_target_pct ?? 0.30;
      const poolSizeBasis = tier.pool_size_basis ?? 'absolute';

      // Blended $/credit: this month's actual token cost of pool-MEMBER services ÷ credits
      // consumed earning it. Since ADR 0012 Decision 2 lets non-pool services share the scenario
      // (and book their own revenue independently), tokenCostsUpper is no longer pool-scoped —
      // monthPoolTokenCostsUpper keeps this floor's numerator matched to its denominator.
      const creditFloorUpper = monthPoolConsumedCreditsUpper > 0 ? monthPoolTokenCostsUpper / monthPoolConsumedCreditsUpper : 0;
      const valuePerCreditUpper = monthPoolConsumedCreditsUpper > 0
        ? (captureForPool * (monthCopilotEvcValueUpper + monthAgentEvcValueUpper)) / monthPoolConsumedCreditsUpper
        : 0;
      const creditValueUpper = Math.max(creditFloorUpper, valuePerCreditUpper);

      // Pool allowance (Decision 1 / Amendment 2026-07) - absolute (flat credits) or per_member (credits × aiUsers).
      const effectivePoolUpper = poolSizeBasis === 'per_member' ? tier.credit_pool_size * activeAiUsersUpper : tier.credit_pool_size;

      // Breakage (Decision 2/Parameters): unused credits valued at the cost floor, memo only —
      // no rollover, no cash impact (the full fee is already booked below regardless of usage).
      monthPoolBreakageUpper = Math.max(0, effectivePoolUpper - monthPoolConsumedCreditsUpper) * creditFloorUpper;

      // Pool exhaustion (Decision 4) — behavior from the pool services' shared monetization_type
      // (homogeneity is enforced by validateRevenueIntegrity, so any one service's type applies).
      const poolService = (scenario.services ?? []).find(s => poolBurnRateMap.has(s.id));
      const poolBillingType = poolService?.monetization?.monetization_type;
      let overageRevenueUpper = 0;
      if (monthPoolConsumedCreditsUpper > effectivePoolUpper) {
        const overageCreditsUpper = monthPoolConsumedCreditsUpper - effectivePoolUpper;
        if (poolBillingType === 'hybrid') {
          overageRevenueUpper = overageCreditsUpper * creditValueUpper * HYBRID_OVERAGE_MARKUP;
        } else if (poolBillingType === 'usage') {
          overageRevenueUpper = overageCreditsUpper * creditValueUpper;
        }
        // 'addon' -> hard cap: no overage revenue: the excess activity's COGS (already booked via
        // tokenCostsUpper above) becomes a margin hit, modeling real hard-cap risk.
      }

      // Tier fee basis (ADR 0012 Decision 1 / Amendment 2026-07)
      // 'flat' (default) books monthly_fee once;
      // 'per_member' scales it by the active AI users;
      // 'per_customer' scales it by total active customers.
      const tierFeeUpper = tier.fee_basis === 'per_member'
        ? tier.monthly_fee * activeAiUsersUpper
        : (tier.fee_basis === 'per_customer' ? tier.monthly_fee * activeCustomers : tier.monthly_fee);
      const tierFeeLower = tier.fee_basis === 'per_member'
        ? tier.monthly_fee * activeAiUsersLower
        : (tier.fee_basis === 'per_customer' ? tier.monthly_fee * activeCustomers : tier.monthly_fee);

      monthPoolTierFeeUpper = tierFeeUpper;
      monthPoolOverageRevenueUpper = overageRevenueUpper;

      // Overage pricing only varies the volume by band in principle; reusing the upper-band
      // credit value for both keeps this in line with how plan/seat figures are also only
      // banded when an expansion curve is active (none here).
      upperRevenue += tierFeeUpper + overageRevenueUpper;
      lowerRevenue += tierFeeLower + overageRevenueUpper;

      sumPoolConsumedCreditsUpper += monthPoolConsumedCreditsUpper;
      sumCopilotEvcValue += monthCopilotEvcValueUpper;
      sumAgentEvcValue += monthAgentEvcValueUpper;

      poolFeeFlowUpper.push(tierFeeUpper);
      poolOverageFlowUpper.push(overageRevenueUpper);
    } else {
      poolFeeFlowUpper.push(0);
      poolOverageFlowUpper.push(0);
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
            capex += item.amount * (1 + (scenario.capex_contingency_pct || 0));
          } else {
            opex += item.amount;
          }
        }
      }
    }

    const totalCostsUpper = opex + capex + tokenCostsUpper;
    const totalCostsLower = opex + capex + tokenCostsLower;
    const netCashFlow = upperRevenue - totalCostsUpper;
    const netCashFlowLower = lowerRevenue - totalCostsLower;
    cumulativeCashFlow += netCashFlow;
    cumulativeCashFlowLower += netCashFlowLower;

    timeline.push({
      month: t,
      revenue: parseFloat(upperRevenue.toFixed(2)),
      customers: activeCustomers,
      aiUsers: expansionCurve ? activeAiUsersUpper : activeAiUsers,
      aiUsersWeighted: expansionCurve ? activeAiUsersWeightedUpper : weightedActiveAiUsers,
      opex: parseFloat(opex.toFixed(2)),
      capex: parseFloat(capex.toFixed(2)),
      tokenCosts: parseFloat(tokenCostsUpper.toFixed(2)),
      totalCosts: parseFloat(totalCostsUpper.toFixed(2)),
      netCashFlow: parseFloat(netCashFlow.toFixed(2)),
      cumulativeCashFlow: parseFloat(cumulativeCashFlow.toFixed(2)),
      cumulativeCashFlowLower: parseFloat(cumulativeCashFlowLower.toFixed(2)),
      tokenCostsLower: parseFloat(tokenCostsLower.toFixed(2)),
      totalCostsLower: parseFloat(totalCostsLower.toFixed(2)),
      grossRevenue: parseFloat(grossRevenue.toFixed(2)),
      baselineRevenue: parseFloat(baselineRevenue.toFixed(2)),
      baselineCustomers: Math.round(baselineCustomers),
      monetizationRevenue: parseFloat((monetizationUpper.totalRevenue + monthOutcomeRevenueUpper).toFixed(2)),
      addonRevenue: parseFloat(monetizationUpper.addonRevenue.toFixed(2)),
      usageRevenue: parseFloat(monetizationUpper.usageRevenue.toFixed(2)),
      hybridBaseRevenue: parseFloat(monetizationUpper.hybridBaseRevenue.toFixed(2)),
      overchargeRevenue: parseFloat(monetizationUpper.overchargeRevenue.toFixed(2)),
      outcomeRevenue: parseFloat(monthOutcomeRevenueUpper.toFixed(2)),
      // Agent archetype fields
      totalInteractions: parseFloat(monthTotalInteractions.toFixed(2)),
      deflectedInteractions: parseFloat(monthDeflectedInteractions.toFixed(2)),
      laborSavingsCash: parseFloat(monthLaborSavingsCash.toFixed(2)),
      laborSavingsCapacity: parseFloat(monthLaborSavingsCapacity.toFixed(2)),
      failedDeflectionCost: parseFloat(monthFailedDeflectionCost.toFixed(2)),
      agentTokenCosts: parseFloat(monthAgentTokenCosts.toFixed(2)),
      // Per-stream revenue/COGS (ADR 0009)
      copilotRevenue: parseFloat(copilotRevenueUpper.toFixed(2)),
      copilotCogs: parseFloat(copilotCogs.toFixed(2)),
      copilotTokenCosts: parseFloat(monthCopilotTokenCosts.toFixed(2)),
      agentRevenue: parseFloat(agentRevenueUpper.toFixed(2)),
      agentCogs: parseFloat(agentCogs.toFixed(2)),
      // Credit pool (ADR 0010)
      poolBreakage: parseFloat(monthPoolBreakageUpper.toFixed(2)),
      poolTierFeeRevenue: parseFloat(monthPoolTierFeeUpper.toFixed(2)),
      poolOverageRevenue: parseFloat(monthPoolOverageRevenueUpper.toFixed(2))
    });

    cashFlowsLower.push(parseFloat(netCashFlowLower.toFixed(2)));

    unmonetizedLaborFlowUpper.push(monthLaborSavingsCash);
    agentOutcomeFlowUpper.push(monthAgentOutcomeRevenueUpper);
    copilotOutcomeFlowUpper.push(monthCopilotOutcomeRevenueUpper);

    // ADR 0009 Track B — snapshot this month's per-cohort agent aggregates; only the final
    // (steady-state) month feeds buildAgentDeflectionCorridor, mirroring buildPricingCorridor.
    lastMonthCohortAgentAgg = monthCohortAgentAgg;
    lastMonthCohortPrice = monthCohortPrice;
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
  const pvCostsLower = timeline.reduce((acc, curr) => acc + (curr.totalCostsLower ?? curr.totalCosts) / Math.pow(1 + rMonthly, curr.month), 0);

  const piUpper = pvCosts > 0 ? parseFloat((npvUpper / pvCosts + 1).toFixed(4)) : 0;
  const piLower = pvCostsLower > 0 ? parseFloat((npvLower / pvCostsLower + 1).toFixed(4)) : 0;

  const irr = calculateIRRGuarded(cashFlowsUpper, paybackUpper);

  let evc: EvcResult | null = null;
  if (scenario.evc_nba_annual_value !== undefined && scenario.evc_nba_annual_value !== null) {
    // Weighted-average gross margin for Value Split vendor profit
    let avgGrossMargin = 1.0;
    if (scenario.scope_cohorts && scenario.scope_cohorts.length > 0) {
      const totUsers = scenario.scope_cohorts.reduce((s, cc) => s + (cc.current_users || 0), 0);
      if (totUsers > 0) {
        avgGrossMargin = scenario.scope_cohorts.reduce(
          (s, cc) => s + (cc.gross_margin !== undefined ? cc.gross_margin : 1.0) * (cc.current_users || 0), 0
        ) / totUsers;
      } else {
        avgGrossMargin = scenario.scope_cohorts.reduce(
          (s, cc) => s + (cc.gross_margin !== undefined ? cc.gross_margin : 1.0), 0
        ) / scenario.scope_cohorts.length;
      }
    }

    const evcInputs: EvcInputs = {
      nbaAnnualValue: scenario.evc_nba_annual_value,
      extraPositiveValue: scenario.evc_extra_positive_value ?? 0,
      negativeValue: scenario.evc_negative_value ?? 0,
      captureCeilingPct: scenario.evc_capture_ceiling_pct ?? 0.50,
      captureTargetPct: scenario.evc_capture_target_pct ?? 0.30,
      captureFloorPct: scenario.evc_capture_floor_pct ?? 0.15,
      unitLaborSavingsAnnual: calculateAnalyticalLaborSavings(scenario),
      grossMargin: avgGrossMargin
    };
    evc = calculateEVC(timeline, evcInputs);
    if (evc) {
      evc.pricingCorridor = buildPricingCorridor(scenario, timeline, evc, lastMonthCohortPrice);
      evc.pocketMarginWaterfall = buildPocketMarginWaterfall(scenario, timeline, evc);
    }
  }

  const driverProfile = detectDriverProfile(scenario);

  // Credit pool (ADR 0010 Decision 3) — attribute each month's pool revenue (tier fee + overage,
  // already the entirety of that month's `revenue` for a pool carrier — labor savings and outcome
  // revenue are both excluded/absent under the billing-homogeneity invariant) to copilot/agent
  // proportional to the *lifetime* EVC weight. Resolved only now, after the full timeline (and
  // hence the lifetime EVC sums) is available — mutating the already-built MonthlyBreakdown
  // objects before streamMargins sums them below.
  let poolEconomics: PoolEconomics | null = null;
  const carrierForPool = resolveCarrier(scenario.modeling_type, scenario.revenue_carrier);
  if (carrierForPool === 'pool' && scenario.pool_tier) {
    const totalEvcValue = sumCopilotEvcValue + sumAgentEvcValue;
    const attribution: PoolAttribution = totalEvcValue > 0
      ? {
          copilotShare: parseFloat((sumCopilotEvcValue / totalEvcValue).toFixed(4)),
          agentShare: parseFloat((sumAgentEvcValue / totalEvcValue).toFixed(4)),
          method: 'evc'
        }
      : (
          driverProfile === 'seat_only'
            ? { copilotShare: 1.0, agentShare: 0.0, method: 'profile_fallback' }
            : (
                driverProfile === 'interaction_only'
                  ? { copilotShare: 0.0, agentShare: 1.0, method: 'profile_fallback' }
                  : { copilotShare: 0.5, agentShare: 0.5, method: 'even_split_fallback' }
              )
        );

    let totalOverageRevenue = 0;
    let totalTierFeeRevenue = 0;
    let totalBreakage = 0;
    for (const m of timeline) {
      const poolRevenue = (m.poolTierFeeRevenue ?? 0) + (m.poolOverageRevenue ?? 0);
      m.copilotRevenue = parseFloat(((m.copilotRevenue ?? 0) + poolRevenue * attribution.copilotShare).toFixed(2));
      m.agentRevenue = parseFloat(((m.agentRevenue ?? 0) + poolRevenue * attribution.agentShare).toFixed(2));
      totalOverageRevenue += m.poolOverageRevenue ?? 0;
      totalTierFeeRevenue += m.poolTierFeeRevenue ?? 0;
      totalBreakage += m.poolBreakage ?? 0;
    }

    poolEconomics = {
      tierMonthlyFee: scenario.pool_tier.monthly_fee,
      poolSize: scenario.pool_tier.credit_pool_size,
      totalConsumedCredits: parseFloat(sumPoolConsumedCreditsUpper.toFixed(2)),
      totalBreakage: parseFloat(totalBreakage.toFixed(2)),
      totalOverageRevenue: parseFloat(totalOverageRevenue.toFixed(2)),
      totalTierFeeRevenue: parseFloat(totalTierFeeRevenue.toFixed(2)),
      feeBasis: scenario.pool_tier.fee_basis ?? 'flat',
      poolSizeBasis: scenario.pool_tier.pool_size_basis ?? 'absolute',
      attribution
    };
  }

  const copilotMarginThreshold = scenario.copilot_margin_threshold ?? DEFAULT_COPILOT_MARGIN_THRESHOLD;
  const agentMarginThreshold = scenario.agent_margin_threshold ?? DEFAULT_AGENT_MARGIN_THRESHOLD;

  const sumCopilotRevenue = timeline.reduce((s, m) => s + (m.copilotRevenue ?? 0), 0);
  const sumCopilotCogs = timeline.reduce((s, m) => s + (m.copilotCogs ?? 0), 0);
  const sumAgentRevenue = timeline.reduce((s, m) => s + (m.agentRevenue ?? 0), 0);
  const sumAgentCogs = timeline.reduce((s, m) => s + (m.agentCogs ?? 0), 0);
  // Blended = revenue-weighted blend of the two billing streams (ADR 0009 Decision 6 / methodology
  // Step 4): [(Rev_cop − COGS_cop) + (Rev_ag − COGS_ag)] / (Rev_cop + Rev_ag). Built on the same
  // revenue base and the same COGS as the per-stream margins — including the agent's failed-deflection
  // penalty, which sits in opex (not tokenCosts) — so blended reconciles with the streams by
  // construction. (A scenario-wide tokenCosts ratio silently dropped failed-deflection cost and folded
  // in unattributed cohort/seat revenue, so it didn't tie out to the per-stream margins.)
  const sumStreamRevenue = sumCopilotRevenue + sumAgentRevenue;
  const sumStreamCogs = sumCopilotCogs + sumAgentCogs;

  const streamMargins: StreamMargins = {
    copilot: sumCopilotRevenue > 0 ? parseFloat(((sumCopilotRevenue - sumCopilotCogs) / sumCopilotRevenue).toFixed(4)) : null,
    agent: sumAgentRevenue > 0 ? parseFloat(((sumAgentRevenue - sumAgentCogs) / sumAgentRevenue).toFixed(4)) : null,
    blended: sumStreamRevenue > 0 ? parseFloat(((sumStreamRevenue - sumStreamCogs) / sumStreamRevenue).toFixed(4)) : 0,
    copilotThreshold: copilotMarginThreshold,
    agentThreshold: agentMarginThreshold
  };

  const agentDeflectionCorridor = lastMonthCohortAgentAgg.size > 0
    ? buildAgentDeflectionCorridor(scenario, lastMonthCohortAgentAgg, agentMarginThreshold)
    : null;

  const calculatePV = (flow: number[]) => {
    const rMonthly = Math.pow(1 + annualDiscountRate, 1 / 12) - 1;
    let pv = 0;
    for (let t = 0; t < flow.length; t++) {
      pv += flow[t] / Math.pow(1 + rMonthly, t);
    }
    return parseFloat(pv.toFixed(2));
  };

  const resComp = resolveCompositeComponents(scenario);

  const compositeBreakdown: CompositeBreakdown = {
    cohort: {
      role: resComp.cohort.role,
      revenuePv: resComp.cohort.role === 'books' ? calculatePV(cohortUpliftFlowUpper) : 0,
      reason: resComp.cohort.reason
    },
    plan: {
      role: resComp.plan.role,
      revenuePv: resComp.plan.role === 'books' ? calculatePV(planSubscriptionFlowUpper) : 0,
      memoValue: resComp.plan.role === 'folded' ? calculatePV(planSubscriptionFlowUpper) : undefined,
      reason: resComp.plan.reason
    },
    copilotMonetization: {
      role: resComp.copilotMonetization.role,
      revenuePv: resComp.copilotMonetization.role === 'books' ? calculatePV(copilotMonetizationFlowUpper) : 0,
      memoValue: resComp.copilotMonetization.role === 'folded' ? calculatePV(copilotMonetizationFlowUpper) : undefined,
      reason: resComp.copilotMonetization.reason
    },
    agentMonetization: {
      role: resComp.agentMonetization.role,
      revenuePv: resComp.agentMonetization.role === 'books' ? calculatePV(agentMonetizationFlowUpper) : 0,
      memoValue: resComp.agentMonetization.role === 'pool_billed' ? calculatePV(agentMonetizationFlowUpper) : undefined,
      reason: resComp.agentMonetization.reason
    },
    pool: {
      role: resComp.pool.role,
      revenuePv: resComp.pool.role === 'books' ? calculatePV(poolFeeFlowUpper.map((fee, idx) => fee + poolOverageFlowUpper[idx])) : 0,
      reason: resComp.pool.reason
    },
    agentOutcome: {
      role: resComp.agentOutcome.role,
      revenuePv: resComp.agentOutcome.role === 'books' ? calculatePV(agentOutcomeFlowUpper) : 0,
      reason: resComp.agentOutcome.reason
    },
    copilotOutcome: {
      role: resComp.copilotOutcome.role,
      revenuePv: resComp.copilotOutcome.role === 'books' ? calculatePV(copilotOutcomeFlowUpper) : 0,
      reason: resComp.copilotOutcome.reason
    },
    unmonetizedLabor: {
      role: resComp.unmonetizedLabor.role,
      revenuePv: resComp.unmonetizedLabor.role === 'books' ? calculatePV(unmonetizedLaborFlowUpper) : 0,
      reason: resComp.unmonetizedLabor.reason
    }
  };

  return {
    timeline,
    paybackUpper,
    paybackLower,
    npvUpper,
    npvLower,
    piUpper,
    piLower,
    irr,
    tco,
    evc,
    driverProfile,
    streamMargins,
    poolEconomics,
    agentDeflectionCorridor,
    cohortPriceMap: lastMonthCohortPrice,
    compositeBreakdown
  };
}



/**
 * Agent-archetype analogue of `buildPricingCorridor` — displaced-labor cost-to-serve vs.
 * avoided-cost value per cohort, computed from the steady-state (last month) per-cohort agent
 * aggregates. Pure; only meaningful for scenarios with at least one `per_customer`-driver agent
 * service (empty aggregates in ⇒ empty points out).
 */
export function buildAgentDeflectionCorridor(
  scenario: Scenario,
  cohortAgentAgg: Map<string, CohortAgentAggregate>,
  agentMarginThreshold: number = DEFAULT_AGENT_MARGIN_THRESHOLD
): AgentDeflectionCorridorResult {
  const cohorts = scenario.scope_cohorts || [];

  const points: AgentDeflectionCorridorPoint[] = [];
  let totalCustomers = 0;
  let totalCostToServe = 0;
  let totalAvoidedValue = 0;
  let totalRealizableAvoidedValue = 0;

  for (const cohort of cohorts) {
    const agg = cohortAgentAgg.get(cohort.id);
    if (!agg || agg.customers <= 0) continue;

    const interactions = agg.interactions / agg.customers;
    const containmentRate = agg.interactions > 0 ? agg.deflected / agg.interactions : 0;
    const costToServe = (agg.agentCogs + agg.fixedCostAlloc + agg.failedCost) / agg.customers;
    const avoidedValue = agg.avoidedValue / agg.customers;
    const realizableAvoidedValue = agg.realizableAvoidedValue / agg.customers;
    const realizationRatio = avoidedValue > 0 ? realizableAvoidedValue / avoidedValue : 1.0;
    const netDeflectionValue = avoidedValue - costToServe;

    let status: 'loss' | 'below_margin' | 'healthy' = 'healthy';
    if (netDeflectionValue < 0) {
      status = 'loss';
    } else if (avoidedValue > 0 && netDeflectionValue / avoidedValue < agentMarginThreshold) {
      status = 'below_margin';
    }

    const costDecomposition = {
      tokens: agg.agentCogs / agg.customers,
      fixedAlloc: agg.fixedCostAlloc / agg.customers,
      failedDeflection: agg.failedCost / agg.customers
    };

    points.push({
      cohortId: cohort.id,
      cohortName: cohort.name,
      interactions,
      containmentRate,
      costToServe,
      avoidedValue,
      realizableAvoidedValue,
      realizationRatio,
      netDeflectionValue,
      costDecomposition,
      status
    });

    totalCustomers += agg.customers;
    totalCostToServe += agg.agentCogs + agg.fixedCostAlloc + agg.failedCost;
    totalAvoidedValue += agg.avoidedValue;
    totalRealizableAvoidedValue += agg.realizableAvoidedValue;
  }

  points.sort((a, b) => a.costToServe - b.costToServe);
  const hasBreak = points.some(p => p.status === 'loss');

  return {
    points,
    blendedCostToServe: totalCustomers > 0 ? totalCostToServe / totalCustomers : 0,
    blendedAvoidedValue: totalCustomers > 0 ? totalAvoidedValue / totalCustomers : 0,
    blendedRealizableAvoidedValue: totalCustomers > 0 ? totalRealizableAvoidedValue / totalCustomers : 0,
    hasBreak
  };
}

export function calculateEVC(timeline: MonthlyBreakdown[], inputs: EvcInputs): EvcResult {
  // EVC inputs are per-customer/year
  const extraPositiveValue = inputs.extraPositiveValue;
  const negativeValue = inputs.negativeValue;
  const nbaAnnualValue = inputs.nbaAnnualValue;
  const unitLaborSavingsAnnual = inputs.unitLaborSavingsAnnual;
  
  // unitNetValue (monthly)
  const unitNetValue = (extraPositiveValue + unitLaborSavingsAnnual - negativeValue) / 12;
  
  // referenceValue (monthly)
  const referenceValue = nbaAnnualValue / 12;
  
  // positiveValueTotal (monthly)
  const positiveValueTotal = (extraPositiveValue + unitLaborSavingsAnnual) / 12;
  
  // negativeValueTotal (monthly)
  const negativeValueTotal = negativeValue / 12;
  
  // netCreatedValue (monthly)
  const netCreatedValue = unitNetValue;
  
  // evc (monthly)
  const evc = referenceValue + netCreatedValue;
  
  // prices (monthly)
  const priceFloor = referenceValue + (inputs.captureFloorPct * netCreatedValue);
  const priceTarget = referenceValue + (inputs.captureTargetPct * netCreatedValue);
  const priceCeiling = referenceValue + (inputs.captureCeilingPct * netCreatedValue);
  
  // cogsPerUserMonth
  // COGS in the last month of the timeline (steady state, tokenCosts + opex) per customer
  const lastMonth = timeline[timeline.length - 1];
  const steadyStateCustomers = lastMonth ? lastMonth.customers : 0;
  const cogsPerUserMonth = (lastMonth && steadyStateCustomers > 0) ? ((lastMonth.tokenCosts + lastMonth.opex) / steadyStateCustomers) : 0;
  
  // targetCapturePerUserMonth (= capture_target * NetValue/klient/mc)
  const targetCapturePerUserMonth = inputs.captureTargetPct * unitNetValue;
  
  // customerSurplusPerUserMonth (= (1 - capture_target) * NetValue)
  const customerSurplusPerUserMonth = (1 - inputs.captureTargetPct) * unitNetValue;
  
  // vendorGrossProfitPerUserMonth = targetCapturePerUserMonth * grossMargin - cogsPerUserMonth
  const gm = inputs.grossMargin !== undefined ? inputs.grossMargin : 1.0;
  const vendorGrossProfitPerUserMonth = targetCapturePerUserMonth * gm - cogsPerUserMonth;

  return {
    evc,
    referenceValue,
    positiveValueTotal,
    negativeValueTotal,
    netCreatedValue,
    priceFloor,
    priceTarget,
    priceCeiling,
    laborSavings: unitLaborSavingsAnnual,
    extraPositiveValue,
    unitNetValue,
    targetCapturePerUserMonth,
    customerSurplusPerUserMonth,
    vendorGrossProfitPerUserMonth,
    cogsPerUserMonth
  };
}

export function calculateCohortNetValue(
  cohort: CohortConfig,
  scenario: Scenario
): { valueFromOutcomes: number; laborSavingsMonthly: number; netValue: number } {
  const intensity = cohort.usage_intensity ?? 1.0;
  let valueFromOutcomes = 0;
  let laborSavingsMonthly = 0;

  const cohorts = scenario.scope_cohorts || [];
  const totalStartingCustomers = cohorts.reduce((sum, cc) => sum + (cc.current_users || 0), 0);
  const representativeCustomers = totalStartingCustomers > 0 ? totalStartingCustomers : 1;

  for (const service of scenario.services || []) {
    const isAgent = service.service_type === 'agent';
    const hasValue = service.value_per_outcome != null && service.value_per_outcome > 0;
    
    let baseActivity = 0;
    if (isAgent) {
      const containmentRate = service.containment_rate || 0;
      let interactionsPerCustomerMonth = 0;
      if (service.interaction_driver_type === 'per_customer') {
        interactionsPerCustomerMonth = service.interactions_per_customer_month || 0;
      } else {
        interactionsPerCustomerMonth = (service.monthly_volume || 0) / representativeCustomers;
      }
      baseActivity = interactionsPerCustomerMonth * containmentRate;
    } else {
      // copilot
      baseActivity = service.avg_requests_per_user_month || 0;
    }

    const activity = baseActivity * intensity;

    if (hasValue) {
      valueFromOutcomes += (service.value_per_outcome || 0) * activity;
    } else if (isAgent) {
      // labor savings path only for agents without value_per_outcome
      const hoursSaved = (activity * (service.average_handle_time_seconds || 0)) / 3600;
      const productiveHours = service.productive_hours_per_fte_month || 120;
      const baselineFte = service.baseline_fte || 0;
      const fteSaved = hoursSaved / productiveHours;
      const realizable = baselineFte > 0 
        ? Math.min(fteSaved, baselineFte / representativeCustomers) 
        : fteSaved;
      laborSavingsMonthly += (realizable * (service.fully_loaded_cost_per_fte_month || 0));
    }
  }

  const netValue = valueFromOutcomes + laborSavingsMonthly - (scenario.evc_negative_value || 0) / 12;

  return {
    valueFromOutcomes,
    laborSavingsMonthly,
    netValue
  };
}

export function buildPricingCorridor(
  scenario: Scenario,
  timeline: MonthlyBreakdown[],
  evc: EvcResult,
  cohortPriceMap?: Map<string, number>
): PricingCorridorResult {
  const lastMonth = timeline[timeline.length - 1];
  const aiUsers = lastMonth ? lastMonth.aiUsers : 0;
  const customers = lastMonth ? lastMonth.customers : 0;

  // u_base = intensity-free token cost per AI user. The main timeline scales tokenCosts by per-cohort
  // usage_intensity (ADR 0011 Phase B), so divide by the intensity-weighted user count to recover the
  // base unit cost before re-applying each cohort's own intensity below — otherwise the blended
  // avgIntensity gets double-counted into every cohort's COGS floor.
  const weightedAiUsers = lastMonth ? (lastMonth.aiUsersWeighted ?? aiUsers) : 0;
  const u = weightedAiUsers > 0 && lastMonth ? lastMonth.tokenCosts / weightedAiUsers : 0;
  const o = customers > 0 && lastMonth ? lastMonth.opex / customers : 0;
  const actualPrice = customers > 0 && lastMonth ? lastMonth.revenue / customers : 0;

  const carrier = resolveCarrier(scenario.modeling_type, scenario.revenue_carrier);
  const useCohortPrice = carrier === 'cohort' && cohortPriceMap !== undefined;

  const cohorts = scenario.scope_cohorts || [];
  const hasAnyValuePerOutcome = (scenario.services || []).some(s => s.value_per_outcome != null && s.value_per_outcome > 0);
  // ADR 0011 Track A — middle-priority path: differentiate the EVC ceiling/target/floor per
  // cohort via decomposed multipliers when any cohort resolved a non-1.0 multiplier through the
  // scope-override cascade. Lower priority than the per-outcome path; higher than the flat
  // scenario-scalar fallback (which still applies when neither is configured).
  const hasAnyEvcMultiplier = cohorts.some(c =>
    (c.evc_extra_value_multiplier ?? 1.0) !== 1.0 ||
    (c.evc_negative_value_multiplier ?? 1.0) !== 1.0 ||
    (c.evc_nba_multiplier ?? 1.0) !== 1.0
  );

  const points: PricingCorridorPoint[] = cohorts.map(cohort => {
    const a = cohort.ai_adoption_rate ?? 0;
    const intensity = cohort.usage_intensity ?? 1.0;
    const gm = Math.max(0, Math.min(0.99, cohort.gross_margin ?? 1.0));

    // Scale COGS by usage intensity
    const cogs = a * intensity * u + o;
    const floorTarget = cogs / (1 - gm);

    let pointCeiling = evc.priceCeiling;
    let pointTarget = evc.priceTarget;
    let pointFloor = evc.priceFloor;
    let cohortValFromOutcomes = 0;

    if (hasAnyValuePerOutcome) {
      const { valueFromOutcomes, netValue } = calculateCohortNetValue(cohort, scenario);

      const referenceValue = (scenario.evc_nba_annual_value || 0) / 12;
      const capCeiling = scenario.evc_capture_ceiling_pct ?? 0.50;
      const capTarget = scenario.evc_capture_target_pct ?? 0.30;
      const capFloor = scenario.evc_capture_floor_pct ?? 0.15;

      pointCeiling = referenceValue + capCeiling * netValue;
      pointTarget = referenceValue + capTarget * netValue;
      pointFloor = referenceValue + capFloor * netValue;
      cohortValFromOutcomes = valueFromOutcomes;
    } else if (hasAnyEvcMultiplier) {
      const extraMult = cohort.evc_extra_value_multiplier ?? 1.0;
      const negMult = cohort.evc_negative_value_multiplier ?? 1.0;
      const nbaMult = cohort.evc_nba_multiplier ?? 1.0;

      const extra_c = (scenario.evc_extra_positive_value ?? 0) * extraMult;
      const neg_c = (scenario.evc_negative_value ?? 0) * negMult;
      const nba_c = (scenario.evc_nba_annual_value ?? 0) * nbaMult;

      // Labor-savings term is intentionally left un-multiplied — multipliers scale
      // willingness-to-pay inputs, not displaced-labor value (that's Track B's domain).
      const netCreated_c = (extra_c + evc.laborSavings - neg_c) / 12;
      const reference_c = nba_c / 12;
      const capCeiling = scenario.evc_capture_ceiling_pct ?? 0.50;
      const capTarget = scenario.evc_capture_target_pct ?? 0.30;
      const capFloor = scenario.evc_capture_floor_pct ?? 0.15;

      pointCeiling = reference_c + capCeiling * netCreated_c;
      pointTarget = reference_c + capTarget * netCreated_c;
      pointFloor = reference_c + capFloor * netCreated_c;
    }

    const pointPrice = useCohortPrice ? (cohortPriceMap.get(cohort.id) ?? 0) : actualPrice;

    let status: 'loss' | 'below_margin' | 'healthy' | 'over_ceiling' = 'healthy';
    if (pointPrice < cogs) {
      status = 'loss';
    } else if (pointPrice < floorTarget) {
      status = 'below_margin';
    } else if (pointPrice > pointCeiling) {
      status = 'over_ceiling';
    }

    return {
      cohortId: cohort.id,
      cohortName: cohort.name,
      adoptionRate: a,
      grossMargin: cohort.gross_margin ?? 1.0,
      cogs,
      floorTarget,
      ceiling: pointCeiling,
      targetPrice: pointTarget,
      floorPrice: pointFloor,
      valueFromOutcomes: hasAnyValuePerOutcome ? cohortValFromOutcomes : undefined,
      status,
      isReference: !!scenario.evc_reference_cohort_id && cohort.id === scenario.evc_reference_cohort_id,
      pricePerCustomer: pointPrice,
      priceBasis: useCohortPrice ? 'cohort' : 'blended'
    };
  });

  // Sort ascending by cogs
  points.sort((a, b) => a.cogs - b.cogs);

  const hasBreak = points.some(p => p.status === 'loss');

  // Compute blended/average reference lines
  const blendedMediumCogs = evc.cogsPerUserMonth;
  // Weighted or simple average of gross margin for the blended floor target
  let avgGrossMargin = 1.0;
  if (cohorts.length > 0) {
    const totUsers = cohorts.reduce((s, cc) => s + (cc.current_users || 0), 0);
    if (totUsers > 0) {
      avgGrossMargin = cohorts.reduce(
        (s, cc) => s + (cc.gross_margin !== undefined ? cc.gross_margin : 1.0) * (cc.current_users || 0), 0
      ) / totUsers;
    } else {
      avgGrossMargin = cohorts.reduce(
        (s, cc) => s + (cc.gross_margin !== undefined ? cc.gross_margin : 1.0), 0
      ) / cohorts.length;
    }
  }
  const clampedAvgGrossMargin = Math.max(0, Math.min(0.99, avgGrossMargin));
  const blendedMediumFloorTarget = blendedMediumCogs / (1 - clampedAvgGrossMargin);

  return {
    points,
    actualPrice,
    blendedMediumCogs,
    blendedMediumFloorTarget,
    hasBreak
  };
}

export function buildPocketMarginWaterfall(
  scenario: Scenario,
  timeline: MonthlyBreakdown[],
  evc: EvcResult
): PocketMarginWaterfallResult {
  const lastMonth = timeline[timeline.length - 1];
  const customers = lastMonth ? lastMonth.customers : 0;

  // All per-customer/month so the bridge reconciles with evc.cogsPerUserMonth (= u + o).
  const u = customers > 0 && lastMonth ? lastMonth.tokenCosts / customers : 0;
  const o = customers > 0 && lastMonth ? lastMonth.opex / customers : 0;

  // Realized price per customer
  const actualPrice = customers > 0 && lastMonth ? lastMonth.revenue / customers : 0;

  const steps: PocketMarginWaterfallStep[] = [
    { name: 'Economic Value to Customer (EVC)', value: evc.evc, type: 'base' },
    { name: 'Customer Surplus', value: -evc.customerSurplusPerUserMonth, type: 'delta' },
    { name: 'Target Price', value: evc.priceTarget, type: 'total' },
    { name: 'AI COGS', value: -u, type: 'delta' },
    { name: 'Cost-to-Serve', value: -o, type: 'delta' },
    { name: 'Pocket Margin', value: evc.priceTarget - u - o, type: 'total' }
  ];

  const pocketMargin = evc.priceTarget - u - o;
  const reconciliationError = Math.abs((evc.evc - evc.customerSurplusPerUserMonth - u - o) - pocketMargin);

  return {
    steps,
    actualPrice,
    pocketMargin,
    reconciliationError
  };
}

// ============================================================
// Sensitivity Analysis
// ============================================================

/**
 * Helper to clone the scenario object deeply to avoid mutating DB-cached records.
 */
export function cloneScenario(scenario: Scenario): Scenario {
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
    (carrier === 'plan' || carrier === 'feature' || carrier === 'pack' || carrier === 'composite') &&
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

    // 8d. Price Per Outcome (Gap A)
    const outcomeMonetizationActive = (scenario.services ?? []).some(s => s.monetization?.monetization_type === 'outcome');
    if (outcomeMonetizationActive) {
      const cloneLow = cloneScenario(scenario);
      for (const s of cloneLow.services ?? []) {
        if (s.monetization?.price_per_outcome != null) {
          s.monetization.price_per_outcome *= (1 - variationPercent);
        }
      }
      const resLow = calculateScenario(cloneLow, allProviders, creditSettings);

      const cloneHigh = cloneScenario(scenario);
      for (const s of cloneHigh.services ?? []) {
        if (s.monetization?.price_per_outcome != null) {
          s.monetization.price_per_outcome *= (1 + variationPercent);
        }
      }
      const resHigh = calculateScenario(cloneHigh, allProviders, creditSettings);

      results.push({
        parameter: 'Price per Outcome',
        key: 'price_per_outcome',
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

export function runCaptureCurve(
  scenario: Scenario,
  allProviders: Provider[],
  creditSettings: CreditSettings = DEFAULT_CREDIT_SETTINGS
): CaptureCurveResult {
  const points: CaptureCurvePoint[] = [];
  const epsilon = scenario.adoption_elasticity ?? 0;
  const epsilon_low = Math.max(0, epsilon - 0.5);
  const epsilon_high = epsilon + 0.5;
  
  let maxNpv = -Infinity;
  let optimalCapture = 0.30;
  
  let maxNpvLow = -Infinity;
  let band_low = 0.30;
  
  let maxNpvHigh = -Infinity;
  let band_high = 0.30;
  
  // Sweep capture from 0.0 to 1.0 in 20 steps (0.05 step)
  for (let i = 0; i <= 20; i++) {
    const capture = i / 20;
    
    // 1. Base Epsilon
    const cloned = cloneScenario(scenario);
    cloned.price_from_evc = true;
    cloned.adoption_elasticity = epsilon;
    const res = calculateScenario(cloned, allProviders, creditSettings, { runtime_capture_pct: capture });
    
    let customerSurplusPV = 0;
    let vendorProfitPV = 0;
    if (res.evc) {
      const surplusFlows = res.timeline.map(m => m.customers * (res.evc?.customerSurplusPerUserMonth ?? 0));
      const profitFlows = res.timeline.map(m => m.customers * (res.evc?.vendorGrossProfitPerUserMonth ?? 0));
      const rate = scenario.discount_rate ?? 0.10;
      customerSurplusPV = calculateNPV(surplusFlows, rate);
      vendorProfitPV = calculateNPV(profitFlows, rate);
    }
    
    points.push({
      capture,
      npvUpper: res.npvUpper,
      npvLower: res.npvLower,
      customerSurplus: customerSurplusPV,
      vendorProfit: vendorProfitPV
    });
    
    if (res.npvUpper > maxNpv) {
      maxNpv = res.npvUpper;
      optimalCapture = capture;
    }
    
    // 2. Epsilon Low
    const clonedLow = cloneScenario(scenario);
    clonedLow.price_from_evc = true;
    clonedLow.adoption_elasticity = epsilon_low;
    const resLow = calculateScenario(clonedLow, allProviders, creditSettings, { runtime_capture_pct: capture });
    if (resLow.npvUpper > maxNpvLow) {
      maxNpvLow = resLow.npvUpper;
      band_low = capture;
    }
    
    // 3. Epsilon High
    const clonedHigh = cloneScenario(scenario);
    clonedHigh.price_from_evc = true;
    clonedHigh.adoption_elasticity = epsilon_high;
    const resHigh = calculateScenario(clonedHigh, allProviders, creditSettings, { runtime_capture_pct: capture });
    if (resHigh.npvUpper > maxNpvHigh) {
      maxNpvHigh = resHigh.npvUpper;
      band_high = capture;
    }
  }
  
  const unitLaborSavingsAnnual = calculateAnalyticalLaborSavings(scenario);
  const unitNetValue = ((scenario.evc_extra_positive_value ?? 0) + unitLaborSavingsAnnual - (scenario.evc_negative_value ?? 0)) / 12;
  const optimalOverlayPrice = unitNetValue * optimalCapture;
  
  return {
    points,
    optimalCapture,
    optimalOverlayPrice,
    epsilonBand: {
      low: band_low,
      base: optimalCapture,
      high: band_high
    }
  };
}
