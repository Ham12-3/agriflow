import "server-only";

import type { DatabaseSync } from "node:sqlite";
import { isoDaysAgo } from "./dates";

// Sample data for a brand-new install: a mixed broiler + dairy farm with a
// month of records, stock and about ten weeks of transactions (₦, 2026 prices).
// Runs inside the schema migration's transaction.

export function seedSampleFarm(d: DatabaseSync, farmId: number) {
  const addBatch = d.prepare(
    `INSERT INTO batches (id, farm_id, species, breed, category, initial_count, start_age_weeks, start_avg_weight_kg, status, date_added)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const addRecord = d.prepare(
    `INSERT INTO daily_records (batch_id, date, stock_level, feed_type, feed_intake_kg, weight_gain_kg, medication, mortality, recorded_by, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  // Broilers: 30 days of records, growing from ~0.9kg to ~2.2kg.
  addBatch.run("POU-001", farmId, "Poultry", "Ross 308", "Broiler", 7000, 1, 0.85, "healthy", isoDaysAgo(30));
  let stock = 7000;
  for (let day = 29; day >= 0; day--) {
    const mortality = day % 6 === 0 ? 3 : day % 4 === 0 ? 1 : 0;
    stock -= mortality;
    const feed = day > 14 ? "Starter Mash" : "Finisher Mash";
    const medication = day === 22 ? "Coryl SP" : day === 9 ? "Vitamin C" : null;
    addRecord.run(
      "POU-001", isoDaysAgo(day), stock, feed,
      Math.round(stock * (0.08 + (29 - day) * 0.004)),
      Number((0.042 + Math.sin(day / 2.5) * 0.004).toFixed(3)),
      medication, mortality, day % 2 ? "Jane" : "Musa",
      mortality > 2 ? "Removed weak birds" : "Normal",
    );
  }

  // Dairy cattle: a few recent records.
  addBatch.run("CAT-002", farmId, "Cattle", "Friesian", "Dairy", 120, 8, 455, "healthy", isoDaysAgo(10));
  for (let day = 2; day >= 0; day--) {
    addRecord.run(
      "CAT-002", isoDaysAgo(day), 120, "Dairy Pellets", 34 + day, 0.32 + day * 0.01,
      day === 2 ? "Oxytetracycline" : null, 0, "Admin",
      day === 2 ? "Pink eye case treated" : "Good condition",
    );
  }

  const addItem = d.prepare(
    `INSERT INTO inventory_items (farm_id, name, category, unit, capacity, reorder_level, unit_cost, baseline_qty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  addItem.run(farmId, "Finisher Mash", "Feed", "kg", 30000, 8000, 560, 9000);
  addItem.run(farmId, "Starter Mash", "Feed", "kg", 10000, 1500, 600, 2500);
  addItem.run(farmId, "Dairy Pellets", "Feed", "kg", 2000, 300, 420, 1150);
  addItem.run(farmId, "Broiler Chick", "Livestock", "units", 5000, 0, 950, 1000);
  addItem.run(farmId, "Coryl SP", "Medication", "sachets", 50, 10, 2500, 8);

  const addTx = d.prepare(
    `INSERT INTO transactions (farm_id, date, type, category, description, amount, batch_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const rows: [number, "income" | "expense", string, string, number, string | null][] = [
    [68, "income", "Livestock sales", "Sold 6,800 broilers (previous batch)", 37_400_000, null],
    [66, "expense", "Feed", "Finisher Mash, 12,000 kg", 6_480_000, null],
    [60, "expense", "Labour", "Monthly wages, 5 farmhands", 650_000, null],
    [30, "expense", "Livestock purchase", "7,000 Ross 308 day-old chicks", 6_650_000, "POU-001"],
    [30, "expense", "Feed", "Starter Mash, 8,000 kg", 4_800_000, "POU-001"],
    [29, "expense", "Medication & vet", "Gumboro + Newcastle vaccines", 180_000, "POU-001"],
    [30, "expense", "Labour", "Monthly wages, 5 farmhands", 650_000, null],
    [25, "expense", "Utilities", "Generator diesel", 95_000, null],
    [22, "expense", "Medication & vet", "Coryl SP and vitamins", 62_500, "POU-001"],
    [12, "income", "Manure sales", "Poultry manure, 40 bags", 85_000, null],
    [6, "expense", "Feed", "Finisher Mash, 10,000 kg", 5_600_000, "POU-001"],
    [5, "expense", "Feed", "Dairy Pellets, 1,000 kg", 420_000, "CAT-002"],
    [1, "expense", "Labour", "Monthly wages, 5 farmhands", 650_000, null],
    [3, "expense", "Medication & vet", "Vet visit, pink eye treatment", 45_000, "CAT-002"],
    [2, "expense", "Transport", "Milk delivery van fuel", 120_000, "CAT-002"],
  ];
  for (const week of [63, 56, 49, 42, 35, 28, 21, 14, 7, 0]) {
    rows.push([week, "income", "Milk sales", "Weekly milk sales to Ikeja collection centre", 2_050_000 + (week % 3) * 45_000, "CAT-002"]);
  }
  for (const [daysAgo, type, category, description, amount, batch] of rows) {
    addTx.run(farmId, isoDaysAgo(daysAgo), type, category, description, amount, batch);
  }
}
