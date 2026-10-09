"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SPEECH_TAGS, type LanguageCode } from "@/lib/languages";

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
  language: LanguageCode;
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
    r.lang = SPEECH_TAGS[language];
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

// Spoken replies. With the YarnGPT server (`npm run tts`) answers are spoken
// in a Nigerian voice in English, Yoruba, Hausa or Igbo; otherwise the
// device's own voice is used. Answers are split into ~25-word chunks: the
// next chunk is generated while the current one plays.

const CHUNK_WORDS = 25;
const FIRST_CHUNK_WORDS = 10; // short, so the first audio arrives sooner

export function chunkText(text: string) {
  const sentences = text
    .replace(/[*_#`>|]/g, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  const limit = () => (chunks.length ? CHUNK_WORDS : FIRST_CHUNK_WORDS);
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/);
    if (current.length && current.length + words.length > limit()) {
      chunks.push(current.join(" "));
      current = [];
    }
    for (const word of words) {
      current.push(word);
      if (current.length >= limit()) {
        chunks.push(current.join(" "));
        current = [];
      }
    }
  }
  if (current.length) chunks.push(current.join(" "));
  return chunks;
}

function speakInBrowser(text: string, language: LanguageCode) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(language);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? SPEECH_TAGS[language];
  utterance.rate = 0.95;
  utterance.onend = utterance.onerror = () => setSpeaking(false);
  setSpeaking(true);
  window.speechSynthesis.speak(utterance);
}

// Shared playback state, so any chat can show a Stop button.
let speaking = false;
let session = 0;
let controller: AbortController | null = null;
let audio: HTMLAudioElement | null = null;
let finishCurrent: (() => void) | null = null;
const listeners = new Set<() => void>();

function setSpeaking(value: boolean) {
  speaking = value;
  listeners.forEach((l) => l());
}

export function useSpeaking() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => speaking,
    () => false,
  );
}

function play(blob: Blob) {
  return new Promise<void>((resolve) => {
    const url = URL.createObjectURL(blob);
    audio = new Audio(url);
    const done = () => {
      URL.revokeObjectURL(url);
      finishCurrent = null;
      resolve();
    };
    finishCurrent = done;
    audio.onended = done;
    audio.onerror = done;
    audio.play().catch(done);
  });
}

export async function speak(text: string, language: LanguageCode, { yarngpt = false } = {}) {
  stopSpeaking();
  if (!yarngpt) return speakInBrowser(text, language);

  const id = ++session;
  controller = new AbortController();
  const signal = controller.signal;
  const chunks = chunkText(text);
  const fetchChunk = async (chunk: string) => {
    const res = await fetch("/api/ai/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: chunk, language }),
      signal,
    });
    if (!res.ok) throw new Error(String(res.status));
    return res.blob();
  };

  setSpeaking(true);
  let next = chunks.length ? fetchChunk(chunks[0]) : null;
  for (let i = 0; next && i < chunks.length; i++) {
    let blob: Blob;
    try {
      blob = await next;
    } catch {
      // Server busy or down: say the rest with the device voice.
      if (id === session && !signal.aborted) speakInBrowser(chunks.slice(i).join(" "), language);
      return;
    }
    if (id !== session) return;
    next = i + 1 < chunks.length ? fetchChunk(chunks[i + 1]) : null;
    next?.catch(() => {}); // handled when awaited
    await play(blob);
    if (id !== session) return;
  }
  setSpeaking(false);
}

export function stopSpeaking() {
  session++;
  controller?.abort();
  controller = null;
  audio?.pause();
  finishCurrent?.();
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  if (speaking) setSpeaking(false);
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
