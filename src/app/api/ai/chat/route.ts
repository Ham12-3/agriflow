import {
  AIConfigError,
  AIWarmingUpError,
  buildSystemPrompt,
  streamChatCompletion,
  type ChatMessage,
  type LanguageCode,
} from "@/lib/ai/natlas";
import { getDashboardData, summarizeForAI } from "@/lib/dashboard";
import { isLanguage } from "@/lib/languages";
import { getAISettings } from "@/lib/settings";
import { getContext } from "@/lib/auth";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_MESSAGES = 50;

function parseBody(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const { messages, language } = body as {
    messages?: unknown;
    language?: unknown;
  };
  if (!Array.isArray(messages) || messages.length === 0) return null;
  // Older turns are dropped by trimHistory; this just bounds the request size.
  const recent = messages.slice(-MAX_MESSAGES);

  const clean: ChatMessage[] = [];
  for (const m of recent) {
    if (
      !m ||
      (m.role !== "user" && m.role !== "assistant") ||
      typeof m.content !== "string"
    ) {
      return null;
    }
    clean.push({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LENGTH) });
  }

  const lang: LanguageCode | null = isLanguage(language) ? language : null;
  return { messages: clean, language: lang };
}

export async function POST(request: Request) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const parsed = parseBody(await request.json().catch(() => null));
  if (!parsed) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    // Farm context is loaded on the server so the client can't spoof it.
    const language = parsed.language ?? getAISettings(ctx.farm.id).language;
    const systemPrompt = buildSystemPrompt(summarizeForAI(getDashboardData(ctx)), language);
    const stream = await streamChatCompletion(
      parsed.messages,
      systemPrompt,
      request.signal,
    );
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof AIConfigError || err instanceof AIWarmingUpError) {
      return Response.json({ error: err.message }, { status: 503 });
    }
    console.error(err);
    return Response.json(
      { error: "The AI assistant is unavailable right now. Please try again." },
      { status: 502 },
    );
  }
}
