import { getContext } from "@/lib/auth";
import { isReplyLanguage } from "@/lib/languages";
import { getAISettings, getReplyLanguage, saveReplyLanguage } from "@/lib/settings";

// The assistant's preferences for the signed-in person.
export async function GET() {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Please sign in again." }, { status: 401 });
  return Response.json(
    {
      voiceInput: getAISettings(ctx.farm.id).voiceInput,
      language: getReplyLanguage(ctx.user.id, ctx.farm.id),
      voiceServer: Boolean(process.env.ASR_BASE_URL),
      ttsServer: Boolean(process.env.TTS_BASE_URL),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// Saves the reply language picked in the chat (anyone can choose their own).
export async function PATCH(request: Request) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { language?: unknown } | null;
  if (!isReplyLanguage(body?.language)) return Response.json({ error: "Unknown language." }, { status: 400 });
  saveReplyLanguage(ctx.user.id, body.language);
  return Response.json({ language: body.language });
}
