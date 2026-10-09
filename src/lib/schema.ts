import "server-only";

import { randomInt } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { seedSampleFarm } from "./seed";

// All tables live here. Migrations are idempotent: they upgrade an existing
// database in place (earlier single-farm data becomes farm 1) and build a new
// one from scratch. Sample data is added only when the database is brand new.

const NOW_MS = "strftime('%Y-%m-%d %H:%M:%f','now')";

const tableExists = (d: DatabaseSync, name: string) =>
  Boolean(d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));

const columnExists = (d: DatabaseSync, table: string, column: string) =>
  (d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === column);

const tableSql = (d: DatabaseSync, name: string) =>
  (d.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) as { sql: string } | undefined)?.sql ?? "";

const ALPHANUM = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newFarmCode() {
  return String(randomInt(10000, 100000));
}

export function newJoinCode() {
  return `FJ${Array.from({ length: 7 }, () => ALPHANUM[randomInt(ALPHANUM.length)]).join("")}`;
}

function uniqueCode(d: DatabaseSync, column: "code" | "join_code", make: () => string) {
  for (;;) {
    const code = make();
    if (!d.prepare(`SELECT 1 FROM farms WHERE ${column} = ?`).get(code)) return code;
  }
}

export function insertFarm(
  d: DatabaseSync,
  farm: { name: string; location?: string; type?: string; established?: string | null },
) {
  const result = d
    .prepare(
      `INSERT INTO farms (name, location, type, established, code, join_code) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      farm.name,
      farm.location ?? "",
      farm.type ?? "Mixed",
      farm.established ?? null,
      uniqueCode(d, "code", newFarmCode),
      uniqueCode(d, "join_code", newJoinCode),
    );
  return Number(result.lastInsertRowid);
}

export function migrate(d: DatabaseSync) {
  const brandNew = !tableExists(d, "batches") && !tableExists(d, "farms");

  d.exec("PRAGMA foreign_keys = OFF");
  d.exec("BEGIN");
  try {
    d.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS farms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        location TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL DEFAULT 'Mixed',
        established TEXT,
        code TEXT NOT NULL UNIQUE,
        join_code TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS memberships (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'worker')),
        title TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
        joined_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_active_at TEXT,
        PRIMARY KEY (user_id, farm_id)
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        farm_id INTEGER REFERENCES farms(id) ON DELETE SET NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

      CREATE TABLE IF NOT EXISTS batches (
        id TEXT PRIMARY KEY,
        farm_id INTEGER NOT NULL DEFAULT 1,
        species TEXT NOT NULL,
        breed TEXT NOT NULL,
        category TEXT NOT NULL,
        initial_count INTEGER NOT NULL,
        start_age_weeks INTEGER NOT NULL,
        start_avg_weight_kg REAL,
        status TEXT NOT NULL DEFAULT 'healthy',
        date_added TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS daily_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        stock_level INTEGER NOT NULL,
        feed_type TEXT NOT NULL,
        feed_intake_kg REAL NOT NULL,
        weight_gain_kg REAL NOT NULL,
        medication TEXT,
        mortality INTEGER NOT NULL DEFAULT 0,
        recorded_by TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (${NOW_MS})
      );
      CREATE TABLE IF NOT EXISTS inventory_deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        quantity REAL NOT NULL,
        total_cost REAL NOT NULL DEFAULT 0,
        supplier TEXT,
        created_at TEXT NOT NULL DEFAULT (${NOW_MS})
      );
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        farm_id INTEGER NOT NULL DEFAULT 1,
        date TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL CHECK (amount > 0),
        batch_id TEXT REFERENCES batches(id) ON DELETE SET NULL,
        source TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS meetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        agenda TEXT NOT NULL DEFAULT '',
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS batch_assignments (
        batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (batch_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS meeting_attendees (
        meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (meeting_id, user_id)
      );
    `);

    // Single-farm databases: tag existing rows with farm 1.
    if (!columnExists(d, "batches", "farm_id")) {
      d.exec("ALTER TABLE batches ADD COLUMN farm_id INTEGER NOT NULL DEFAULT 1");
    }
    if (!columnExists(d, "transactions", "farm_id")) {
      d.exec("ALTER TABLE transactions ADD COLUMN farm_id INTEGER NOT NULL DEFAULT 1");
    }

    // Inventory item names were unique across the whole database; make them
    // unique per farm (needs a table rebuild in SQLite).
    const inventoryItems = `
      CREATE TABLE %NAME% (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        farm_id INTEGER NOT NULL DEFAULT 1,
        name TEXT NOT NULL COLLATE NOCASE,
        category TEXT NOT NULL,
        unit TEXT NOT NULL,
        capacity REAL NOT NULL,
        reorder_level REAL NOT NULL DEFAULT 0,
        unit_cost REAL NOT NULL DEFAULT 0,
        baseline_qty REAL NOT NULL DEFAULT 0,
        baseline_at TEXT NOT NULL DEFAULT (${NOW_MS}),
        created_at TEXT NOT NULL DEFAULT (${NOW_MS}),
        UNIQUE (farm_id, name)
      )`;
    if (!tableExists(d, "inventory_items")) {
      d.exec(inventoryItems.replace("%NAME%", "inventory_items"));
    } else if (!columnExists(d, "inventory_items", "farm_id") || /name TEXT NOT NULL UNIQUE/i.test(tableSql(d, "inventory_items"))) {
      d.exec(inventoryItems.replace("%NAME%", "inventory_items_new"));
      d.exec(`
        INSERT INTO inventory_items_new (id, name, category, unit, capacity, reorder_level, unit_cost, baseline_qty, baseline_at, created_at)
        SELECT id, name, category, unit, capacity, reorder_level, unit_cost, baseline_qty, baseline_at, created_at FROM inventory_items;
        DROP TABLE inventory_items;
        ALTER TABLE inventory_items_new RENAME TO inventory_items;
      `);
    }

    d.exec(`
      CREATE INDEX IF NOT EXISTS idx_batches_farm ON batches(farm_id);
      CREATE INDEX IF NOT EXISTS idx_records_batch_date ON daily_records(batch_id, date);
      CREATE INDEX IF NOT EXISTS idx_transactions_farm_date ON transactions(farm_id, date);
      CREATE INDEX IF NOT EXISTS idx_meetings_farm_date ON meetings(farm_id, date);
      CREATE INDEX IF NOT EXISTS idx_memberships_farm ON memberships(farm_id);
    `);

    const hasFarms = Boolean(d.prepare("SELECT 1 FROM farms LIMIT 1").get());
    if (!hasFarms) {
      // Farm 1 holds earlier single-farm data, or the sample data on a new install.
      // The first person to sign up claims it.
      d.prepare(
        `INSERT INTO farms (id, name, location, type, established, code, join_code) VALUES (1, 'Farm 1', 'Ogun State, Nigeria', 'Mixed', '2020', ?, ?)`,
      ).run(newFarmCode(), newJoinCode());
      // Move farm-wide settings saved before farms existed.
      for (const key of ["ai", "monthly_revenue_target"]) {
        d.prepare("UPDATE OR IGNORE settings SET key = ? WHERE key = ?").run(`farm:1:${key}`, key);
      }
      if (brandNew) seedSampleFarm(d, 1);
    }

    d.exec("COMMIT");
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  } finally {
    d.exec("PRAGMA foreign_keys = ON");
  }
}
