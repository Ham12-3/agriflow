"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SPEECH_TAGS, type LanguageCode, type ReplyLanguage } from "@/lib/languages";

// ---------- Speech to text (AgriTalk) ----------

const noopSubscribe = () => () => {};

type VoiceState = "idle" | "recording" | "transcribing";

const MAX_RECORDING_MS = 60_000;
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

type BrowserRecognition = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function browserRecognition(): (new () => BrowserRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => BrowserRecognition;
    webkitSpeechRecognition?: new () => BrowserRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Records speech and returns text via `onText`. Uses the speech server
 * (/api/ai/transcribe → `npm run asr`) when available, otherwise the browser's
 * built-in recognition (Chrome/Edge; needs internet).
 */
export function useVoiceInput({
  language,
  useServer,
  onText,
}: {
  language: ReplyLanguage; // "auto": the speech server detects the language
  useServer: boolean;
  onText: (text: string) => void;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  // Falls back to browser recognition once the speech server has failed.
  const [serverDown, setServerDown] = useState(false);
  const serverMode = useServer && !serverDown;
  const recorder = useRef<MediaRecorder | null>(null);
  const recognition = useRef<BrowserRecognition | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  // Checked on the client only (false during server render) to avoid hydration mismatches.
  const supported = useSyncExternalStore(
    noopSubscribe,
    () =>
      (serverMode && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices) ||
      browserRecognition() !== null,
    () => false,
  );

  const listenInBrowser = useCallback(() => {
    const Recognition = browserRecognition();
    if (!Recognition) {
      setError("Voice input isn't available in this browser. Try Chrome or Edge, or start the voice server.");
      setState("idle");
      return;
    }
    const r = new Recognition();
    // Browsers can't detect the language, so "auto" listens for Nigerian English.
    r.lang = SPEECH_TAGS[language === "auto" ? "en" : language];
    r.interimResults = false;
    r.onresult = (e) => {
      const text = Array.from(e.results).map((res) => res[0].transcript).join(" ").trim();
      if (text) onTextRef.current(text);
    };
    r.onerror = (e) =>
      setError(
        e.error === "not-allowed"
          ? "Microphone permission was blocked."
          : e.error === "language-not-supported"
            ? "Your browser can't recognise this language. Start the voice server for Nigerian languages."
            : "Didn't catch that. Please try again.",
      );
    r.onend = () => setState("idle");
    recognition.current = r;
    setState("recording");
    r.start();
  }, [language]);

  const transcribe = useCallback(
    async (blob: Blob) => {
      setState("transcribing");
      try {
        const body = new FormData();
        body.append("file", blob, "speech.webm");
        body.append("language", language);
        const res = await fetch("/api/ai/transcribe", { method: "POST", body });
        const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string; fallback?: string };
        if (!res.ok) {
          if (data.fallback === "browser" && browserRecognition()) {
            setServerDown(true);
            setError(`${data.error ?? "Voice server unavailable."} Using your browser's speech recognition instead — tap the mic again.`);
          } else {
            setError(data.error ?? "Couldn't transcribe that.");
          }
          return;
        }
        if (data.text) onTextRef.current(data.text);
        else setError("Didn't catch that. Please try again.");
      } catch {
        setError("Couldn't reach the server.");
      } finally {
        setState("idle");
      }
    },
    [language],
  );

  const start = useCallback(async () => {
    setError(null);
    if (!serverMode) return listenInBrowser();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) clearTimeout(timer.current);
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        if (blob.size > 0) void transcribe(blob);
        else setState("idle");
      };
      recorder.current = rec;
      rec.start();
      setState("recording");
      timer.current = setTimeout(() => rec.state === "recording" && rec.stop(), MAX_RECORDING_MS);
    } catch {
      setError("Microphone permission was blocked or no microphone was found.");
      setState("idle");
    }
  }, [serverMode, listenInBrowser, transcribe]);

  const stop = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    recognition.current?.stop();
  }, []);

  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
      recognition.current?.stop();
    },
    [],
  );

  return { state, error, supported, start, stop, clearError: () => setError(null) };
}

// ---------- Text to speech (read replies aloud) ----------

