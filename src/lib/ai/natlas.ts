import "server-only";

// Client for N-ATLaS (NCAIR1/N-ATLaS, a Llama-3 8B fine-tune for English,
// Hausa, Igbo and Yoruba). N-ATLaS has no official hosted API, so this talks to
// any OpenAI-compatible server that is serving it: vLLM, TGI / HF Inference
// Endpoints, Ollama (GGUF build), or a third-party host. Configure via env.

import { LANGUAGES, detectLanguage, type LanguageCode, type ReplyLanguage } from "@/lib/languages";

export { LANGUAGES, type LanguageCode };

export type ChatMessage = { role: "user" | "assistant"; content: string };

export class AIConfigError extends Error {}

// The model server is starting up (e.g. a Hugging Face Inference Endpoint
// that scaled to zero and is waking up). Worth retrying in a minute.
export class AIWarmingUpError extends Error {}

export function getConfig() {
  let baseURL = process.env.LLM_BASE_URL?.trim().replace(/\/+$/, "");
  const model = process.env.LLM_MODEL?.trim();
  if (!baseURL || !model) {
    throw new AIConfigError(
      "N-ATLaS is not configured. Set LLM_BASE_URL and LLM_MODEL in .env.local.",
    );
  }
  // Hugging Face Inference Endpoints serve the OpenAI-compatible API under /v1;
  // accept the bare endpoint URL as copied from the dashboard.
  if (baseURL.includes(".endpoints.huggingface.cloud") && !baseURL.endsWith("/v1")) {
    baseURL += "/v1";
  }
  const repetitionPenalty = process.env.LLM_REPETITION_PENALTY;
  return {
    baseURL,
    model,
    // Ollama gets its native API, which can keep the model loaded between
    // questions (its OpenAI-style API unloads it after 5 idle minutes).
    ollama: process.env.LLM_PROVIDER === "ollama" || /:11434(\/|$)/.test(baseURL),
    keepAlive: process.env.LLM_KEEP_ALIVE ?? "60m",
    apiKey: process.env.LLM_API_KEY || process.env.HF_TOKEN,
    repetitionPenalty: repetitionPenalty ? Number(repetitionPenalty) : undefined,
  };
}

// The system prompt holds no per-question details (like the reply language),
// so the model server can reuse its work on it between questions.
export function buildSystemPrompt(farmSummary: string) {
  return [
    "You are Agriflow AI, a friendly assistant for livestock farmers in Nigeria, built on N-ATLaS.",
    "You help with farm records, feed, growth, finances and day-to-day livestock management.",
    "Use simple words a busy farmer can follow. Keep answers short and practical: 2 to 5 sentences unless the farmer asks for more detail.",
    "You understand English, Hausa, Igbo and Yoruba, and reply in the language you are asked to.",
    "Use only the farm data below for numbers about this farm, and copy each number exactly as written there, in digits. If the data does not answer the question, say so instead of guessing.",
    "You are not a veterinarian. For signs of disease, high mortality or medication questions, give general guidance and advise contacting a qualified vet.",
    "",
    "FARM DATA:",
    farmSummary,
  ].join("\n");
}

// Wraps the farmer's latest message to set the reply language. For "auto" the
// app detects the question's language itself ("the same language as my
// message" was often answered in English), and the instruction goes before the
// question, which N-ATLaS followed most reliably in tests.
export function withLanguage(messages: ChatMessage[], language: ReplyLanguage): ChatMessage[] {
  const last = messages.length - 1;
  const target = language === "auto" ? detectLanguage(messages[last]?.content ?? "") : language;
  const before = `Answer in ${LANGUAGES[target]} only${target === "en" ? "" : ", not English"}.`;
  const after = "(Keep numbers exactly as in the farm data.)";
  return messages.map((m, i) =>
    i === last && m.role === "user" ? { ...m, content: `${before}\n\n${m.content}\n\n${after}` } : m,
  );
}

export function translationPrompt(text: string, to: LanguageCode): ChatMessage[] {
  return [
    {
      role: "user",
      content: `Translate this farm advice into ${LANGUAGES[to]}. Keep numbers, units, names and batch IDs exactly as they are. Reply with only the translation.\n\n${text}`,
    },
  ];
}

// N-ATLaS has an ~8K token context window. Keep the conversation within a
// character budget (Hausa/Yoruba tokenize densely, so be conservative),
// always starting on a user turn.
const HISTORY_CHAR_BUDGET = 6000;

