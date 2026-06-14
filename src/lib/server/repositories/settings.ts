import db from '../db';
import type { Settings, Currency } from '../../types';
import { FALLBACK_EXCHANGE_RATES, EXCHANGE_RATES_AS_OF } from '../../shared/currency.js';
import { scenariosRepository } from './scenarios';

export const settingsRepository = {
  get(): Settings {
    const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    const settingsMap: Record<string, string> = {};
    for (const r of rows) {
      settingsMap[r.key] = r.value;
    }
    
    let exchangeRates = FALLBACK_EXCHANGE_RATES;
    if (settingsMap['exchange_rates']) {
      try {
        exchangeRates = JSON.parse(settingsMap['exchange_rates']);
      } catch (e) {
        console.error('Failed to parse exchange_rates, using fallback', e);
      }
    }
    
    return {
      company_name: settingsMap['company_name'] || 'Beacon Helpdesk',
      currency: (settingsMap['currency'] as Currency) || 'USD',
      default_discount_rate: parseFloat(settingsMap['default_discount_rate'] || '0.10'),
      setup_completed: settingsMap['setup_completed'] === '1',
      projection_horizon_months: parseInt(settingsMap['projection_horizon_months'] || '36', 10),
      exchange_rates: exchangeRates,
      exchange_rates_as_of: settingsMap['exchange_rates_as_of'] || EXCHANGE_RATES_AS_OF,
      default_price_per_credit: parseFloat(settingsMap['default_price_per_credit'] || '0.02'),
      default_input_tokens_per_credit: parseInt(settingsMap['default_input_tokens_per_credit'] || '1000000', 10),
      default_output_tokens_per_credit: parseInt(settingsMap['default_output_tokens_per_credit'] || '333333', 10),
      default_overcharge_markup: parseFloat(settingsMap['default_overcharge_markup'] || '1.5'),
      default_overcharge_user_pct: parseFloat(settingsMap['default_overcharge_user_pct'] || '0.2'),
      default_avg_overcharge_pct: parseFloat(settingsMap['default_avg_overcharge_pct'] || '0.5')
    };
  },

  update(settings: Partial<Settings>): void {
    const updateStmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    let shouldInvalidateAllResults = false;
    
    db.transaction(() => {
      if (settings.company_name !== undefined) {
        updateStmt.run('company_name', settings.company_name);
      }
      if (settings.currency !== undefined) {
        updateStmt.run('currency', settings.currency);
        shouldInvalidateAllResults = true;
      }
      if (settings.default_discount_rate !== undefined) {
        updateStmt.run('default_discount_rate', settings.default_discount_rate.toString());
      }
      if (settings.setup_completed !== undefined) {
        updateStmt.run('setup_completed', settings.setup_completed ? '1' : '0');
      }
      if (settings.projection_horizon_months !== undefined) {
        updateStmt.run('projection_horizon_months', settings.projection_horizon_months.toString());
      }
      if (settings.exchange_rates !== undefined) {
        updateStmt.run('exchange_rates', JSON.stringify(settings.exchange_rates));
        shouldInvalidateAllResults = true;
      }
      if (settings.exchange_rates_as_of !== undefined) {
        updateStmt.run('exchange_rates_as_of', settings.exchange_rates_as_of);
      }
      if (settings.default_price_per_credit !== undefined) {
        updateStmt.run('default_price_per_credit', settings.default_price_per_credit.toString());
        shouldInvalidateAllResults = true;
      }
      if (settings.default_input_tokens_per_credit !== undefined) {
        updateStmt.run('default_input_tokens_per_credit', settings.default_input_tokens_per_credit.toString());
        shouldInvalidateAllResults = true;
      }
      if (settings.default_output_tokens_per_credit !== undefined) {
        updateStmt.run('default_output_tokens_per_credit', settings.default_output_tokens_per_credit.toString());
        shouldInvalidateAllResults = true;
      }
      if (settings.default_overcharge_markup !== undefined) {
        updateStmt.run('default_overcharge_markup', settings.default_overcharge_markup.toString());
        shouldInvalidateAllResults = true;
      }
      if (settings.default_overcharge_user_pct !== undefined) {
        updateStmt.run('default_overcharge_user_pct', settings.default_overcharge_user_pct.toString());
        shouldInvalidateAllResults = true;
      }
      if (settings.default_avg_overcharge_pct !== undefined) {
        updateStmt.run('default_avg_overcharge_pct', settings.default_avg_overcharge_pct.toString());
        shouldInvalidateAllResults = true;
      }

      if (shouldInvalidateAllResults) {
        scenariosRepository.invalidateAllResults();
      }
    })();
  },

  async reset(): Promise<void> {
    // Delete database file and let db init trigger seed
    db.transaction(() => {
      db.prepare("DELETE FROM settings").run();
      db.prepare("DELETE FROM providers").run();
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
    // Re-seed since settings table is empty
    const { seedDatabase } = await import('../../shared/seed');
    seedDatabase(db);
  }
};
