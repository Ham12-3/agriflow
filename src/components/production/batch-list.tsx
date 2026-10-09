"use client";

import { Camera, Ellipsis, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { deleteBatchAction } from "@/app/(main)/production/actions";
import { Button, StatusPill } from "@/components/ui";
import type { BatchSummary } from "@/lib/db";
import { formatKg } from "@/lib/farm-data";
import { NewBatchDialog } from "./new-batch-dialog";

export function BatchList({ batches, canManage }: { batches: BatchSummary[]; canManage: boolean }) {
  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return batches;
    return batches.filter((b) =>
      [b.id, b.species, b.breed, b.category].some((v) => v.toLowerCase().includes(q)),
    );
  }, [batches, query]);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Production Tracking</h2>
          <p className="mt-1 text-sm text-muted">
            Manage livestock batches, weights, and AgriSnap entries.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled
            title="AgriSnap notebook scanning is coming soon"
          >
            <Camera className="size-4" />
            Scan Notebook
          </Button>
          {canManage && (
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="size-4" />
            New Batch
          </Button>
          )}
        </div>
      </div>

      <section className="rounded-2xl border border-line bg-card">
        <div className="flex items-center justify-between gap-4 p-4 sm:p-5">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search batches or species…"
              aria-label="Search batches or species"
              className="h-10 w-full rounded-lg border border-line bg-card pl-10 pr-3 text-sm outline-none ring-foreground/10 placeholder:text-muted focus:ring-2"
            />
          </div>
          <span className="shrink-0 text-sm text-muted">
            {filtered.length} {filtered.length === 1 ? "batch" : "batches"}
          </span>
        </div>

        {/* Phones get a card per batch instead of a wide table. */}
        <ul className="divide-y divide-line border-t border-line sm:hidden">
          {filtered.map((b) => (
            <li key={b.id} className="flex items-center gap-3 px-4 py-3.5">
              <Link href={`/production/${b.id}`} className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{b.id}</span>
                  <StatusPill status={b.status} />
                </div>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {b.species} · {b.breed} · {b.category}
                </p>
                <p className="mt-1.5 text-xs tabular-nums text-neutral-700">
                  {b.currentCount.toLocaleString("en-NG")} head · {b.ageWeeks}w ·{" "}
                  {formatKg(b.avgWeightKg)}
                </p>
              </Link>
              <RowMenu batchId={b.id} canManage={canManage} />
            </li>
          ))}
        </ul>

        <div className="hidden sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-line text-left text-[11px] uppercase tracking-[0.06em] text-muted">
                <th className="px-5 py-3 font-medium">Batch ID</th>
                <th className="px-5 py-3 font-medium">Species &amp; Breed</th>
                <th className="px-5 py-3 font-medium">Count</th>
                <th className="px-5 py-3 font-medium">Age (weeks)</th>
                <th className="px-5 py-3 font-medium">Avg weight</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr
                  key={b.id}
                  onClick={() => router.push(`/production/${b.id}`)}
                  className="cursor-pointer border-b border-line last:border-0 hover:bg-background/60"
                >
                  <td className="whitespace-nowrap px-5 py-4 font-semibold">
                    <Link href={`/production/${b.id}`} onClick={(e) => e.stopPropagation()}>
                      {b.id}
                    </Link>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-medium">{b.species}</p>
                    <p className="text-xs text-muted">
                      {b.breed} · {b.category}
                    </p>
                  </td>
                  <td className="px-5 py-4 tabular-nums">{b.currentCount.toLocaleString("en-NG")}</td>
                  <td className="px-5 py-4 tabular-nums">{b.ageWeeks}w</td>
                  <td className="px-5 py-4 tabular-nums">{formatKg(b.avgWeightKg)}</td>
                  <td className="px-5 py-4">
                    <StatusPill status={b.status} />
                  </td>
                  <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <RowMenu batchId={b.id} canManage={canManage} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
            <div className="px-5 py-16 text-center">
              <p className="text-sm font-medium">
                {batches.length === 0 ? "No batches yet" : "No batches match your search"}
              </p>
              <p className="mt-1 text-xs text-muted">
                {batches.length === 0
                  ? "Create your first batch to start logging daily records."
                  : "Try a batch ID, species or breed."}
              </p>
            </div>
          )}
      </section>

      {newOpen && <NewBatchDialog open onClose={() => setNewOpen(false)} />}
    </>
  );
}

function RowMenu({ batchId, canManage }: { batchId: string; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={(e) => {
          if (!e.currentTarget.parentElement?.contains(e.relatedTarget)) setOpen(false);
        }}
        className="grid size-8 place-items-center rounded-lg text-muted hover:bg-background hover:text-foreground"
        aria-label={`Actions for ${batchId}`}
        aria-expanded={open}
      >
        <Ellipsis className="size-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-xl border border-line bg-card py-1 text-left shadow-lg">
          <Link
            href={`/production/${batchId}`}
            className="block px-3 py-2 text-sm hover:bg-background"
          >
            View records
          </Link>
          {canManage && (
          <button
            disabled={pending}
            onClick={() => {
              if (!confirm(`Delete batch ${batchId} and all of its daily records?`)) return;
              startTransition(() => deleteBatchAction(batchId));
            }}
            className="block w-full px-3 py-2 text-left text-sm text-bad hover:bg-bad-soft disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Delete batch"}
          </button>
          )}
        </div>
      )}
    </div>
  );
}
