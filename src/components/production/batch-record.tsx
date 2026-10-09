"use client";

import {
  ArrowLeft,
  Braces,
  ChevronRight,
  Download,
  Plus,
  Printer,
  Share2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteRecordAction,
  setBatchStatusAction,
} from "@/app/(main)/production/actions";
import { Button } from "@/components/ui";
import type { BatchSummary, DailyRecord } from "@/lib/db";
import { BATCH_STATUSES, formatKg, type BatchStatus } from "@/lib/farm-data";
import { downloadFile, toCsv } from "@/lib/csv";
import { AddRecordDialog } from "./add-record-dialog";

const STATUS_SELECT: Record<BatchStatus, string> = {
  healthy: "bg-good-soft text-good",
  warning: "bg-warn-soft text-warn",
  critical: "bg-bad-soft text-bad",
};

const COLUMNS: { key: keyof DailyRecord; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "stockLevel", label: "Stock level" },
  { key: "feedType", label: "Feed type" },
  { key: "feedIntakeKg", label: "Feed intake (kg)" },
  { key: "weightGainKg", label: "Daily weight gain (kg)" },
  { key: "medication", label: "Medication" },
  { key: "mortality", label: "Mortality" },
  { key: "recordedBy", label: "Recorded by" },
  { key: "notes", label: "Notes" },
];

function recordsCsv(records: DailyRecord[]) {
  return toCsv(
    COLUMNS.map((c) => c.label),
    records.map((r) => COLUMNS.map((c) => r[c.key])),
  );
}

