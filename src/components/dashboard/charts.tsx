"use client";

import { Activity, Maximize2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDay } from "@/lib/dates";
import type { FarmChartSeries, WeightPoint } from "@/lib/farm-data";
import { Card, ChangePill } from "./cards";

const AXIS = { fontSize: 11, fill: "#6b6b70" };
const SERIES_COLORS = ["#f59e0b", "#22c55e", "#a855f7"];

const shortDate = (iso: string) => formatDay(iso);

// Evenly spaced "nice" ticks (steps of 1, 2, 2.5 or 5 × 10ⁿ) around the data.
function niceTicks(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const rawStep = (max - min || Math.max(Math.abs(max), 1)) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * magnitude >= rawStep) ?? 10) * magnitude;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Number(t.toFixed(4)));
  return ticks;
}

export type WeightSeries = { batchId: string; label: string; points: WeightPoint[] };

export function WeightTrendCard({ series }: { series: WeightSeries[] }) {
  const [batchId, setBatchId] = useState(series[0]?.batchId);
  const points = series.find((s) => s.batchId === batchId)?.points ?? [];
  const weightTicks = points.length ? niceTicks(points.map((p) => p.avgWeightKg)) : [];

  return (
    <Card className="flex min-h-80 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Weight Trend (30 Days)</h2>
          <p className="mt-1 text-xs text-muted">
            Average weight recorded across each active batch.
          </p>
        </div>
        {series.length > 1 && (
          <select
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            aria-label="Batch"
            className="rounded-lg border border-line bg-background px-2 py-1.5 text-xs font-medium outline-none"
          >
            {series.map((s) => (
              <option key={s.batchId} value={s.batchId}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {points.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <Activity className="size-6 text-neutral-300" />
          <p className="text-sm font-medium text-muted">No weight records yet</p>
          <p className="text-xs text-muted">
            Log batch weights in Production to see trends here.
          </p>
        </div>
      ) : (
        <div className="mt-4 h-72 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#eeeef0" />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tick={AXIS}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                width="auto"
                tick={AXIS}
                tickLine={false}
                axisLine={false}
                unit="kg"
                domain={[weightTicks[0], weightTicks.at(-1) ?? 1]}
                ticks={weightTicks}
                tickFormatter={(v: number) => String(v)}
              />
              <Tooltip
                labelFormatter={(label) => shortDate(String(label))}
                formatter={(v) => [`${v} kg`, "Avg weight"]}
              />
              <Line
                type="monotone"
                dataKey="avgWeightKg"
                stroke="#0a0a0a"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

export function FarmChartCard({
  charts,
  asOf,
}: {
  charts: FarmChartSeries[];
  asOf: string;
}) {
  const [index, setIndex] = useState(0);
  const chart = charts[index];
  if (!chart) return null;
  const goodWhenUp = !chart.lowerIsBetter;

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold">Farm Chart</h2>
          <p className="text-xs text-muted">
            {formatDay(asOf, { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </div>
        <Link
          href="/analytics"
          className="grid size-7 place-items-center rounded-full border border-line text-muted hover:text-foreground"
          aria-label="Open analytics"
        >
          <Maximize2 className="size-3.5" />
        </Link>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs font-semibold">{chart.title}</p>
        {chart.changePct !== null && (
          <ChangePill value={chart.changePct} goodWhenUp={goodWhenUp} />
        )}
      </div>

      <div className="mt-2 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chart.rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#eeeef0" />
            <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={false} />
            <YAxis
              width="auto"
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${chart.prefix ?? ""}${v.toLocaleString("en-NG")}${chart.suffix.trim()}`}
            />
            <Tooltip formatter={(v) => `${chart.prefix ?? ""}${Number(v).toLocaleString("en-NG")}${chart.suffix}`} />
            <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 11 }} />
            {chart.years.map((year, i) => (
              <Area
                key={year}
                type="monotone"
                dataKey={year}
                stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                fillOpacity={0.15}
                strokeWidth={1.5}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex justify-center gap-1.5">
        {charts.map((c, i) => (
          <button
            key={c.key}
            onClick={() => setIndex(i)}
            aria-label={`Show ${c.title}`}
            aria-current={i === index}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? "w-4 bg-foreground" : "w-1.5 bg-neutral-300"
            }`}
          />
        ))}
      </div>
    </Card>
  );
}
