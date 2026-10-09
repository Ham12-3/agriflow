"use client";

import { BadgeCheck, CircleAlert, Landmark, Pencil, Sparkles, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { setRevenueTargetAction } from "@/app/(main)/analytics/actions";
import { useAskAI } from "@/components/app-shell";
import { Button, Modal } from "@/components/ui";
import type { Analytics, CreditScore, Insight } from "@/lib/analytics";
import { formatDay } from "@/lib/dates";
import { formatNaira, formatNairaFull } from "@/lib/farm-data";

const AXIS = { fontSize: 11, fill: "#6b6b70" };
const BAR_COLORS = ["#e5484d", "#0a0a0a", "#f59e0b", "#a855f7", "#3b82f6"];

function Section({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-2xl border border-line bg-card p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function AnalyticsView({ data, canManage }: { data: Analytics; canManage: boolean }) {
  const [creditOpen, setCreditOpen] = useState(false);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Analytics</h2>
          <p className="mt-1 text-sm text-muted">
            Measure production efficiency, farm health and progress against your targets.
          </p>
        </div>
        {canManage && (
        <Button onClick={() => setCreditOpen(true)}>
          <Landmark className="size-4" /> Credit Scoring
        </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <InsightSection insights={data.insights} className="lg:col-span-2" />
        <EfficiencySection rows={data.efficiency} className="lg:col-span-2" />
        <HealthSection health={data.health} />
        {canManage && (
          <RevenueSection
            canManage={canManage}
            revenue={data.revenue}
            target={data.target}
            thisMonthRevenue={data.thisMonthRevenue}
          />
        )}
        <MortalitySection data={data} className="lg:col-span-2" />
      </div>

      {creditOpen && <CreditDialog credit={data.credit} onClose={() => setCreditOpen(false)} />}
    </>
  );
}

const INSIGHT_ICON = {
  good: <BadgeCheck className="size-4 text-good" />,
  warn: <TriangleAlert className="size-4 text-warn" />,
  bad: <CircleAlert className="size-4 text-bad" />,
};

function InsightSection({ insights, className }: { insights: Insight[]; className?: string }) {
  const ask = useAskAI();
  return (
    <Section
      title="Insight"
      subtitle="What your records are telling you right now."
      className={className}
      action={
        <Button
          variant="secondary"
          onClick={() =>
            ask("Look at my farm data and give me the 3 most important things I should do this week, with reasons.")
          }
        >
          <Sparkles className="size-4" /> Ask Agriflow AI
        </Button>
      }
    >
      {insights.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing stands out yet. Insights appear as you log daily records, stock and transactions.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {insights.map((i) => (
            <li key={i.text} className="flex gap-3 rounded-xl bg-background px-4 py-3 text-sm">
              <span className="mt-0.5 shrink-0">{INSIGHT_ICON[i.tone]}</span>
              <span>{i.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

const RATING = {
  good: { label: "Good", className: "bg-good-soft text-good" },
  ok: { label: "Fair", className: "bg-warn-soft text-warn" },
  poor: { label: "Poor", className: "bg-bad-soft text-bad" },
};

function EfficiencySection({ rows, className }: { rows: Analytics["efficiency"]; className?: string }) {
  return (
    <Section
      title="Production Efficiency"
      subtitle="Last 30 days of daily records. FCR = kg of feed per kg of weight gained (lower is better)."
      className={className}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Add a batch in Production to see efficiency.</p>
      ) : (
        <div className="relative -mx-5 overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-y border-line text-left text-[11px] uppercase tracking-[0.06em] text-muted">
                <th className="px-5 py-2.5 font-medium">Batch</th>
                <th className="px-5 py-2.5 font-medium">Days logged</th>
                <th className="px-5 py-2.5 font-medium">Daily gain / animal</th>
                <th className="px-5 py-2.5 font-medium">Feed / animal / day</th>
                <th className="px-5 py-2.5 font-medium">FCR</th>
                <th className="px-5 py-2.5 font-medium">Rating</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.batchId} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 font-medium">{r.label}</td>
                  <td className="px-5 py-3 tabular-nums">{r.days}</td>
                  <td className="px-5 py-3 tabular-nums">
                    {r.avgDailyGainKg === null ? "—" : `${r.avgDailyGainKg} kg`}
                  </td>
                  <td className="px-5 py-3 tabular-nums">
                    {r.feedPerHeadKg === null ? "—" : `${r.feedPerHeadKg} kg`}
                  </td>
                  <td className="px-5 py-3 font-semibold tabular-nums">{r.fcr ?? "—"}</td>
                  <td className="px-5 py-3">
                    {r.rating ? (
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${RATING[r.rating].className}`}>
                        {RATING[r.rating].label}
                      </span>
                    ) : (
                      <span className="text-xs text-muted" title="Benchmarks are set for broilers only for now">
                        No benchmark
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function Gauge({ score }: { score: number }) {
  const color = score >= 80 ? "var(--color-good)" : score >= 60 ? "var(--color-warn)" : "var(--color-bad)";
  const length = Math.PI * 80; // semicircle of radius 80
  return (
    <svg viewBox="0 0 200 110" className="mx-auto w-full max-w-56" role="img" aria-label={`Health score ${score} out of 100`}>
      <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#eeeef0" strokeWidth="16" strokeLinecap="round" />
      <path
        d="M20 100 A80 80 0 0 1 180 100"
        fill="none"
        stroke={color}
        strokeWidth="16"
        strokeLinecap="round"
        strokeDasharray={`${(length * score) / 100} ${length}`}
      />
      <text x="100" y="92" textAnchor="middle" className="fill-foreground text-[32px] font-semibold">
        {score}
      </text>
    </svg>
  );
}

function HealthSection({ health }: { health: Analytics["health"] }) {
  if (health.score === null) {
    return (
      <Section title="Health Score" subtitle="Overall farm condition, out of 100.">
        <p className="text-sm text-muted">Add a batch and log daily records to get a health score.</p>
      </Section>
    );
  }
  const tone = health.score >= 80 ? "text-good" : health.score >= 60 ? "text-warn" : "text-bad";
  return (
    <Section title="Health Score" subtitle="Overall farm condition, out of 100.">
      <Gauge score={health.score} />
      <p className={`mt-1 text-center text-xs font-semibold uppercase tracking-[0.12em] ${tone}`}>
        {health.label}
      </p>
      <ul className="mt-5 space-y-3">
        {health.parts.map((p) => (
          <li key={p.name}>
            <div className="flex justify-between text-sm">
              <span>{p.name}</span>
              <span className="font-medium tabular-nums">
                {p.score}/{p.max}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-foreground" style={{ width: `${(p.score / p.max) * 100}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-muted">{p.detail}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function RevenueSection({
  canManage,
  revenue,
  target,
  thisMonthRevenue,
}: {
  revenue: Analytics["revenue"];
  target: number;
  thisMonthRevenue: number;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(target));
  const [pending, startTransition] = useTransition();
  const progress = Math.min(100, Math.round((thisMonthRevenue / target) * 100));

  function save() {
    const value = Number(draft);
    if (!Number.isFinite(value) || value <= 0) return;
    startTransition(async () => {
      await setRevenueTargetAction(value);
      setEditing(false);
    });
  }

  return (
    <Section title="Revenue vs Target" subtitle="Monthly income against your revenue target.">
      <div className="mb-4 rounded-xl bg-background p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            This month: <strong className="tabular-nums">{formatNairaFull(thisMonthRevenue)}</strong>
          </span>
          {editing ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <label className="sr-only" htmlFor="revenue-target">Monthly target (₦)</label>
              <input
                id="revenue-target"
                type="number"
                min={1}
                step="any"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                className="h-8 w-32 rounded-md border border-line bg-card px-2 text-sm outline-none focus:ring-2 ring-foreground/10"
              />
              <Button type="submit" disabled={pending} className="h-8 px-2.5 text-xs">
                Save
              </Button>
            </form>
          ) : (
            <button
              onClick={() => setEditing(true)}
              disabled={!canManage}
              title={canManage ? "Edit monthly target" : "Only managers can change the target"}
              className="inline-flex items-center gap-1 text-muted hover:text-foreground"
            >
              Target {formatNairaFull(target)} <Pencil className="size-3" />
            </button>
          )}
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-200">
          <div
            className={`h-full rounded-full ${progress >= 100 ? "bg-good" : "bg-foreground"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-1 text-[11px] text-muted">{progress}% of this month&apos;s target</p>
      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={revenue} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#eeeef0" />
            <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={false} />
            <YAxis
              width="auto"
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatNaira(v)}
            />
            <Tooltip formatter={(v, name) => [formatNairaFull(Number(v)), name === "revenue" ? "Revenue" : "Expenses"]} />
            <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 11 }} formatter={(v) => (v === "revenue" ? "Revenue" : "Expenses")} />
            <ReferenceLine y={target} stroke="var(--color-good)" strokeDasharray="4 4" label={{ value: "Target", fontSize: 10, fill: "var(--color-good)", position: "insideTopRight" }} />
            <Bar dataKey="revenue" fill="#0a0a0a" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expenses" fill="#d4d4d8" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Section>
  );
}

const MORTALITY_STATUS = {
  good: { label: "Within benchmark", className: "bg-good-soft text-good" },
  watch: { label: "Watch", className: "bg-warn-soft text-warn" },
  high: { label: "High", className: "bg-bad-soft text-bad" },
};

function MortalitySection({ data, className }: { data: Analytics; className?: string }) {
  return (
    <Section title="Mortality" subtitle="Deaths recorded per day over the last 30 days." className={className}>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.mortality.map((m) => (
          <div key={m.batchId} className="rounded-xl bg-background p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{m.label}</p>
              {m.status && (
                <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${MORTALITY_STATUS[m.status].className}`}>
                  {MORTALITY_STATUS[m.status].label}
                </span>
              )}
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {m.ratePct === null ? "—" : `${m.ratePct}%`}
            </p>
            <p className="text-xs text-muted">
              {m.deaths} deaths in 30 days · {m.totalDeaths} since start
            </p>
          </div>
        ))}
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.mortalityDaily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#eeeef0" />
            <XAxis
              dataKey="date"
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              minTickGap={28}
              tickFormatter={(d: string) =>
                formatDay(d)
              }
            />
            <YAxis width="auto" allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
            <Tooltip
              labelFormatter={(d) =>
                formatDay(String(d))
              }
            />
            <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 11 }} />
            {data.batches.map((b, i) => (
              <Bar
                key={b.id}
                dataKey={b.id}
                name={b.label}
                stackId="deaths"
                fill={BAR_COLORS[i % BAR_COLORS.length]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Section>
  );
}

const GRADE_TONE: Record<CreditScore["grade"], string> = {
  A: "text-good",
  B: "text-good",
  C: "text-warn",
  D: "text-bad",
  E: "text-bad",
};

function CreditDialog({ credit, onClose }: { credit: CreditScore; onClose: () => void }) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Credit scoring"
      description="How your Agriflow records would look to a lender."
    >
      <div className="flex items-center gap-5 rounded-xl bg-background p-4">
        <div className="text-center">
          <p className={`text-5xl font-semibold ${GRADE_TONE[credit.grade]}`}>{credit.grade}</p>
          <p className="text-[11px] uppercase tracking-[0.1em] text-muted">Grade</p>
        </div>
        <div>
          <p className="text-2xl font-semibold tabular-nums">
            {credit.score}
            <span className="text-base text-muted">/100</span>
          </p>
          <p className="text-xs text-muted">
            Better records and steady profit raise your score — and your chances of affordable credit.
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-3">
        {credit.factors.map((f) => (
          <li key={f.name}>
            <div className="flex justify-between text-sm">
              <span className="font-medium">{f.name}</span>
              <span className="tabular-nums">
                {f.score}/{f.max}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-foreground" style={{ width: `${(f.score / f.max) * 100}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-muted">
              {f.detail}
              {f.score < f.max * 0.7 && <> · Tip: {f.tip}</>}
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[11px] leading-snug text-muted">
        Indicative score calculated from your Agriflow records only. It is not a credit bureau score
        and isn&apos;t shared with anyone.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => window.print()}>
          Print
        </Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}
