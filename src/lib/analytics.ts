import "server-only";

import { getDb, listBatches, type BatchSummary } from "./db";
import type { FarmChartSeries } from "./farm-data";
import { summarize } from "./finances";
import { listItems } from "./inventory";
import { farmKey, getAISettings, getSetting, setSetting } from "./settings";
import { daysInMonth, farmToday, isoDate, isoDaysAgo } from "./dates";

// Farm analytics computed from Production records, Inventory and Finances.
// Benchmarks are rough industry figures; tune them per farm as data grows.

const WINDOW_DAYS = 30;
const DEFAULT_REVENUE_TARGET = 10_000_000;

// 30-day mortality (% of head) that scores full marks / zero for each species.
const MORTALITY_BENCHMARK: Record<string, { good: number; bad: number }> = {
  Poultry: { good: 3, bad: 10 },
  Fish: { good: 5, bad: 15 },
};
const DEFAULT_MORTALITY = { good: 0.5, bad: 3 }; // cattle, goats, sheep, pigs

// Species are typed freely, so map common spellings onto benchmark groups.
function speciesGroup(species: string) {
  const s = species.trim().toLowerCase();
  if (/poultry|chicken|broiler|layer|bird|turkey|duck|cockerel/.test(s)) return "Poultry";
  if (/fish|catfish|tilapia/.test(s)) return "Fish";
  return species.trim();
}

const mortalityBenchmark = (species: string) =>
  MORTALITY_BENCHMARK[speciesGroup(species)] ?? DEFAULT_MORTALITY;

// Broiler feed conversion ratio (kg feed per kg gain).
const BROILER_FCR = { good: 1.8, ok: 2.2 };

const db = getDb;
// Daily records belonging to one farm's batches.
const FARM_RECORDS = "batch_id IN (SELECT id FROM batches WHERE farm_id = ?)";

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
// 1 at `good`, 0 at `bad`, linear between (works for either direction).
const scale = (value: number, good: number, bad: number) =>
  clamp((value - bad) / (good - bad));

// ---------- Settings ----------

export function revenueTarget(farmId: number) {
  return Number(getSetting(farmKey(farmId, "monthly_revenue_target"), DEFAULT_REVENUE_TARGET)) || DEFAULT_REVENUE_TARGET;
}

export function setRevenueTarget(farmId: number, amount: number) {
  setSetting(farmKey(farmId, "monthly_revenue_target"), amount);
}

// ---------- Production efficiency ----------

export type Efficiency = {
  batchId: string;
  label: string;
  species: string;
  days: number;
  avgDailyGainKg: number | null;
  feedPerHeadKg: number | null;
  fcr: number | null;
  rating: "good" | "ok" | "poor" | null;
};

type RecordTotals = {
  batchId: string;
  days: number;
  feed: number;
  gain: number;
  avgStock: number;
  deaths: number;
};

function recordTotals(farmId: number, sinceDays: number): Map<string, RecordTotals> {
  const rows = db()
    .prepare(
      `SELECT batch_id AS batchId, COUNT(DISTINCT date) AS days, SUM(feed_intake_kg) AS feed,
              SUM(weight_gain_kg) AS gain, AVG(stock_level) AS avgStock, SUM(mortality) AS deaths
       FROM daily_records WHERE ${FARM_RECORDS} AND date >= ? GROUP BY batch_id`,
    )
    .all(farmId, isoDaysAgo(sinceDays - 1)) as RecordTotals[];
  return new Map(rows.map((r) => [r.batchId, { ...r }]));
}

function efficiencyFor(b: BatchSummary, t: RecordTotals | undefined): Efficiency {
  const label = `${b.id} · ${b.species} (${b.breed})`;
  if (!t || t.days === 0 || t.avgStock <= 0) {
    return { batchId: b.id, label, species: b.species, days: 0, avgDailyGainKg: null, feedPerHeadKg: null, fcr: null, rating: null };
  }
  const fcr = t.gain > 0 ? t.feed / (t.avgStock * t.gain) : null;
  let rating: Efficiency["rating"] = null;
  if (fcr !== null && speciesGroup(b.species) === "Poultry" && /broiler/i.test(b.category)) {
    rating = fcr <= BROILER_FCR.good ? "good" : fcr <= BROILER_FCR.ok ? "ok" : "poor";
  }
  return {
    batchId: b.id,
    label,
    species: b.species,
    days: t.days,
    avgDailyGainKg: Number((t.gain / t.days).toFixed(3)),
    feedPerHeadKg: Number((t.feed / (t.avgStock * t.days)).toFixed(3)),
    fcr: fcr === null ? null : Number(fcr.toFixed(2)),
    rating,
  };
}

