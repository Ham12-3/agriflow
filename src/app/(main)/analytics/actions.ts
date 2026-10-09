"use server";

import { refresh } from "next/cache";
import { setRevenueTarget } from "@/lib/analytics";
import { authorize } from "@/lib/auth";


export async function setRevenueTargetAction(amount: number) {
  const ctx = await authorize("manager");
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) return;
  setRevenueTarget(ctx.farm.id, Math.round(amount));
  refresh();
}
