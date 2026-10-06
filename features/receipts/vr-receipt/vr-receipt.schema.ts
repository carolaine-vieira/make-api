import { z } from 'zod';
import type { FieldIssue, ReceiptData } from './vr-receipt.types.js';
import { capitalize, monthName, normalizeCpf, parseIsoDate, todayInSaoPaulo } from './vr-receipt.utils.js';

type Issue = { input?: unknown };
const requiredOr = (message: string) => (issue: Issue) => (issue.input === undefined ? 'is required' : message);

const text = (max: number) =>
  z
    .string({ error: requiredOr('must be a string') })
    .trim()
    .min(1, 'must not be empty')
    .max(max, `must have at most ${max} characters`);

/** Accepts numbers or numeric strings with a dot as decimal separator (Make.com may send strings). */
const numeric = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (trimmed === '') return undefined;
    return /^-?\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : value;
  }, schema);

const money = () =>
  numeric(z.number({ error: requiredOr('must be a number') }).finite('must be a number').min(0, 'must not be negative'));

export const vrReceiptSchema = z.object({
  name: text(120),
  cpf: z
    .string({ error: requiredOr('must be a string') })
    .trim()
    .transform((value, ctx) => {
      const cpf = normalizeCpf(value);
      if (cpf === null) ctx.issues.push({ code: 'custom', message: 'must have exactly 11 digits', input: value });
      return cpf ?? '';
    }),
  unitValue: money(),
  quantity: numeric(
    z
      .number({ error: requiredOr('must be an integer') })
      .int('must be an integer')
      .min(0, 'must not be negative'),
  ),
  totalValue: money(),
  totalInWords: text(200),
  referenceMonth: text(60).optional(),
  issueDate: z
    .string({ error: requiredOr('must be a string') })
    .trim()
    .refine((value) => parseIsoDate(value) !== null, 'must be a valid date in YYYY-MM-DD format')
    .optional(),
  observation: text(300).optional(),
  fileName: text(120).optional(),
});

export type VrReceiptInput = z.infer<typeof vrReceiptSchema>;

export type ParseResult = { ok: true; data: ReceiptData } | { ok: false; details: FieldIssue[] };

/** Validates the request body and fills in the defaults. Messages never include input values. */
export function parseVrReceipt(body: unknown, now = new Date()): ParseResult {
  const parsed = vrReceiptSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      details: parsed.error.issues.map((i) => ({ field: i.path.join('.') || 'body', message: i.message })),
    };
  }
  const input = parsed.data;

  if (Math.abs(input.totalValue - input.unitValue * input.quantity) > 0.01) {
    return {
      ok: false,
      details: [{ field: 'totalValue', message: 'must equal unitValue * quantity (tolerance of 0.01)' }],
    };
  }

  const issueDate = input.issueDate ? parseIsoDate(input.issueDate)! : todayInSaoPaulo(now);
  return {
    ok: true,
    data: {
      name: input.name,
      cpf: input.cpf,
      unitValue: input.unitValue,
      quantity: input.quantity,
      totalValue: input.totalValue,
      totalInWords: input.totalInWords,
      referenceMonth: input.referenceMonth ?? capitalize(monthName(issueDate.month)),
      issueDate,
      ...(input.observation !== undefined && { observation: input.observation }),
      ...(input.fileName !== undefined && { fileName: input.fileName }),
    },
  };
}
