export interface CurrencyToExtensoRequest {
  /** Amount in BRL: a number (12.5) or a numeric string ("12.50" or "1.234,56"). */
  value: number | string;
}

export interface CurrencyToExtensoResult {
  value: number;
  extenso: string;
}

export { ValidationError } from '../../../shared/errors.js';
