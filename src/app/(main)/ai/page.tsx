import { CircleCheck, CircleDashed, CircleX } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AIWorkspace } from "@/components/ai/ai-workspace";
import { PageSkeleton } from "@/components/page-skeleton";
import { checkModelStatus, checkSpeechStatus, checkVoiceStatus, type ServiceStatus } from "@/lib/ai/status";
import { hasRole, requireContext } from "@/lib/auth";
import { getAISettings, getReplyLanguage } from "@/lib/settings";

export const metadata: Metadata = { title: "AI · Agriflow" };

export default function AIPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AIContent />
    </Suspense>
  );
}

async function AIContent() {
  const ctx = await requireContext();
  return (
    <AIWorkspace
      settings={getAISettings(ctx.farm.id)}
      replyLanguage={getReplyLanguage(ctx.user.id, ctx.farm.id)}
      canManage={hasRole(ctx, "manager")}
      voiceServer={Boolean(process.env.ASR_BASE_URL)}
      ttsServer={Boolean(process.env.TTS_BASE_URL)}
      status={
        <Suspense fallback={<StatusList loading />}>
          <Status />
        </Suspense>
      }
    />
  );
}

async function Status() {
  const [model, voice, speech] = await Promise.all([checkModelStatus(), checkVoiceStatus(), checkSpeechStatus()]);
  return <StatusList model={model} voice={voice} speech={speech} />;
}

const ICON = {
  online: <CircleCheck className="size-4 text-good" />,
  offline: <CircleX className="size-4 text-bad" />,
  "not-configured": <CircleDashed className="size-4 text-muted" />,
};
const LABEL = { online: "Connected", offline: "Offline", "not-configured": "Not set up" };

function StatusList({
  model,
  voice,
  speech,
  loading,
}: {
  model?: ServiceStatus;
  voice?: ServiceStatus;
  speech?: ServiceStatus;
  loading?: boolean;
}) {
  const rows = [
    { name: "N-ATLaS chat model", s: model },
    { name: "Voice transcription", s: voice },
    { name: "Spoken replies (YarnGPT)", s: speech },
  ];
  return (
    <ul className="divide-y divide-line rounded-xl bg-background text-sm" aria-busy={loading}>
      {rows.map(({ name, s }) => (
        <li key={name} className="flex items-center gap-3 px-4 py-3">
          {s ? ICON[s.state] : <CircleDashed className="size-4 animate-spin text-muted" />}
          <div className="min-w-0 flex-1">
            <p className="font-medium">{name}</p>
            <p className="truncate text-xs text-muted">{s ? s.detail : "Checking…"}</p>
          </div>
          <span className="text-xs text-muted">{s ? LABEL[s.state] : ""}</span>
        </li>
      ))}
    </ul>
  );
}
