import type { Currency } from '../types';

// Provider price catalog lives in shared/ so the MCP server can seed it too
export { PREDEFINED_PROVIDERS, PROVIDER_PRICES_AS_OF } from '../shared/provider-catalog';

export const CURRENCIES: { value: Currency; label: string; symbol: string }[] = [
  { value: 'USD', label: 'US Dollar', symbol: '$' },
  { value: 'EUR', label: 'Euro', symbol: '€' },
  { value: 'PLN', label: 'Polish Zloty', symbol: 'zł' },
  { value: 'GBP', label: 'British Pound', symbol: '£' }
];

export const COST_SUBCATEGORIES = {
  capex: [
    { value: 'development', label: 'Software Development' },
    { value: 'infrastructure', label: 'Hardware/Infrastructure Setup' },
    { value: 'consulting', label: 'External Consulting/Audits' },
    { value: 'training', label: 'Change Management & Training' },
    { value: 'other', label: 'Other CAPEX' }
  ],
  opex: [
    { value: 'personnel', label: 'Personnel (Salary, Contractors)' },
    { value: 'infrastructure', label: 'Cloud Infrastructure / API Licenses' },
    { value: 'observability', label: 'Monitoring / LLM Observability' },
    { value: 'marketing', label: 'Marketing / Launch Operations' },
    { value: 'compliance', label: 'Compliance & Security Audits' },
    { value: 'maintenance', label: 'Maintenance / Retraining' },
    { value: 'other', label: 'Other OPEX' }
  ]
};
