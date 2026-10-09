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
  const canManage = hasRole(ctx, "manager");
  // Workers don't see money, so costs aren't sent to their browser at all.
  const items = listItems(ctx.farm.id).map((i) => (canManage ? i : { ...i, unitCost: 0 }));
  return <InventoryView items={items} canManage={canManage} />;
}
