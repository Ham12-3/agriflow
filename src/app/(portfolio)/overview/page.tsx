import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { requireContext } from "@/lib/auth";
import { formatNaira } from "@/lib/farm-data";
import { listUserFarms } from "@/lib/farms";

export const metadata: Metadata = { title: "Overview · Agriflow" };

// All-farms portfolio (Wireframes 1 & 11). Money figures are this year.
export default function OverviewPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview />
    </Suspense>
  );
}

function Bar({ pct }: { pct: number }) {
  return (
    <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-neutral-200">
      <div className="h-full rounded-full bg-foreground" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

async function Overview() {
  const ctx = await requireContext();
  const farms = listUserFarms(ctx.user.id);
  const livestock = farms.reduce((s, f) => s + f.livestock, 0);
  const revenue = farms.reduce((s, f) => s + f.revenue, 0);
  const expenses = farms.reduce((s, f) => s + f.expenses, 0);
  const net = revenue - expenses;
  const margin = revenue > 0 ? Math.round((net / revenue) * 100) : null;
  const maxHead = Math.max(1, ...farms.map((f) => f.livestock));

  const stats = [
    { label: "Livestock count", value: livestock.toLocaleString("en-NG"), caption: "Head" },
    { label: "Total revenue", value: formatNaira(revenue), caption: "This year" },
    { label: "Total expenses", value: formatNaira(expenses), caption: "This year" },
    { label: "Net profit", value: formatNaira(net), caption: "This year", tone: net < 0 ? "text-bad" : "" },
  ];

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-muted">Livestock and money across every farm you manage.</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-card p-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{s.label}</p>
            <p className={`mt-3 text-2xl font-semibold tracking-tight ${s.tone ?? ""}`}>{s.value}</p>
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted">{s.caption}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-card p-5">
          <h2 className="text-base font-semibold">Revenue by Farm</h2>
          <ul className="mt-4 space-y-4">
            {farms.map((f) => {
              const share = revenue > 0 ? Math.round((f.revenue / revenue) * 100) : 0;
              return (
                <li key={f.id}>
                  <div className="flex justify-between gap-3 text-sm">
                    <span>{f.name}</span>
                    <span className="text-right">
                      <span className="block font-semibold">{formatNaira(f.revenue)}</span>
                      <span className="block text-[11px] text-muted">Net: {formatNaira(f.revenue - f.expenses)}</span>
                    </span>
                  </div>
                  <Bar pct={share} />
                  <p className="mt-1 text-[11px] text-muted">{share}% of Total Revenue</p>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-2xl border border-line bg-card p-5">
          <h2 className="text-base font-semibold">Livestock by Farm</h2>
          <ul className="mt-4 space-y-4">
            {farms.map((f) => (
              <li key={f.id}>
                <div className="flex justify-between text-sm">
                  <span>{f.name}</span>
                  <span className="font-semibold">{f.livestock.toLocaleString("en-NG")} Head</span>
                </div>
                <Bar pct={(f.livestock / maxHead) * 100} />
              </li>
            ))}
          </ul>
          <div className="mt-6 border-t border-line pt-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Portfolio margin</p>
            <p className={`mt-1 text-2xl font-semibold ${margin !== null && margin < 0 ? "text-bad" : ""}`}>
              {margin === null ? "—" : `${String(margin).replace("-", "−")}%`}
            </p>
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted">Net profit margin</p>
          </div>
        </section>
      </div>
    </>
  );
}
