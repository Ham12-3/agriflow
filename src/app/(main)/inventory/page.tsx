import type { Metadata } from "next";
import { Suspense } from "react";
import { InventoryView } from "@/components/inventory/inventory-view";
import { PageSkeleton } from "@/components/page-skeleton";
import { hasRole, requireContext } from "@/lib/auth";
import { listItems } from "@/lib/inventory";

export const metadata: Metadata = { title: "Feed & Inventory · Agriflow" };

export default function InventoryPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Inventory />
    </Suspense>
  );
}

async function Inventory() {
  const ctx = await requireContext();
  return <InventoryView items={listItems(ctx.farm.id)} canManage={hasRole(ctx, "manager")} />;
}
