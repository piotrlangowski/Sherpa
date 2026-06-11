import type { PageServerLoad, Actions } from './$types';
import { providersRepository } from '$lib/server/repositories/providers';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
  const providers = providersRepository.getAll();
  return {
    providers
  };
};

export const actions: Actions = {
  saveProvider: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get('id') as string;
    const name = formData.get('name') as string;
    const modelName = formData.get('modelName') as string;
    const inputPrice = parseFloat(formData.get('inputPrice') as string);
    const outputPrice = parseFloat(formData.get('outputPrice') as string);

    const currency = formData.get('currency') as any || 'USD';

    if (!name || !modelName) {
      return fail(400, { error: 'Provider and model names are required' });
    }

    if (isNaN(inputPrice) || inputPrice < 0 || isNaN(outputPrice) || outputPrice < 0) {
      return fail(400, { error: 'Prices must be non-negative numbers' });
    }

    try {
      if (id) {
        providersRepository.update(id, {
          name,
          model_name: modelName,
          input_price: inputPrice,
          output_price: outputPrice,
          currency
        });
      } else {
        providersRepository.create({
          name,
          model_name: modelName,
          input_price: inputPrice,
          output_price: outputPrice,
          is_predefined: false,
          currency
        });
      }
      return { success: true };
    } catch (err: any) {
      return fail(500, { error: err.message });
    }
  },

  deleteProvider: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get('id') as string;

    if (!id) {
      return fail(400, { error: 'Provider ID is required' });
    }

    try {
      providersRepository.delete(id);
      return { success: true };
    } catch (err: any) {
      return fail(500, { error: err.message });
    }
  }
};
