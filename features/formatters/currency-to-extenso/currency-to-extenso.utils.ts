import { ValidationError } from './currency-to-extenso.types.js';

const UNITS = [
  'zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
  'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove',
] as const;
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'] as const;
const HUNDREDS = [
  '', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
  'seiscentos', 'setecentos', 'oitocentos', 'novecentos',
] as const;

const MAX_CENTS = 99_999_999_999_999; // 999.999.999.999,99

/** Words for 1..999. */
function hundredsToWords(n: number): string {
  if (n === 100) return 'cem';
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h > 0) parts.push(HUNDREDS[h]!);
  if (rest > 0) {
    if (rest < 20) parts.push(UNITS[rest]!);
    else {
      const t = Math.floor(rest / 10);
      const u = rest % 10;
      parts.push(u > 0 ? `${TENS[t]} e ${UNITS[u]}` : TENS[t]!);
    }
  }
  return parts.join(' e ');
}

/** Words for an integer in 0..999.999.999.999. */
export function integerToWords(n: number): string {
  if (n === 0) return 'zero';

  const scales = [
    { size: 1_000_000_000, singular: 'bilhão', plural: 'bilhões' },
    { size: 1_000_000, singular: 'milhão', plural: 'milhões' },
    { size: 1_000, singular: 'mil', plural: 'mil' },
  ];

  const parts: { words: string; remainder: number }[] = [];
  let remainder = n;

  for (const { size, singular, plural } of scales) {
    const count = Math.floor(remainder / size);
    remainder %= size;
    if (count === 0) continue;
    const words =
      size === 1_000 && count === 1
        ? 'mil'
        : `${hundredsToWords(count)} ${count === 1 ? singular : plural}`;
    parts.push({ words, remainder });
  }
  if (remainder > 0) parts.push({ words: hundredsToWords(remainder), remainder: 0 });

  // "e" joins a group to the next one only when the rest is < 100 or a round hundred.
  return parts.reduce((acc, part, i) => {
    if (i === 0) return part.words;
    const rest = parts[i - 1]!.remainder; // value still to be spelled after the previous group
    const joinWithE = rest < 100 || rest % 100 === 0;
    return `${acc}${joinWithE ? ' e ' : ' '}${part.words}`;
  }, '');
}

export function parseToCents(value: number | string): number {
  let cents: number;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ValidationError('"value" must be a finite number.');
    cents = Math.round(value * 100);
  } else {
    const normalized = value.includes(',')
      ? value.trim().replace(/\./g, '').replace(',', '.')
      : value.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
      throw new ValidationError('"value" must be a non-negative amount with up to 2 decimal places.');
    }
    const [int = '0', frac = ''] = normalized.split('.');
    cents = Number(int) * 100 + Number(frac.padEnd(2, '0'));
  }

  if (cents < 0) throw new ValidationError('"value" must not be negative.');
  if (cents > MAX_CENTS) throw new ValidationError('"value" is too large (max 999999999999.99).');
  return cents;
}
