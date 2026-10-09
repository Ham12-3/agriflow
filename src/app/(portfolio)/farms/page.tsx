import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { FarmsList } from "@/components/portfolio/farms-list";
import { requireContext } from "@/lib/auth";
import { listUserFarms } from "@/lib/farms";

export const metadata: Metadata = { title: "My Farms · Agriflow" };

export default function FarmsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Farms />
    </Suspense>
  );
}

async function Farms() {
  const ctx = await requireContext();
  return <FarmsList farms={listUserFarms(ctx.user.id)} activeFarmId={ctx.farm.id} />;
}
