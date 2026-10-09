import { AIConfigError, AIWarmingUpError, streamChatCompletion, translationPrompt } from "@/lib/ai/natlas";
import { getContext } from "@/lib/auth";
import { isLanguage } from "@/lib/languages";

// Rewrites one assistant reply in another language (streams plain text).
const MAX_CHARS = 4000;

export async function POST(request: Request) {
  if (!(await getContext())) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { text?: unknown; to?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || !isLanguage(body?.to)) return Response.json({ error: "Invalid request body." }, { status: 400 });
  if (text.length > MAX_CHARS) return Response.json({ error: "That reply is too long to translate." }, { status: 413 });

  try {
    const stream = await streamChatCompletion(translationPrompt(text, body.to), null, request.signal);
    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof AIConfigError || err instanceof AIWarmingUpError) {
      return Response.json({ error: err.message }, { status: 503 });
    }
    console.error(err);
    return Response.json({ error: "Couldn't translate that right now. Please try again." }, { status: 502 });
  }
}
