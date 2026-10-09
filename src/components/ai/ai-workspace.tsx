"use client";

import { Camera, Gauge, Mic, Sparkles, Volume2 } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { saveAISettingsAction } from "@/app/(main)/ai/actions";
import { Button, Switch } from "@/components/ui";
import { LANGUAGES, type LanguageCode } from "@/lib/languages";
import { ChatView, LanguageSelect, useChat, type VoicePrefs } from "./chat";
import { useHasVoice } from "./use-voice";

type Settings = {
  voiceInput: boolean;
  speakReplies: boolean;
  language: LanguageCode;
  feedVarianceTolerancePct: number;
  predictiveHorizonDays: number;
};

export function AIWorkspace({
  settings,
  canManage,
  voiceServer,
  ttsServer,
  status,
}: {
  settings: Settings;
  voiceServer: boolean;
  ttsServer: boolean;
  status: ReactNode;
  canManage: boolean;
}) {
  const chat = useChat({ ...settings, voiceServer, ttsServer });

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
          onSaved={(s) => chat.applyPrefs({ ...s, voiceServer, ttsServer } satisfies VoicePrefs)}
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
  const voiceAvailable = useHasVoice(s.language);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const dirty = JSON.stringify(s) !== JSON.stringify(settings) && savedAt === null;
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setS((prev) => ({ ...prev, [key]: value }));
    setSavedAt(null);
  };

  return (
    <form
      className="h-fit rounded-2xl border border-line bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        startTransition(async () => {
          const saved = await saveAISettingsAction(form);
          setS(saved);
          setSavedAt(Date.now());
          onSaved(saved);
        });
      }}
    >
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Sparkles className="size-4" /> AI Settings
        </h3>
        {canManage && (
        <Button type="submit" disabled={pending || (!dirty && savedAt !== null)} className="h-8 px-3 text-xs">
          {pending ? "Saving…" : savedAt ? "Saved" : "Save Changes"}
        </Button>
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

        <SettingRow
          icon={<Volume2 className="size-4" />}
          title="Read replies aloud"
          description={
            ttsServer
              ? "Speak each answer in a Nigerian voice (YarnGPT) in English, Hausa, Igbo or Yoruba."
              : s.speakReplies && !voiceAvailable
                ? `This device has no ${LANGUAGES[s.language]} voice, so replies may be read with an English voice. Start the YarnGPT voice server for Nigerian voices.`
                : "Speak each answer using your device's voice. Start the YarnGPT voice server for Nigerian voices."
          }
        >
          <Switch
            name="speakReplies"
            checked={s.speakReplies}
            onChange={(v) => set("speakReplies", v)}
            label="Read replies aloud"
          />
        </SettingRow>

        <label className="flex items-center justify-between gap-3 rounded-xl border border-line p-4">
          <span>
            <span className="block text-sm font-semibold">Default language</span>
            <span className="text-xs text-muted">For replies and voice input.</span>
          </span>
          <select
            name="language"
            value={s.language}
            onChange={(e) => set("language", e.target.value as LanguageCode)}
            className="rounded-lg border border-line bg-background px-2 py-1.5 text-sm outline-none"
          >
            {(Object.keys(LANGUAGES) as LanguageCode[]).map((code) => (
              <option key={code} value={code}>
                {LANGUAGES[code]}
              </option>
            ))}
          </select>
        </label>

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
              onChange={(v) => set("feedVarianceTolerancePct", v)}
            />
            <Slider
              name="predictiveHorizonDays"
              label="Predictive Horizon"
              description="Warn when stock will run out within this many days."
              value={s.predictiveHorizonDays}
              min={3}
              max={30}
              format={(v) => `${v} days`}
              onChange={(v) => set("predictiveHorizonDays", v)}
            />
          </div>
        </div>
      </fieldset>
    </form>
  );
}
