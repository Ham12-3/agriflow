// Shared farm types, sample data that has no backing table yet, and formatting
// helpers. Safe to import from client components.

export type BatchStatus = "healthy" | "warning" | "critical";

export const BATCH_STATUSES: BatchStatus[] = ["healthy", "warning", "critical"];

export const INVENTORY_CATEGORIES = ["Feed", "Medication", "Livestock", "Supplies"] as const;

export const INCOME_CATEGORIES = [
  "Livestock sales",
  "Milk sales",
  "Egg sales",
  "Manure sales",
  "Grants & loans",
  "Other income",
];

export const EXPENSE_CATEGORIES = [
  "Feed",
  "Medication & vet",
  "Livestock purchase",
  "Labour",
  "Utilities",
  "Transport",
  "Equipment & supplies",
  "Other",
];

export type Finances = {
  revenue: number;
  expenses: number;
  // vs the same days last month; null when there's nothing to compare against.
  revenueChangePct: number | null;
  expensesChangePct: number | null;
  profitChangePct: number | null;
};

export type WeightPoint = { date: string; avgWeightKg: number };

export type FarmChartSeries = {
  key: string;
  title: string;
  prefix?: string;
  suffix: string;
  // This month vs last month (daily average); null when there's no prior data.
  changePct: number | null;
  lowerIsBetter?: boolean;
  // One row per month, one numeric column per year.
  rows: Record<string, string | number>[];
  years: string[];
};


export function countByStatus(batches: { status: BatchStatus }[]) {
  const counts: Record<BatchStatus, number> = {
    healthy: 0,
    warning: 0,
    critical: 0,
  };
  for (const b of batches) counts[b.status] += 1;
  return counts;
}

// Compact: ₦0.5M, −₦2.4M, ₦85,000.
export function formatNaira(amount: number) {
  const sign = amount < 0 ? "−" : "";
  const abs = Math.abs(amount);
  if (abs >= 100_000) {
    return `${sign}₦${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  return `${sign}₦${Math.round(abs).toLocaleString("en-NG")}`;
}

// Exact: ₦2,050,000, −₦200,000.
export function formatNairaFull(amount: number) {
  const sign = amount < 0 ? "−" : "";
  return `${sign}₦${Math.round(Math.abs(amount)).toLocaleString("en-NG")}`;
}

export function formatKg(kg: number | null) {
  if (kg === null) return "—";
  const digits = kg >= 100 ? 1 : 2;
  return `${kg.toLocaleString("en-NG", { maximumFractionDigits: digits })} kg`;
}