function pickVoice(language: LanguageCode) {
  const voices = window.speechSynthesis.getVoices();
  const tag = SPEECH_TAGS[language].toLowerCase();
  return (
    voices.find((v) => v.lang.toLowerCase() === tag) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(`${language}-`)) ??
    (language === "en" ? voices.find((v) => /en-(gb|us)/i.test(v.lang)) : undefined) ??
    null
  );
}

// Spoken replies, one message at a time. With the YarnGPT server (`npm run tts`)
// replies are spoken in a Nigerian voice in English, Hausa, Igbo or Yoruba;
// otherwise the device's own voice is used.
//
// YarnGPT is slower than real time on a laptop, so playing each sentence as
// soon as it's ready leaves gaps mid-answer. Instead, sentences are generated
// a few at a time and playback starts once the rest will be ready before it's
// needed; the clips are then joined on one timeline with short pauses.

const PARALLEL = 3; // matches the voice server's Ollama (OLLAMA_NUM_PARALLEL)
const MAX_WORDS = 30;
const PAUSE = 0.25; // seconds between sentences

/** Splits text into sentences (long ones at commas), never mid-phrase. */
export function splitSentences(text: string) {
  const sentences = text
    .replace(/[*_#`>|]/g, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^\s*[-•\d]+[.)]?\s+/, "").trim())
    .filter((s) => /\p{L}/u.test(s));
  const parts: string[] = [];
  for (const sentence of sentences) {
    let current: string[] = [];
    for (const phrase of sentence.split(/(?<=[,;:])\s+/)) {
      const words = phrase.split(/\s+/);
      if (current.length && current.length + words.length > MAX_WORDS) {
        parts.push(current.join(" "));
        current = [];
      }
      for (let i = 0; i < words.length; i += MAX_WORDS) current.push(...words.slice(i, i + MAX_WORDS));
    }
    if (current.length) parts.push(current.join(" "));
  }
  // Very short fragments ("Yes.") sound clipped on their own; join them to the next.
  const merged: string[] = [];
  for (const part of parts) {
    const prev = merged[merged.length - 1];
    if (prev && prev.split(/\s+/).length < 3) merged[merged.length - 1] = `${prev} ${part}`;
    else merged.push(part);
  }
  return merged;
}

// Which message is being read, and whether its audio is still being made.
export type Speech = { id: string | null; phase: "preparing" | "playing" | null; progress?: number };

let speech: Speech = { id: null, phase: null };
let session = 0;
let controller: AbortController | null = null;
let audioCtx: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();
const IDLE: Speech = { id: null, phase: null };

function setSpeech(next: Speech) {
  if (next.id === speech.id && next.phase === speech.phase && next.progress === speech.progress) return;
  speech = next;
  listeners.forEach((l) => l());
}

export function useSpeech() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => speech,
    () => IDLE,
  );
}

function speakInBrowser(id: string, text: string, language: LanguageCode) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return setSpeech(IDLE);
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(language);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? SPEECH_TAGS[language];
  utterance.rate = 0.95;
  utterance.onend = utterance.onerror = () => {
    if (speech.id === id) setSpeech(IDLE);
  };
  setSpeech({ id, phase: "playing" });
  window.speechSynthesis.speak(utterance);
}

