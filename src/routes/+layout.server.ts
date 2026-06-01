import type { LayoutServerLoad } from './$types';
import { settingsRepository } from '$lib/server/repositories/settings';

export const load: LayoutServerLoad = async () => {
  // Access db to trigger migrations & seeds if not initialized yet
  const settings = settingsRepository.get();
  
  return {
    settings: {
      companyName: settings.company_name,
      currency: settings.currency,
      defaultDiscountRate: settings.default_discount_rate,
      setupCompleted: settings.setup_completed
    }
  };
};
