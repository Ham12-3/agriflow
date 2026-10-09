import "server-only";

import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isoDaysAgo } from "./dates";
import type { BatchStatus } from "./farm-data";
import { migrate } from "./schema";

// Local SQLite store (Node's built-in driver). Every farm-owned row carries a
// farm_id; callers pass the signed-in user's active farm. The schema maps 1:1
// onto Postgres/Supabase when the app moves to a hosted database.

const DB_PATH = path.join(process.cwd(), ".data", "agriflow.db");

const globalForDb = globalThis as unknown as { agriflowDb?: DatabaseSync; agriflowMigrated?: boolean };

function open() {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  return db;
}

// Reuse one connection across hot reloads in dev; migrate once per process.
export function getDb() {
  globalForDb.agriflowDb ??= open();
  if (!globalForDb.agriflowMigrated) {
    migrate(globalForDb.agriflowDb);
    globalForDb.agriflowMigrated = true;
  }
  return globalForDb.agriflowDb;
}

// Runs `fn` in a transaction (nested calls join the outer one). The driver is
// synchronous, so a simple depth counter is safe.
let depth = 0;
export function transaction<T>(fn: () => T): T {
  const d = getDb();
  if (depth > 0) return fn();
  d.exec("BEGIN");
  depth++;
  try {
    const result = fn();
    d.exec("COMMIT");
    return result;
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  } finally {
    depth--;
  }
}

// ---------- Queries ----------

export type BatchSummary = {
  id: string;
  species: string;
  breed: string;
  category: string;
  dateAdded: string;
  status: BatchStatus;
  initialCount: number;
  currentCount: number;
  ageWeeks: number;
  avgWeightKg: number | null;
  totalMortality: number;
};

export type DailyRecord = {
  id: number;
  date: string;
  stockLevel: number;
  feedType: string;
  feedIntakeKg: number;
  weightGainKg: number;
  medication: string | null;
  mortality: number;
  recordedBy: string;
  notes: string | null;
};

type BatchRow = {
  id: string;
  species: string;
  breed: string;
  category: string;
  initial_count: number;
  start_age_weeks: number;
  start_avg_weight_kg: number | null;
  status: BatchStatus;
  date_added: string;
  latest_stock: number | null;
  total_gain: number | null;
  total_mortality: number | null;
};

const BATCH_SELECT = `
  SELECT b.*,
    (SELECT stock_level FROM daily_records r WHERE r.batch_id = b.id
       ORDER BY r.date DESC, r.id DESC LIMIT 1) AS latest_stock,
    (SELECT SUM(weight_gain_kg) FROM daily_records r WHERE r.batch_id = b.id) AS total_gain,
    (SELECT SUM(mortality) FROM daily_records r WHERE r.batch_id = b.id) AS total_mortality
  FROM batches b`;

function weeksSince(isoDate: string) {
  const ms = Date.now() - new Date(isoDate).getTime();
  return Math.max(0, Math.floor(ms / (7 * 24 * 60 * 60 * 1000)));
}

function toSummary(row: BatchRow): BatchSummary {
  return {
    id: row.id,
    species: row.species,
    breed: row.breed,
    category: row.category,
    dateAdded: row.date_added,
    status: row.status,
    initialCount: row.initial_count,
    currentCount: row.latest_stock ?? row.initial_count,
    ageWeeks: row.start_age_weeks + weeksSince(row.date_added),
    avgWeightKg:
      row.start_avg_weight_kg === null
        ? null
        : Number((row.start_avg_weight_kg + (row.total_gain ?? 0)).toFixed(2)),
    totalMortality: row.total_mortality ?? 0,
  };
}

export function listBatches(farmId: number): BatchSummary[] {
  const rows = getDb()
    .prepare(`${BATCH_SELECT} WHERE b.farm_id = ? ORDER BY b.date_added DESC, b.id DESC`)
    .all(farmId) as BatchRow[];
  return rows.map(toSummary);
}

export function getBatch(farmId: number, id: string): BatchSummary | null {
  const row = getDb().prepare(`${BATCH_SELECT} WHERE b.farm_id = ? AND b.id = ?`).get(farmId, id) as
    | BatchRow
    | undefined;
  return row ? toSummary(row) : null;
}

// Callers check the batch belongs to their farm first (getBatch).
export function listRecords(batchId: string): DailyRecord[] {
  // node:sqlite rows have a null prototype; copy them into plain objects so
  // they can be passed to Client Components.
  const rows = getDb()
    .prepare(
      `SELECT id, date, stock_level AS stockLevel, feed_type AS feedType,
              feed_intake_kg AS feedIntakeKg, weight_gain_kg AS weightGainKg,
              medication, mortality, recorded_by AS recordedBy, notes
       FROM daily_records WHERE batch_id = ? ORDER BY date DESC, id DESC`,
    )
    .all(batchId) as DailyRecord[];
  return rows.map((r) => ({ ...r }));
}

