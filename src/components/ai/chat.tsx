"use client";

import { ArrowUp, LoaderCircle, Mic, Square, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LANGUAGES,
  REPLY_LANGUAGES,
  detectLanguage,
  type LanguageCode,
  type ReplyLanguage,
} from "@/lib/languages";
import { speak, stopSpeaking, useSpeech, useVoiceInput } from "./use-voice";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string; // as written; this is what the AI sees as history
  language?: LanguageCode; // language of `content` (replies)
  translations?: Partial<Record<LanguageCode, string>>;
  shown?: LanguageCode; // which version of a reply is on screen
};

export type VoicePrefs = {
  voiceInput: boolean;
  language: ReplyLanguage; // this person's reply language (saved as they change it)
  voiceServer: boolean;
  ttsServer: boolean; // YarnGPT spoken replies
};

const DEFAULT_PREFS: VoicePrefs = { voiceInput: true, language: "auto", voiceServer: false, ttsServer: false };

const SUGGESTIONS = [
  "How is my farm doing this month?",
  "Is my broiler batch growing well?",
  "Which feed do I need to reorder?",
];

let nextId = 0;
const newId = () => `m${Date.now().toString(36)}${(nextId++).toString(36)}`;

/** The text and language of a reply as currently shown. */
export function displayed(m: Message): { text: string; language: LanguageCode } {
  const language = m.shown ?? m.language ?? "en";
  const text = language === m.language ? m.content : (m.translations?.[language] ?? m.content);
  return { text, language };
}

async function readStream(res: Response, onText: (text: string) => void) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onText(text);
  }
  return text;
}

async function errorFrom(res: Response) {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return new Error(body?.error ?? "Something went wrong.");
}

/** Conversation state + streaming from /api/ai/chat. */
export function useChat(initialPrefs?: VoicePrefs) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<VoicePrefs>(initialPrefs ?? DEFAULT_PREFS);
  const [language, setLanguageState] = useState<ReplyLanguage>(initialPrefs?.language ?? "auto");
  const loadedPrefs = useRef(Boolean(initialPrefs));
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const update = useCallback((id: string, patch: (m: Message) => Partial<Message>) => {
    setMessages((all) => all.map((m) => (m.id === id ? { ...m, ...patch(m) } : m)));
  }, []);

  // The slide-out panel has no server props, so it loads saved preferences.
  const loadPrefs = useCallback(async () => {
    if (loadedPrefs.current) return;
    loadedPrefs.current = true;
    const p = (await fetch("/api/ai/settings").then((r) => r.json()).catch(() => null)) as VoicePrefs | null;
    if (p) {
      setPrefs(p);
      setLanguageState(p.language);
    }
  }, []);

  /** Shows a reply in another language, translating it the first time. */
  const showIn = useCallback(
    async (id: string, to: LanguageCode) => {
      const m = messagesRef.current.find((x) => x.id === id);
      if (!m || m.role !== "assistant" || !m.content || abortRef.current) return;
      stopSpeaking();
      if (to === m.language || m.translations?.[to]) return update(id, () => ({ shown: to }));

      const controller = new AbortController();
      abortRef.current = controller;
      setTranslating(id);
      setError(null);
      const before = m.shown;
      const translate = async (text: string, lang: LanguageCode) => {
        update(id, () => ({ shown: lang }));
        const res = await fetch("/api/ai/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, to: lang }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw await errorFrom(res);
        const out = await readStream(res, (t) =>
          update(id, (x) => ({ translations: { ...x.translations, [lang]: t } })),
        );
        if (!out.trim()) throw new Error("The assistant returned an empty translation.");
        return out;
      };
      try {
        // N-ATLaS translates best to and from English, so Hausa, Igbo and
        // Yoruba go through English (which is kept, so EN is then instant).
        let source = m.language === "en" ? m.content : m.translations?.en;
        if (!source && to !== "en") source = await translate(m.content, "en");
        await translate(source ?? m.content, to);
      } catch (err) {
        update(id, (x) => {
          const translations = { ...x.translations };
          delete translations[to];
          return { shown: before, translations };
        });
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Couldn't translate that.");
      } finally {
        abortRef.current = null;
        setTranslating(null);
      }
    },
    [update],
  );

  // Picking a language saves it for next time and switches the latest reply.
  const setLanguage = useCallback(
    (next: ReplyLanguage) => {
      setLanguageState(next);
      void fetch("/api/ai/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: next }),
      }).catch(() => {});
      const last = messagesRef.current.findLast((m) => m.role === "assistant" && m.content);
      if (last && next !== "auto") void showIn(last.id, next);
    },
    [showIn],
  );

  const send = useCallback(
    async (text: string, draftSetter?: (v: string) => void) => {
      const question = text.trim();
      if (!question || abortRef.current) return;
      const previous = messagesRef.current;
      const asked: Message = { id: newId(), role: "user", content: question };
      const reply: Message = { id: newId(), role: "assistant", content: "" };
      const history = [...previous, asked].map(({ role, content }) => ({ role, content }));
      setMessages([...previous, asked, reply]);
      setError(null);
      setLoading(true);
      stopSpeaking();

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, language }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw await errorFrom(res);
        const answer = await readStream(res, (t) => update(reply.id, () => ({ content: t })));
        if (!answer) throw new Error("The assistant returned an empty answer.");
        const answeredIn = language === "auto" ? detectLanguage(answer) : language;
        update(reply.id, () => ({ language: answeredIn, shown: answeredIn }));
      } catch (err) {
        if (controller.signal.aborted) return;
        setMessages(previous);
        draftSetter?.(question);
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        abortRef.current = null;
        setLoading(false);
      }
    },
    [language, update],
  );

  useEffect(() => () => abortRef.current?.abort(), []);

  // After the AI page saves farm settings, apply the ones that affect the chat.
  const applyPrefs = useCallback((p: Partial<VoicePrefs>) => {
    setPrefs((prev) => ({ ...prev, ...p }));
  }, []);

  return {
    messages,
    loading,
    translating,
    error,
    send,
    showIn,
    prefs,
    loadPrefs,
    applyPrefs,
    language,
    setLanguage,
  };
}

