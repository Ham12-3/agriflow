"use client";

import { ArrowRight, Eye, EyeOff, Lock } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, type ComponentProps } from "react";
import { joinFarmAction, logInAction, signUpAction } from "@/app/(auth)/actions";
import { Button, Field, FormError } from "@/components/ui";

// These forms use <form action>, not onSubmit: if someone submits before the
// page's JavaScript loads, React queues it instead of the browser falling back
// to a GET that would put the email and password in the URL. React clears the
// form after each attempt, so non-secret fields come back via state.fields.

function PasswordField({ label, hint, ...input }: { label: string; hint?: string } & ComponentProps<"input">) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className="text-xs font-medium text-neutral-700">{label}</span>
      <span className="relative mt-1.5 block">
        <input
          {...input}
          type={show ? "text" : "password"}
          className="h-10 w-full rounded-lg border border-line bg-card pl-3 pr-10 text-sm outline-none ring-foreground/10 placeholder:text-neutral-400 focus:ring-2"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted hover:text-foreground"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </span>
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

function Heading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{eyebrow}</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted">{subtitle}</p>
    </div>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(logInAction, { ok: false });
  const [forgot, setForgot] = useState(false);
  return (
    <form action={formAction} className="space-y-4">
      <Heading eyebrow="Welcome to Agriflow" title="Welcome back" subtitle="Log in to see how your farms are doing." />
      <input type="hidden" name="next" value={next} />
      <Field label="Email address" name="email" type="email" autoComplete="email" required placeholder="you@example.com" defaultValue={state.fields?.email} />
      <PasswordField label="Password" name="password" autoComplete="current-password" required placeholder="Enter your password" />
      <div className="flex items-center justify-between text-xs">
        <label className="flex items-center gap-2 text-muted">
          <input type="checkbox" name="remember" defaultChecked className="accent-foreground" /> Remember me
        </label>
        <button type="button" onClick={() => setForgot((f) => !f)} className="font-medium hover:underline">
          Forgot password?
        </button>
      </div>
      {forgot && (
        <p className="rounded-lg bg-background px-3 py-2 text-xs text-muted">
          Ask your farm owner to remove you and send a new join link, or contact support. Email resets
          need an email service, which isn&apos;t set up yet.
        </p>
      )}
      <FormError message={state.error} />
      <Button type="submit" disabled={pending} className="h-11 w-full">
        {pending ? "Logging in…" : "Log in"} <ArrowRight className="size-4" />
      </Button>
      <p className="text-center text-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-semibold text-foreground hover:underline">
          Sign up
        </Link>
      </p>
      <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted">
        <Lock className="size-3" /> A secure home for your farm data.
      </p>
    </form>
  );
}

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUpAction, { ok: false });
  return (
    <form action={formAction} className="space-y-4">
      <Heading eyebrow="Get started with Agriflow" title="Create your account" subtitle="Bring your farms into one workspace. Start with your details below." />
      <Field label="Full name" name="name" autoComplete="name" required placeholder="Enter your full name" defaultValue={state.fields?.name} />
      <Field label="Email address" name="email" type="email" autoComplete="email" required placeholder="you@example.com" defaultValue={state.fields?.email} />
      <Field label="Farm or business name" name="farmName" required placeholder="Enter your farm or business name" defaultValue={state.fields?.farmName} />
      <PasswordField
        label="Password"
        name="password"
        autoComplete="new-password"
        required
        minLength={8}
        placeholder="Create a password"
        hint="At least 8 characters, including a number."
      />
      <PasswordField label="Confirm password" name="confirm" autoComplete="new-password" required placeholder="Re-enter your password" />
      <label className="flex items-start gap-2 text-xs text-muted">
        <input type="checkbox" name="terms" required className="mt-0.5 accent-foreground" />
        <span>I agree to Agriflow&apos;s Terms of Service and Privacy Policy.</span>
      </label>
      <FormError message={state.error} />
      <Button type="submit" disabled={pending} className="h-11 w-full">
        {pending ? "Creating account…" : "Create account"} <ArrowRight className="size-4" />
      </Button>
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-foreground hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}

export function JoinForm({
  code,
  farmName,
  signedInAs,
}: {
  code: string;
  farmName: string | null;
  signedInAs: string | null;
}) {
  const [state, formAction, pending] = useActionState(joinFarmAction, { ok: false });
  return (
    <form action={formAction} className="space-y-4">
      <Heading
        eyebrow="Join a farm"
        title={farmName ? `Join ${farmName}` : "Enter your farm code"}
        subtitle={
          signedInAs
            ? `You're signed in as ${signedInAs}. Joining adds this farm to your account.`
            : "Your farm owner shares this code or link. You'll create your login as you join."
        }
      />
      <Field label="Farm join code" name="code" required defaultValue={code} placeholder="FJA767282" className="[&_input]:uppercase [&_input]:tracking-widest" />
      {!signedInAs && (
        <>
          <Field label="Full name" name="name" autoComplete="name" required placeholder="Enter your full name" defaultValue={state.fields?.name} />
          <Field label="Email address" name="email" type="email" autoComplete="email" required placeholder="you@example.com" defaultValue={state.fields?.email} />
          <PasswordField
            label="Password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="Create a password"
            hint="At least 8 characters, including a number."
          />
        </>
      )}
      <FormError message={state.error} />
      <Button type="submit" disabled={pending} className="h-11 w-full">
        {pending ? "Joining…" : "Join farm"} <ArrowRight className="size-4" />
      </Button>
      {!signedInAs && (
        <p className="text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href={`/login?next=${encodeURIComponent(`/join?code=${code}`)}`} className="font-semibold text-foreground hover:underline">
            Log in first
          </Link>
        </p>
      )}
    </form>
  );
}
