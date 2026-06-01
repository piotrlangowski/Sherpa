import type { CohortConfig } from '../../types';

export interface CohortTimelineResult {
  month: number;
  activeCustomers: number;
  activeAiUsers: number;
  mrr: number;
  arr: number;
  newUsersAcquired: number;
}

export interface CohortModelResult {
  timeline: CohortTimelineResult[];
  totalRevenue: number;
  endingMrr: number;
  endingCustomers: number;
}

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
  // Month 0 has the starting current users, plus any initial MRR
  for (let t = 0; t < projectionMonths; t++) {
    let activeCustomers = 0;
    let mrr = 0;
    let newUsersAcquired = t === 0 ? 0 : cohortSizes[t]; // New users acquired at start of month t (t >= 1)

    // Calculate active customers and MRR at month t by summing over all active cohorts
    // Cohort s was acquired at month s (s = 0 is the starting cohort)
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