// ---------- Mortality ----------

export type MortalitySummary = {
  batchId: string;
  label: string;
  deaths: number;
  ratePct: number | null;
  totalDeaths: number;
  status: "good" | "watch" | "high" | null;
};

function mortalityDaily(farmId: number, batches: BatchSummary[]) {
  const rows = db()
    .prepare(
      `SELECT date, batch_id AS batchId, SUM(mortality) AS deaths FROM daily_records
       WHERE ${FARM_RECORDS} AND date >= ? GROUP BY date, batch_id ORDER BY date`,
    )
    .all(farmId, isoDaysAgo(WINDOW_DAYS - 1)) as { date: string; batchId: string; deaths: number }[];
  const byDate = new Map<string, Record<string, string | number>>();
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const date = isoDaysAgo(i);
    const row: Record<string, string | number> = { date };
    for (const b of batches) row[b.id] = 0;
    byDate.set(date, row);
  }
  for (const r of rows) {
    const row = byDate.get(r.date);
    if (row) row[r.batchId] = r.deaths;
  }
  return [...byDate.values()];
}

// ---------- Health score ----------

export type HealthScore = {
  score: number | null; // null when there are no batches to score
  label: "Optimal" | "Fair" | "Needs attention" | "No data yet";
  parts: { name: string; score: number; max: number; detail: string }[];
};

function healthScore(
  farmId: number,
  batches: BatchSummary[],
  mortality: MortalitySummary[],
  recordDays: Map<string, number>,
): HealthScore {
  if (batches.length === 0) return { score: null, label: "No data yet", parts: [] };
  const heads = batches.reduce((s, b) => s + b.currentCount, 0) || 1;
  const weighted = (fn: (b: BatchSummary) => number) =>
    batches.length ? batches.reduce((s, b) => s + fn(b) * b.currentCount, 0) / heads : 1;

  const mortalityPart = weighted((b) => {
    const m = mortality.find((x) => x.batchId === b.id);
    if (m?.ratePct == null) return 1;
    const bench = mortalityBenchmark(b.species);
    return scale(m.ratePct, bench.good, bench.bad);
  });
  const statusPart = weighted((b) => ({ healthy: 1, warning: 0.5, critical: 0 })[b.status]);
  const recordsPart = batches.length
    ? batches.reduce((s, b) => s + clamp((recordDays.get(b.id) ?? 0) / 14), 0) / batches.length
    : 1;
  const runways = listItems(farmId)
    .filter((i) => i.category === "Feed" && i.daysLeft !== null)
    .map((i) => i.daysLeft as number);
  const feedPart = runways.length ? scale(Math.min(...runways), 14, 0) : 1;

  const parts = [
    { name: "Mortality", score: mortalityPart * 40, max: 40, detail: "Deaths in the last 30 days vs species benchmarks" },
    { name: "Batch status", score: statusPart * 30, max: 30, detail: "Healthy / warning / critical flags, weighted by head count" },
    { name: "Record keeping", score: recordsPart * 15, max: 15, detail: "Daily records logged in the last 14 days" },
    { name: "Feed security", score: feedPart * 15, max: 15, detail: runways.length ? `Shortest feed runway: ${Math.floor(Math.min(...runways))} days` : "No feed usage tracked yet" },
  ].map((p) => ({ ...p, score: Math.round(p.score) }));

  const score = parts.reduce((s, p) => s + p.score, 0);
  return { score, label: score >= 80 ? "Optimal" : score >= 60 ? "Fair" : "Needs attention", parts };
}

// ---------- Revenue vs target ----------


function monthLabel(key: string) {
  return new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-NG", { month: "short", timeZone: "UTC" });
}

export function monthlyRevenue(farmId: number, months = 6) {
  const { year, month } = farmToday();
  const keys = Array.from({ length: months }, (_, i) =>
    isoDate(year, month - (months - 1 - i), 1).slice(0, 7),
  );
  const rows = db()
    .prepare(
      `SELECT substr(date, 1, 7) AS month,
              SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS revenue,
              SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expenses
       FROM transactions WHERE farm_id = ? AND date >= ? GROUP BY month`,
    )
    .all(farmId, `${keys[0]}-01`) as { month: string; revenue: number; expenses: number }[];
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return keys.map((k) => ({
    month: monthLabel(k),
    revenue: byMonth.get(k)?.revenue ?? 0,
    expenses: byMonth.get(k)?.expenses ?? 0,
  }));
}

// ---------- Credit score ----------

