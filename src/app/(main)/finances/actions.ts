"use server";

import { refresh } from "next/cache";
import { isValidISODate, isoDaysAgo } from "@/lib/dates";
import { getBatch } from "@/lib/db";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/farm-data";
import { authorize } from "@/lib/auth";
import * as finances from "@/lib/finances";
import { guarded } from "@/lib/guard";

// Every action runs against the signed-in user's active farm; finances are
// for managers and owners.

export type ActionState = { ok: boolean; error?: string };

export async function addTransactionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded("manager", (ctx) => {
    const type = String(form.get("type"));
    const category = String(form.get("category") ?? "");
    const description = String(form.get("description") ?? "").trim().slice(0, 120);
    const date = String(form.get("date") ?? "");
    const amount = Number(form.get("amount"));
    const batchId = String(form.get("batchId") ?? "") || null;

    if (type !== "income" && type !== "expense") return { ok: false, error: "Pick income or expense." };
    const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    if (!categories.includes(category)) return { ok: false, error: "Pick a category." };
    if (!description) return { ok: false, error: "Add a short description." };
    if (!isValidISODate(date) || date > isoDaysAgo(-1)) {
      return { ok: false, error: "Pick a valid date that isn't in the future." };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, error: "Amount must be more than ₦0." };
    }
    if (batchId && !getBatch(ctx.farm.id, batchId)) return { ok: false, error: "That batch no longer exists." };

    finances.addTransaction(ctx.farm.id, { type, category, description, date, amount, batchId });
    refresh();
    return { ok: true };
  });
}

export async function deleteTransactionAction(id: number) {
  const ctx = await authorize("manager");
  if (!Number.isInteger(id)) return;
  finances.deleteTransaction(ctx.farm.id, id);
  refresh();
}
