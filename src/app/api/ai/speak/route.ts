import { getContext } from "@/lib/auth";
import { isLanguage } from "@/lib/languages";

// Spoken replies: forwards one short chunk of an answer to the YarnGPT
// text-to-speech server (`npm run tts`) and returns the audio. The client
// splits long answers into chunks and plays them in order.

const MAX_CHARS = 400; // ~60 words, the TTS server's per-request limit

export async function POST(request: Request) {
  if (!(await getContext())) return Response.json({ error: "Please sign in again." }, { status: 401 });

  const baseURL = process.env.TTS_BASE_URL?.trim().replace(/\/+$/, "");
  if (!baseURL) {
    return Response.json({ error: "Spoken replies aren't set up. Run `npm run tts` and set TTS_BASE_URL.", fallback: "browser" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { text?: unknown; language?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return Response.json({ error: "Nothing to say." }, { status: 400 });
  if (text.length > MAX_CHARS) return Response.json({ error: "Send shorter chunks." }, { status: 413 });
  const language = isLanguage(body?.language) ? body.language : "en";

  try {
    const res = await fetch(`${baseURL}/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: text, language, voice: process.env[`TTS_VOICE_${language.toUpperCase()}`] }),
      // A CPU can take a minute or more for a long sentence.
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(180_000)]),
    });
    if (!res.ok || !res.body) {
      console.error("TTS error", res.status, await res.text().catch(() => ""));
      return Response.json({ error: "Couldn't speak that. Please try again.", fallback: "browser" }, { status: 502 });
    }
    return new Response(res.body, {
      headers: { "Content-Type": res.headers.get("Content-Type") ?? "audio/wav", "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error(err);
    return Response.json({ error: "The voice server isn't reachable. Is `npm run tts` running?", fallback: "browser" }, { status: 503 });
  }
}