export type CreditScore = {
  score: number;
  grade: "A" | "B" | "C" | "D" | "E";
  factors: { name: string; score: number; max: number; detail: string; tip: string }[];
};

function creditScore(
  farmId: number,
  batches: BatchSummary[],
  health: HealthScore,
  recordDays60: Map<string, number>,
): CreditScore {
  const records = batches.length
    ? batches.reduce((s, b) => {
        const expected = Math.min(60, Math.max(1, daysSince(b.dateAdded) + 1));
        return s + clamp((recordDays60.get(b.id) ?? 0) / expected);
      }, 0) / batches.length
    : 0;

  const quarter = summarizeRange(farmId, 90);
  const margin = quarter.revenue > 0 ? (quarter.revenue - quarter.expenses) / quarter.revenue : -1;

  // Only months since the farm started keeping records count; empty months
  // before that would unfairly look like zero income.
  const history = monthlyRevenue(farmId, 6);
  const first = history.findIndex((m) => m.revenue > 0 || m.expenses > 0);
  const monthly = first === -1 ? [] : history.slice(first).map((m) => m.revenue);
  const mean = monthly.length ? monthly.reduce((a, b) => a + b, 0) / monthly.length : 0;
  const sd = monthly.length
    ? Math.sqrt(monthly.reduce((a, b) => a + (b - mean) ** 2, 0) / monthly.length)
    : 0;
  const cv = monthly.length >= 2 && mean > 0 ? sd / mean : null;

  const stockValue = listItems(farmId).reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const avgMonthlyExpenses = quarter.expenses / 3;
  const coverage = avgMonthlyExpenses > 0 ? stockValue / avgMonthlyExpenses : 1;

  const factors = [
    {
      name: "Record keeping",
      score: records * 25,
      max: 25,
      detail: `${Math.round(records * 100)}% of expected daily records in the last 60 days`,
      tip: "Log a daily record for every batch, every day.",
    },
    {
      name: "Profitability",
      score: scale(margin, 0.2, -0.2) * 25,
      max: 25,
      detail: quarter.revenue > 0 ? `${Math.round(margin * 100)}% profit margin over 90 days` : "No income recorded in 90 days",
      tip: "Record every sale so income isn't understated.",
    },
    {
      name: "Revenue consistency",
      // Too little history to judge: half marks rather than a penalty.
      score: (cv === null ? 0.5 : scale(cv, 0.3, 1.5)) * 20,
      max: 20,
      detail:
        cv === null
          ? "Not enough monthly history yet (needs 2+ months)"
          : `Monthly revenue varies by ${Math.round(cv * 100)}% over ${monthly.length} months`,
      tip: "Steady income streams (milk, eggs) smooth out batch sales.",
    },
    {
      name: "Farm health",
      score: ((health.score ?? 0) / 100) * 15,
      max: 15,
      detail: health.score === null ? "No batches to score yet" : `Health score ${health.score}/100`,
      tip: "Keep mortality low and batch statuses up to date.",
    },
    {
      name: "Assets on hand",
      score: clamp(coverage) * 15,
      max: 15,
      detail: `Stock covers ${coverage.toFixed(1)} months of expenses`,
      tip: "Keep inventory counts current so stock value is captured.",
    },
  ].map((f) => ({ ...f, score: Math.round(f.score) }));

  const score = factors.reduce((s, f) => s + f.score, 0);
  const grade = score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : score >= 35 ? "D" : "E";
  return { score, grade, factors };
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function summarizeRange(farmId: number, days: number) {
  return db()
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount END), 0) AS revenue,
              COALESCE(SUM(CASE WHEN type = 'expense' THEN amount END), 0) AS expenses
       FROM transactions WHERE farm_id = ? AND date >= ?`,
    )
    .get(farmId, isoDaysAgo(days - 1)) as { revenue: number; expenses: number };
}

function recordDayCounts(farmId: number, sinceDays: number) {
  const rows = db()
    .prepare(
      `SELECT batch_id AS batchId, COUNT(DISTINCT date) AS days FROM daily_records
       WHERE ${FARM_RECORDS} AND date >= ? GROUP BY batch_id`,
    )
    .all(farmId, isoDaysAgo(sinceDays - 1)) as { batchId: string; days: number }[];
  return new Map(rows.map((r) => [r.batchId, r.days]));
}

// ---------- Insights ----------

export type Insight = { tone: "good" | "warn" | "bad"; text: string };

// Latest day's feed per animal vs the average of the 7 records before it.
function feedVariance(batches: BatchSummary[], tolerancePct: number): Insight[] {
  const out: Insight[] = [];
  const stmt = db().prepare(
    `SELECT date, feed_intake_kg AS feed, stock_level AS stock FROM daily_records
     WHERE batch_id = ? ORDER BY date DESC, id DESC LIMIT 8`,
  );
  for (const b of batches) {
    const rows = stmt.all(b.id) as { date: string; feed: number; stock: number }[];
    if (rows.length < 4) continue;
    const perHead = rows.map((r) => (r.stock > 0 ? r.feed / r.stock : 0));
    const [latest, ...previous] = perHead;
    const avg = previous.reduce((a, v) => a + v, 0) / previous.length;
    if (avg <= 0) continue;
    const diffPct = ((latest - avg) / avg) * 100;
    if (Math.abs(diffPct) > tolerancePct) {
      out.push({
        tone: "warn",
        text: `${b.id} ate ${Math.abs(Math.round(diffPct))}% ${diffPct > 0 ? "more" : "less"} feed per animal on ${rows[0].date} than its recent average (tolerance ±${tolerancePct}%). ${diffPct > 0 ? "Check for spillage or a recording error." : "Check appetite — falling intake can be an early sign of illness."}`,
      });
    }
  }
  return out;
}

function buildInsights(input: {
  farmId: number;
  efficiency: Efficiency[];
  mortality: MortalitySummary[];
  health: HealthScore;
  target: number;
  thisMonthRevenue: number | null;
  feedVariance: Insight[];
}): Insight[] {
  const out: Insight[] = [...input.feedVariance];
  for (const e of input.efficiency) {
    if (e.rating === "poor") {
      out.push({ tone: "bad", text: `${e.batchId} is using ${e.fcr} kg of feed per kg of weight gained (target ≤ ${BROILER_FCR.good}). Check for feed wastage, spillage or underweight birds.` });
    } else if (e.rating === "good") {
      out.push({ tone: "good", text: `${e.batchId} converts feed efficiently (FCR ${e.fcr}).` });
    }
  }
  for (const m of input.mortality) {
    if (m.status === "high") out.push({ tone: "bad", text: `${m.batchId} lost ${m.deaths} animals in 30 days (${m.ratePct}%). Consider a vet check.` });
    else if (m.status === "good" && m.deaths > 0) out.push({ tone: "good", text: `${m.batchId} mortality is within benchmark (${m.ratePct}% in 30 days).` });
  }
  for (const i of listItems(input.farmId)) {
    if (i.attentionReason === "Running out soon" && i.daysLeft !== null) {
      out.push({ tone: "warn", text: `${i.name} runs out in about ${Math.floor(i.daysLeft)} days at current feeding. Order now to avoid a gap.` });
    } else if (i.attentionReason === "Below reorder level") {
      out.push({ tone: "warn", text: `${i.name} is below its reorder level (${i.quantity} ${i.unit} left).` });
    }
  }
  const today = farmToday();
  const expectedSoFar = (input.target * today.day) / daysInMonth(today.year, today.month);
  if (input.thisMonthRevenue !== null && input.thisMonthRevenue < expectedSoFar * 0.8) {
    out.push({ tone: "warn", text: `Revenue is behind this month's target pace (₦${Math.round(input.thisMonthRevenue).toLocaleString("en-NG")} of ₦${Math.round(expectedSoFar).toLocaleString("en-NG")} expected by today).` });
  }
  if (input.health.score !== null && input.health.score >= 80) out.push({ tone: "good", text: `Overall farm health is ${input.health.label.toLowerCase()} (${input.health.score}/100).` });
  const order = { bad: 0, warn: 1, good: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}

