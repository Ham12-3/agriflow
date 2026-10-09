"use client";

import { ArrowUp, LoaderCircle, Mic, Square, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LANGUAGES, type LanguageCode } from "@/lib/languages";
import { speak, stopSpeaking, useSpeaking, useVoiceInput } from "./use-voice";

export type Message = { role: "user" | "assistant"; content: string };

export type VoicePrefs = {
  voiceInput: boolean;
  speakReplies: boolean;
  language: LanguageCode;
  voiceServer: boolean;
  ttsServer: boolean; // YarnGPT spoken replies
};

const DEFAULT_PREFS: VoicePrefs = { voiceInput: true, speakReplies: false, language: "en", voiceServer: false, ttsServer: false };

const SUGGESTIONS = [
  "How is my farm doing this month?",
  "Is my broiler batch growing well?",
  "Which feed do I need to reorder?",
];

/** Conversation state + streaming from /api/ai/chat. */
export function useChat(initialPrefs?: VoicePrefs) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<VoicePrefs>(initialPrefs ?? DEFAULT_PREFS);
  const [language, setLanguage] = useState<LanguageCode>(initialPrefs?.language ?? "en");
  const [speakOn, setSpeakOn] = useState(initialPrefs?.speakReplies ?? false);
  const loadedPrefs = useRef(Boolean(initialPrefs));
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // The slide-out panel has no server props, so it loads saved preferences.
  const loadPrefs = useCallback(async () => {
    if (loadedPrefs.current) return;
    loadedPrefs.current = true;
    const p = (await fetch("/api/ai/settings").then((r) => r.json()).catch(() => null)) as VoicePrefs | null;
    if (p) {
      setPrefs(p);
      setLanguage(p.language);
      setSpeakOn(p.speakReplies);
    }
  }, []);

  const send = useCallback(
    async (text: string, draftSetter?: (v: string) => void) => {
      const question = text.trim();
      if (!question || abortRef.current) return;
      const previous = messagesRef.current;
      const history: Message[] = [...previous, { role: "user", content: question }];
      setMessages([...history, { role: "assistant", content: "" }]);
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
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "Something went wrong.");
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let answer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          answer += decoder.decode(value, { stream: true });
          setMessages([...history, { role: "assistant", content: answer }]);
        }
        if (!answer) throw new Error("The assistant returned an empty answer.");
        if (speakOn) void speak(answer, language, { yarngpt: prefs.ttsServer });
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
    [language, speakOn, prefs.ttsServer],
  );

  useEffect(() => () => abortRef.current?.abort(), []);

  // After the AI page saves settings, apply them to this conversation.
  const applyPrefs = useCallback((p: VoicePrefs) => {
    setPrefs(p);
    setLanguage(p.language);
    setSpeakOn(p.speakReplies);
  }, []);

  return { messages, loading, error, send, prefs, loadPrefs, applyPrefs, language, setLanguage, speakOn, setSpeakOn };
}

export type ChatState = ReturnType<typeof useChat>;

export function LanguageSelect({ chat }: { chat: ChatState }) {
  return (
    <select
      value={chat.language}
      onChange={(e) => chat.setLanguage(e.target.value as LanguageCode)}
      aria-label="Reply language"
      className="rounded-lg border border-line bg-background px-2 py-1.5 text-xs font-medium outline-none"
    >
      {(Object.keys(LANGUAGES) as LanguageCode[]).map((code) => (
        <option key={code} value={code}>
          {LANGUAGES[code]}
        </option>
      ))}
    </select>
  );
}

export function ChatView({ chat, autoFocus = true }: { chat: ChatState; autoFocus?: boolean }) {
  const [input, setInput] = useState("");
  const speaking = useSpeaking();
  const scrollRef = useRef<HTMLDivElement>(null);
  const voice = useVoiceInput({
    language: chat.language,
    useServer: chat.prefs.voiceServer,
    onText: (text) => void chat.send(text, setInput),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat.messages]);

  const showMic = chat.prefs.voiceInput && voice.supported;
  const recording = voice.state === "recording";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {chat.messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Ask about your batches, feed, finances or farm practices — in English, Hausa, Igbo or
              Yoruba{showMic ? ", by typing or tapping the microphone" : ""}.
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
            key={i}
            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              m.role === "user" ? "ml-auto bg-foreground text-white" : "bg-background text-foreground"
            }`}
          >
            {m.content ||
              (chat.loading && i === chat.messages.length - 1 && (
                <LoaderCircle className="size-4 animate-spin text-muted" />
              ))}
            {m.role === "assistant" && m.content && !chat.loading && (
              <button
                onClick={() =>
                  speaking ? stopSpeaking() : void speak(m.content, chat.language, { yarngpt: chat.prefs.ttsServer })
                }
                className="mt-1 flex items-center gap-1 text-[11px] text-muted hover:text-foreground"
                aria-label={speaking ? "Stop reading aloud" : "Read this answer aloud"}
              >
                {speaking ? <Square className="size-3" /> : <Volume2 className="size-3" />}
                {speaking ? "Stop" : "Listen"}
              </button>
            )}
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
          <button
            type="button"
            onClick={() => {
              if (chat.speakOn) stopSpeaking();
              chat.setSpeakOn(!chat.speakOn);
            }}
            className={`grid size-8 place-items-center rounded-full ${chat.speakOn ? "bg-good-soft text-good" : "text-muted hover:bg-card"}`}
            aria-label={chat.speakOn ? "Stop reading replies aloud" : "Read replies aloud"}
            aria-pressed={chat.speakOn}
            title={chat.speakOn ? "Replies are read aloud" : "Read replies aloud"}
          >
            {chat.speakOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
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
            disabled={chat.loading || !input.trim()}
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
