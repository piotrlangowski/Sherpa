import type { Provider } from './types.js';

// Date the bundled price list below was last verified against provider price pages
export const PROVIDER_PRICES_AS_OF = '2026-06-10';

// Default AI models with prices per 1M tokens (USD), as of PROVIDER_PRICES_AS_OF
export const PREDEFINED_PROVIDERS: Omit<Provider, 'id' | 'updated_at' | 'input_tokens_per_credit' | 'output_tokens_per_credit'>[] = [
  {
    name: 'OpenAI',
    model_name: 'GPT-5.5',
    input_price: 5.00, // $5.00 per 1M tokens
    output_price: 30.00, // $30.00 per 1M tokens
    is_predefined: true,
    currency: 'USD'
  },
  {
    name: 'OpenAI',
    model_name: 'GPT-5.4 mini',
    input_price: 0.75,
    output_price: 4.50,
    is_predefined: true,
    currency: 'USD'
  },
  {
    name: 'Anthropic',
    model_name: 'Claude Opus 4.8',
    input_price: 5.00,
    output_price: 25.00,
    is_predefined: true,
    currency: 'USD'
  },
  {
    name: 'Anthropic',
    model_name: 'Claude Sonnet 4.6',
    input_price: 3.00,
    output_price: 15.00,
    is_predefined: true,
    currency: 'USD'
  },
  {
    name: 'Anthropic',
    model_name: 'Claude Haiku 4.5',
    input_price: 1.00,
    output_price: 5.00,
    is_predefined: true,
    currency: 'USD'
  },
  {
    name: 'Google',
    model_name: 'Gemini 3.1 Pro',
    input_price: 2.00,
    output_price: 12.00,
    is_predefined: true,
    currency: 'USD'
  },
  {
    name: 'Google',
    model_name: 'Gemini 3.5 Flash',
    input_price: 1.50,
    output_price: 9.00,
    is_predefined: true,
    currency: 'USD'
  }
];
