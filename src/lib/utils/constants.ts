import type { Currency, Provider } from '../types';

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

// Default AI models with prices per 1M tokens (USD)
export const PREDEFINED_PROVIDERS: Omit<Provider, 'id' | 'updated_at'>[] = [
  {
    name: 'OpenAI',
    model_name: 'GPT-4o',
    input_price: 2.50, // $2.50 per 1M tokens
    output_price: 10.00, // $10.00 per 1M tokens
    is_predefined: true
  },
  {
    name: 'OpenAI',
    model_name: 'GPT-4o mini',
    input_price: 0.150,
    output_price: 0.600,
    is_predefined: true
  },
  {
    name: 'Anthropic',
    model_name: 'Claude 3.5 Sonnet',
    input_price: 3.00,
    output_price: 15.00,
    is_predefined: true
  },
  {
    name: 'Anthropic',
    model_name: 'Claude 3.5 Haiku',
    input_price: 0.80,
    output_price: 4.00,
    is_predefined: true
  },
  {
    name: 'Google',
    model_name: 'Gemini 2.5 Pro',
    input_price: 1.25,
    output_price: 5.00,
    is_predefined: true
  },
  {
    name: 'Google',
    model_name: 'Gemini 2.5 Flash',
    input_price: 0.075,
    output_price: 0.30,
    is_predefined: true
  }
];
