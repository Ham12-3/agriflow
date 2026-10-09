"use server";

import { refresh } from "next/cache";
import { isValidISODate, isoDaysAgo } from "@/lib/dates";
import { authorize } from "@/lib/auth";
import { guarded } from "@/lib/guard";
import * as inventory from "@/lib/inventory";

// Every action runs against the signed-in user's active farm. Workers log
// deliveries and stock counts; managers add and remove items.

export type ActionState = { ok: boolean; error?: string };

function text(form: FormData, key: string, max = 60) {
  return String(form.get(key) ?? "").trim().slice(0, max);
}

// Returns null when blank, NaN when not a valid non-negative number.
function amount(form: FormData, key: string) {
  const raw = String(form.get(key) ?? "").trim();
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : NaN;
}

export async function createItemAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded("manager", (ctx) => {
    const name = text(form, "name");
    const category = text(form, "category");
    const unit = text(form, "unit", 20);
    const capacity = amount(form, "capacity");
    const quantity = amount(form, "quantity") ?? 0;
    const reorderLevel = amount(form, "reorderLevel") ?? 0;
    const unitCost = amount(form, "unitCost") ?? 0;

    if (!name || !unit) return { ok: false, error: "Name and unit are required." };
    if (!(inventory.INVENTORY_CATEGORIES as readonly string[]).includes(category)) {
      return { ok: false, error: "Pick a category." };
    }
    if (capacity === null || Number.isNaN(capacity) || capacity <= 0) {
      return { ok: false, error: "Storage capacity must be more than 0." };
    }
    if ([quantity, reorderLevel, unitCost].some(Number.isNaN)) {
      return { ok: false, error: "Quantities and cost must be positive numbers." };
    }
    if (inventory.itemNameExists(ctx.farm.id, name)) {
      return { ok: false, error: `"${name}" is already in your inventory.` };
    }

    inventory.createItem(ctx.farm.id, { name, category, unit, capacity, reorderLevel, unitCost, quantity });
    refresh();
    return { ok: true };
  });
}

export async function logDeliveryAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded("worker", (ctx) => {
    const itemId = Number(form.get("itemId"));
    const date = text(form, "date", 10);
    const quantity = amount(form, "quantity");
    const totalCost = amount(form, "totalCost") ?? 0;

    if (!Number.isInteger(itemId) || !inventory.itemExists(ctx.farm.id, itemId)) {
      return { ok: false, error: "Pick an item." };
    }
    if (!isValidISODate(date) || date > isoDaysAgo(-1)) {
      return { ok: false, error: "Pick a valid date that isn't in the future." };
    }
    if (quantity === null || Number.isNaN(quantity) || quantity <= 0) {
      return { ok: false, error: "Quantity delivered must be more than 0." };
    }
    if (Number.isNaN(totalCost)) return { ok: false, error: "Cost must be a positive number." };

    inventory.logDelivery(ctx.farm.id, {
      itemId,
      date,
      quantity,
      totalCost,
      supplier: text(form, "supplier") || null,
  });
  refresh();
  return { ok: true };
  });
}

export async function setStockCountAction(itemId: number, quantity: number) {
  const ctx = await authorize("worker");
  if (!Number.isFinite(quantity) || quantity < 0 || !inventory.itemExists(ctx.farm.id, itemId)) return;
  inventory.setStockCount(ctx.farm.id, itemId, quantity);
  refresh();
}

export async function deleteItemAction(itemId: number) {
  const ctx = await authorize("manager");
  inventory.deleteItem(ctx.farm.id, itemId);
  refresh();
}