export function trimHistory(messages: ChatMessage[]) {
  const kept: ChatMessage[] = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    used += messages[i].content.length;
    if (used > HISTORY_CHAR_BUDGET && kept.length > 0) break;
    kept.unshift(messages[i]);
  }
  while (kept.length > 1 && kept[0].role !== "user") kept.shift();
  return kept;
}

const MAX_ANSWER_TOKENS = 450;

export async function streamChatCompletion(
  messages: ChatMessage[],
  systemPrompt: string | null,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const cfg = getConfig();
  const all: AnyMessage[] = [
    ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
    ...trimHistory(messages),
  ];
  if (cfg.ollama) return ollamaChat(cfg, all, signal);

  const res = await fetch(`${cfg.baseURL}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: cfg.model,
      stream: true,
      // Sampling settings recommended on the N-ATLaS model card.
      temperature: 0.1,
      max_tokens: MAX_ANSWER_TOKENS,
      ...(cfg.repetitionPenalty
        ? { repetition_penalty: cfg.repetitionPenalty }
        : {}),
      messages: all,
    }),
  });

  if (res.status === 503) {
    throw new AIWarmingUpError(
      "The AI model is starting up. Please try again in a minute or two.",
    );
  }
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`N-ATLaS request failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  return sseToTextStream(res.body);
}

// ---------- Ollama (native API) ----------

type Config = ReturnType<typeof getConfig>;
type AnyMessage = { role: string; content: string };

const ollamaRoot = (cfg: Config) => cfg.baseURL.replace(/\/v1$/, "");

function ollamaOptions(cfg: Config, maxTokens: number) {
  return {
    temperature: 0.1,
    num_predict: maxTokens,
    num_ctx: 4096,
    // A mild penalty stops answers getting stuck repeating a phrase (seen in Igbo).
    repeat_penalty: cfg.repetitionPenalty ?? 1.1,
  };
}

async function ollamaChat(cfg: Config, messages: AnyMessage[], signal?: AbortSignal) {
  const res = await fetch(`${ollamaRoot(cfg)}/api/chat`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: cfg.model,
      stream: true,
      keep_alive: cfg.keepAlive,
      options: ollamaOptions(cfg, MAX_ANSWER_TOKENS),
      messages,
    }),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`N-ATLaS request failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return ndjsonToTextStream(res.body);
}

/**
 * Loads the model and reads the farm data ahead of the first question, so the
 * answer starts in seconds instead of a minute or more. Ollama only; other
 * servers keep the model loaded themselves.
 */
export async function warmUp(systemPrompt: string) {
  const cfg = getConfig();
  if (!cfg.ollama) return false;
  const res = await fetch(`${ollamaRoot(cfg)}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: cfg.model,
      stream: false,
      keep_alive: cfg.keepAlive,
      options: ollamaOptions(cfg, 1),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Hello" },
      ],
    }),
  });
  return res.ok;
}

// Ollama streams one JSON object per line.
function ndjsonToTextStream(body: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const handle = (line: string, controller: TransformStreamDefaultController<Uint8Array>) => {
    if (!line.trim()) return;
    let frame: { message?: { content?: string }; error?: string };
    try {
      frame = JSON.parse(line);
    } catch {
      return;
    }
    if (frame.error) return controller.error(new Error(`N-ATLaS error: ${frame.error}`));
    if (frame.message?.content) controller.enqueue(encoder.encode(frame.message.content));
  };
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) handle(line, controller);
      },
      flush(controller) {
        buffer += decoder.decode();
        handle(buffer, controller);
      },
    }),
  );
}

// ---------- OpenAI-compatible servers ----------

// Converts an OpenAI-style SSE stream into a plain stream of text deltas.
function sseToTextStream(body: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const handle = (line: string, controller: TransformStreamDefaultController<Uint8Array>) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]") return;
    let frame: {
      choices?: { delta?: { content?: string } }[];
      error?: { message?: string } | string;
    };
    try {
      frame = JSON.parse(payload);
    } catch {
      return; // keep-alives and partial frames
    }
    if (frame.error) {
      const message = typeof frame.error === "string" ? frame.error : frame.error.message;
      controller.error(new Error(`N-ATLaS error: ${message ?? "unknown"}`));
      return;
    }
    const delta = frame.choices?.[0]?.delta?.content;
    if (delta) controller.enqueue(encoder.encode(delta));
  };

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) handle(line, controller);
      },
      // A final frame without a trailing newline.
      flush(controller) {
        buffer += decoder.decode();
        if (buffer) handle(buffer, controller);
      },
    }),
  );
}
