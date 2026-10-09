// Calendar dates in the farm's timezone. The server runs in UTC, but "today"
// for a Nigerian farm starts at midnight WAT (UTC+1), so all day/month logic
// goes through here. Safe to import from client components.

export const FARM_TIMEZONE = "Africa/Lagos";

const ymd = new Intl.DateTimeFormat("en-CA", {
  timeZone: FARM_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date on the farm, as YYYY-MM-DD. */
export function todayISO() {
  return ymd.format(new Date());
}

/** Today's date parts on the farm (month is 0-based, like Date). */
export function farmToday() {
  const [y, m, d] = todayISO().split("-").map(Number);
  return { year: y, month: m - 1, day: d };
}

/** YYYY-MM-DD for a calendar date; out-of-range parts roll over (day 0 = last day of previous month). */
export function isoDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

/** The farm date `days` before today (negative = in the future). */
export function isoDaysAgo(days: number) {
  const { year, month, day } = farmToday();
  return isoDate(year, month, day - days);
}

/** Days in a month (month 0-based). */
export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** True for a real calendar date like 2026-02-28 (rejects 2026-02-31). */
export function isValidISODate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  return isoDate(y, m - 1, d) === value;
}

/** Formats a YYYY-MM-DD date without shifting it by the viewer's timezone. */
export function formatDay(iso: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-NG", { ...options, timeZone: "UTC" });
}
