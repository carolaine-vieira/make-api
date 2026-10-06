import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatBRL, normalizeCpf, sanitizeFileName, todayInSaoPaulo } from './vr-receipt.utils.js';

test('sanitizes file names', () => {
  assert.equal(sanitizeFileName('  A/B\\C:D*E?F"G<H>I|J \u0001  K  '), 'ABCDEFGHIJ K.pdf');
  assert.equal(sanitizeFileName('///'), 'Recibo.pdf');
  assert.equal(sanitizeFileName('x'.repeat(300)).length, 154);
});

test('normalizes CPF', () => {
  assert.equal(normalizeCpf('00000000000'), '000.000.000-00');
  assert.equal(normalizeCpf('000.000.000-0'), null);
});

test('formats BRL with a regular space', () => {
  assert.equal(formatBRL(1234.56), 'R$ 1.234,56');
});

test('uses the Sao Paulo date around midnight UTC', () => {
  assert.deepEqual(todayInSaoPaulo(new Date('2026-08-02T01:30:00Z')), { year: 2026, month: 8, day: 1 });
});
