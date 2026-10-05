import { defineEndpoint } from '../../../shared/define-endpoint.js';
import { currencyToExtenso } from './currency-to-extenso.service.js';
import type { CurrencyToExtensoRequest } from './currency-to-extenso.types.js';

export const currencyToExtensoController = defineEndpoint({
  method: 'POST',
  summary: 'Convert a BRL amount to words',
  description: 'Accepts a number (12.5) or a numeric string ("12.50" or "1.234,56").',
  example: { value: '1.234,56' },
  handle: (body: CurrencyToExtensoRequest) => currencyToExtenso(body),
});
