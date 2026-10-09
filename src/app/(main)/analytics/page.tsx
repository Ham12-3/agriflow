import type { Metadata } from "next";
import { Suspense } from "react";
import { AnalyticsView } from "@/components/analytics/analytics-view";
import { PageSkeleton } from "@/components/page-skeleton";
import { getAnalytics } from "@/lib/analytics";
import { hasRole, requireContext } from "@/lib/auth";

export const metadata: Metadata = { title: "Analytics · Agriflow" };

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AnalyticsContent />
    </Suspense>
  );
}

async function AnalyticsContent() {
  const ctx = await requireContext();
  const canManage = hasRole(ctx, "manager");
  return <AnalyticsView data={getAnalytics(ctx.farm.id, canManage)} canManage={canManage} />;
}
