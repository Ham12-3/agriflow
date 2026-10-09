import type { Metadata } from "next";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { TeamView } from "@/components/team/team-view";
import { hasRole, requireContext } from "@/lib/auth";
import { listBatches } from "@/lib/db";
import { listMembers } from "@/lib/farms";

export const metadata: Metadata = { title: "Team · Agriflow" };

export default function TeamPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Team />
    </Suspense>
  );
}

async function Team() {
  const ctx = await requireContext();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const joinLink = `${proto}://${host}/join?code=${ctx.farm.joinCode}`;
  const qrSvg = await QRCode.toString(joinLink, { type: "svg", margin: 1, width: 160 });

  return (
    <TeamView
      farmName={ctx.farm.name}
      joinCode={ctx.farm.joinCode}
      joinLink={joinLink}
      qrSvg={qrSvg}
      members={listMembers(ctx.farm.id)}
      batches={listBatches(ctx.farm.id).map((b) => ({ id: b.id, label: `${b.id} · ${b.species}` }))}
      me={{ userId: ctx.user.id, role: ctx.role }}
      canManage={hasRole(ctx, "manager")}
    />
  );
}
