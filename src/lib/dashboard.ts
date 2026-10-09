import "server-only";

import { listBatches, listRecords, weightTrendByBatch } from "./db";
import { listItems } from "./inventory";
import { farmCharts } from "./analytics";
import { hasRole, type Context } from "./auth";
import { todayISO } from "./dates";
import { countByStatus } from "./farm-data";
import { monthToDate } from "./finances";

export function getDashboardData(ctx: Context) {
  const farmId = ctx.farm.id;
  // Money is for managers and owners (as on the Finances page).
  const seesMoney = hasRole(ctx, "manager");
  return {
    farm: ctx.farm,
    user: ctx.user,
    finances: seesMoney ? monthToDate(farmId) : null,
    batches: listBatches(farmId),
    weightSeries: weightTrendByBatch(farmId, 30),
    farmCharts: farmCharts(farmId).filter((c) => seesMoney || c.key !== "revenue"),
    asOf: todayISO(),
  };
}

export type DashboardData = ReturnType<typeof getDashboardData>;

// Compact plain-text summary used to ground the AI assistant in this farm's data.
export function summarizeForAI(data: DashboardData) {
  const { farm, finances, batches, asOf } = data;
  const counts = countByStatus(batches);

  // N-ATLaS has ~8K tokens of context, so cap how many batches are described.
  const batchLines = batches.slice(0, 15).map((b) => {
    const recent = listRecords(b.id)
      .slice(0, 3)
      .map(
        (r) =>
          `    ${r.date}: stock ${r.stockLevel}, feed ${r.feedIntakeKg}kg ${r.feedType}, gain ${r.weightGainKg}kg, mortality ${r.mortality}${r.medication ? `, medication ${r.medication}` : ""}${r.notes ? `, notes "${r.notes}"` : ""}`,
      )
      .join("\n");
    return [
      `- ${b.id}: ${b.currentCount} ${b.species} (${b.breed}, ${b.category}), ${b.ageWeeks} weeks old, avg weight ${b.avgWeightKg ?? "unknown"}kg, total mortality ${b.totalMortality}, status ${b.status}`,
      recent ? `  Latest daily records:\n${recent}` : "  No daily records yet.",
    ].join("\n");
  });

  return [
    `Farm: ${farm.name} (${farm.location}). Data as of ${asOf}.`,
    finances
      ? `This month so far: revenue ₦${finances.revenue.toLocaleString("en-NG")}, expenses ₦${finances.expenses.toLocaleString("en-NG")}, net profit ₦${(finances.revenue - finances.expenses).toLocaleString("en-NG")}.`
      : "Finances: not shared with this user (worker role). If asked about money, say only managers can see it.",
    `Batch health: ${counts.healthy} healthy, ${counts.warning} warning, ${counts.critical} critical.`,
    `Active batches:\n${batchLines.join("\n") || "None"}`,
    `Inventory:\n${inventoryLines(farm.id) || "No items tracked."}`,
  ].join("\n");
}

function inventoryLines(farmId: number) {
  return listItems(farmId)
    .slice(0, 15)
    .map((i) => {
      const runway =
        i.daysLeft !== null
          ? `, about ${Math.floor(i.daysLeft)} days left at ${i.avgDailyUsage} ${i.unit}/day`
          : "";
      const flag = i.attentionReason ? ` — ${i.attentionReason.toUpperCase()}` : "";
      return `- ${i.name} (${i.category}): ${i.quantity} of ${i.capacity} ${i.unit} in stock${runway}${flag}`;
    })
    .join("\n");
}
