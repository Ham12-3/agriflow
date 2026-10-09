"use server";

import { refresh } from "next/cache";
import { authorize } from "@/lib/auth";
import { isValidISODate, todayISO } from "@/lib/dates";
import { guarded, type FormResult } from "@/lib/guard";
import { createMeeting, deleteMeeting } from "@/lib/meetings";

export async function scheduleMeetingAction(_prev: FormResult, form: FormData): Promise<FormResult> {
  return guarded("manager", (ctx) => {
    const title = String(form.get("title") ?? "").trim().slice(0, 80);
    const date = String(form.get("date") ?? "");
    const time = String(form.get("time") ?? "");
    const agenda = String(form.get("agenda") ?? "").trim().slice(0, 1000);
    const attendeeIds = form.getAll("attendees").map(Number).filter(Number.isInteger);

    if (!title) return { ok: false, error: "Give the meeting a title." };
    if (!isValidISODate(date)) return { ok: false, error: "Pick a date." };
    if (date < todayISO()) return { ok: false, error: "Pick today or a later date." };
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, error: "Pick a time." };

    createMeeting(ctx.farm.id, ctx.user.id, { title, date, time, agenda, attendeeIds });
    refresh();
    return { ok: true, savedAt: Date.now() };
  });
}

export async function deleteMeetingAction(id: number) {
  const ctx = await authorize("manager");
  deleteMeeting(ctx.farm.id, id);
  refresh();
}
