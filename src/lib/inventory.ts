import "server-only";

import { isoDaysAgo } from "./dates";
import { getDb, transaction } from "./db";
import { recordDeliveryExpense } from "./finances";
import { getAISettings } from "./settings";

export { INVENTORY_CATEGORIES } from "./farm-data";

// Feed & inventory. Stock is never stored as a single running number:
//   current = last stock count + deliveries since − feed used since
// where "feed used" comes from Production daily records (in the same farm)
// whose feed type matches the item name. Logging or deleting a daily record
// therefore updates stock automatically, and a physical count resets the baseline.

const USAGE_WINDOW_DAYS = 14;

// Millisecond timestamps keep "after the count" comparisons exact.
const NOW_MS = "strftime('%Y-%m-%d %H:%M:%f','now')";

const db = getDb;

export type InventoryItem = {
  id: number;
  name: string;
  category: string;
  unit: string;
  capacity: number;
  reorderLevel: number;
  unitCost: number;
  quantity: number;
  avgDailyUsage: number | null;
  daysLeft: number | null;
  runsOutOn: string | null; // YYYY-MM-DD, farm time
  needsAttention: boolean;
  attentionReason: string | null;
};

type ItemRow = {
  id: number;
  name: string;
  category: string;
  unit: string;
  capacity: number;
  reorder_level: number;
  unit_cost: number;
  baseline_qty: number;
  delivered: number;
  used: number;
  recent_usage: number;
  usage_days: number;
};

// Feed usage only applies to feed measured in kg (daily records log kg), from
// batches on the same farm.
const FEED_MATCH = `i.category = 'Feed' AND i.unit = 'kg' COLLATE NOCASE
  AND r.feed_type = i.name COLLATE NOCASE
  AND r.batch_id IN (SELECT id FROM batches WHERE farm_id = i.farm_id)`;

const ITEM_SELECT = `
  SELECT i.*,
    COALESCE((SELECT SUM(quantity) FROM inventory_deliveries d
       WHERE d.item_id = i.id AND d.created_at > i.baseline_at), 0) AS delivered,
    COALESCE((SELECT SUM(feed_intake_kg) FROM daily_records r
       WHERE ${FEED_MATCH} AND r.created_at > i.baseline_at), 0) AS used,
    COALESCE((SELECT SUM(feed_intake_kg) FROM daily_records r
       WHERE ${FEED_MATCH} AND r.date >= ?), 0) AS recent_usage,
    (SELECT COUNT(DISTINCT r.date) FROM daily_records r
       WHERE ${FEED_MATCH} AND r.date >= ?) AS usage_days
  FROM inventory_items i`;

// Items run out "soon" when fewer than `horizonDays` of stock remain (the
// InsightEngine "predictive horizon" on the AI page).
function toItem(row: ItemRow, horizonDays: number): InventoryItem {
  const quantity = Math.max(0, row.baseline_qty + row.delivered - row.used);
  const avgDailyUsage = row.usage_days > 0 ? row.recent_usage / row.usage_days : null;
  const daysLeft = avgDailyUsage ? quantity / avgDailyUsage : null;

  let attentionReason: string | null = null;
  if (quantity <= row.reorder_level) attentionReason = "Below reorder level";
  else if (daysLeft !== null && daysLeft < horizonDays) attentionReason = "Running out soon";

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    unit: row.unit,
    capacity: row.capacity,
    reorderLevel: row.reorder_level,
    unitCost: row.unit_cost,
    quantity: Number(quantity.toFixed(2)),
    avgDailyUsage: avgDailyUsage === null ? null : Number(avgDailyUsage.toFixed(1)),
    daysLeft: daysLeft === null ? null : Number(daysLeft.toFixed(1)),
    runsOutOn: daysLeft === null ? null : isoDaysAgo(-Math.floor(daysLeft)),
    needsAttention: attentionReason !== null,
    attentionReason,
  };
}