// ---------- Page data ----------

// `seesMoney` is false for workers: revenue figures and money insights are left out.
export function getAnalytics(farmId: number, seesMoney = true) {
  const batches = listBatches(farmId);
  const totals = recordTotals(farmId, WINDOW_DAYS);
  const efficiency = batches.map((b) => efficiencyFor(b, totals.get(b.id)));

  const totalDeaths = new Map(
    (
      db()
        .prepare(`SELECT batch_id AS batchId, SUM(mortality) AS n FROM daily_records WHERE ${FARM_RECORDS} GROUP BY batch_id`)
        .all(farmId) as { batchId: string; n: number }[]
    ).map((r) => [r.batchId, r.n]),
  );
  const mortality: MortalitySummary[] = batches.map((b) => {
    const t = totals.get(b.id);
    const ratePct = t && t.avgStock > 0 ? Number(((t.deaths / t.avgStock) * 100).toFixed(2)) : null;
    const bench = mortalityBenchmark(b.species);
    return {
      batchId: b.id,
      label: `${b.id} · ${b.species}`,
      deaths: t?.deaths ?? 0,
      ratePct,
      totalDeaths: totalDeaths.get(b.id) ?? 0,
      status: ratePct === null ? null : ratePct <= bench.good ? "good" : ratePct <= (bench.good + bench.bad) / 2 ? "watch" : "high",
    };
  });

  const health = healthScore(farmId, batches, mortality, recordDayCounts(farmId, 14));
  const target = revenueTarget(farmId);
  const revenue = monthlyRevenue(farmId, 6);
  const thisMonth = summarize(farmId, "month");

  return {
    insights: buildInsights({
      farmId,
      efficiency,
      mortality,
      health,
      target,
      thisMonthRevenue: seesMoney ? thisMonth.revenue : null,
      feedVariance: feedVariance(batches, getAISettings(farmId).feedVarianceTolerancePct),
    }),
    efficiency,
    health,
    revenue: seesMoney ? revenue : [],
    target,
    thisMonthRevenue: seesMoney ? thisMonth.revenue : 0,
    mortality,
    mortalityDaily: mortalityDaily(farmId, batches),
    batches: batches.map((b) => ({ id: b.id, label: `${b.id} · ${b.species}` })),
    credit: creditScore(farmId, batches, health, recordDayCounts(farmId, 60)),
  };
}

