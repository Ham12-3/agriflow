import { getContext } from "@/lib/auth";
import { isLanguage } from "@/lib/languages";

// AgriTalk voice input: forwards a recording to an OpenAI-compatible
// speech-to-text server (the local `npm run asr` server, or a hosted one).

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  if (!(await getContext())) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const baseURL = process.env.ASR_BASE_URL?.trim().replace(/\/+$/, "");
  if (!baseURL) {
    return Response.json(
      { error: "Voice transcription isn't set up. Run `npm run asr` and set ASR_BASE_URL.", fallback: "browser" },
      { status: 503 },
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const language = form?.get("language");
  if (!(file instanceof Blob) || file.size === 0) {
    return Response.json({ error: "No audio received." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "That recording is too long." }, { status: 413 });
  }
  if (!file.type.startsWith("audio/") && !file.type.startsWith("video/webm")) {
    return Response.json({ error: "Unsupported audio format." }, { status: 415 });
  }

  const upstream = new FormData();
  upstream.append("file", file, `speech.${file.type.includes("ogg") ? "ogg" : file.type.includes("wav") ? "wav" : "webm"}`);
  upstream.append("language", isLanguage(language) ? language : "en");
  upstream.append("model", process.env.ASR_MODEL ?? "whisper-1");

  try {
    const res = await fetch(`${baseURL}/audio/transcriptions`, {
      method: "POST",
      body: upstream,
      headers: process.env.ASR_API_KEY ? { Authorization: `Bearer ${process.env.ASR_API_KEY}` } : undefined,
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      console.error("ASR error", res.status, await res.text().catch(() => ""));
      return Response.json(
        { error: res.status === 503 ? "The voice model is starting up. Try again in a moment." : "Couldn't transcribe that. Please try again." },
        { status: 502 },
      );
    }
    const { text } = (await res.json()) as { text?: string };
    return Response.json({ text: (text ?? "").trim() });
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: "The voice server isn't reachable. Is `npm run asr` running?", fallback: "browser" },
      { status: 503 },
    );
  }
}
