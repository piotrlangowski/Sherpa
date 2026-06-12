import type { PageServerLoad, Actions } from './$types';
import { cohortsRepository } from '$lib/server/repositories/cohorts';
import { verticalsRepository } from '$lib/server/repositories/verticals';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
  const cohorts = cohortsRepository.getAll();
  const verticals = verticalsRepository.getAll();
  return {
    cohorts,
    verticals
  };
};

export const actions: Actions = {
  createCohort: async ({ request }) => {
    const formData = await request.formData();
    const name = formData.get('name') as string;
    const verticalId = formData.get('verticalId') as string;
    const currentUsers = parseInt(formData.get('currentUsers') as string || '0', 10);
    const monthlyAcquisition = parseInt(formData.get('monthlyAcquisition') as string || '0', 10);
    const acquisitionGrowthRate = parseFloat(formData.get('acquisitionGrowthRate') as string || '0') / 100;
    const monthlyChurnRate = parseFloat(formData.get('monthlyChurnRate') as string || '0') / 100;
    const retentionFloor = parseFloat(formData.get('retentionFloor') as string || '0') / 100;
    const monthlyExpansionRate = parseFloat(formData.get('monthlyExpansionRate') as string || '0') / 100;
    const aiAdoptionRate = parseFloat(formData.get('aiAdoptionRate') as string || '0') / 100;
    const baseArpu = parseFloat(formData.get('baseArpu') as string || '0');
    const arpuUplift = parseFloat(formData.get('arpuUplift') as string || '0');
    const arpuUpliftPercent = parseFloat(formData.get('arpuUpliftPercent') as string || '0') / 100;
    const churnReduction = parseFloat(formData.get('churnReduction') as string || '0') / 100;
    const acquisitionUplift = parseFloat(formData.get('acquisitionUplift') as string || '0') / 100;

    if (!name) {
      return fail(400, { error: 'Cohort name is required' });
    }

    try {
      cohortsRepository.create({
        name,
        vertical_id: verticalId || null,
        current_users: currentUsers,
        monthly_acquisition: monthlyAcquisition,
        acquisition_growth_rate: acquisitionGrowthRate,
        monthly_churn_rate: monthlyChurnRate,
        retention_floor: retentionFloor,
        monthly_expansion_rate: monthlyExpansionRate,
        ai_adoption_rate: aiAdoptionRate,
        base_arpu: baseArpu,
        arpu_uplift: arpuUplift,
        arpu_uplift_percent: arpuUpliftPercent,
        churn_reduction: churnReduction,
        acquisition_uplift: acquisitionUplift
      });
      return { success: true };
    } catch (err: any) {
      return fail(500, { error: err.message });
    }
  },

  updateCohort: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get('id') as string;
    const name = formData.get('name') as string;
    const verticalId = formData.get('verticalId') as string;
    const currentUsers = parseInt(formData.get('currentUsers') as string || '0', 10);
    const monthlyAcquisition = parseInt(formData.get('monthlyAcquisition') as string || '0', 10);
    const acquisitionGrowthRate = parseFloat(formData.get('acquisitionGrowthRate') as string || '0') / 100;
    const monthlyChurnRate = parseFloat(formData.get('monthlyChurnRate') as string || '0') / 100;
    const retentionFloor = parseFloat(formData.get('retentionFloor') as string || '0') / 100;
    const monthlyExpansionRate = parseFloat(formData.get('monthlyExpansionRate') as string || '0') / 100;
    const aiAdoptionRate = parseFloat(formData.get('aiAdoptionRate') as string || '0') / 100;
    const baseArpu = parseFloat(formData.get('baseArpu') as string || '0');
    const arpuUplift = parseFloat(formData.get('arpuUplift') as string || '0');
    const arpuUpliftPercent = parseFloat(formData.get('arpuUpliftPercent') as string || '0') / 100;
    const churnReduction = parseFloat(formData.get('churnReduction') as string || '0') / 100;
    const acquisitionUplift = parseFloat(formData.get('acquisitionUplift') as string || '0') / 100;

    if (!id || !name) {
      return fail(400, { error: 'ID and Cohort name are required' });
    }

    try {
      cohortsRepository.update(id, {
        name,
        vertical_id: verticalId || null,
        current_users: currentUsers,
        monthly_acquisition: monthlyAcquisition,
        acquisition_growth_rate: acquisitionGrowthRate,
        monthly_churn_rate: monthlyChurnRate,
        retention_floor: retentionFloor,
        monthly_expansion_rate: monthlyExpansionRate,
        ai_adoption_rate: aiAdoptionRate,
        base_arpu: baseArpu,
        arpu_uplift: arpuUplift,
        arpu_uplift_percent: arpuUpliftPercent,
        churn_reduction: churnReduction,
        acquisition_uplift: acquisitionUplift
      });
      return { success: true };
    } catch (err: any) {
      return fail(500, { error: err.message });
    }
  },

  deleteCohort: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get('id') as string;

    if (!id) {
      return fail(400, { error: 'Cohort ID is required' });
    }

    try {
      cohortsRepository.delete(id);
      return { success: true };
    } catch (err: any) {
      return fail(500, { error: err.message });
    }
  }
};
