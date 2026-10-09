import "server-only";

import { daysInMonth, farmToday, isoDate } from "./dates";
import { getDb } from "./db";
import type { Finances } from "./farm-data";

// Income and expense transactions, per farm. Inventory deliveries with a cost
// are recorded here automatically as expenses (see recordDeliveryExpense).

export type TransactionType = "income" | "expense";

export type Transaction = {
  id: number;
  date: string;
  type: TransactionType;
  category: string;
  description: string;
  amount: number;
  batchId: string | null;
  source: string | null;
};

const db = getDb;

// ---------- Periods ----------

export type Period = "month" | "last-month" | "year" | "all";

export function periodRange(period: Period): { from: string | null; to: string | null } {
  const { year: y, month: m } = farmToday();
  switch (period) {
    case "month":
      return { from: isoDate(y, m, 1), to: null };
    case "last-month":
      return { from: isoDate(y, m - 1, 1), to: isoDate(y, m, 0) };
    case "year":
      return { from: `${y}-01-01`, to: null };
    case "all":
      return { from: null, to: null };
  }
}

function where(farmId: number, range: { from: string | null; to: string | null }) {
  const clauses = ["farm_id = ?"];
  const params: (string | number)[] = [farmId];
  if (range.from) {
    clauses.push("date >= ?");
    params.push(range.from);
  }
  if (range.to) {
    clauses.push("date <= ?");
    params.push(range.to);
  }
  return { sql: `WHERE ${clauses.join(" AND ")}`, params };
}

// ---------- Queries ----------

const MAX_LISTED = 500;

export function listTransactions(farmId: number, period: Period): { rows: Transaction[]; truncated: boolean } {
  const w = where(farmId, periodRange(period));
  const rows = db()
    .prepare(
      `SELECT id, date, type, category, description, amount, batch_id AS batchId, source
       FROM transactions ${w.sql} ORDER BY date DESC, id DESC LIMIT ${MAX_LISTED + 1}`,
    )
    .all(...w.params) as Transaction[];
  return {
    rows: rows.slice(0, MAX_LISTED).map((r) => ({ ...r })),
    truncated: rows.length > MAX_LISTED,
  };
}

export function summarize(farmId: number, period: Period) {
  const w = where(farmId, periodRange(period));
  const totals = db()
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'income' THEN amount END), 0) AS revenue,
         COALESCE(SUM(CASE WHEN type = 'expense' THEN amount END), 0) AS expenses
       FROM transactions ${w.sql}`,
    )
    .get(...w.params) as { revenue: number; expenses: number };

  const net = totals.revenue - totals.expenses;
  return {
    revenue: totals.revenue,
    expenses: totals.expenses,
    net,
    margin: totals.revenue > 0 ? (net / totals.revenue) * 100 : null,
  };
}

// Revenue and expenses since `from` (inclusive), e.g. for portfolio views.
export function totalsSince(farmId: number, from: string | null) {
  const w = where(farmId, { from, to: null });
  return db()
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount END), 0) AS revenue,
              COALESCE(SUM(CASE WHEN type = 'expense' THEN amount END), 0) AS expenses
       FROM transactions ${w.sql}`,
    )
    .get(...w.params) as { revenue: number; expenses: number };
}

function pctChange(current: number, previous: number) {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

// Month-to-date figures for the dashboard, compared with the same days of last month.
export function monthToDate(farmId: number): Finances {
  const { year: y, month: m, day } = farmToday();
  const prevMonthDays = daysInMonth(y, m - 1);

  const sums = (from: string, to: string) =>
    db()
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN type = 'income' THEN amount END), 0) AS revenue,
           COALESCE(SUM(CASE WHEN type = 'expense' THEN amount END), 0) AS expenses
         FROM transactions WHERE farm_id = ? AND date BETWEEN ? AND ?`,
      )
      .get(farmId, from, to) as { revenue: number; expenses: number };

  const cur = sums(isoDate(y, m, 1), isoDate(y, m, day));
  const prev = sums(isoDate(y, m - 1, 1), isoDate(y, m - 1, Math.min(day, prevMonthDays)));

  return {
    revenue: cur.revenue,
    expenses: cur.expenses,
    revenueChangePct: pctChange(cur.revenue, prev.revenue),
    expensesChangePct: pctChange(cur.expenses, prev.expenses),
    profitChangePct: pctChange(cur.revenue - cur.expenses, prev.revenue - prev.expenses),
  };
}

// ---------- Mutations ----------

export type NewTransaction = Omit<Transaction, "id" | "source">;

export function addTransaction(farmId: number, t: NewTransaction) {
  db()
    .prepare(
      `INSERT INTO transactions (farm_id, date, type, category, description, amount, batch_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(farmId, t.date, t.type, t.category, t.description, t.amount, t.batchId);
}

export function deleteTransaction(farmId: number, id: number) {
  db().prepare("DELETE FROM transactions WHERE farm_id = ? AND id = ?").run(farmId, id);
}

const DELIVERY_CATEGORY: Record<string, string> = {
  Feed: "Feed",
  Medication: "Medication & vet",
  Livestock: "Livestock purchase",
  Supplies: "Equipment & supplies",
};

// Called inside inventory's delivery transaction, so both rows commit together.
export function recordDeliveryExpense(
  farmId: number,
  d: { date: string; itemCategory: string; description: string; amount: number },
) {
  db()
    .prepare(
      `INSERT INTO transactions (farm_id, date, type, category, description, amount, source)
       VALUES (?, ?, 'expense', ?, ?, ?, 'inventory')`,
    )
    .run(farmId, d.date, DELIVERY_CATEGORY[d.itemCategory] ?? "Other", d.description, d.amount);
}
