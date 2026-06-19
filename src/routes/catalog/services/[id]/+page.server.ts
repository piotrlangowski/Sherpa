import type { PageServerLoad, Actions } from './$types';
import { providersRepository } from '$lib/server/repositories/providers';
import { servicesRepository } from '$lib/server/repositories/services';
import { monetizationRepository } from '$lib/server/repositories/monetization';
import { saveMonetizationFromForm } from '$lib/server/services/monetization-form';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
  const providers = providersRepository.getAll();
  const service = servicesRepository.getById(params.id);

  if (!service) {
    throw redirect(303, '/catalog/services');
  }

  service.monetization = monetizationRepository.getForEntity('service', params.id) ?? undefined;

  return {
    providers,
    service
  };
};

export const actions: Actions = {
  updateService: async ({ request, params }) => {
    const formData = await request.formData();
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const status = formData.get('status') as any;
    const providerId = formData.get('providerId') as string;
    const avgInputTokens = parseInt(formData.get('avgInputTokens') as string || '0', 10);
    const avgOutputTokens = parseInt(formData.get('avgOutputTokens') as string || '0', 10);
    const avgRequests = parseInt(formData.get('avgRequests') as string || '0', 10);
    const fixedCostStr = formData.get('fixedCost') as string;
    const fixedCost = fixedCostStr ? parseFloat(fixedCostStr) : null;
    const fixedCostCurrency = formData.get('fixedCostCurrency') as any || 'USD';

    const serviceType = (formData.get('service_type') as 'copilot' | 'agent') || 'copilot';
    const interactionDriverType = (formData.get('interaction_driver_type') as 'flat' | 'per_customer') || 'flat';
    const monthlyVolume = parseFloat(formData.get('monthly_volume') as string || '0');
    const volumeGrowthRate = parseFloat(formData.get('volume_growth_rate') as string || '0');
    const interactionsPerCustomerMonth = parseFloat(formData.get('interactions_per_customer_month') as string || '0');
    const fullyLoadedCostPerFteMonth = parseFloat(formData.get('fully_loaded_cost_per_fte_month') as string || '0');
    const productiveHoursPerFteMonth = parseFloat(formData.get('productive_hours_per_fte_month') as string || '120');
    const averageHandleTimeSeconds = parseInt(formData.get('average_handle_time_seconds') as string || '0', 10);
    const baselineFte = parseFloat(formData.get('baseline_fte') as string || '0');
    const staffingRealizationLagMonths = parseInt(formData.get('staffing_realization_lag_months') as string || '0', 10);
    const containmentRate = parseFloat(formData.get('containment_rate') as string || '0');
    const containmentStartRate = parseFloat(formData.get('containment_start_rate') as string || '0');
    const containmentRampMonths = parseInt(formData.get('containment_ramp_months') as string || '0', 10);
    const escalationRate = parseFloat(formData.get('escalation_rate') as string || '0');
    const failedDeflectionPenalty = parseFloat(formData.get('failed_deflection_penalty') as string || '0');
    const churnRateUplift = parseFloat(formData.get('churn_rate_uplift') as string || '0');

    if (!name || !status) {
      return fail(400, { error: 'Name and Status are required fields' });
    }

    try {
      servicesRepository.update(params.id, {
        name,
        description,
        status,
        provider_id: providerId || null,
        avg_input_tokens: avgInputTokens,
        avg_output_tokens: avgOutputTokens,
        avg_requests_per_user_month: avgRequests,
        fixed_cost_per_month: fixedCost,
        fixed_cost_currency: fixedCostCurrency,
        service_type: serviceType,
        interaction_driver_type: interactionDriverType,
        monthly_volume: monthlyVolume,
        volume_growth_rate: volumeGrowthRate,
        interactions_per_customer_month: interactionsPerCustomerMonth,
        fully_loaded_cost_per_fte_month: fullyLoadedCostPerFteMonth,
        productive_hours_per_fte_month: productiveHoursPerFteMonth,
        average_handle_time_seconds: averageHandleTimeSeconds,
        baseline_fte: baselineFte,
        staffing_realization_lag_months: staffingRealizationLagMonths,
        containment_rate: containmentRate,
        containment_start_rate: containmentStartRate,
        containment_ramp_months: containmentRampMonths,
        escalation_rate: escalationRate,
        failed_deflection_penalty: failedDeflectionPenalty,
        churn_rate_uplift: churnRateUplift
      });
      saveMonetizationFromForm('service', params.id, formData);
    } catch (err: any) {
      return fail(500, { error: err.message });
    }

    throw redirect(303, '/catalog/services');
  }
};
