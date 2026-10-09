"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { authorize } from "@/lib/auth";
import { isValidISODate, isoDaysAgo } from "@/lib/dates";
import * as db from "@/lib/db";
import { BATCH_STATUSES, type BatchStatus } from "@/lib/farm-data";
import { guarded, type FormResult } from "@/lib/guard";
import { rebaselineFeedItems } from "@/lib/inventory";

// Every action runs against the signed-in user's active farm (see guard.ts).
// Workers log records; managers and owners create and delete batches.

export type ActionState = FormResult;

function text(form: FormData, key: string, max = 80) {
  const value = String(form.get(key) ?? "").trim();
  return value.slice(0, max);
}

function number(form: FormData, key: string, { min = 0, integer = false } = {}) {
  const raw = String(form.get(key) ?? "").trim();
  if (raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || (integer && !Number.isInteger(value))) {
    return NaN;
  }
  return value;
}

export async function createBatchAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded("manager", (ctx) => {
    const species = text(form, "species");
    const breed = text(form, "breed");
    const category = text(form, "category");
    const count = number(form, "count", { min: 1, integer: true });
    const ageWeeks = number(form, "ageWeeks", { integer: true });
    const avgWeightKg = number(form, "avgWeightKg");
    const status = text(form, "status") as BatchStatus;

    if (!species || !breed || !category) {
      return { ok: false, error: "Species, breed and category are required." };
    }
    if (count === null || Number.isNaN(count)) {
      return { ok: false, error: "Count must be a whole number of at least 1." };
    }
    if (ageWeeks === null || Number.isNaN(ageWeeks)) {
      return { ok: false, error: "Age must be a whole number of weeks." };
    }
    if (Number.isNaN(avgWeightKg)) {
      return { ok: false, error: "Average weight must be a positive number." };
    }
    if (!BATCH_STATUSES.includes(status)) return { ok: false, error: "Pick a status." };

    db.createBatch(ctx.farm.id, ctx.farm.code, { species, breed, category, count, ageWeeks, avgWeightKg, status });
    refresh();
    return { ok: true, savedAt: Date.now() };
  });
}

// Shown in the New Batch dialog before saving.
export async function previewBatchIdAction(species: string) {
  const ctx = await authorize("manager");
  return db.nextBatchId(ctx.farm.id, ctx.farm.code, species || "Batch");
}

export async function deleteBatchAction(batchId: string) {
  const ctx = await authorize("manager");
  // Keep the feed this batch ate counted as used once its records are gone.
  rebaselineFeedItems(ctx.farm.id);
  db.deleteBatch(ctx.farm.id, batchId);
  redirect("/production");
}

export async function setBatchStatusAction(batchId: string, status: BatchStatus) {
  const ctx = await authorize("worker");
  if (!BATCH_STATUSES.includes(status)) return;
  db.setBatchStatus(ctx.farm.id, batchId, status);
  refresh();
}

export async function addRecordAction(batchId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded("worker", (ctx) => {
    if (!db.getBatch(ctx.farm.id, batchId)) return { ok: false, error: "Batch not found." };

    const date = text(form, "date", 10);
    const feedType = text(form, "feedType");
    const recordedBy = text(form, "recordedBy") || ctx.user.name;
    const stockLevel = number(form, "stockLevel", { integer: true });
    const feedIntakeKg = number(form, "feedIntakeKg");
    const weightGainKg = number(form, "weightGainKg", { min: -50 });
    const mortality = number(form, "mortality", { integer: true }) ?? 0;

    // One day of slack for farmers in timezones ahead of WAT.
    if (!isValidISODate(date) || date > isoDaysAgo(-1)) {
      return { ok: false, error: "Pick a valid date that isn't in the future." };
    }
    if (!feedType) return { ok: false, error: "Feed type is required." };
    if (stockLevel === null || Number.isNaN(stockLevel)) {
      return { ok: false, error: "Stock level must be a whole number." };
    }
    if (feedIntakeKg === null || Number.isNaN(feedIntakeKg)) {
      return { ok: false, error: "Feed intake must be a number of kg." };
    }
    if (weightGainKg === null || Number.isNaN(weightGainKg) || weightGainKg > 50) {
      return { ok: false, error: "Daily weight gain must be a number of kg." };
    }
    if (Number.isNaN(mortality)) return { ok: false, error: "Mortality must be a whole number." };

    db.addRecord(batchId, {
      date,
      stockLevel,
      feedType,
      feedIntakeKg,
      weightGainKg,
      mortality,
      recordedBy,
      medication: text(form, "medication") || null,
      notes: text(form, "notes", 200) || null,
    });
    refresh();
    return { ok: true, savedAt: Date.now() };
  });
}

export async function deleteRecordAction(batchId: string, recordId: number) {
  const ctx = await authorize("manager");
  if (!db.getBatch(ctx.farm.id, batchId)) return;
  db.deleteRecord(batchId, recordId);
  refresh();
}
