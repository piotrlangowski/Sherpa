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
    const cohortSizes = [currentUsers];
    for (let m = 1; m <= projectionMonths; m++) {
        const acquiredSize = baseAcquisition * Math.pow(1 + growthRate, m - 1);
        cohortSizes.push(acquiredSize);
    }
    for (let t = 0; t < projectionMonths; t++) {
        let activeCustomers = 0;
        let mrr = 0;
        let newUsersAcquired = t === 0 ? 0 : cohortSizes[t];
        for (let s = 0; s <= t; s++) {
            const cohortSize = cohortSizes[s];
            if (cohortSize <= 0)
                continue;
            const age = t - s;
            const retentionFraction = Math.max(retentionFloor, Math.pow(1 - churnRate, age));
            const activeInCohort = cohortSize * retentionFraction;
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
export function calculateNPV(cashFlows, annualDiscountRate) {
    const rMonthly = Math.pow(1 + annualDiscountRate, 1 / 12) - 1;
    let npv = 0;
    for (let t = 0; t < cashFlows.length; t++) {
        npv += cashFlows[t] / Math.pow(1 + rMonthly, t);
    }
    return parseFloat(npv.toFixed(2));
}
export function calculatePaybackPeriod(cashFlows, annualDiscountRate = 0) {
    const rMonthly = annualDiscountRate > 0 ? Math.pow(1 + annualDiscountRate, 1 / 12) - 1 : 0;
    let cumulative = 0;
    let prevCumulative = 0;
    for (let t = 0; t < cashFlows.length; t++) {
        const discountedCf = cashFlows[t] / Math.pow(1 + rMonthly, t);
        prevCumulative = cumulative;
        cumulative += discountedCf;
        if (cumulative >= 0 && prevCumulative < 0) {
            const fraction = -prevCumulative / discountedCf;
            return parseFloat((t - 1 + fraction).toFixed(1));
        }
    }
    return null;
}
export function calculateIRR(cashFlows) {
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
    let r = 0.01;
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
            break;
        const nextR = r - fVal / fDeriv;
        if (Math.abs(nextR - r) < tolerance) {
            let checkVal = 0;
            for (let t = 0; t < cashFlows.length; t++) {
                checkVal += cashFlows[t] / Math.pow(1 + nextR, t);
            }
            if (Math.abs(checkVal) < 1e-5) {
                const annualizedIrr = Math.pow(1 + nextR, 12) - 1;
                if (!isNaN(annualizedIrr) && isFinite(annualizedIrr)) {
                    return parseFloat(annualizedIrr.toFixed(4));
                }
            }
        }
        r = nextR;
    }
    let low = -0.99;
    let high = 2.0;
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
export function calculateTCO(timeline) {
    const total = timeline.reduce((acc, curr) => acc + curr.totalCosts, 0);
    return parseFloat(total.toFixed(2));
}
export function calculateScenario(scenario, allProviders) {
    const projectionMonths = scenario.projection_months || 36;
    const annualDiscountRate = scenario.discount_rate || 0.10;
    if (!scenario.cohort_config) {
        throw new Error(`Scenario lacks a cohort configuration.`);
    }
    const cohortResult = buildCohortModel(scenario.cohort_config, projectionMonths);
    const providersMap = new Map();
    for (const prov of allProviders) {
        providersMap.set(prov.id, prov);
    }
    const timeline = [];
    let cumulativeCashFlow = 0;
    for (let t = 0; t < projectionMonths; t++) {
        const cohortMonth = cohortResult.timeline[t];
        const activeCustomers = cohortMonth.activeCustomers;
        const activeAiUsers = cohortMonth.activeAiUsers;
        const revenue = cohortMonth.mrr;
        let opex = 0;
        let capex = 0;
        let tokenCosts = 0;
        if (scenario.services) {
            for (const service of scenario.services) {
                const rolloutMonth = service.rollout_month ?? 0;
                if (t >= rolloutMonth) {
                    let serviceTokenCost = 0;
                    if (service.provider_id && providersMap.has(service.provider_id)) {
                        const provider = providersMap.get(service.provider_id);
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
    const cashFlows = timeline.map(day => day.netCashFlow);
    const paybackMonths = calculatePaybackPeriod(cashFlows, annualDiscountRate);
    const npv = calculateNPV(cashFlows, annualDiscountRate);
    const irrAnnual = calculateIRR(cashFlows);
    const tco = calculateTCO(timeline);
    const totalRevenue = timeline.reduce((acc, curr) => acc + curr.revenue, 0);
    const roiPercent = tco > 0 ? parseFloat(((totalRevenue - tco) / tco).toFixed(4)) : 0;
    return {
        timeline,
        paybackMonths,
        npv,
        irrAnnual,
        tco,
        roiPercent
    };
}
function cloneScenario(scenario) {
    return JSON.parse(JSON.stringify(scenario));
}
export function runSensitivityAnalysis(scenario, allProviders, variationPercent = 0.1) {
    const baseResult = calculateScenario(scenario, allProviders);
    const baseNpv = baseResult.npv;
    const results = [];
    const cohort = scenario.cohort_config;
    if (!cohort) {
        return {
            scenarioId: scenario.id,
            baseNpv,
            baseIrr: baseResult.irrAnnual,
            basePayback: baseResult.paybackMonths,
            results: []
        };
    }
    // 1. Churn Rate
    {
        const baseVal = cohort.monthly_churn_rate;
        const lowVal = baseVal * (1 - variationPercent);
        const highVal = baseVal * (1 + variationPercent);
        const cloneLow = cloneScenario(scenario);
        cloneLow.cohort_config.monthly_churn_rate = lowVal;
        const resLow = calculateScenario(cloneLow, allProviders);
        const cloneHigh = cloneScenario(scenario);
        cloneHigh.cohort_config.monthly_churn_rate = highVal;
        const resHigh = calculateScenario(cloneHigh, allProviders);
        results.push({
            parameter: 'Monthly Churn Rate',
            key: 'churn_rate',
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
    // 2. Monthly Acquisition
    {
        const baseVal = cohort.monthly_acquisition;
        const lowVal = baseVal * (1 - variationPercent);
        const highVal = baseVal * (1 + variationPercent);
        const cloneLow = cloneScenario(scenario);
        cloneLow.cohort_config.monthly_acquisition = lowVal;
        const resLow = calculateScenario(cloneLow, allProviders);
        const cloneHigh = cloneScenario(scenario);
        cloneHigh.cohort_config.monthly_acquisition = highVal;
        const resHigh = calculateScenario(cloneHigh, allProviders);
        results.push({
            parameter: 'New Monthly Customers',
            key: 'acquisition',
            lowValueText: Math.round(lowVal).toString(),
            highValueText: Math.round(highVal).toString(),
            lowNpv: resLow.npv,
            highNpv: resHigh.npv,
            lowIrr: resLow.irrAnnual,
            highIrr: resHigh.irrAnnual,
            lowPayback: resLow.paybackMonths,
            highPayback: resHigh.paybackMonths,
            impactRange: Math.abs(resHigh.npv - resLow.npv)
        });
    }
    // 3. Base ARPU
    {
        const baseVal = cohort.base_arpu;
        const lowVal = baseVal * (1 - variationPercent);
        const highVal = baseVal * (1 + variationPercent);
        const cloneLow = cloneScenario(scenario);
        cloneLow.cohort_config.base_arpu = lowVal;
        const resLow = calculateScenario(cloneLow, allProviders);
        const cloneHigh = cloneScenario(scenario);
        cloneHigh.cohort_config.base_arpu = highVal;
        const resHigh = calculateScenario(cloneHigh, allProviders);
        results.push({
            parameter: 'Base ARPU',
            key: 'arpu',
            lowValueText: `$${lowVal.toFixed(2)}`,
            highValueText: `$${highVal.toFixed(2)}`,
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
        const baseVal = cohort.ai_adoption_rate;
        const lowVal = baseVal * (1 - variationPercent);
        const highVal = baseVal * (1 + variationPercent);
        const cloneLow = cloneScenario(scenario);
        cloneLow.cohort_config.ai_adoption_rate = lowVal;
        const resLow = calculateScenario(cloneLow, allProviders);
        const cloneHigh = cloneScenario(scenario);
        cloneHigh.cohort_config.ai_adoption_rate = highVal;
        const resHigh = calculateScenario(cloneHigh, allProviders);
        results.push({
            parameter: 'AI Adoption Rate',
            key: 'adoption',
            lowValueText: `${(lowVal * 100).toFixed(1)}%`,
            highValueText: `${(highVal * 100).toFixed(1)}%`,
            lowNpv: resLow.npv,
            highNpv: resHigh.npv,
            lowIrr: resLow.irrAnnual,
            highIrr: resHigh.irrAnnual,
            lowPayback: resLow.paybackMonths,
            highPayback: resHigh.paybackMonths,
            impactRange: Math.abs(resHigh.npv - resLow.npv)
        });
    }
    // 5. Discount Rate
    {
        const baseVal = scenario.discount_rate || 0.10;
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
    // 6. Non-Token Costs
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
    // 7. AI Token Pricing
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
    results.sort((a, b) => b.impactRange - a.impactRange);
    return {
        scenarioId: scenario.id,
        baseNpv,
        baseIrr: baseResult.irrAnnual,
        basePayback: baseResult.paybackMonths,
        results
    };
}
