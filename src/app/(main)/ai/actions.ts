"use server";

import { refresh } from "next/cache";
import { authorize } from "@/lib/auth";
import { isLanguage } from "@/lib/languages";
import { saveAISettings, type AISettings } from "@/lib/settings";


export async function saveAISettingsAction(form: FormData): Promise<AISettings> {
  const ctx = await authorize("manager");
  const language = form.get("language");
  const saved = saveAISettings(ctx.farm.id, {
    voiceInput: form.get("voiceInput") === "on",
    speakReplies: form.get("speakReplies") === "on",
    ...(isLanguage(language) ? { language } : {}),
    feedVarianceTolerancePct: Number(form.get("feedVarianceTolerancePct")),
    predictiveHorizonDays: Number(form.get("predictiveHorizonDays")),
  });
  refresh();
  return saved;
}
