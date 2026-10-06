import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createVrReceiptHandler } from './vr-receipt.controller.js';

const valid = {
  name: 'Maria Souza',
  cpf: '000.000.000-00',
  unitValue: 31.43,
  quantity: 13,
  totalValue: 408.59,
  totalInWords: 'quatrocentos e oito reais e cinquenta e nove centavos',
  referenceMonth: 'Agosto',
  issueDate: '2026-08-01',
};

function fakeRes() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    raw: undefined as Buffer | undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    end(buffer?: Buffer) {
      this.raw = buffer;
      return this;
    },
  };
  return res;
}

async function call(
  req: { method?: string; headers?: Record<string, string>; body?: unknown; query?: Record<string, string> },
  deps: Parameters<typeof createVrReceiptHandler>[0] = {},
) {
  const res = fakeRes();
  const handler = createVrReceiptHandler({
    now: () => new Date('2026-08-15T12:00:00Z'),
    ...deps,
  });
  await handler(
    { method: 'POST', query: {}, ...req } as unknown as VercelRequest,
    res as unknown as VercelResponse,
  );
  return res;
}

test('405 for non-POST methods', async () => {
  const res = await call({ method: 'GET' });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'POST');
});

test('400 for a missing field, without echoing values', async () => {
  const { totalInWords: _omit, ...body } = valid;
  const res = await call({ body });
  assert.equal(res.statusCode, 400);
  const json = res.body as { error: string; details: { field: string }[] };
  assert.ok(json.details.some((d) => d.field === 'totalInWords'));
  assert.ok(!JSON.stringify(res.body).includes('Maria'));
});

test('400 for a CPF with 10 digits, without echoing it', async () => {
  const res = await call({ body: { ...valid, cpf: '123.456.789-0' } });
  assert.equal(res.statusCode, 400);
  assert.ok(!JSON.stringify(res.body).includes('123'));
});

test('400 when the total does not match unitValue * quantity', async () => {
  const res = await call({ body: { ...valid, totalValue: 500 } });
  assert.equal(res.statusCode, 400);
});

test('accepts numeric strings from Make', async () => {
  const res = await call({ body: { ...valid, unitValue: '31.43', quantity: '13', totalValue: '408.59' } });
  assert.equal(res.statusCode, 200);
});

test('returns the raw PDF with the default file name', async () => {
  const res = await call({ body: valid });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'application/pdf');
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.match(res.headers['content-disposition']!, /^attachment; filename="Recibo VR - Maria Souza - Agosto 2026\.pdf"/);
  assert.equal(res.raw?.subarray(0, 4).toString(), '%PDF');
  assert.equal(res.headers['content-length'], String(res.raw?.length));
});

test('uses a sanitized custom file name, with UTF-8 name for accents', async () => {
  const res = await call({ body: { ...valid, fileName: 'Recibo/Março: João' } });
  assert.match(res.headers['content-disposition']!, /filename="ReciboMarco Joao\.pdf"; filename\*=UTF-8''ReciboMar%C3%A7o%20Jo%C3%A3o\.pdf/);
});

test('the PDF response never contains the CPF in headers', async () => {
  const res = await call({ body: valid });
  assert.ok(!JSON.stringify(res.headers).includes('000.000'));
});

test('500 for unexpected errors, without details', async () => {
  const res = await call(
    { body: valid },
    {
      generate: async () => {
        throw new Error('stack with Maria Souza');
      },
    },
  );
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'server_error' });
});
