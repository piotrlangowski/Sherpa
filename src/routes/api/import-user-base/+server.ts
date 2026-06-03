import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { importerService, type CompanyImportRecord } from '$lib/server/services/importer';
import { settingsRepository } from '$lib/server/repositories/settings';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const rawBody = await request.json();
    const { action, source, csvText, tokenOverride } = rawBody;

    if (!action || (action !== 'preview' && action !== 'import')) {
      return json({ success: false, message: 'Invalid action. Must be "preview" or "import".' }, { status: 400 });
    }

    if (!source || (source !== 'csv' && source !== 'hubspot')) {
      return json({ success: false, message: 'Invalid source. Must be "csv" or "hubspot".' }, { status: 400 });
    }

    let records: CompanyImportRecord[] = [];

    if (source === 'csv') {
      if (!csvText) {
        return json({ success: false, message: 'Missing CSV text for CSV source.' }, { status: 400 });
      }
      records = importerService.parseCSV(csvText);
    } else if (source === 'hubspot') {
      // Get token from settings or payload override
      let token = tokenOverride || '';
      if (!token) {
        const settings = settingsRepository.get();
        token = settings.hubspot_access_token || '';
      }

      if (!token) {
        return json({ success: false, message: 'HubSpot access token is not configured. Please save it in settings or provide an override.' }, { status: 400 });
      }

      const { companies, deals } = await importerService.fetchHubSpotData(token);
      records = importerService.mapHubSpotToRecords(companies, deals);
    }

    if (records.length === 0) {
      return json({ success: false, message: 'No customer records found to import.' }, { status: 400 });
    }

    const calculatedVerticals = importerService.calculateMetrics(records);

    if (action === 'preview') {
      return json({ success: true, verticals: calculatedVerticals });
    }

    // action === 'import'
    importerService.saveImportedData(calculatedVerticals);
    return json({ success: true, message: 'Data imported successfully.' });

  } catch (err: any) {
    console.error('Import user base error:', err);
    return json({ success: false, message: err.message || 'An error occurred during import.' }, { status: 500 });
  }
};
