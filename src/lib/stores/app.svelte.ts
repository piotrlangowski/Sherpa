import type { Currency, ExchangeRates } from '../types';
import { FALLBACK_EXCHANGE_RATES } from '../shared/currency.js';

class AppState {
  companyName = $state<string>('Acme Analytics');
  currency = $state<Currency>('USD');
  defaultDiscountRate = $state<number>(0.10);
  setupCompleted = $state<boolean>(false);
  exchangeRates = $state<ExchangeRates>(FALLBACK_EXCHANGE_RATES);
  ratesAsOf = $state<string>('');
  activeScenarioId = $state<string | null>(null);
  activeScenarioName = $state<string | null>(null);

  init(data: {
    companyName: string;
    currency: Currency;
    defaultDiscountRate: number;
    setupCompleted: boolean;
    exchangeRates: ExchangeRates;
    ratesAsOf: string;
  }) {
    this.companyName = data.companyName;
    this.currency = data.currency;
    this.defaultDiscountRate = data.defaultDiscountRate;
    this.setupCompleted = data.setupCompleted;
    this.exchangeRates = data.exchangeRates;
    this.ratesAsOf = data.ratesAsOf;
  }

  setCompanyName(name: string) {
    this.companyName = name;
  }

  setCurrency(cur: Currency) {
    this.currency = cur;
  }

  setDiscountRate(rate: number) {
    this.defaultDiscountRate = rate;
  }

  setSetupCompleted(completed: boolean) {
    this.setupCompleted = completed;
  }

  setActiveScenario(id: string | null, name: string | null) {
    this.activeScenarioId = id;
    this.activeScenarioName = name;
  }
}

export const appState = new AppState();
