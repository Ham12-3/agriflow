import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { PageSkeleton } from "@/components/page-skeleton";
import { requireContext } from "@/lib/auth";
import { listFarmNames } from "@/lib/farms";
import { getNotifications } from "@/lib/notifications";

// The signed-in farm app. Reading the session is request-time work, so the
// shell streams in behind a Suspense boundary.
export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  return (
    <AppShell
      farm={{ id: ctx.farm.id, name: ctx.farm.name }}
      farms={listFarmNames(ctx.user.id)}
      user={{ name: ctx.user.name, email: ctx.user.email }}
      role={ctx.role}
      notifications={getNotifications(ctx)}
    >
      {children}
    </AppShell>
  );
}

function ShellFallback() {
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-64 border-r border-line bg-card lg:block" />
      <div className="flex-1">
        <div className="h-16 border-b border-line bg-card" />
        <div className="p-6">
          <PageSkeleton />
        </div>
      </div>
    </div>
  );
}
