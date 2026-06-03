import type { PageServerLoad } from './$types';
import { settingsRepository } from '$lib/server/repositories/settings';

export const load: PageServerLoad = async () => {
  const settings = settingsRepository.get();
  return {
    hubspotAccessToken: settings.hubspot_access_token || ''
  };
};
