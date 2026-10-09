import { getContext } from "@/lib/auth";
import { getAISettings } from "@/lib/settings";

// Voice/language preferences for the assistant panel (read-only; the AI page saves them).
export async function GET() {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const { voiceInput, speakReplies, language } = getAISettings(ctx.farm.id);
  return Response.json(
    { voiceInput, speakReplies, language, voiceServer: Boolean(process.env.ASR_BASE_URL), ttsServer: Boolean(process.env.TTS_BASE_URL) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
