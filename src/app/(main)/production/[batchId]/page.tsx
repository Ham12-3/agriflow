import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { BatchRecord } from "@/components/production/batch-record";
import { hasRole, requireContext } from "@/lib/auth";
import { getBatch, listBatches, listRecords } from "@/lib/db";
import { feedItemNames } from "@/lib/inventory";

export async function generateMetadata({
  params,
}: PageProps<"/production/[batchId]">): Promise<Metadata> {
  const { batchId } = await params;
  return { title: `${decodeURIComponent(batchId)} · Production · Agriflow` };
}

export default function BatchPage({ params }: PageProps<"/production/[batchId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Batch params={params} />
    </Suspense>
  );
}

async function Batch({ params }: { params: Promise<{ batchId: string }> }) {
  const ctx = await requireContext();
  const batchId = decodeURIComponent((await params).batchId);
  const batch = getBatch(ctx.farm.id, batchId);
  if (!batch) notFound();

  const allBatches = listBatches(ctx.farm.id).map((b) => ({
    id: b.id,
    label: `${b.id} · ${b.species} · ${b.breed}`,
  }));

  return (
    <BatchRecord
      farmName={ctx.farm.name}
      canManage={hasRole(ctx, "manager")}
      batch={batch}
      records={listRecords(batch.id)}
      allBatches={allBatches}
      feedOptions={feedItemNames(ctx.farm.id)}
    />
  );
}
