import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { importerService, type CompanyImportRecord } from '$lib/server/services/importer';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const rawBody = await request.json();
    const { action, csvText } = rawBody;

    if (!action || (action !== 'preview' && action !== 'import')) {
      return json({ success: false, message: 'Invalid action. Must be "preview" or "import".' }, { status: 400 });
    }

    if (!csvText) {
      return json({ success: false, message: 'Missing CSV text.' }, { status: 400 });
    }

    const records: CompanyImportRecord[] = importerService.parseCSV(csvText);

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
