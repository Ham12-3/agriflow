import "server-only";

import { getDb } from "./db";
import { isReplyLanguage, type ReplyLanguage } from "./languages";
import { DEFAULT_VOICES, sanitizeVoices, type VoiceChoice } from "./voices";

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
  language: ReplyLanguage; // farm default for reply language; each person can pick their own
  voices: VoiceChoice; // YarnGPT voice for each language
  // InsightEngine thresholds
  feedVarianceTolerancePct: number; // flag a day's feed this far from the 7-day average
  predictiveHorizonDays: number; // warn when stock runs out within this many days
};

export const AI_DEFAULTS: AISettings = {
  voiceInput: true,
  language: "auto",
  voices: DEFAULT_VOICES,
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

// Each person's own reply language, picked in the chat; falls back to the farm default.
const userKey = (userId: number) => `user:${userId}:replyLanguage`;

export function getReplyLanguage(userId: number, farmId: number): ReplyLanguage {
  const own = getSetting<unknown>(userKey(userId), null);
  return isReplyLanguage(own) ? own : getAISettings(farmId).language;
}

export function saveReplyLanguage(userId: number, language: ReplyLanguage) {
  setSetting(userKey(userId), language);
}

function sanitize(s: AISettings): AISettings {
  return {
    voiceInput: Boolean(s.voiceInput),
    language: isReplyLanguage(s.language) ? s.language : AI_DEFAULTS.language,
    voices: sanitizeVoices(s.voices),
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