export type ChatState = ReturnType<typeof useChat>;

export function LanguageSelect({ chat }: { chat: ChatState }) {
  return (
    <select
      value={chat.language}
      onChange={(e) => chat.setLanguage(e.target.value as ReplyLanguage)}
      aria-label="Reply language"
      title="Reply language (saved automatically)"
      className="rounded-lg border border-line bg-background px-2 py-1.5 text-xs font-medium outline-none"
    >
      {(Object.keys(REPLY_LANGUAGES) as ReplyLanguage[]).map((code) => (
        <option key={code} value={code}>
          {code === "auto" ? "Auto language" : REPLY_LANGUAGES[code]}
        </option>
      ))}
    </select>
  );
}

const SHORT: Record<LanguageCode, string> = { en: "EN", ha: "HA", ig: "IG", yo: "YO" };

function ReplyTools({ chat, m }: { chat: ChatState; m: Message }) {
  const speech = useSpeech();
  const mine = speech.id === m.id;
  const { text, language } = displayed(m);
  const busy = chat.loading || chat.translating !== null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line/70 pt-2">
      <button
        onClick={() => (mine ? stopSpeaking() : void speak(m.id, text, language, { yarngpt: chat.prefs.ttsServer }))}
        disabled={chat.translating === m.id}
        className="flex items-center gap-1 text-[11px] font-medium text-muted hover:text-foreground disabled:opacity-40"
        aria-label={mine ? "Stop reading aloud" : `Read this answer aloud in ${LANGUAGES[language]}`}
      >
        {mine && speech.phase === "preparing" ? (
          <>
            <LoaderCircle className="size-3 animate-spin" /> Preparing audio
            {speech.progress ? ` ${speech.progress}%` : "…"} (tap to stop)
          </>
        ) : mine ? (
          <>
            <Square className="size-3" /> Stop
          </>
        ) : (
          <>
            <Volume2 className="size-3" /> Listen
          </>
        )}
      </button>
      <div className="ml-auto flex items-center gap-1" role="group" aria-label="Show this answer in">
        {(Object.keys(LANGUAGES) as LanguageCode[]).map((code) => {
          const active = code === language;
          const loadingThis = chat.translating === m.id && active;
          return (
            <button
              key={code}
              onClick={() => void chat.showIn(m.id, code)}
              disabled={busy && !active}
              aria-pressed={active}
              aria-label={`Show in ${LANGUAGES[code]}`}
              title={LANGUAGES[code]}
              className={`flex h-5 min-w-7 items-center justify-center rounded px-1 text-[10px] font-semibold disabled:opacity-40 ${
                active ? "bg-foreground text-white" : "text-muted hover:bg-card hover:text-foreground"
              }`}
            >
              {loadingThis ? <LoaderCircle className="size-3 animate-spin" /> : SHORT[code]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ChatView({ chat, autoFocus = true }: { chat: ChatState; autoFocus?: boolean }) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const voice = useVoiceInput({
    language: chat.language,
    useServer: chat.prefs.voiceServer,
    onText: (text) => void chat.send(text, setInput),
  });

  // Load the AI model as soon as the chat opens, so the first answer is quick.
  useEffect(() => {
    void fetch("/api/ai/warmup", { method: "POST" }).catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat.messages]);

  // Stop reading aloud when the chat closes.
  useEffect(() => () => stopSpeaking(), []);

  const showMic = chat.prefs.voiceInput && voice.supported;
  const recording = voice.state === "recording";
  const last = chat.messages.length - 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {chat.messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Ask about your batches, feed, finances or farm practices — type or speak in English, Hausa, Igbo
              or Yoruba. Every answer can be switched to another language and read aloud.
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => chat.send(s, setInput)}
                className="block w-full rounded-xl border border-line px-4 py-3 text-left text-sm hover:bg-background"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {chat.messages.map((m, i) => (
          <div
            key={m.id}
            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              m.role === "user" ? "ml-auto bg-foreground text-white" : "bg-background text-foreground"
            }`}
          >
            {m.role === "user"
              ? m.content
              : displayed(m).text ||
                (chat.loading && i === last && <LoaderCircle className="size-4 animate-spin text-muted" />)}
            {m.role === "assistant" && m.language && <ReplyTools chat={chat} m={m} />}
          </div>
        ))}

        {(chat.error || voice.error) && (
          <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">
            {chat.error ?? voice.error}
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void chat.send(input, setInput);
          setInput("");
        }}
        className="border-t border-line p-4"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-background p-2">
          <textarea
            autoFocus={autoFocus}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void chat.send(input, setInput);
                setInput("");
              }
            }}
            rows={1}
            placeholder={recording ? "Listening…" : voice.state === "transcribing" ? "Transcribing…" : "Ask Agriflow AI…"}
            className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted"
          />
          {showMic && (
            <button
              type="button"
              disabled={voice.state === "transcribing" || chat.loading}
              onClick={() => (recording ? voice.stop() : void voice.start())}
              className={`grid size-8 place-items-center rounded-full disabled:opacity-40 ${
                recording ? "animate-pulse bg-bad text-white" : "bg-card text-foreground hover:bg-neutral-200"
              }`}
              aria-label={recording ? "Stop recording" : "Speak your question"}
              aria-pressed={recording}
            >
              {voice.state === "transcribing" ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : recording ? (
                <Square className="size-3.5" />
              ) : (
                <Mic className="size-4" />
              )}
            </button>
          )}
          <button
            type="submit"
            disabled={chat.loading || chat.translating !== null || !input.trim()}
            className="grid size-8 place-items-center rounded-full bg-foreground text-white disabled:opacity-30"
            aria-label="Send"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-[10px] leading-snug text-muted">
          AI answers can be wrong — check with a vet for animal health issues. N-ATLaS is an
          initiative of the Federal Ministry of Communications, Innovation and Digital Economy,
          powered by Awarri Technologies.
        </p>
      </form>
    </div>
  );
}
