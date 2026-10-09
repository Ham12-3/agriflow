import "server-only";

import { getDb } from "./db";
import { isLanguage, type LanguageCode } from "./languages";

// Small key/value store for settings (JSON values). Farm settings use
// farmKey(farmId, name) so each farm has its own.

const db = getDb;

export const farmKey = (farmId: number, name: string) => `farm:${farmId}:${name}`;

export function getSetting<T>(key: string, fallback: T): T {
  const row = db().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function setSetting(key: string, value: unknown) {
  db()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, JSON.stringify(value));
}

export function deleteSetting(key: string) {
  db().prepare("DELETE FROM settings WHERE key = ?").run(key);
}

// ---------- AI settings (AI page) ----------

export type AISettings = {
  voiceInput: boolean; // AgriTalk: microphone button in the assistant
  speakReplies: boolean; // read answers aloud
  language: LanguageCode; // default reply / speech language
  // InsightEngine thresholds
  feedVarianceTolerancePct: number; // flag a day's feed this far from the 7-day average
  predictiveHorizonDays: number; // warn when stock runs out within this many days
};

export const AI_DEFAULTS: AISettings = {
  voiceInput: true,
  speakReplies: false,
  language: "en",
  feedVarianceTolerancePct: 10,
  predictiveHorizonDays: 14,
};

export const AI_LIMITS = {
  feedVarianceTolerancePct: { min: 5, max: 50 },
  predictiveHorizonDays: { min: 3, max: 30 },
};

const clamp = (n: number, { min, max }: { min: number; max: number }) =>
  Math.min(max, Math.max(min, Math.round(n)));

export function getAISettings(farmId: number): AISettings {
  const saved = getSetting<Partial<AISettings>>(farmKey(farmId, "ai"), {});
  return sanitize({ ...AI_DEFAULTS, ...saved });
}

export function saveAISettings(farmId: number, next: Partial<AISettings>) {
  const merged = sanitize({ ...getAISettings(farmId), ...next });
  setSetting(farmKey(farmId, "ai"), merged);
  return merged;
}

function sanitize(s: AISettings): AISettings {
  return {
    voiceInput: Boolean(s.voiceInput),
    speakReplies: Boolean(s.speakReplies),
    language: isLanguage(s.language) ? s.language : AI_DEFAULTS.language,
    feedVarianceTolerancePct: clamp(
      Number(s.feedVarianceTolerancePct) || AI_DEFAULTS.feedVarianceTolerancePct,
      AI_LIMITS.feedVarianceTolerancePct,
    ),
    predictiveHorizonDays: clamp(
      Number(s.predictiveHorizonDays) || AI_DEFAULTS.predictiveHorizonDays,
      AI_LIMITS.predictiveHorizonDays,
    ),
  };
}
