import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { PortfolioShell } from "@/components/portfolio/portfolio-shell";
import { requireContext } from "@/lib/auth";
import { listFarmNames } from "@/lib/farms";

// Multi-farm screens (Overview, My Farms) with their own sidebar, per the design.
export default function PortfolioLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<div className="p-6"><PageSkeleton /></div>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  return (
    <PortfolioShell user={{ name: ctx.user.name }} farms={listFarmNames(ctx.user.id)}>
      {children}
    </PortfolioShell>
  );
}
