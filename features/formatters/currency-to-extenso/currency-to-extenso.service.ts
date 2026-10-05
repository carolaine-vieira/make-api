import {
  ValidationError,
  type CurrencyToExtensoRequest,
  type CurrencyToExtensoResult,
} from './currency-to-extenso.types.js';
import { integerToWords, parseToCents } from './currency-to-extenso.utils.js';

export function currencyToExtenso(input: CurrencyToExtensoRequest): CurrencyToExtensoResult {
  if (input.value === undefined || input.value === null || input.value === '') {
    throw new ValidationError('"value" is required.');
  }
  if (typeof input.value !== 'number' && typeof input.value !== 'string') {
    throw new ValidationError('"value" must be a number or a string.');
  }

  const totalCents = parseToCents(input.value);
  const reais = Math.floor(totalCents / 100);
  const centavos = totalCents % 100;

  const parts: string[] = [];
  if (reais > 0 || centavos === 0) {
    const de = reais >= 1_000_000 && reais % 1_000_000 === 0 ? ' de' : '';
    parts.push(`${integerToWords(reais)}${de} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (centavos > 0) {
    parts.push(`${integerToWords(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  }

  return { value: totalCents / 100, extenso: parts.join(' e ') };
}
