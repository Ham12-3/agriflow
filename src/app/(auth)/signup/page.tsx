import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignupForm } from "@/components/auth/auth-forms";
import { AuthPage } from "@/components/auth/auth-page";
import { getContext } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign up · Agriflow" };

export default function SignupPage() {
  return (
    <AuthPage prompt="Already have an account?" linkLabel="Log in" href="/login">
      <Suspense>
        <Signup />
      </Suspense>
    </AuthPage>
  );
}

async function Signup() {
  if (await getContext()) redirect("/");
  return <SignupForm />;
}
