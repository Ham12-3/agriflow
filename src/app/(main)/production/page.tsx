import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { BatchList } from "@/components/production/batch-list";
import { hasRole, requireContext } from "@/lib/auth";
import { listBatches } from "@/lib/db";

export const metadata: Metadata = { title: "Production · Agriflow" };

export default function ProductionPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Batches />
    </Suspense>
  );
}

async function Batches() {
  const ctx = await requireContext();
  return <BatchList batches={listBatches(ctx.farm.id)} canManage={hasRole(ctx, "manager")} />;
}
