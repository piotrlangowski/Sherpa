import type { Scenario, ScenarioResult, CostItem, Service, Provider } from '../../types';
import { buildCohortModel } from './cohort-model';
import { scenariosRepository } from '../repositories/scenarios';
import { providersRepository } from '../repositories/providers';

export interface MonthlyBreakdown {
  month: number;
  revenue: number;
  customers: number;
  aiUsers: number;
  opex: number;
  capex: number;
  tokenCosts: number;
  totalCosts: number;
  netCashFlow: number;
  cumulativeCashFlow: number;
}

export interface CalculationResult {
  timeline: MonthlyBreakdown[];
  paybackMonths: number | null;
  npv: number;
  irrAnnual: number | null;
  tco: number;
  roiPercent: number;
}

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
  const rMonthly = annualDiscountRate > 0 ? Math.pow(1 + annualDiscountRate, 1 / 12) - 1 : 0;
  let cumulative = 0;
  let prevCumulative = 0;

  for (let t = 0; t < cashFlows.length; t++) {
    const discountedCf = cashFlows[t] / Math.pow(1 + rMonthly, t);
    prevCumulative = cumulative;
    cumulative += discountedCf;

    if (cumulative >= 0 && prevCumulative < 0) {
      // Interpolate fractional month:
      // Payback = (t - 1) + |prevCumulative| / discountedCf
      // Note: prevCumulative is negative, so we do -prevCumulative
      const fraction = -prevCumulative / discountedCf;
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

/**
 * Runs the full financial engine calculations for a Scenario.
 */
export function calculateScenario(scenario: Scenario): CalculationResult {
  const projectionMonths = scenario.projection_months || 36;
  const annualDiscountRate = scenario.discount_rate || 0.10;

  if (!scenario.cohort_config) {
    throw new Error(`Scenario '${scenario.name}' lacks a cohort configuration.`);
  }

  // 1. Generate cohort revenue timeline
  const cohortResult = buildCohortModel(scenario.cohort_config, projectionMonths);

  // 2. Load all predefined/custom providers for token pricing
  const allProviders = providersRepository.getAll();
  const providersMap = new Map<string, Provider>();
  for (const prov of allProviders) {
    providersMap.set(prov.id, prov);
  }

  const timeline: MonthlyBreakdown[] = [];
  let cumulativeCashFlow = 0;

  // 3. Loop through projection months
  for (let t = 0; t < projectionMonths; t++) {
    const cohortMonth = cohortResult.timeline[t];
    const activeCustomers = cohortMonth.activeCustomers;
    const activeAiUsers = cohortMonth.activeAiUsers;
    const revenue = cohortMonth.mrr;

    let opex = 0;
    let capex = 0;
    let tokenCosts = 0;

    // A. Direct AI Services Costs (from scenario_services rollout)
    if (scenario.services) {
      for (const service of scenario.services) {
        // Only active if month is at or after rollout month
        if (t >= service.rollout_month) {
          // Find full service properties (scenarios Repository returns partial metadata)
          // Let's get the DB parameters for this service
          const fullService = service as any; // Loaded relations in repository getById
          
          let serviceTokenCost = 0;
          if (fullService.provider_id && providersMap.has(fullService.provider_id)) {
            const provider = providersMap.get(fullService.provider_id)!;
            const inputPrice = provider.input_price / 1000000;
            const outputPrice = provider.output_price / 1000000;
            
            // Monthly service execution token cost
            // activeAiUsers * avg_requests_per_user_month * (avg_input_tokens * input_price + avg_output_tokens * output_price)
            serviceTokenCost = activeAiUsers * 
              (fullService.avg_requests_per_user_month || 0) * 
              ((fullService.avg_input_tokens || 0) * inputPrice + (fullService.avg_output_tokens || 0) * outputPrice);
          }

          let serviceFixedCost = fullService.fixed_cost_per_month || 0;

          // Add to token / infrastructure cost segment
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
      revenue,
      customers: activeCustomers,
      aiUsers: activeAiUsers,
      opex: parseFloat(opex.toFixed(2)),
      capex: parseFloat(capex.toFixed(2)),
      tokenCosts: parseFloat(tokenCosts.toFixed(2)),
      totalCosts: parseFloat(totalCosts.toFixed(2)),
      netCashFlow: parseFloat(netCashFlow.toFixed(2)),
      cumulativeCashFlow: parseFloat(cumulativeCashFlow.toFixed(2))
    });
  }

  // 4. Calculate aggregate KPIs
  const cashFlows = timeline.map(day => day.netCashFlow);
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

/**
 * Executes calculation for a scenario ID, caches it in the scenario_results table,
 * and returns the calculated calculation result.
 */
export function runAndSaveScenario(scenarioId: string): CalculationResult {
  const scenario = scenariosRepository.getById(scenarioId);
  if (!scenario) {
    throw new Error(`Scenario not found: ${scenarioId}`);
  }

  const result = calculateScenario(scenario);

  scenariosRepository.saveResults({
    id: '', // repo will generate UUID or replace existing
    scenario_id: scenarioId,
    payback_months: result.paybackMonths,
    npv: result.npv,
    irr_annual: result.irrAnnual,
    tco: result.tco,
    roi_percent: result.roiPercent,
    monthly_cashflows: result.timeline.map(t => t.netCashFlow),
    monthly_mrr: result.timeline.map(t => t.revenue),
    monthly_customers: result.timeline.map(t => t.customers),
    calculated_at: new Date().toISOString()
  });

  return result;
}
