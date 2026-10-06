import type { IssueDate } from './vr-receipt.types.js';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const;

const TIME_ZONE = 'America/Sao_Paulo';
const MAX_FILE_NAME = 150;

export function monthName(month: number): string {
  return MONTHS[month - 1] ?? '';
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Today's date in the America/Sao_Paulo timezone. */
export function todayInSaoPaulo(now = new Date()): IssueDate {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now); // YYYY-MM-DD
  return parseIsoDate(iso)!;
}

/** Parses YYYY-MM-DD; returns null when the format or the calendar date is invalid. */
export function parseIsoDate(value: string): IssueDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  const valid =
    check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
  return valid ? { year, month, day } : null;
}

/** 11 digits to 000.000.000-00. Returns null when the digit count is not 11. */
export function normalizeCpf(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) return null;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** R$ 1.234,56 (regular space instead of the non-breaking one Intl emits). */
export function formatBRL(value: number): string {
  return brl.format(value).replace(/ /g, ' ');
}

/** 1.234,56 (no currency prefix). */
export function formatDecimal(value: number): string {
  return decimal.format(value);
}

export function formatLongDate({ year, month, day }: IssueDate): string {
  return `${String(day).padStart(2, '0')} de ${monthName(month)} de ${year}`;
}

/** File name without extension to a safe one with ".pdf". */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FILE_NAME)
    .trim();
  return `${cleaned || 'Recibo'}.pdf`;
}
