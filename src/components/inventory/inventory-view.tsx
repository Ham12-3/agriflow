"use client";

import { Plus, Truck, X } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteItemAction, setStockCountAction } from "@/app/(main)/inventory/actions";
import { Button } from "@/components/ui";
import { formatDay } from "@/lib/dates";
import { formatNaira } from "@/lib/farm-data";
import type { InventoryItem } from "@/lib/inventory";
import { AddItemDialog, LogDeliveryDialog } from "./inventory-dialogs";

function qty(n: number) {
  return n.toLocaleString("en-NG", { maximumFractionDigits: 1 });
}


export function InventoryView({ items, canManage }: { items: InventoryItem[]; canManage: boolean }) {
  const [dialog, setDialog] = useState<"add" | "delivery" | null>(null);
  const attention = items.filter((i) => i.needsAttention).length;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Feed &amp; Inventory</h2>
          <p className="mt-1 text-sm text-muted">
            Real-time stock tracking with predictive depletion alerts.
          </p>
        </div>
        <div className="flex gap-2">
          {canManage && (
          <Button variant="secondary" onClick={() => setDialog("add")}>
            <Plus className="size-4" /> Add Item
          </Button>
          )}
          <Button onClick={() => setDialog("delivery")} disabled={items.length === 0}>
            <Truck className="size-4" /> Log Delivery
          </Button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4">
        <Stat label="Total items" value={String(items.length)} />
        <Stat
          label="Needs attention"
          value={String(attention)}
          valueClass={attention > 0 ? "text-bad" : undefined}
        />
      </div>

      <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
        {items.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium">No items yet</p>
            <p className="mt-1 text-xs text-muted">
              Add your feeds and medicines to start tracking stock.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              // Keyed on quantity so the count input resets when stock changes.
              <ItemCard key={`${item.id}-${item.quantity}`} item={item} canManage={canManage} />
            ))}
          </div>
        )}
      </section>

      {dialog === "add" && <AddItemDialog onClose={() => setDialog(null)} />}
      {dialog === "delivery" && (
        <LogDeliveryDialog items={items} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

function Stat({
  label,
  value,
  valueClass = "",
  className = "",
}: {
  label: string;
  value: string;
  valueClass?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-line bg-card p-5 ${className}`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className={`mt-3 text-2xl font-semibold tracking-tight ${valueClass}`}>{value}</p>
    </div>
  );
}

function ItemCard({ item, canManage }: { item: InventoryItem; canManage: boolean }) {
  const [count, setCount] = useState(String(item.quantity));
  const [pending, startTransition] = useTransition();
  const pct = Math.min(100, Math.round((item.quantity / item.capacity) * 100));

  function saveCount() {
    const value = Number(count);
    if (count.trim() === "" || !Number.isFinite(value) || value < 0) {
      setCount(String(item.quantity));
      return;
    }
    if (value === item.quantity) return;
    startTransition(() => setStockCountAction(item.id, value));
  }

  return (
    <article
      className={`flex flex-col rounded-2xl border p-5 ${
        item.needsAttention ? "border-bad/40" : "border-line"
      } ${pending ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold">{item.name}</h3>
          <p className="text-xs text-muted">{item.category}</p>
        </div>
        <div className="flex items-center gap-1">
          {item.attentionReason && (
            <span className="whitespace-nowrap rounded-full bg-bad-soft px-2 py-0.5 text-[11px] font-medium text-bad">
              {item.attentionReason}
            </span>
          )}
          {canManage && (
          <button
            onClick={() => {
              if (!confirm(`Remove ${item.name} from inventory?`)) return;
              startTransition(() => deleteItemAction(item.id));
            }}
            className="grid size-7 place-items-center rounded-md text-muted hover:bg-bad-soft hover:text-bad"
            aria-label={`Remove ${item.name}`}
          >
            <X className="size-4" />
          </button>
          )}
        </div>
      </div>

      <p className="mt-3 text-sm text-muted">
        {qty(item.quantity)}/{qty(item.capacity)} {item.unit} · {pct}%
      </p>
      <div
        className="mt-2 h-2.5 overflow-hidden rounded-full bg-neutral-200"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${item.name} stock level`}
      >
        <div
          className={`h-full rounded-full ${item.needsAttention ? "bg-bad" : "bg-foreground"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <label className="mt-4 flex items-center gap-3">
        <span className="sr-only">Stock count for {item.name}</span>
        <input
          type="number"
          min={0}
          step="any"
          value={count}
          disabled={pending}
          onChange={(e) => setCount(e.target.value)}
          onBlur={saveCount}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          title="Type a new count after checking the store"
          className="h-11 min-w-0 flex-1 rounded-lg bg-background px-4 text-sm font-medium tabular-nums outline-none ring-foreground/10 focus:ring-2"
        />
        <span className="w-14 text-sm text-muted">{item.unit}</span>
      </label>

      {canManage && (
        <p className="mt-4 text-sm">
          Cost: <span className="font-semibold">{formatNaira(Math.round(item.quantity * item.unitCost))}</span>
          <span className="text-muted"> · ₦{qty(item.unitCost)}/{item.unit.replace(/s$/, "")}</span>
        </p>
      )}

      {item.avgDailyUsage !== null && item.daysLeft !== null && (
        <p className={`mt-1 text-xs ${item.needsAttention ? "text-bad" : "text-muted"}`}>
          Uses ~{qty(item.avgDailyUsage)} {item.unit}/day ·{" "}
          {item.daysLeft < 1
            ? "runs out today"
            : `~${Math.floor(item.daysLeft)} days left (runs out ${item.runsOutOn ? formatDay(item.runsOutOn) : "soon"})`}
        </p>
      )}
    </article>
  );
}
