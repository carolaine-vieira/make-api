import { createHash, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateReceiptPdf } from './vr-receipt.pdf.js';
import { parseVrReceipt } from './vr-receipt.schema.js';
import { sanitizeFileName } from './vr-receipt.utils.js';

type Env = Record<string, string | undefined>;

export interface VrReceiptDeps {
  generate: typeof generateReceiptPdf;
  env: () => Env;
  now: () => Date;
}

const defaultDeps: VrReceiptDeps = {
  generate: generateReceiptPdf,
  env: () => process.env,
  now: () => new Date(),
};

/** Constant-time comparison (hashing first so the lengths always match). */
function apiKeyMatches(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string') return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(provided), digest(expected));
}

function parseBody(body: unknown): unknown {
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/**
 * POST: validates the payload and returns the receipt PDF bytes (Make saves the file).
 * Never logs or echoes personal data (name, CPF, file names).
 */
export function createVrReceiptHandler(overrides: Partial<VrReceiptDeps> = {}) {
  const deps = { ...defaultDeps, ...overrides };

  return async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }

    const expectedKey = deps.env().RECEIPT_API_KEY;
    if (!expectedKey) {
      console.error('vr-receipt: RECEIPT_API_KEY is not configured');
      res.status(500).json({ error: 'server_error' }); // fail closed
      return;
    }
    if (!apiKeyMatches(req.headers['x-api-key'], expectedKey)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const body = parseBody(req.body);
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      res.status(400).json({ error: 'invalid_body', details: [{ field: 'body', message: 'must be a JSON object' }] });
      return;
    }
    const parsed = parseVrReceipt(body, deps.now());
    if (!parsed.ok) {
      res.status(400).json({ error: 'validation_error', details: parsed.details });
      return;
    }
    const receipt = parsed.data;

    try {
      const pdf = Buffer.from(await deps.generate(receipt));
      const fileName = sanitizeFileName(
        receipt.fileName ?? `Recibo VR - ${receipt.name} - ${receipt.referenceMonth} ${receipt.issueDate.year}`,
      );
      const ascii = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_');

      res.status(200);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      );
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Length', String(pdf.length));
      res.end(pdf);
    } catch {
      console.error('vr-receipt: PDF generation failed');
      res.status(500).json({ error: 'server_error' });
    }
  };
}

export const vrReceiptController = Object.assign(createVrReceiptHandler(), {
  meta: {
    methods: ['POST'] as const,
    summary: 'Generate a VR receipt PDF',
    description:
      'Requires the x-api-key header. Returns the raw PDF (application/pdf) with the file name in Content-Disposition. Errors are JSON: { error, details? }. Responses do not use the { success, data } envelope.',
    example: {
      name: 'Maria Souza',
      cpf: '000.000.000-00',
      unitValue: 31.43,
      quantity: 13,
      totalValue: 408.59,
      totalInWords: 'quatrocentos e oito reais e cinquenta e nove centavos',
      referenceMonth: 'Agosto',
      issueDate: '2026-08-01',
    },
  },
});