export type Analytics = ReturnType<typeof getAnalytics>;

// ---------- Dashboard farm chart (replaces sample data) ----------

export function farmCharts(farmId: number): FarmChartSeries[] {
  const { year, month, day: today } = farmToday();
  const months = Array.from({ length: month + 1 }, (_, i) => i);
  const label = (m: number) => monthLabel(`${year}-${String(m + 1).padStart(2, "0")}`);
  const years = [String(year - 1), String(year)];

  const revenue = db()
    .prepare(
      `SELECT substr(date, 1, 4) AS y, CAST(substr(date, 6, 2) AS INTEGER) - 1 AS m, SUM(amount) AS v
       FROM transactions WHERE farm_id = ? AND type = 'income' AND date >= ? GROUP BY y, m`,
    )
    .all(farmId, `${year - 1}-01-01`) as { y: string; m: number; v: number }[];
  const records = db()
    .prepare(
      `SELECT substr(date, 1, 4) AS y, CAST(substr(date, 6, 2) AS INTEGER) - 1 AS m,
              SUM(feed_intake_kg) AS feed, SUM(mortality) AS deaths, AVG(stock_level) AS stock
       FROM daily_records WHERE ${FARM_RECORDS} AND date >= ? GROUP BY y, m`,
    )
    .all(farmId, `${year - 1}-01-01`) as { y: string; m: number; feed: number; deaths: number; stock: number }[];

  const build = (pick: (y: string, m: number) => number | null) => {
    const present = years.filter((y) => months.some((m) => pick(y, m) !== null));
    const rows = months.map((m) => {
      const row: Record<string, string | number> = { month: label(m) };
      for (const y of present) row[y] = pick(y, m) ?? 0;
      return row;
    });
    return { rows, years: present.length ? present : [String(year)] };
  };
  // This month's daily average vs last month's, so a part-month compares fairly.
  const change = (pick: (y: string, m: number) => number | null) => {
    const prevDays = daysInMonth(year, month - 1);
    const prevYear = month === 0 ? String(year - 1) : String(year);
    const cur = (pick(String(year), month) ?? 0) / today;
    const prev = (pick(prevYear, (month + 11) % 12) ?? 0) / prevDays;
    return prev > 0 ? Number((((cur - prev) / prev) * 100).toFixed(1)) : null;
  };

  const rev = (y: string, m: number) => {
    const r = revenue.find((x) => x.y === y && x.m === m);
    return r ? Number((r.v / 1_000_000).toFixed(2)) : null;
  };
  const feed = (y: string, m: number) => {
    const r = records.find((x) => x.y === y && x.m === m);
    return r ? Math.round(r.feed) : null;
  };
  const mort = (y: string, m: number) => {
    const r = records.find((x) => x.y === y && x.m === m);
    return r && r.stock > 0 ? Number(((r.deaths / r.stock) * 100).toFixed(2)) : null;
  };

  return [
    { key: "revenue", title: "Revenue", prefix: "₦", suffix: "M", changePct: change(rev), ...build(rev) },
    { key: "feed-intake", title: "Feed Intake", suffix: " kg", changePct: change(feed), ...build(feed) },
    { key: "mortality", title: "Mortality Rate", suffix: "%", changePct: change(mort), lowerIsBetter: true, ...build(mort) },
  ];
}
