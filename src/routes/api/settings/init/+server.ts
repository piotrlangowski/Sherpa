import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { settingsRepository } from '$lib/server/repositories/settings';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { companyName, currency, discountRate, keepSample } = await request.json();

    // 1. Update settings
    settingsRepository.update({
      company_name: companyName,
      currency: currency,
      default_discount_rate: discountRate,
      setup_completed: true
    });

    // 2. Clear sample data if requested
    if (!keepSample) {
      db.transaction(() => {
        db.prepare("DELETE FROM services").run();
        db.prepare("DELETE FROM packs").run();
        db.prepare("DELETE FROM pack_services").run();
        db.prepare("DELETE FROM plans").run();
        db.prepare("DELETE FROM plan_services").run();
        db.prepare("DELETE FROM plan_packs").run();
        db.prepare("DELETE FROM service_dependencies").run();
        db.prepare("DELETE FROM verticals").run();
        db.prepare("DELETE FROM vertical_plans").run();
        db.prepare("DELETE FROM vertical_packs").run();
        db.prepare("DELETE FROM cost_items").run();
        db.prepare("DELETE FROM cohort_configs").run();
        db.prepare("DELETE FROM scenarios").run();
        db.prepare("DELETE FROM scenario_services").run();
        db.prepare("DELETE FROM scenario_packs").run();
        db.prepare("DELETE FROM scenario_plans").run();
        db.prepare("DELETE FROM scenario_costs").run();
        db.prepare("DELETE FROM scenario_results").run();
      })();
      console.error('Sample data cleared for clean setup.');
    }

    return json({ success: true });
  } catch (err: any) {
    console.error('Error during setup wizard POST:', err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
