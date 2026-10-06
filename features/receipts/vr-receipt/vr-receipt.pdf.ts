import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import type { ReceiptData } from './vr-receipt.types.js';
import { capitalize, formatBRL, formatDecimal, formatLongDate } from './vr-receipt.utils.js';

/** City printed next to the issue date. */
const CITY = 'Belo Horizonte';

// Resolved from the project root; assets/** is bundled via vercel.json "includeFiles".
// Fonts are embedded whole: fontkit subsetting drops glyphs for Carlito.
const ASSETS_DIR = join(process.cwd(), 'assets');

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 40;
const OUTER = 2;
const INNER = 1;
const PAD = 6;
const BLACK = rgb(0, 0, 0);
const RED = rgb(0.75, 0, 0);
const BEIGE = rgb(0xdd / 255, 0xd9 / 255, 0xc4 / 255);

const HEADER_H = 50;
const TOTAL_H = 28;
const MONTH_H = 26;
const TABLE_HEADER_H = 22;
const TABLE_ROW_MIN_H = 22;
const SPACER_H = 90;
const COL_RATIOS = [0.14, 0.14, 0.12, 0.11, 0.49] as const;

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

interface Word {
  text: string;
  underline: boolean;
}

interface PlacedWord extends Word {
  x: number;
  /** True when the underline should also cover the space that follows. */
  joinNext: boolean;
}

/** Replaces characters the font cannot encode so embedding never throws. */
function safe(font: PDFFont, text: string): string {
  const supported = font.getCharacterSet();
  return [...text.replace(/ /g, ' ')]
    .map((ch) => (supported.includes(ch.codePointAt(0)!) ? ch : '?'))
    .join('');
}

/** Splits a word that is wider than maxWidth into pieces that fit. */
function splitLong(word: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
  const pieces: string[] = [];
  let current = '';
  for (const ch of word) {
    if (current && font.widthOfTextAtSize(current + ch, size) > maxWidth) {
      pieces.push(current);
      current = '';
    }
    current += ch;
  }
  if (current) pieces.push(current);
  return pieces;
}

/** Greedy word wrap; words wider than a line are broken. */
function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines = wrapWords(
    text.split(/\s+/).filter(Boolean).map((t) => ({ text: t, underline: false })),
    font,
    size,
    maxWidth,
  );
  return lines.map((line) => line.map((w) => w.text).join(' '));
}

function wrapWords(words: Word[], font: PDFFont, size: number, maxWidth: number): PlacedWord[][] {
  const space = font.widthOfTextAtSize(' ', size);
  const lines: PlacedWord[][] = [[]];
  let x = 0;
  for (const word of words) {
    for (const piece of splitLong(word.text, font, size, maxWidth)) {
      const width = font.widthOfTextAtSize(piece, size);
      let line = lines[lines.length - 1]!;
      if (line.length > 0 && x + space + width > maxWidth) {
        line = [];
        lines.push(line);
        x = 0;
      }
      const start = line.length === 0 ? 0 : x + space;
      line.push({ text: piece, underline: word.underline, x: start, joinNext: false });
      x = start + width;
    }
  }
  for (const line of lines) {
    line.forEach((w, i) => {
      w.joinNext = w.underline && line[i + 1]?.underline === true;
    });
  }
  return lines;
}

/** Shrinks the font size until the text fits in maxWidth (min 7pt). */
function fitSize(text: string, font: PDFFont, size: number, maxWidth: number): number {
  let s = size;
  while (s > 7 && font.widthOfTextAtSize(text, s) > maxWidth) s -= 0.25;
  return s;
}

function line(page: PDFPage, x1: number, y1: number, x2: number, y2: number, thickness = INNER): void {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color: BLACK });
}

/** Draws one line of text vertically centered in a row. */
function drawCentered(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  cellX: number,
  cellW: number,
  rowTop: number,
  rowH: number,
  color = BLACK,
): void {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: cellX + (cellW - width) / 2,
    y: rowTop - rowH / 2 - size * 0.32,
    size,
    font,
    color,
  });
}

async function loadLogo(pdf: PDFDocument): Promise<PDFImage | null> {
  try {
    return await pdf.embedPng(await readFile(join(ASSETS_DIR, 'intermobile-logo.png')));
  } catch {
    return null; // text-only placeholder is drawn instead
  }
}

