"use client";

import { Bell, Check, ChevronDown, LayoutGrid, LogOut, Menu, Search, Tractor } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { signOutAction, switchFarmAction } from "@/app/(auth)/actions";
import type { Notification } from "@/lib/notifications";

export type ShellFarm = { id: number; name: string };

export function AskAISearch({
  onAsk,
  className = "",
}: {
  onAsk: (question: string) => void;
  className?: string;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      className={`relative ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        onAsk(value.trim());
        setValue("");
      }}
    >
      <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask Agriflow AI"
        aria-label="Ask Agriflow AI"
        className="h-10 w-full rounded-full bg-background pl-11 pr-4 text-sm outline-none ring-foreground/10 placeholder:text-muted focus:ring-2"
      />
    </form>
  );
}

/** A button that toggles a floating panel; closes on outside click or Escape. */
function Dropdown({
  button,
  label,
  align = "left",
  children,
}: {
  button: (open: boolean) => ReactNode;
  label: string;
  align?: "left" | "right";
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" aria-label={label} className="rounded-lg">
        {button(open)}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute top-full z-40 mt-2 w-72 overflow-hidden rounded-2xl border border-line bg-card shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function FarmSwitcher({ farm, farms }: { farm: ShellFarm; farms: ShellFarm[] }) {
  return (
    <Dropdown
      label={`Switch farm (current: ${farm.name})`}
      button={(open) => (
        <span className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-base font-semibold hover:bg-background">
          <span className="size-2 rounded-full bg-good" aria-hidden />
          <span className="max-w-[40vw] truncate">{farm.name}</span>
          <ChevronDown className={`size-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      )}
    >
      {(close) => (
        <div className="p-2">
          <p className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Your farms</p>
          {farms.map((f) => (
            <form key={f.id} action={switchFarmAction.bind(null, f.id)}>
              <button
                type="submit"
                role="menuitem"
                onClick={() => f.id === farm.id && close()}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-background"
              >
                <span className="truncate">{f.name}</span>
                {f.id === farm.id && <Check className="size-4 text-good" />}
              </button>
            </form>
          ))}
          <div className="my-1 border-t border-line" />
          <Link href="/overview" onClick={close} role="menuitem" className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-background">
            <LayoutGrid className="size-4 text-muted" /> All farms overview
          </Link>
          <Link href="/farms" onClick={close} role="menuitem" className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-background">
            <Tractor className="size-4 text-muted" /> My farms
          </Link>
        </div>
      )}
    </Dropdown>
  );
}

const FILTERS = { all: "All", alert: "Alerts", stock: "Stock", meeting: "Meetings" } as const;
const TONE_DOT = { bad: "bg-bad", warn: "bg-warn", info: "bg-foreground" };

export function NotificationsMenu({ notifications }: { notifications: Notification[] }) {
  const [filter, setFilter] = useState<keyof typeof FILTERS>("all");
  const shown = filter === "all" ? notifications : notifications.filter((n) => n.kind === filter);
  const urgent = notifications.filter((n) => n.tone !== "info").length;

  return (
    <Dropdown
      label={`Notifications (${notifications.length})`}
      align="right"
      button={() => (
        <span className="relative grid size-9 place-items-center rounded-full bg-background hover:bg-neutral-200">
          <Bell className="size-4" />
          {notifications.length > 0 && (
            <span
              className={`absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold text-white ${urgent ? "bg-bad" : "bg-foreground"}`}
            >
              {notifications.length}
            </span>
          )}
        </span>
      )}
    >
      {(close) => (
        <>
          <div className="border-b border-line p-3">
            <p className="text-sm font-semibold">Notifications</p>
            <div className="mt-2 flex gap-1.5" role="tablist" aria-label="Filter notifications">
              {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={filter === f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${filter === f ? "bg-foreground text-white" : "bg-background text-muted"}`}
                >
                  {FILTERS[f]}
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">You&apos;re all caught up.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {shown.map((n) => (
                <li key={n.id}>
                  <Link href={n.href} onClick={close} role="menuitem" className="flex gap-3 px-4 py-3 hover:bg-background">
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${TONE_DOT[n.tone]}`} aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{n.title}</span>
                      <span className="block truncate text-xs text-muted">{n.detail}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Dropdown>
  );
}

export function SignOutButton({ className = "", children }: { className?: string; children?: ReactNode }) {
  return (
    <form action={signOutAction}>
      <button type="submit" className={className} aria-label="Sign out" title="Sign out">
        {children ?? <LogOut className="size-4" />}
      </button>
    </form>
  );
}

export function Header({
  farm,
  farms,
  user,
  notifications,
  onMenu,
  onAsk,
}: {
  farm: ShellFarm;
  farms: ShellFarm[];
  user: { name: string; email: string };
  notifications: Notification[];
  onMenu: () => void;
  onAsk: (question: string) => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-card px-4 sm:px-6 print:hidden">
      <button
        onClick={onMenu}
        className="hidden rounded-md p-1.5 hover:bg-background md:block lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>
      <FarmSwitcher farm={farm} farms={farms} />

      <AskAISearch onAsk={onAsk} className="ml-auto hidden w-full max-w-sm md:block" />

      <div className="ml-auto flex items-center gap-3 md:ml-4">
        <NotificationsMenu notifications={notifications} />
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-full bg-foreground text-sm font-semibold text-white">
            {user.name.charAt(0).toUpperCase()}
          </span>
          <div className="hidden max-w-44 leading-tight sm:block">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
        </div>
        <SignOutButton className="hidden p-1 text-muted hover:text-foreground sm:block" />
      </div>
    </header>
  );
}