export function BatchRecord({
  farmName,
  batch,
  records,
  allBatches,
  feedOptions,
  canManage,
}: {
  farmName: string;
  batch: BatchSummary;
  records: DailyRecord[];
  allBatches: { id: string; label: string }[];
  feedOptions: string[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [shareNote, setShareNote] = useState("");
  const [statusPending, startStatus] = useTransition();
  const latestStock = records[0]?.stockLevel ?? batch.currentCount;

  const stats = [
    { label: "Species", value: batch.species },
    { label: "Breed", value: batch.breed },
    { label: "Category", value: batch.category },
    { label: "Date added", value: batch.dateAdded },
    { label: "Age", value: `${batch.ageWeeks} wks` },
    { label: "Current head", value: batch.currentCount.toLocaleString("en-NG") },
    { label: "Avg weight", value: formatKg(batch.avgWeightKg) },
    { label: "Total mortality", value: batch.totalMortality.toLocaleString("en-NG") },
  ];

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Batch ${batch.id}`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShareNote("Link copied");
        setTimeout(() => setShareNote(""), 2000);
      }
    } catch {
      // User cancelled the share sheet.
    }
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1 text-xs text-muted print:hidden">
        <span>{farmName}</span>
        <ChevronRight className="size-3" />
        <Link href="/production" className="hover:text-foreground">
          Production
        </Link>
        <ChevronRight className="size-3" />
        <span className="font-medium text-foreground">Batch Record</span>
      </nav>
      <p className="mb-4 text-sm text-muted print:hidden">
        Manage livestock batches, stock level, age, mortality, weights, feed intake and yield.
      </p>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/production"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-card px-3 text-sm font-medium hover:bg-background print:hidden"
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
          <h2 className="text-lg font-semibold">
            {batch.id}
            <span className="font-normal text-muted">
              {" "}· {batch.species} · {batch.breed} · {latestStock.toLocaleString("en-NG")} head
            </span>
          </h2>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted print:hidden">
          Switch
          <select
            value={batch.id}
            onChange={(e) => router.push(`/production/${e.target.value}`)}
            className="h-9 rounded-lg border border-line bg-card px-2 text-sm font-medium text-foreground outline-none"
          >
            {allBatches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="rounded-2xl border border-line bg-card">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-line p-5 sm:grid-cols-4 xl:grid-cols-8">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="text-[11px] uppercase tracking-[0.06em] text-muted">{s.label}</p>
              <p className="mt-1 text-sm font-semibold">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5 print:hidden">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={!records.length}
              onClick={() => downloadFile(`${batch.id}-records.csv`, recordsCsv(records), "text/csv")}
            >
              <Download className="size-4" /> CSV
            </Button>
            <Button
              variant="secondary"
              disabled={!records.length}
              onClick={() =>
                downloadFile(
                  `${batch.id}-records.json`,
                  JSON.stringify({ batch, records }, null, 2),
                  "application/json",
                )
              }
            >
              <Braces className="size-4" /> JSON
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="size-4" /> Print
            </Button>
            <Button variant="secondary" onClick={share}>
              <Share2 className="size-4" /> {shareNote || "Share"}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={batch.status}
              disabled={statusPending}
              onChange={(e) =>
                startStatus(() =>
                  setBatchStatusAction(batch.id, e.target.value as BatchStatus),
                )
              }
              aria-label="Batch status"
              className={`h-9 rounded-lg px-2 text-sm font-medium capitalize outline-none ${STATUS_SELECT[batch.status]}`}
            >
              {BATCH_STATUSES.map((s) => (
                <option key={s} value={s} className="bg-card text-foreground">
                  {s}
                </option>
              ))}
            </select>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="size-4" /> Add Daily Record
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-y border-line text-left text-[11px] uppercase tracking-[0.06em] text-muted">
                {COLUMNS.map((c) => (
                  <th key={c.key} className="px-4 py-3 font-medium">
                    {c.label}
                  </th>
                ))}
                <th className="px-4 py-3 print:hidden">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <RecordRow key={r.id} batchId={batch.id} record={r} latest={i === 0} canManage={canManage} />
              ))}
            </tbody>
          </table>
          {records.length === 0 && (
            <div className="px-5 py-16 text-center">
              <p className="text-sm font-medium">No daily records yet</p>
              <p className="mt-1 text-xs text-muted">
                Add today&apos;s stock, feed and weight to start tracking this batch.
              </p>
            </div>
          )}
        </div>
      </section>

      {addOpen && (
        <AddRecordDialog
          batchId={batch.id}
          defaultStock={latestStock}
          lastFeedType={records[0]?.feedType}
          feedOptions={feedOptions}
          onClose={() => setAddOpen(false)}
        />
      )}
    </>
  );
}

function RecordRow({
  batchId,
  record: r,
  latest,
  canManage,
}: {
  batchId: string;
  record: DailyRecord;
  latest: boolean;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <tr className={`border-b border-line last:border-0 ${latest ? "bg-background/70" : ""} ${pending ? "opacity-40" : ""}`}>
      <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs">
        {r.date}
        {latest && (
          <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 font-sans text-[10px] font-medium uppercase tracking-wide text-neutral-600">
            Latest
          </span>
        )}
      </td>
      <td className="px-4 py-3.5 font-semibold tabular-nums">{r.stockLevel.toLocaleString("en-NG")}</td>
      <td className="px-4 py-3.5">
        <span className="whitespace-nowrap rounded-full bg-warn-soft px-2.5 py-0.5 text-xs text-warn">
          {r.feedType}
        </span>
      </td>
      <td className="px-4 py-3.5 tabular-nums">{r.feedIntakeKg.toLocaleString("en-NG")} kg</td>
      <td className="px-4 py-3.5 font-semibold tabular-nums">
        {r.weightGainKg >= 0 ? "+" : ""}
        {r.weightGainKg} kg
      </td>
      <td className="px-4 py-3.5">
        {r.medication ? (
          <span className="whitespace-nowrap rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-700">
            {r.medication}
          </span>
        ) : (
          <span className="text-muted">None</span>
        )}
      </td>
      <td className={`px-4 py-3.5 tabular-nums ${r.mortality > 0 ? "font-semibold text-bad" : ""}`}>
        {r.mortality}
      </td>
      <td className="px-4 py-3.5 text-muted">{r.recordedBy}</td>
      <td className="max-w-48 truncate px-4 py-3.5 text-muted" title={r.notes ?? undefined}>
        {r.notes ?? "—"}
      </td>
      <td className="px-4 py-3.5 text-right print:hidden">
        {canManage && (
        <button
          disabled={pending}
          onClick={() => {
            if (!confirm(`Delete the record for ${r.date}?`)) return;
            startTransition(() => deleteRecordAction(batchId, r.id));
          }}
          className="grid size-7 place-items-center rounded-md border border-bad/30 text-bad hover:bg-bad-soft"
          aria-label={`Delete record for ${r.date}`}
        >
          <X className="size-3.5" />
        </button>
        )}
      </td>
    </tr>
  );
}
