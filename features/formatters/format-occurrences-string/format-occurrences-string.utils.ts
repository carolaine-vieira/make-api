const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function excelSerialToDate(serial: number): Date {
  return new Date(EXCEL_EPOCH_UTC + Math.floor(serial) * MS_PER_DAY);
}

const pad = (n: number) => String(n).padStart(2, "0");

export function formatMonthYear(serial: number): string {
  const d = excelSerialToDate(serial);
  return `${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export function formatFullDate(serial: number): string {
  const d = excelSerialToDate(serial);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}
