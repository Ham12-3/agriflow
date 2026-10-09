"use client";

import { Camera, Check, Gauge, LoaderCircle, Mic, Sparkles, Square, Volume2 } from "lucide-react";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { saveAISettingsAction } from "@/app/(main)/ai/actions";
import { Switch } from "@/components/ui";
import { LANGUAGES, REPLY_LANGUAGES, type LanguageCode, type ReplyLanguage } from "@/lib/languages";
import { VOICES, VOICE_SAMPLES, type VoiceChoice } from "@/lib/voices";
import { ChatView, LanguageSelect, useChat } from "./chat";
import { speak, stopSpeaking, useSpeech } from "./use-voice";

type Settings = {
  voiceInput: boolean;
  language: ReplyLanguage;
  voices: VoiceChoice;
  feedVarianceTolerancePct: number;
  predictiveHorizonDays: number;
};

export function AIWorkspace({
  settings,
  replyLanguage,
  canManage,
  voiceServer,
  ttsServer,
  status,
}: {
  settings: Settings;
  replyLanguage: ReplyLanguage;
  voiceServer: boolean;
  ttsServer: boolean;
  status: ReactNode;
  canManage: boolean;
}) {
  const chat = useChat({ voiceInput: settings.voiceInput, language: replyLanguage, voiceServer, ttsServer });

  return (
    <>
      <div className="mb-5">
        <h2 className="text-2xl font-semibold tracking-tight">Agriflow AI</h2>
        <p className="mt-1 text-sm text-muted">
          Talk or type to your farm assistant, and configure the AI that powers Agriflow&apos;s insights.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex h-[calc(100dvh-12rem)] min-h-[480px] min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-card">
          <header className="flex items-center gap-3 border-b border-line px-5 py-4">
            <span className="grid size-8 place-items-center rounded-lg bg-foreground text-white">
              <Sparkles className="size-4" />
            </span>
            <div className="flex-1">
              <h3 className="text-sm font-semibold">Ask Agriflow AI</h3>
              <p className="text-xs text-muted">
                Powered by N-ATLaS{chat.prefs.voiceInput ? " · tap the mic to speak" : ""}
              </p>
            </div>
            <LanguageSelect chat={chat} />
          </header>
          <ChatView chat={chat} autoFocus={false} />
        </section>

        <SettingsCard
          settings={settings}
          status={status}
          canManage={canManage}
          ttsServer={ttsServer}
          onSaved={(s) => chat.applyPrefs({ voiceInput: s.voiceInput })}
        />
      </div>
    </>
  );
}

