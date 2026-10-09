"use server";

import { refresh } from "next/cache";
import { authorize } from "@/lib/auth";
import { saveAISettings, type AISettings } from "@/lib/settings";

// Settings save as soon as they change; values are checked in saveAISettings.
export async function saveAISettingsAction(next: Partial<AISettings>): Promise<AISettings> {
  const ctx = await authorize("manager");
  const saved = saveAISettings(ctx.farm.id, next);
  refresh();
  return saved;
}
