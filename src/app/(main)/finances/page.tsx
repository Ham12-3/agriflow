import type { Metadata } from "next";
import { Suspense } from "react";
import { FinanceView } from "@/components/finances/finance-view";
import { PageSkeleton } from "@/components/page-skeleton";
import { hasRole, requireContext } from "@/lib/auth";
import { NoAccess } from "@/components/no-access";
import { listBatches } from "@/lib/db";
import { listTransactions, summarize } from "@/lib/finances";

export const metadata: Metadata = { title: "Finances · Agriflow" };

export default function FinancesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Finances />
    </Suspense>
  );
}

// All-time figures, as in the design (no period picker).
async function Finances() {
  const ctx = await requireContext();
  if (!hasRole(ctx, "manager")) return <NoAccess what="Finances" />;
  const { rows, truncated } = listTransactions(ctx.farm.id, "all");

  return (
    <FinanceView
      summary={summarize(ctx.farm.id, "all")}
      transactions={rows}
      truncated={truncated}
      batches={listBatches(ctx.farm.id).map((b) => ({ id: b.id, label: `${b.id} · ${b.species}` }))}
    />
  );
}
