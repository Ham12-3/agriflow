import type { Metadata } from "next";
import { Suspense } from "react";
import { JoinForm } from "@/components/auth/auth-forms";
import { AuthPage } from "@/components/auth/auth-page";
import { getContext } from "@/lib/auth";
import { farmByJoinCode, userCanAccessFarm } from "@/lib/farms";

export const metadata: Metadata = { title: "Join a farm · Agriflow" };

// Onboarding screen for workers: they arrive here from the farm's join link
// or QR code (Team page) and enter / confirm the code.
export default function JoinPage({ searchParams }: PageProps<"/join">) {
  return (
    <AuthPage prompt="Setting up your own farm?" linkLabel="Create an account" href="/signup">
      <Suspense>
        <Join searchParams={searchParams} />
      </Suspense>
    </AuthPage>
  );
}

async function Join({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).code;
  const code = typeof raw === "string" ? raw.trim().toUpperCase().slice(0, 20) : "";
  const farm = code ? farmByJoinCode(code) : undefined;
  const ctx = await getContext();
  return (
    <JoinForm
      code={code}
      farmName={farm?.name ?? null}
      signedInAs={ctx ? ctx.user.email : null}
      alreadyMember={Boolean(ctx && farm && userCanAccessFarm(ctx.user.id, farm.id))}
    />
  );
}
