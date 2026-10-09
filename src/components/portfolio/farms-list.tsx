"use client";

import { ArrowRight, Plus, Search, Warehouse } from "lucide-react";
import { useMemo, useState } from "react";
import { switchFarmAction } from "@/app/(auth)/actions";
import { createFarmAction } from "@/app/(portfolio)/actions";
import { Button, Field, FormError, Modal, SelectField } from "@/components/ui";
import { useDialogAction } from "@/components/use-dialog-action";
import { formatNaira } from "@/lib/farm-data";
import type { FarmCard } from "@/lib/farms";

const FARM_TYPES = ["Mixed", "Poultry", "Cattle", "Dairy", "Goat & sheep", "Piggery", "Fish"];

export function FarmsList({ farms, activeFarmId }: { farms: FarmCard[]; activeFarmId: number }) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? farms.filter((f) => `${f.name} ${f.location}`.toLowerCase().includes(q)) : farms;
  }, [farms, query]);

  const livestock = farms.reduce((s, f) => s + f.livestock, 0);
  const revenue = farms.reduce((s, f) => s + f.revenue, 0);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Farms</h1>
          <p className="mt-1 text-sm text-muted">Manage your farms and review livestock and financial performance.</p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Add farm
        </Button>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {[
          { label: "My farms", value: String(farms.length), caption: "Farms in your portfolio" },
          { label: "Livestock count", value: livestock.toLocaleString("en-NG"), caption: "Head" },
          { label: "Total revenue", value: formatNaira(revenue), caption: "Across all farms, this year" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-card p-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{s.label}</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight">{s.value}</p>
            <p className="text-xs text-muted">{s.caption}</p>
          </div>
        ))}
      </div>

      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-semibold">Your farms</h2>
        <span className="rounded-full bg-neutral-200 px-2 text-xs font-medium">{farms.length}</span>
      </div>
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search farms by name"
          aria-label="Search farms by name"
          className="h-10 w-full rounded-lg border border-line bg-card pl-10 pr-3 text-sm outline-none ring-foreground/10 placeholder:text-muted focus:ring-2"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((f) => {
          const share = revenue > 0 ? Math.round((f.revenue / revenue) * 100) : 0;
          return (
            <article key={f.id} className="flex flex-col rounded-2xl border border-line bg-card p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-background">
                  <Warehouse className="size-4 text-muted" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold">{f.name}</h3>
                  <p className="truncate text-xs text-muted">
                    {[f.location, f.type, f.established && `Est. ${f.established}`].filter(Boolean).join(" · ") || "No details yet"}
                  </p>
                </div>
                {f.id === activeFarmId && (
                  <span className="rounded-full bg-good-soft px-2 py-0.5 text-[11px] font-medium text-good">Active</span>
                )}
              </div>
              <p className="mt-4 text-[11px] uppercase tracking-[0.08em] text-muted">Livestock count</p>
              <p className="text-2xl font-semibold">
                {f.livestock.toLocaleString("en-NG")} <span className="text-xs font-normal text-muted">Head</span>
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.08em] text-muted">Revenue</p>
                  <p className="font-semibold">{formatNaira(f.revenue)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.08em] text-muted">Net profit</p>
                  <p className={`font-semibold ${f.revenue - f.expenses < 0 ? "text-bad" : ""}`}>{formatNaira(f.revenue - f.expenses)}</p>
                </div>
              </div>
              <div className="mt-3 flex justify-between border-t border-line pt-3 text-xs text-muted">
                <span>
                  {f.users} {f.users === 1 ? "user" : "users"} · {f.manager ? `Manager: ${f.manager}` : "No manager"}
                </span>
                <span>{share}% of revenue</span>
              </div>
              <form action={switchFarmAction.bind(null, f.id)} className="mt-4">
                <button
                  type="submit"
                  className="flex h-9 w-full items-center justify-between rounded-lg border border-line px-3 text-sm font-medium hover:bg-background"
                >
                  {f.id === activeFarmId ? "Open farm" : "View farm"} <ArrowRight className="size-4" />
                </button>
              </form>
            </article>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-muted">
        Showing {shown.length} of {farms.length} {farms.length === 1 ? "farm" : "farms"}
      </p>

      {adding && <AddFarmDialog onClose={() => setAdding(false)} />}
    </>
  );
}

function AddFarmDialog({ onClose }: { onClose: () => void }) {
  const [state, onSubmit, pending] = useDialogAction(createFarmAction, onClose);
  return (
    <Modal open onClose={onClose} title="Add a farm" description="You'll be the owner and can invite your team.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Farm name" name="name" required placeholder="Farm 2" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Location" name="location" placeholder="Lagos, Nigeria" />
          <SelectField label="Type" name="type" defaultValue="Mixed">
            {FARM_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </SelectField>
          <Field label="Established (year)" name="established" type="number" min={1900} max={2100} placeholder="2002" />
        </div>
        <FormError message={state.error} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create farm"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
