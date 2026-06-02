import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exportScenarioToJSON, exportScenarioToCSV } from '$lib/server/services/export';
import { scenariosRepository } from '$lib/server/repositories/scenarios';

export const GET: RequestHandler = async ({ params, url }) => {
  const format = params.format;
  const scenarioId = url.searchParams.get('scenarioId');

  if (!scenarioId) {
    throw error(400, 'Missing scenarioId parameter');
  }

  const scenario = scenariosRepository.getById(scenarioId);
  if (!scenario) {
    throw error(404, 'Scenario not found');
  }

  // Sanitize name for filename
  const filename = scenario.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

  if (format === 'json') {
    try {
      const data = exportScenarioToJSON(scenarioId);
      return new Response(data, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${filename}.json"`
        }
      });
    } catch (err: any) {
      throw error(500, `Failed to export JSON: ${err.message}`);
    }
  } else if (format === 'csv') {
    try {
      const csv = exportScenarioToCSV(scenarioId);
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}.csv"`
        }
      });
    } catch (err: any) {
      throw error(500, `Failed to export CSV: ${err.message}`);
    }
  } else {
    throw error(400, `Unsupported format: ${format}`);
  }
};