export function listItems(farmId: number): InventoryItem[] {
  const since = isoDaysAgo(USAGE_WINDOW_DAYS - 1);
  const rows = db()
    .prepare(`${ITEM_SELECT} WHERE i.farm_id = ? ORDER BY i.category, i.name`)
    .all(since, since, farmId) as ItemRow[];
  const horizon = getAISettings(farmId).predictiveHorizonDays;
  return rows.map((r) => toItem(r, horizon));
}

export function itemNameExists(farmId: number, name: string) {
  return Boolean(db().prepare("SELECT 1 FROM inventory_items WHERE farm_id = ? AND name = ?").get(farmId, name));
}

export function itemExists(farmId: number, id: number) {
  return Boolean(db().prepare("SELECT 1 FROM inventory_items WHERE farm_id = ? AND id = ?").get(farmId, id));
}

export type NewItem = {
  name: string;
  category: string;
  unit: string;
  capacity: number;
  reorderLevel: number;
  unitCost: number;
  quantity: number;
};

// "KG", "kgs", "Kilograms" → "kg", so daily feed records deduct stock.
export function normalizeUnit(unit: string) {
  const u = unit.trim();
  return /^(kgs?|kilo(gram)?s?)$/i.test(u) ? "kg" : u;
}

export function createItem(farmId: number, i: NewItem) {
  db()
    .prepare(
      `INSERT INTO inventory_items (farm_id, name, category, unit, capacity, reorder_level, unit_cost, baseline_qty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(farmId, i.name, i.category, normalizeUnit(i.unit), i.capacity, i.reorderLevel, i.unitCost, i.quantity);
}

export function deleteItem(farmId: number, id: number) {
  db().prepare("DELETE FROM inventory_items WHERE farm_id = ? AND id = ?").run(farmId, id);
}

// A physical stock count: becomes the new baseline for future usage/deliveries.
export function setStockCount(farmId: number, id: number, quantity: number) {
  db()
    .prepare(`UPDATE inventory_items SET baseline_qty = ?, baseline_at = ${NOW_MS} WHERE farm_id = ? AND id = ?`)
    .run(quantity, farmId, id);
}

// Locks in current feed stock as a fresh baseline. Called before deleting a
// batch, whose cascading record delete would otherwise "un-eat" its feed.
export function rebaselineFeedItems(farmId: number) {
  const items = listItems(farmId).filter((i) => i.category === "Feed");
  const update = db().prepare(`UPDATE inventory_items SET baseline_qty = ?, baseline_at = ${NOW_MS} WHERE id = ?`);
  transaction(() => {
    for (const i of items) update.run(i.quantity, i.id);
  });
}

export function logDelivery(
  farmId: number,
  d: { itemId: number; date: string; quantity: number; totalCost: number; supplier: string | null },
) {
  const conn = db();
  transaction(() => {
    const item = conn
      .prepare("SELECT name, category, unit FROM inventory_items WHERE farm_id = ? AND id = ?")
      .get(farmId, d.itemId) as { name: string; category: string; unit: string } | undefined;
    if (!item) throw new Error("Item not found");
    conn
      .prepare(
        `INSERT INTO inventory_deliveries (item_id, date, quantity, total_cost, supplier)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(d.itemId, d.date, d.quantity, d.totalCost, d.supplier);
    // The latest delivery sets the going unit price, and the cost is booked
    // as an expense in Finances.
    if (d.totalCost > 0) {
      conn.prepare("UPDATE inventory_items SET unit_cost = ? WHERE id = ?").run(d.totalCost / d.quantity, d.itemId);
      recordDeliveryExpense(farmId, {
        date: d.date,
        itemCategory: item.category,
        description: `${item.name}, ${d.quantity.toLocaleString("en-NG")} ${item.unit} delivered${d.supplier ? ` (${d.supplier})` : ""}`,
        amount: d.totalCost,
      });
    }
  });
}

export function feedItemNames(farmId: number): string[] {
  const rows = db()
    .prepare("SELECT name FROM inventory_items WHERE farm_id = ? AND category = 'Feed' ORDER BY name")
    .all(farmId) as { name: string }[];
  return rows.map((r) => r.name);
}