function SettingRow({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line p-4">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground text-white">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

function Slider({
  name,
  label,
  description,
  value,
  min,
  max,
  format,
  onChange,
}: {
  name: string;
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-sm font-medium">
        {label}
        <span className="tabular-nums">{format(value)}</span>
      </span>
      <input
        type="range"
        name={name}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-foreground"
      />
      <span className="flex justify-between text-[11px] text-muted">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </span>
      <span className="mt-1 block text-[11px] text-muted">{description}</span>
    </label>
  );
}

function SettingsCard({
  canManage,
  settings,
  status,
  ttsServer,
  onSaved,
}: {
  settings: Settings;
  status: ReactNode;
  ttsServer: boolean;
  onSaved: (s: Settings) => void;
  canManage: boolean;
}) {
  const [s, setS] = useState(settings);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [, startTransition] = useTransition();
  const queued = useRef<Partial<Settings>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Every change saves on its own; sliders wait until you stop dragging.
  const set = <K extends keyof Settings>(key: K, value: Settings[K], delay = 0) => {
    setS((prev) => ({ ...prev, [key]: value }));
    queued.current = { ...queued.current, [key]: value };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const next = queued.current;
      queued.current = {};
      setSaveState("saving");
      startTransition(async () => {
        try {
          const saved = await saveAISettingsAction(next);
          if (!Object.keys(queued.current).length) setS(saved);
          setSaveState("saved");
          onSaved(saved);
        } catch {
          setSaveState("error");
        }
      });
    }, delay);
  };

  return (
    <div className="h-fit rounded-2xl border border-line bg-card p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Sparkles className="size-4" /> AI Settings
        </h3>
        {canManage && (
          <span className="flex items-center gap-1 text-xs text-muted" role="status" aria-live="polite">
            {saveState === "saving" && (
              <>
                <LoaderCircle className="size-3.5 animate-spin" /> Saving…
              </>
            )}
            {saveState === "saved" && (
              <>
                <Check className="size-3.5 text-good" /> Saved
              </>
            )}
            {saveState === "error" && <span className="text-bad">Couldn&apos;t save. Try again.</span>}
            {saveState === "idle" && "Changes save automatically"}
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-muted">
        Configure the smart bridges — the AI models powering Agriflow&apos;s data capture and InsightEngine predictions.
      </p>

      {!canManage && (
        <p className="mb-3 rounded-lg bg-background px-3 py-2 text-xs text-muted">
          Only farm managers can change these settings.
        </p>
      )}
      {status}

      <fieldset disabled={!canManage} className="mt-4 space-y-3 disabled:opacity-70">
        <SettingRow
          icon={<Camera className="size-4" />}
          title="AgriSnap (Vision OCR)"
          description="Photograph handwritten notebooks and turn them into records. Coming soon — needs an image-reading AI model; N-ATLaS is text-only."
        >
          <Switch checked={false} onChange={() => {}} disabled label="AgriSnap (coming soon)" />
        </SettingRow>

        <SettingRow
          icon={<Mic className="size-4" />}
          title="AgriTalk (Voice Input)"
          description="Speak questions and field notes in English, Hausa, Igbo or Yoruba. Shows a microphone in the assistant."
        >
          <Switch
            name="voiceInput"
            checked={s.voiceInput}
            onChange={(v) => set("voiceInput", v)}
            label="AgriTalk voice input"
          />
        </SettingRow>

        <label className="flex items-center justify-between gap-3 rounded-xl border border-line p-4">
          <span>
            <span className="block text-sm font-semibold">Default reply language</span>
            <span className="text-xs text-muted">For people who haven&apos;t picked their own in the chat.</span>
          </span>
          <select
            name="language"
            value={s.language}
            onChange={(e) => set("language", e.target.value as ReplyLanguage)}
            className="rounded-lg border border-line bg-background px-2 py-1.5 text-sm outline-none"
          >
            {(Object.keys(REPLY_LANGUAGES) as ReplyLanguage[]).map((code) => (
              <option key={code} value={code}>
                {REPLY_LANGUAGES[code]}
              </option>
            ))}
          </select>
        </label>

        <VoicesSetting
          voices={s.voices}
          ttsServer={ttsServer}
          canManage={canManage}
          onChange={(voices) => set("voices", voices)}
        />

        <div className="rounded-xl border border-line p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Gauge className="size-4" /> InsightEngine Thresholds
          </p>
          <p className="mb-4 mt-0.5 text-xs text-muted">
            Set how sensitive Agriflow is when flagging problems in Analytics and Inventory.
          </p>
          <div className="space-y-5">
            <Slider
              name="feedVarianceTolerancePct"
              label="Feed Variance Tolerance"
              description="Flag a batch when a day's feed per animal is this far from its recent average."
              value={s.feedVarianceTolerancePct}
              min={5}
              max={50}
              format={(v) => `±${v}%`}
              onChange={(v) => set("feedVarianceTolerancePct", v, 600)}
            />
            <Slider
              name="predictiveHorizonDays"
              label="Predictive Horizon"
              description="Warn when stock will run out within this many days."
              value={s.predictiveHorizonDays}
              min={3}
              max={30}
              format={(v) => `${v} days`}
              onChange={(v) => set("predictiveHorizonDays", v, 600)}
            />
          </div>
        </div>
      </fieldset>
    </div>
  );
}

function VoicesSetting({
  voices,
  ttsServer,
  canManage,
  onChange,
}: {
  voices: VoiceChoice;
  ttsServer: boolean;
  canManage: boolean;
  onChange: (voices: VoiceChoice) => void;
}) {
  const speech = useSpeech();
  return (
    <div className="rounded-xl border border-line p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Volume2 className="size-4" /> Voices for spoken replies
      </p>
      <p className="mb-3 mt-0.5 text-xs text-muted">
        {ttsServer
          ? "Nigerian YarnGPT voices. Press Try to hear one (it takes a few seconds to prepare)."
          : "Start the YarnGPT voice server (npm run tts) to use these voices; until then replies use your device's voice."}
      </p>
      <div className="space-y-2">
        {(Object.keys(LANGUAGES) as LanguageCode[]).map((lang) => {
          const sampleId = `voice-sample-${lang}`;
          const playing = speech.id === sampleId;
          return (
            <div key={lang} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs font-medium">{LANGUAGES[lang]}</span>
              <select
                value={voices[lang]}
                disabled={!canManage}
                onChange={(e) => onChange({ ...voices, [lang]: e.target.value })}
                aria-label={`${LANGUAGES[lang]} voice`}
                className="min-w-0 flex-1 rounded-lg border border-line bg-background px-2 py-1.5 text-xs outline-none"
              >
                {VOICES[lang].map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!ttsServer}
                onClick={() =>
                  playing
                    ? stopSpeaking()
                    : speak(sampleId, VOICE_SAMPLES[lang], lang, { yarngpt: true, voice: voices[lang] })
                }
                className="flex w-16 shrink-0 items-center justify-center gap-1 rounded-lg border border-line px-2 py-1.5 text-xs font-medium hover:bg-background disabled:opacity-40"
                aria-label={playing ? "Stop" : `Try the ${LANGUAGES[lang]} voice`}
              >
                {playing && speech.phase === "preparing" ? (
                  <LoaderCircle className="size-3 animate-spin" />
                ) : playing ? (
                  <Square className="size-3" />
                ) : (
                  <Volume2 className="size-3" />
                )}
                {playing ? "Stop" : "Try"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
