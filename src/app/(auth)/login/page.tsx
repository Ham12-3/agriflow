import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/auth-forms";
import { AuthPage } from "@/components/auth/auth-page";
import { getContext } from "@/lib/auth";

export const metadata: Metadata = { title: "Log in · Agriflow" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthPage prompt="New to Agriflow?" linkLabel="Create an account" href="/signup">
      <Suspense>
        <Login searchParams={searchParams} />
      </Suspense>
    </AuthPage>
  );
}

async function Login({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).next;
  // Only same-site paths, never "//evil.com".
  const next = typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  if (await getContext()) redirect(next);
  return <LoginForm next={next} />;
}
