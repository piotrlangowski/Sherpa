import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';

export const POST: RequestHandler = async () => {
  try {
    const now = new Date().toISOString();
    
    // Simulate updating standard models with slightly different prices or just fresh timestamps
    db.transaction(() => {
      // We can update standard prices to simulate an update (e.g. minor drop/adjustment)
      const updateStmt = db.prepare(`
        UPDATE providers
        SET input_price = ?, output_price = ?, updated_at = ?
        WHERE name = ? AND model_name = ? AND is_predefined = 1
      `);
      
      updateStmt.run(2.45, 9.80, now, 'OpenAI', 'GPT-4o');
      updateStmt.run(0.145, 0.580, now, 'OpenAI', 'GPT-4o mini');
      updateStmt.run(2.95, 14.80, now, 'Anthropic', 'Claude 3.5 Sonnet');
      updateStmt.run(0.75, 3.80, now, 'Anthropic', 'Claude 3.5 Haiku');
      updateStmt.run(1.20, 4.80, now, 'Google', 'Gemini 2.5 Pro');
      updateStmt.run(0.070, 0.28, now, 'Google', 'Gemini 2.5 Flash');
    })();
    
    console.log('Provider pricing simulated update complete.');
    return json({ success: true });
  } catch (err: any) {
    console.error('Error updating pricing:', err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
