/**
 * Shared financial math functions for the Sherpa ROI Calculator.
 *
 * This module contains all pure computation logic (zero side effects, no DB access).
 * It is the single source of truth shared between the main SvelteKit app
 * and the MCP Server, eliminating code duplication.
 */
// ============================================================
// Scope Override Cascade
// ============================================================
/**
 * Applies a three-level override cascade (global → vertical → cohort) to a list of CohortConfigs.
 * Pure function — callers are responsible for loading the correct cohorts and overrides from DB.
 */
export function applyScopeOverrides(cohorts, overrides) {
    if (cohorts.length === 0)
        return [];
    const applyOverride = (config, override) => {
        if (!override)
            return config;
        const c = { ...config };
        if (override.monthly_churn_rate !== null && override.monthly_churn_rate !== undefined)
            c.monthly_churn_rate = override.monthly_churn_rate;
        if (override.monthly_acquisition !== null && override.monthly_acquisition !== undefined)
            c.monthly_acquisition = override.monthly_acquisition;
        if (override.acquisition_growth_rate !== null && override.acquisition_growth_rate !== undefined)
            c.acquisition_growth_rate = override.acquisition_growth_rate;
        if (override.ai_adoption_rate !== null && override.ai_adoption_rate !== undefined)
            c.ai_adoption_rate = override.ai_adoption_rate;
        if (override.retention_floor !== null && override.retention_floor !== undefined)
            c.retention_floor = override.retention_floor;
        if (override.expansion_rate !== null && override.expansion_rate !== undefined)
            c.monthly_expansion_rate = override.expansion_rate;
        if (override.arpu_override !== null && override.arpu_override !== undefined)
            c.base_arpu = override.arpu_override;
        return c;
    };
    const globalOverride = overrides.find(o => o.target_type === 'all_clients');
    const verticalOverrides = new Map(overrides.filter(o => o.target_type === 'vertical').map(o => [o.target_id, o]));
    const cohortOverrides = new Map(overrides.filter(o => o.target_type === 'cohort').map(o => [o.target_id, o]));
    return cohorts.map(cohort => {
        let c = { ...cohort };
        c = applyOverride(c, globalOverride);
        if (c.vertical_id)
            c = applyOverride(c, verticalOverrides.get(c.vertical_id));
        c = applyOverride(c, cohortOverrides.get(c.id));
        return c;
    });
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
export function buildCohortModel(config, projectionMonths) {
    const timeline = [];
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
    const cohortSizes = [currentUsers];
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
            if (cohortSize <= 0)
                continue;
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
export function calculateNPV(cashFlows, annualDiscountRate) {
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
export function calculatePaybackPeriod(cashFlows, annualDiscountRate = 0) {
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
export function calculateIRR(cashFlows) {
    // Check if we have at least one positive and one negative cash flow
    let hasPositive = false;
    let hasNegative = false;
    for (const cf of cashFlows) {
        if (cf > 0)
            hasPositive = true;
        if (cf < 0)
            hasNegative = true;
    }
    if (!hasPositive || !hasNegative)
        return null;
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
        if (Math.abs(fDeriv) < 1e-12)
            break; // avoid division by zero
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
        }
        else {
            low = mid;
        }
    }
    return null;
}
/**
 * Calculates Total Cost of Ownership (TCO)
 */
export function calculateTCO(timeline) {
    const total = timeline.reduce((acc, curr) => acc + curr.totalCosts, 0);
    return parseFloat(total.toFixed(2));
}
// ============================================================
// Scenario Calculation
// ============================================================
/**
 * Runs the full financial engine calculations for a Scenario.
 * This is a pure function – it requires providers to be passed in
 * rather than querying the database directly.
 */
export function calculateScenario(scenario, allProviders) {
    const projectionMonths = scenario.projection_months ?? 36;
    const annualDiscountRate = scenario.discount_rate ?? 0.10;
    if (!scenario.scope_cohorts || scenario.scope_cohorts.length === 0) {
        throw new Error(`Scenario '${scenario.name}' has no cohort configurations.`);
    }
    // 1. Generate cohort revenue timelines (one per cohort)
    const cohortResults = scenario.scope_cohorts.map(cc => buildCohortModel(cc, projectionMonths));
    // 2. Build provider lookup map
    const providersMap = new Map();
    for (const prov of allProviders) {
        providersMap.set(prov.id, prov);
    }
    const timeline = [];
    let cumulativeCashFlow = 0;
    // 3. Loop through projection months
    for (let t = 0; t < projectionMonths; t++) {
        let activeCustomers = 0;
        let activeAiUsers = 0;
        let revenue = 0;
        // Aggregate over all cohort models for month t
        for (const res of cohortResults) {
            const monthData = res.timeline[t];
            if (monthData) {
                activeCustomers += monthData.activeCustomers;
                activeAiUsers += monthData.activeAiUsers;
                revenue += monthData.mrr;
            }
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
                        const provider = providersMap.get(service.provider_id);
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
                }
                else if (item.frequency === 'monthly') {
                    isApplicable = true;
                }
                else if (item.frequency === 'yearly' && t % 12 === 0) {
                    isApplicable = true;
                }
                if (isApplicable) {
                    if (item.category === 'capex') {
                        capex += item.amount;
                    }
                    else {
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
function cloneScenario(scenario) {
    return JSON.parse(JSON.stringify(scenario));
}
/**
 * Runs sensitivity analysis on a Scenario by varying each parameter by ±variationPercent.
 * Pure function – requires providers to be passed in.
 */
export function runSensitivityAnalysis(scenario, allProviders, variationPercent = 0.1) {
    if (!scenario.scope_cohorts || scenario.scope_cohorts.length === 0) {
        return {
            scenarioId: scenario.id,
            baseNpv: 0,
            baseIrr: null,
            basePayback: null,
            results: []
        };
    }
    const baseResult = calculateScenario(scenario, allProviders);
    const baseNpv = baseResult.npv;
    const results = [];
    // Helper to format percentage change
    const varLabelLow = `-${(variationPercent * 100).toFixed(0)}%`;
    const varLabelHigh = `+${(variationPercent * 100).toFixed(0)}%`;
    // 1. Churn Rate (Negative Impact: Higher churn => Lower NPV)
    {
        const cloneLow = cloneScenario(scenario);
        for (const cc of cloneLow.scope_cohorts) {
            cc.monthly_churn_rate = cc.monthly_churn_rate * (1 - variationPercent);
        }
        const resLow = calculateScenario(cloneLow, allProviders);
        const cloneHigh = cloneScenario(scenario);
        for (const cc of cloneHigh.scope_cohorts) {
            cc.monthly_churn_rate = cc.monthly_churn_rate * (1 + variationPercent);
        }
        const resHigh = calculateScenario(cloneHigh, allProviders);
        results.push({
            parameter: 'Monthly Churn Rate',
            key: 'churn_rate',
            lowValueText: varLabelLow,
            highValueText: varLabelHigh,
            lowNpv: resLow.npv,
            highNpv: resHigh.npv,
            lowIrr: resLow.irrAnnual,
            highIrr: resHigh.irrAnnual,
            lowPayback: resLow.paybackMonths,
            highPayback: resHigh.paybackMonths,
            impactRange: Math.abs(resLow.npv - resHigh.npv)
        });
    }
    // 2. Monthly Acquisition (Positive Impact: Higher acq => Higher NPV)
    {
        const cloneLow = cloneScenario(scenario);
        for (const cc of cloneLow.scope_cohorts) {
            cc.monthly_acquisition = cc.monthly_acquisition * (1 - variationPercent);
        }
        const resLow = calculateScenario(cloneLow, allProviders);
        const cloneHigh = cloneScenario(scenario);
        for (const cc of cloneHigh.scope_cohorts) {
            cc.monthly_acquisition = cc.monthly_acquisition * (1 + variationPercent);
        }
        const resHigh = calculateScenario(cloneHigh, allProviders);
        results.push({
            parameter: 'New Monthly Customers',
            key: 'acquisition',
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
    // 3. Base ARPU (Positive Impact: Higher ARPU => Higher NPV)
    {
        const cloneLow = cloneScenario(scenario);
        for (const cc of cloneLow.scope_cohorts) {
            cc.base_arpu = cc.base_arpu * (1 - variationPercent);
        }
        const resLow = calculateScenario(cloneLow, allProviders);
        const cloneHigh = cloneScenario(scenario);
        for (const cc of cloneHigh.scope_cohorts) {
            cc.base_arpu = cc.base_arpu * (1 + variationPercent);
        }
        const resHigh = calculateScenario(cloneHigh, allProviders);
        results.push({
            parameter: 'Base ARPU',
            key: 'arpu',
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
        for (const cc of cloneLow.scope_cohorts) {
            cc.ai_adoption_rate = cc.ai_adoption_rate * (1 - variationPercent);
        }
        const resLow = calculateScenario(cloneLow, allProviders);
        const cloneHigh = cloneScenario(scenario);
        for (const cc of cloneHigh.scope_cohorts) {
            cc.ai_adoption_rate = cc.ai_adoption_rate * (1 + variationPercent);
        }
        const resHigh = calculateScenario(cloneHigh, allProviders);
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
        const resLow = calculateScenario(cloneLow, allProviders);
        const cloneHigh = cloneScenario(scenario);
        cloneHigh.discount_rate = highVal;
        const resHigh = calculateScenario(cloneHigh, allProviders);
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
        for (const c of cloneLow.costs) {
            c.amount = c.amount * (1 - variationPercent);
        }
        const resLow = calculateScenario(cloneLow, allProviders);
        const cloneHigh = cloneScenario(scenario);
        for (const c of cloneHigh.costs) {
            c.amount = c.amount * (1 + variationPercent);
        }
        const resHigh = calculateScenario(cloneHigh, allProviders);
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
        for (const s of cloneLow.services) {
            s.avg_input_tokens = Math.round(s.avg_input_tokens * (1 - variationPercent));
            s.avg_output_tokens = Math.round(s.avg_output_tokens * (1 - variationPercent));
            if (s.fixed_cost_per_month) {
                s.fixed_cost_per_month = s.fixed_cost_per_month * (1 - variationPercent);
            }
        }
        const resLow = calculateScenario(cloneLow, allProviders);
        const cloneHigh = cloneScenario(scenario);
        for (const s of cloneHigh.services) {
            s.avg_input_tokens = Math.round(s.avg_input_tokens * (1 + variationPercent));
            s.avg_output_tokens = Math.round(s.avg_output_tokens * (1 + variationPercent));
            if (s.fixed_cost_per_month) {
                s.fixed_cost_per_month = s.fixed_cost_per_month * (1 + variationPercent);
            }
        }
        const resHigh = calculateScenario(cloneHigh, allProviders);
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
