// CSV export helpers (client-side).

// Text starting with these characters runs as a formula when opened in Excel.
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]) {
  return [header.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
}

export function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in Firefox/Safari.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