/** Reads one message aloud (stopping anything else that is playing). */
export function speak(
  id: string,
  text: string,
  language: LanguageCode,
  { yarngpt = false, voice }: { yarngpt?: boolean; voice?: string } = {},
) {
  stopSpeaking();
  if (!yarngpt || typeof AudioContext === "undefined") return speakInBrowser(id, text, language);

  const mine = ++session;
  const ctx = new AudioContext(); // created during the click, so the browser allows playback
  audioCtx = ctx;
  controller = new AbortController();
  const signal = controller.signal;
  const parts = splitSentences(text);
  if (!parts.length) return;
  const words = parts.map((p) => p.split(/\s+/).length);
  const totalWords = words.reduce((a, b) => a + b, 0);
  const ready: (AudioBuffer | undefined)[] = [];
  const began = performance.now();
  let fetched = 0;
  let scheduled = 0; // parts placed on the timeline
  let playhead = 0; // when the scheduled audio ends (AudioContext time)
  let started = false;
  let failedAt: number | null = null;
  const live = () => mine === session;

  setSpeech({ id, phase: "preparing", progress: 0 });

  const finish = () => {
    if (!live()) return;
    if (failedAt !== null && scheduled < parts.length) {
      // Voice server stopped part-way: say the rest with the device voice.
      void ctx.close();
      speakInBrowser(id, parts.slice(scheduled).join(" "), language);
      return;
    }
    stopSpeaking();
  };

  const schedule = () => {
    while (ready[scheduled]) {
      const source = ctx.createBufferSource();
      source.buffer = ready[scheduled]!;
      source.connect(ctx.destination);
      const at = Math.max(playhead, ctx.currentTime + 0.05);
      source.start(at);
      playhead = at + source.buffer.duration + PAUSE;
      scheduled++;
      const last = scheduled;
      source.onended = () => {
        // Ended with nothing more queued: either all done, or waiting/failed.
        if (live() && last === scheduled && (scheduled === parts.length || failedAt !== null)) finish();
      };
    }
  };

  // Start once the audio ready so far lasts longer than making the rest will take.
  const readyToStart = () => {
    if (ready.length === parts.length && ready.every(Boolean)) return true;
    let buffered = 0;
    let doneWords = 0;
    let doneAudio = 0;
    for (let i = 0; i < parts.length; i++) {
      const b = ready[i];
      if (!b) continue;
      doneWords += words[i];
      doneAudio += b.duration + PAUSE;
    }
    for (let i = 0; ready[i]; i++) buffered += ready[i]!.duration + PAUSE;
    if (!buffered || !doneWords) return false;
    const elapsed = (performance.now() - began) / 1000;
    const rate = doneAudio / elapsed; // seconds of audio made per second
    const remaining = ((totalWords - doneWords) * doneAudio) / doneWords;
    return buffered > (remaining / rate) * 1.15 + 1;
  };

  const onReady = () => {
    if (!live()) return;
    const doneWords = parts.reduce((sum, _, i) => sum + (ready[i] ? words[i] : 0), 0);
    if (!started && readyToStart()) {
      started = true;
      void ctx.resume();
      playhead = ctx.currentTime + 0.05;
    }
    if (started) schedule();
    else setSpeech({ id, phase: "preparing", progress: Math.round((doneWords / totalWords) * 100) });
  };

  const worker = async () => {
    while (live() && failedAt === null && fetched < parts.length) {
      const i = fetched++;
      try {
        const res = await fetch("/api/ai/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: parts[i], language, voice }),
          signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        ready[i] = await ctx.decodeAudioData(await res.arrayBuffer());
        onReady();
      } catch {
        if (!live() || signal.aborted) return;
        failedAt = failedAt === null ? i : Math.min(failedAt, i);
        if (!started) {
          void ctx.close();
          return speakInBrowser(id, text, language);
        }
        if (playhead <= ctx.currentTime) finish();
      }
    }
  };
  for (let n = 0; n < Math.min(PARALLEL, parts.length); n++) void worker();

  // Shows "preparing" again if playback catches up with generation.
  timer = setInterval(() => {
    if (!live() || !started) return;
    const waiting = scheduled < parts.length && ctx.currentTime >= playhead - PAUSE;
    setSpeech({ id, phase: waiting ? "preparing" : "playing" });
  }, 250);
}

export function stopSpeaking() {
  session++;
  controller?.abort();
  controller = null;
  if (timer) clearInterval(timer);
  timer = null;
  void audioCtx?.close().catch(() => {});
  audioCtx = null;
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  if (speech.id) setSpeech(IDLE);
}

// Whether the device has a voice for this language (Hausa/Igbo/Yoruba often don't).
export function hasVoiceFor(language: LanguageCode) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  return pickVoice(language) !== null;
}

const subscribeVoices = (onChange: () => void) => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", onChange);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", onChange);
};

// Hydration-safe: assumes a voice exists until the browser says otherwise.
export function useHasVoice(language: LanguageCode) {
  return useSyncExternalStore(subscribeVoices, () => hasVoiceFor(language), () => true);
}
