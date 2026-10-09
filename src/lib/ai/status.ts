import "server-only";

import { getConfig } from "./natlas";

export type ServiceStatus = {
  state: "online" | "offline" | "not-configured";
  detail: string;
};

const TIMEOUT_MS = 3000;

export async function checkModelStatus(): Promise<ServiceStatus> {
  let cfg: ReturnType<typeof getConfig>;
  try {
    cfg = getConfig();
  } catch {
    return { state: "not-configured", detail: "Set LLM_BASE_URL and LLM_MODEL in .env.local" };
  }
  try {
    const res = await fetch(`${cfg.baseURL}/models`, {
      headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 503) return { state: "offline", detail: "Starting up (scaled to zero)" };
    if (!res.ok) return { state: "offline", detail: `Server replied ${res.status}` };
    return { state: "online", detail: cfg.model };
  } catch {
    return { state: "offline", detail: `Can't reach ${new URL(cfg.baseURL).host}` };
  }
}

export async function checkVoiceStatus(): Promise<ServiceStatus> {
  const base = process.env.ASR_BASE_URL?.trim();
  if (!base) return { state: "not-configured", detail: "Using your browser's speech recognition" };
  try {
    const res = await fetch(new URL("/health", base), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    // Any HTTP reply means the server is up; ours also reports its engine.
    const info = res.ok ? ((await res.json().catch(() => null)) as { engine?: string; whisper_model?: string } | null) : null;
    const engine =
      info?.engine === "n-atlas"
        ? "N-ATLaS speech models"
        : info?.engine === "whisper"
          ? `Whisper ${info.whisper_model ?? ""}`.trim()
          : "Speech server";
    return { state: "online", detail: engine };
  } catch {
    return { state: "offline", detail: "Voice server not running — start it with npm run asr" };
  }
}

export async function checkSpeechStatus(): Promise<ServiceStatus> {
  const base = process.env.TTS_BASE_URL?.trim();
  if (!base) return { state: "not-configured", detail: "Using your device's voice" };
  try {
    const res = await fetch(new URL("/health", base), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return { state: "offline", detail: `Server replied ${res.status}` };
    return { state: "online", detail: "Nigerian voices in English, Hausa, Igbo and Yoruba" };
  } catch {
    return { state: "offline", detail: "Voice server not running — start it with npm run tts" };
  }
}
