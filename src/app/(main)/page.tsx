import { Suspense } from "react";
import { BatchStatusCard, KpiCard } from "@/components/dashboard/cards";
import { FarmChartCard, WeightTrendCard } from "@/components/dashboard/charts";
import { PageSkeleton } from "@/components/page-skeleton";
import { requireContext } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard";
import { formatDay } from "@/lib/dates";
import { countByStatus, formatNaira, type Finances } from "@/lib/farm-data";

export default function DashboardPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const ctx = await requireContext();
  const data = getDashboardData(ctx);
  const { finances, batches } = data;
  const animals = batches.reduce((sum, b) => sum + b.currentCount, 0);
  const counts = countByStatus(batches);

  return (
    <>
      <div className="mb-5">
        <h2 className="text-2xl font-semibold tracking-tight">Hi {data.user.name.split(" ")[0]},</h2>
        <p className="text-sm text-muted">
          {formatDay(data.asOf, { weekday: "long", day: "numeric", month: "short" })} · {data.farm.name} overview this month
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {finances ? (
          <MoneyCards finances={finances} />
        ) : (
          <>
            <KpiCard label="Animals" value={animals.toLocaleString("en-NG")} caption="Across all batches" />
            <KpiCard label="Healthy batches" value={String(counts.healthy)} caption={`of ${batches.length}`} />
            <KpiCard
              label="Need attention"
              value={String(counts.warning + counts.critical)}
              caption={`${counts.critical} critical`}
            />
          </>
        )}
        <KpiCard
          label="Active batches"
          value={String(batches.length)}
          caption={`${animals.toLocaleString("en-NG")} Animals`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        <WeightTrendCard series={data.weightSeries} />
        <div className="flex flex-col gap-4">
          <FarmChartCard charts={data.farmCharts} asOf={data.asOf} />
          <BatchStatusCard counts={counts} />
        </div>
      </div>
    </>
  );
}

function MoneyCards({ finances }: { finances: Finances }) {
  const profit = finances.revenue - finances.expenses;
  const margin = finances.revenue ? Math.round((profit / finances.revenue) * 100) : 0;
  const marginLabel = `${String(margin).replace("-", "−")}% margin`;
  const expenseShare = finances.revenue ? Math.round((finances.expenses / finances.revenue) * 100) : 0;
  return (
    <>
      <KpiCard
        label="Revenue (this month)"
        value={formatNaira(finances.revenue)}
        caption={marginLabel}
        change={finances.revenueChangePct ?? undefined}
      />
      <KpiCard
        label="Expenses (this month)"
        value={formatNaira(finances.expenses)}
        caption={`${expenseShare}% of revenue`}
        change={finances.expensesChangePct ?? undefined}
        goodWhenUp={false}
      />
      <KpiCard
        label="Net profit (this month)"
        value={formatNaira(profit)}
        caption={marginLabel}
        change={finances.profitChangePct ?? undefined}
      />
    </>
  );
}