export async function generateReceiptPdf(data: ReceiptData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [regularBytes, boldBytes] = await Promise.all([
    readFile(join(ASSETS_DIR, 'fonts', 'Carlito-Regular.ttf')),
    readFile(join(ASSETS_DIR, 'fonts', 'Carlito-Bold.ttf')),
  ]);
  const fonts: Fonts = {
    regular: await pdf.embedFont(regularBytes, { subset: false, features: { liga: false } }),
    bold: await pdf.embedFont(boldBytes, { subset: false, features: { liga: false } }),
  };
  const logo = await loadLogo(pdf);
  const page = pdf.addPage([PAGE.width, PAGE.height]);

  const { regular, bold } = fonts;
  const name = safe(regular, data.name);
  const cpf = safe(regular, data.cpf);
  const words = capitalize(safe(regular, data.totalInWords));
  const month = safe(regular, data.referenceMonth);

  const boxX = MARGIN;
  const boxW = PAGE.width - 2 * MARGIN;
  const boxTop = PAGE.height - MARGIN;

  // --- Measure every row first so the box height is known before drawing. ---
  const declSize = 12;
  const declLeading = 15;
  const declWords = declarationWords(name, cpf);
  const declLines = wrapWords(declWords, regular, declSize, boxW - 2 * PAD);
  const declH = declLines.length * declLeading + 2 * PAD;

  const colW = COL_RATIOS.map((r) => r * boxW);
  const colX = colW.reduce<number[]>((acc, w, i) => [...acc, (acc[i] ?? boxX) + w], [boxX]);
  const tableSize = 11;
  const tableLeading = 14;
  const wordsLines = wrapLines(words, regular, tableSize, colW[4]! - 8);
  const tableRowH = Math.max(TABLE_ROW_MIN_H, wordsLines.length * tableLeading + 8);

  const signW = boxW * 0.42;
  const signX = boxX + boxW - signW - 18;
  const nameLines = wrapLines(name, regular, 12, signW);
  const bottomH = 18 + 14 + nameLines.length * 14 + 14;

  const boxH = HEADER_H + TOTAL_H + declH + MONTH_H + TABLE_HEADER_H + tableRowH + SPACER_H + bottomH;
  const boxBottom = boxTop - boxH;

  // --- Header: logo cell + title ---
  const logoCellW = boxW * 0.2;
  let y = boxTop;
  if (logo) {
    const side = HEADER_H - 8;
    page.drawImage(logo, { x: boxX + (logoCellW - side) / 2, y: y - HEADER_H + 4, width: side, height: side });
  } else {
    const size = fitSize('INTERMOBILE', bold, 13, logoCellW - 2 * PAD);
    drawCentered(page, 'INTERMOBILE', bold, size, boxX, logoCellW, y, HEADER_H);
  }
  drawCentered(page, 'RECIBO', bold, 20, boxX + logoCellW, boxW - logoCellW, y, HEADER_H);
  line(page, boxX + logoCellW, y, boxX + logoCellW, y - HEADER_H);
  y -= HEADER_H;
  line(page, boxX, y, boxX + boxW, y);

  // --- Total ---
  const total = formatBRL(data.totalValue);
  drawCentered(page, total, bold, 18, boxX, boxW, y, TOTAL_H);
  y -= TOTAL_H;
  line(page, boxX, y, boxX + boxW, y);

  // --- Declaration paragraph ---
  declLines.forEach((words, i) => {
    const baseline = y - PAD - declSize - i * declLeading + 2;
    for (const w of words) {
      const x = boxX + PAD + w.x;
      page.drawText(w.text, { x, y: baseline, size: declSize, font: regular, color: BLACK });
      if (w.underline) {
        const end = x + regular.widthOfTextAtSize(w.text, declSize);
        const joined = w.joinNext ? regular.widthOfTextAtSize(' ', declSize) : 0;
        page.drawLine({
          start: { x, y: baseline - 1.5 },
          end: { x: end + joined, y: baseline - 1.5 },
          thickness: 0.7,
          color: BLACK,
        });
      }
    }
  });
  y -= declH;

  // --- Reference month ---
  const monthLabel = 'Referente mês:';
  const monthBase = y - MONTH_H / 2 - 12 * 0.32;
  page.drawText(monthLabel, { x: boxX + PAD, y: monthBase, size: 12, font: bold, color: BLACK });
  page.drawText(month, {
    x: boxX + PAD + bold.widthOfTextAtSize(monthLabel, 12) + 5,
    y: monthBase,
    size: 12,
    font: regular,
    color: BLACK,
  });
  y -= MONTH_H;

  // --- Table ---
  const tableTop = y;
  const tableH = TABLE_HEADER_H + tableRowH;
  page.drawRectangle({ x: boxX, y: tableTop - TABLE_HEADER_H, width: boxW, height: TABLE_HEADER_H, color: BEIGE });
  page.drawRectangle({ x: boxX, y: tableTop - tableH, width: colW[0]!, height: tableRowH, color: BEIGE });
  line(page, boxX, tableTop, boxX + boxW, tableTop);
  line(page, boxX, tableTop - TABLE_HEADER_H, boxX + boxW, tableTop - TABLE_HEADER_H);
  line(page, boxX, tableTop - tableH, boxX + boxW, tableTop - tableH);
  for (const x of colX.slice(1, 5)) line(page, x, tableTop, x, tableTop - tableH);

  const headers = ['Referente à:', 'Valor Unitário', 'Quantidade', 'TOTAL', 'Valor por extenso'];
  headers.forEach((text, i) => {
    const size = fitSize(text, bold, tableSize, colW[i]! - 6);
    drawCentered(page, text, bold, size, colX[i]!, colW[i]!, tableTop, TABLE_HEADER_H);
  });

  const rowTop = tableTop - TABLE_HEADER_H;
  const first = 'Vale Refeição';
  const firstSize = fitSize(first, bold, tableSize, colW[0]! - 6);
  drawCentered(page, first, bold, firstSize, colX[0]!, colW[0]!, rowTop, tableRowH);
  const cells = [formatDecimal(data.unitValue), String(data.quantity), total];
  cells.forEach((text, i) => {
    const col = i + 1;
    const size = fitSize(text, regular, tableSize, colW[col]! - 6);
    drawCentered(page, text, regular, size, colX[col]!, colW[col]!, rowTop, tableRowH);
  });
  const blockH = wordsLines.length * tableLeading;
  wordsLines.forEach((text, i) => {
    page.drawText(text, {
      x: colX[4]! + 4,
      y: rowTop - (tableRowH - blockH) / 2 - (i + 1) * tableLeading + 4,
      size: tableSize,
      font: regular,
      color: BLACK,
    });
  });
  y = tableTop - tableH - SPACER_H;

  // --- Date and signature ---
  const dateText = `${CITY}, ${formatLongDate({ ...data.issueDate })}`;
  const dateBase = y - 18;
  page.drawText(dateText, { x: boxX + 24, y: dateBase, size: 12, font: regular, color: BLACK });
  line(page, signX, dateBase, signX + signW, dateBase);
  nameLines.forEach((text, i) => {
    const width = regular.widthOfTextAtSize(text, 12);
    page.drawText(text, {
      x: signX + (signW - width) / 2,
      y: dateBase - 14 - i * 14,
      size: 12,
      font: regular,
      color: BLACK,
    });
  });

  // --- Outer border on top of the inner lines ---
  page.drawRectangle({
    x: boxX,
    y: boxBottom,
    width: boxW,
    height: boxH,
    borderWidth: OUTER,
    borderColor: BLACK,
  });

  // --- Observation ---
  if (data.observation) {
    const obsSize = 12;
    const obsLines = wrapLines(safe(bold, data.observation), bold, obsSize, boxW);
    obsLines.forEach((text, i) => {
      page.drawText(text, {
        x: boxX,
        y: boxBottom - 12 - obsSize - i * (obsSize + 3),
        size: obsSize,
        font: bold,
        color: RED,
      });
    });
  }

  return pdf.save();
}

/** "Eu, {name}, portador(a) do CPF Nº {cpf} recebi da empresa Intermobile Ltda o auxílio alimentação conforme planilha abaixo:" */
function declarationWords(name: string, cpf: string): Word[] {
  const segments: Word[] = [
    { text: `Eu, ${name}, portador(a) do `, underline: false },
    { text: `CPF Nº ${cpf}`, underline: true },
    { text: ' recebi da empresa Intermobile Ltda o ', underline: false },
    { text: 'auxílio alimentação', underline: true },
    { text: ' conforme planilha abaixo:', underline: false },
  ];
  return segments.flatMap((s) =>
    s.text
      .split(/\s+/)
      .filter(Boolean)
      .map((text) => ({ text, underline: s.underline })),
  );
}
