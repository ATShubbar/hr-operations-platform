// RFC 4180 CSV for every export (REP-03 reports, AUDIT-07 the audit trail,
// SOON-01 the register): CRLF line endings, a field quoted only when it needs to
// be, embedded quotes doubled — and a UTF-8 BOM so Excel opens Arabic as Arabic,
// not mojibake. Lifted out of Reporting (AUDIT-07) so the foundation's audit
// export doesn't import a delivery module.
//
// CSV-01: a spreadsheet RUNS a cell that opens with = + - or @ (or a tab or a
// carriage return) as a formula, so a company or account named
// `=HYPERLINK(...)` would execute on whoever opens the file. Every TEXT cell is
// therefore guarded HERE, in the one writer — an export cannot forget it. A
// leading apostrophe makes Excel and Sheets show the cell as text. Numbers are
// passed as numbers and are never touched: `-12.5` stays a number.

export type CsvCell = string | number | null;

const BOM = '\ufeff';
const CRLF = '\r\n';
const NEEDS_QUOTING = /[",\r\n]/;
const RUNS_AS_FORMULA = /^[=+\-@\t\r]/;

export function csvField(value: CsvCell): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  const text = RUNS_AS_FORMULA.test(value) ? `'${value}` : value;
  return NEEDS_QUOTING.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Optional text as a cell: nothing, or the text. (The formula guard is `csvField`'s — CSV-01.) */
export function csvText(value: string | null | undefined): string | null {
  return value === null || value === undefined || value === '' ? null : value;
}

/** Lines of cells → one CSV document (BOM + CRLF lines + a final CRLF). An empty line is a blank row. */
export function toCsvDocument(lines: readonly (readonly CsvCell[])[]): string {
  return BOM + lines.map((cells) => cells.map(csvField).join(',')).join(CRLF) + CRLF;
}
