import { TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import type { BatchStatus } from "@/lib/farm-data";

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-2xl border border-line bg-card p-5 ${className}`}>
      {children}
    </section>
  );
}

export function ChangePill({
  value,
  goodWhenUp = true,
}: {
  value: number;
  goodWhenUp?: boolean;
}) {
  const up = value >= 0;
  const good = up === goodWhenUp;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        good ? "bg-good-soft text-good" : "bg-bad-soft text-bad"
      }`}
    >
      <Icon className="size-3" />
      {up ? "+" : ""}
      {value}%
    </span>
  );
}

export function KpiCard({
  label,
  value,
  caption,
  change,
  goodWhenUp,
}: {
  label: string;
  value: string;
  caption: string;
  change?: number;
  goodWhenUp?: boolean;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
        {label}
      </p>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{caption}</span>
        {change !== undefined && (
          <ChangePill value={change} goodWhenUp={goodWhenUp} />
        )}
      </div>
    </Card>
  );
}

const STATUS_STYLES: Record<BatchStatus, { label: string; className: string }> = {
  healthy: { label: "Healthy", className: "bg-good-soft text-good" },
  warning: { label: "Warning", className: "bg-warn-soft text-warn" },
  critical: { label: "Critical", className: "bg-bad-soft text-bad" },
};

export function BatchStatusCard({
  counts,
}: {
  counts: Record<BatchStatus, number>;
}) {
  return (
    <Card>
      <h2 className="text-sm font-semibold">Batch Status</h2>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {(Object.keys(STATUS_STYLES) as BatchStatus[]).map((status) => (
          <div
            key={status}
            className={`flex flex-col items-center gap-1 rounded-xl py-4 ${STATUS_STYLES[status].className}`}
          >
            <span className="text-2xl font-semibold">{counts[status]}</span>
            <span className="text-xs font-medium">{STATUS_STYLES[status].label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
