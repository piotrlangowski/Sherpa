import type { PageServerLoad, Actions } from './$types';
import { providersRepository } from '$lib/server/repositories/providers';
import { servicesRepository } from '$lib/server/repositories/services';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
  const providers = providersRepository.getAll();
  const service = servicesRepository.getById(params.id);
  
  if (!service) {
    throw redirect(303, '/catalog/services');
  }

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
        fixed_cost_currency: fixedCostCurrency
      });
    } catch (err: any) {
      return fail(500, { error: err.message });
    }

    throw redirect(303, '/catalog/services');
  }
};
