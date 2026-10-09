import type { Metadata } from "next";
import { Suspense } from "react";
import { MeetingsView } from "@/components/meetings/meetings-view";
import { PageSkeleton } from "@/components/page-skeleton";
import { hasRole, requireContext } from "@/lib/auth";
import { listMembers } from "@/lib/farms";
import { listMeetings } from "@/lib/meetings";

export const metadata: Metadata = { title: "Meetings · Agriflow" };

export default function MeetingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Meetings />
    </Suspense>
  );
}

async function Meetings() {
  const ctx = await requireContext();
  return (
    <MeetingsView
      meetings={listMeetings(ctx.farm.id)}
      members={listMembers(ctx.farm.id)
        .filter((m) => m.status === "active")
        .map((m) => ({ userId: m.userId, name: m.name }))}
      canManage={hasRole(ctx, "manager")}
    />
  );
}
