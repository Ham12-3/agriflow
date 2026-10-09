import "server-only";

// Client for N-ATLaS (NCAIR1/N-ATLaS, a Llama-3 8B fine-tune for English,
// Hausa, Igbo and Yoruba). N-ATLaS has no official hosted API, so this talks to
// any OpenAI-compatible server that is serving it: vLLM, TGI / HF Inference
// Endpoints, Ollama (GGUF build), or a third-party host. Configure via env.

import { LANGUAGES, type LanguageCode } from "@/lib/languages";

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
    apiKey: process.env.LLM_API_KEY || process.env.HF_TOKEN,
    repetitionPenalty: repetitionPenalty ? Number(repetitionPenalty) : undefined,
  };
}

export function buildSystemPrompt(farmSummary: string, language: LanguageCode) {
  return [
    "You are Agriflow AI, a friendly assistant for livestock farmers in Nigeria, built on N-ATLaS.",
    "You help with farm records, feed, growth, finances and day-to-day livestock management.",
    `Always reply in ${LANGUAGES[language]}, using simple words a busy farmer can follow. Keep answers short and practical.`,
    "Use only the farm data below for numbers about this farm. If the data does not answer the question, say so instead of guessing.",
    "You are not a veterinarian. For signs of disease, high mortality or medication questions, give general guidance and advise contacting a qualified vet.",
    "",
    "FARM DATA:",
    farmSummary,
  ].join("\n");
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

export async function streamChatCompletion(
  messages: ChatMessage[],
  systemPrompt: string,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const cfg = getConfig();

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
      max_tokens: 700,
      ...(cfg.repetitionPenalty
        ? { repetition_penalty: cfg.repetitionPenalty }
        : {}),
      messages: [
        { role: "system", content: systemPrompt },
        ...trimHistory(messages),
      ],
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