export type WeightSeries = {
  batchId: string;
  label: string;
  points: { date: string; avgWeightKg: number }[];
};

// Average weight per day for each batch (species differ too much to mix), last `days` days.
export function weightTrendByBatch(farmId: number, days = 30): WeightSeries[] {
  const rows = getDb()
    .prepare(
      `SELECT r.batch_id AS batchId, b.species, b.breed, r.date,
              b.start_avg_weight_kg + (SELECT SUM(weight_gain_kg) FROM daily_records x
                 WHERE x.batch_id = r.batch_id AND (x.date < r.date OR (x.date = r.date AND x.id <= r.id))) AS weight
       FROM daily_records r JOIN batches b ON b.id = r.batch_id
       WHERE b.farm_id = ? AND b.start_avg_weight_kg IS NOT NULL AND r.date >= ?
       ORDER BY r.batch_id, r.date, r.id`,
    )
    .all(farmId, isoDaysAgo(days - 1)) as {
    batchId: string;
    species: string;
    breed: string;
    date: string;
    weight: number;
  }[];

  const series = new Map<string, WeightSeries>();
  for (const r of rows) {
    let s = series.get(r.batchId);
    if (!s) {
      s = { batchId: r.batchId, label: `${r.batchId} · ${r.species} (${r.breed})`, points: [] };
      series.set(r.batchId, s);
    }
    // Several records on one day: keep the latest running weight.
    const last = s.points.at(-1);
    const point = { date: r.date, avgWeightKg: Number(r.weight.toFixed(2)) };
    if (last?.date === r.date) s.points[s.points.length - 1] = point;
    else s.points.push(point);
  }
  // Batches with the most history first, so the dashboard opens on the richest trend.
  return [...series.values()].sort((a, b) => b.points.length - a.points.length);
}

// ---------- Mutations ----------

export type NewBatch = {
  species: string;
  breed: string;
  category: string;
  count: number;
  ageWeeks: number;
  avgWeightKg: number | null;
  status: BatchStatus;
};

function speciesPrefix(species: string) {
  return species.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase() || "BAT";
}

// Next batch ID for a farm, e.g. POU-12124-002 (species · farm code · sequence).
export function nextBatchId(farmId: number, farmCode: string, species: string) {
  const db = getDb();
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM batches WHERE farm_id = ?").get(farmId) as { n: number };
  let seq = n + 1;
  const make = () => `${speciesPrefix(species)}-${farmCode}-${String(seq).padStart(3, "0")}`;
  let id = make();
  while (db.prepare("SELECT 1 FROM batches WHERE id = ?").get(id)) {
    seq += 1;
    id = make();
  }
  return id;
}

export function createBatch(farmId: number, farmCode: string, input: NewBatch) {
  const id = nextBatchId(farmId, farmCode, input.species);
  getDb()
    .prepare(
      `INSERT INTO batches (id, farm_id, species, breed, category, initial_count, start_age_weeks, start_avg_weight_kg, status, date_added)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id, farmId, input.species, input.breed, input.category, input.count,
      input.ageWeeks, input.avgWeightKg, input.status, isoDaysAgo(0),
    );
  return id;
}

export function deleteBatch(farmId: number, id: string) {
  getDb().prepare("DELETE FROM batches WHERE farm_id = ? AND id = ?").run(farmId, id);
}

export function setBatchStatus(farmId: number, id: string, status: BatchStatus) {
  getDb().prepare("UPDATE batches SET status = ? WHERE farm_id = ? AND id = ?").run(status, farmId, id);
}

export type NewRecord = Omit<DailyRecord, "id">;

// Callers check the batch belongs to their farm first (getBatch).
export function addRecord(batchId: string, r: NewRecord) {
  getDb()
    .prepare(
      `INSERT INTO daily_records (batch_id, date, stock_level, feed_type, feed_intake_kg, weight_gain_kg, medication, mortality, recorded_by, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))`,
    )
    .run(
      batchId, r.date, r.stockLevel, r.feedType, r.feedIntakeKg, r.weightGainKg,
      r.medication, r.mortality, r.recordedBy, r.notes,
    );
}

export function deleteRecord(batchId: string, recordId: number) {
  getDb()
    .prepare("DELETE FROM daily_records WHERE id = ? AND batch_id = ?")
    .run(recordId, batchId);
}
