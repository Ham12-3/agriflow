"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import type { BatchStatus } from "@/lib/farm-data";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  // Keep the native <dialog> (focus trap, Esc to close) in sync with `open`.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/30"
    >
      {open && (
        <div className="p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{title}</h2>
              {description && <p className="mt-1 text-sm text-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted hover:bg-background"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

const STATUS_PILL: Record<BatchStatus, string> = {
  healthy: "bg-good-soft text-good",
  warning: "bg-warn-soft text-warn",
  critical: "bg-bad-soft text-bad",
};

export function StatusPill({ status }: { status: BatchStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_PILL[status]}`}
    >
      {status}
    </span>
  );
}

export function Field({
  label,
  hint,
  className = "",
  ...input
}: { label: string; hint?: string } & ComponentProps<"input">) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-medium text-neutral-700">{label}</span>
      <input
        {...input}
        className="mt-1.5 h-10 w-full rounded-lg border border-line bg-card px-3 text-sm outline-none ring-foreground/10 placeholder:text-neutral-400 focus:ring-2"
      />
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

export function SelectField({
  label,
  className = "",
  children,
  ...select
}: { label: string } & ComponentProps<"select">) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-medium text-neutral-700">{label}</span>
      <select
        {...select}
        className="mt-1.5 h-10 w-full rounded-lg border border-line bg-card px-3 text-sm outline-none ring-foreground/10 focus:ring-2"
      >
        {children}
      </select>
    </label>
  );
}

// Accessible on/off switch. Submits "on" under `name` when checked.
export function Switch({
  name,
  checked,
  onChange,
  disabled,
  label,
}: {
  name?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          checked ? "bg-foreground" : "bg-neutral-300"
        }`}
      >
        <span
          className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
      {name && checked && <input type="hidden" name={name} value="on" />}
    </>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: { variant?: "primary" | "secondary" | "ghost" } & ComponentProps<"button">) {
  const styles = {
    primary: "bg-foreground text-white hover:bg-neutral-800",
    secondary: "border border-line bg-card text-foreground hover:bg-background",
    ghost: "text-muted hover:bg-background hover:text-foreground",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    />
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
      {message}
    </p>
  );
}
