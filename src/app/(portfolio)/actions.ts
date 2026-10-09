"use server";

import { redirect } from "next/navigation";
import { getContext, setActiveFarm } from "@/lib/auth";
import { createFarm } from "@/lib/farms";
import type { FormResult } from "@/lib/guard";

const FARM_TYPES = ["Mixed", "Poultry", "Cattle", "Dairy", "Goat & sheep", "Piggery", "Fish"];

export async function createFarmAction(_prev: FormResult, form: FormData): Promise<FormResult> {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const location = String(form.get("location") ?? "").trim().slice(0, 80);
  const type = String(form.get("type") ?? "Mixed");
  const established = String(form.get("established") ?? "").trim();

  if (!name) return { ok: false, error: "Give the farm a name." };
  if (!FARM_TYPES.includes(type)) return { ok: false, error: "Pick a farm type." };
  const year = Number(established);
  if (established && (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear())) {
    return { ok: false, error: "Enter the year the farm was established, e.g. 2018." };
  }

  // The creator owns the new farm; switch straight into it.
  const farmId = createFarm(ctx.user.id, { name, location, type, established: established || null });
  await setActiveFarm(farmId);
  redirect("/");
}
