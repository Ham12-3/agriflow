import "server-only";

import type { Context } from "./auth";
import { formatDay } from "./dates";
import { listBatches } from "./db";
import { listItems } from "./inventory";
import { listMeetings } from "./meetings";

// The bell menu: things on this farm that need a look, worked out live from
// Production, Inventory and Meetings (nothing to mark as read yet).

export type Notification = {
  id: string;
  kind: "alert" | "stock" | "meeting";
  tone: "bad" | "warn" | "info";
  title: string;
  detail: string;
  href: string;
};

export function getNotifications(ctx: Context): Notification[] {
  const farmId = ctx.farm.id;
  const out: Notification[] = [];

  for (const b of listBatches(farmId)) {
    if (b.status === "healthy") continue;
    out.push({
      id: `batch-${b.id}`,
      kind: "alert",
      tone: b.status === "critical" ? "bad" : "warn",
      title: `${b.id} is marked ${b.status}`,
      detail: `${b.species} · ${b.breed} · ${b.currentCount.toLocaleString("en-NG")} head`,
      href: `/production/${b.id}`,
    });
  }

  for (const i of listItems(farmId)) {
    if (!i.attentionReason) continue;
    out.push({
      id: `item-${i.id}`,
      kind: "stock",
      tone: i.attentionReason === "Below reorder level" ? "bad" : "warn",
      title: `${i.name}: ${i.attentionReason.toLowerCase()}`,
      detail:
        i.daysLeft !== null
          ? `${i.quantity.toLocaleString("en-NG")} ${i.unit} left · about ${Math.floor(i.daysLeft)} days`
          : `${i.quantity.toLocaleString("en-NG")} ${i.unit} left`,
      href: "/inventory",
    });
  }

  for (const m of listMeetings(farmId)) {
    if (m.status !== "upcoming") continue;
    out.push({
      id: `meeting-${m.id}`,
      kind: "meeting",
      tone: "info",
      title: m.title,
      detail: `${formatDay(m.date, { weekday: "short", day: "numeric", month: "short" })} at ${m.time}`,
      href: "/meetings",
    });
  }

  const order = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}
