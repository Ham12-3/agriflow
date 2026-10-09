"use client";

import {
  CalendarDays,
  ChartColumn,
  Layers,
  LayoutDashboard,
  LogOut,
  Sparkles,
  Users,
  Wallet,
  Wheat,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import type { Role } from "@/lib/auth";
import { SignOutButton } from "./header";

export type NavItem = { label: string; short: string; icon: LucideIcon; href: string; managersOnly?: boolean };

export const NAV: NavItem[] = [
  { label: "Dashboard", short: "Home", icon: LayoutDashboard, href: "/" },
  { label: "Production", short: "Production", icon: Layers, href: "/production" },
  { label: "Feed and Inventory", short: "Feed", icon: Wheat, href: "/inventory" },
  { label: "Finances", short: "Finance", icon: Wallet, href: "/finances", managersOnly: true },
  { label: "Analytics", short: "Analytics", icon: ChartColumn, href: "/analytics" },
  { label: "Meeting", short: "Meeting", icon: CalendarDays, href: "/meetings" },
  { label: "Team", short: "Team", icon: Users, href: "/team" },
  { label: "AI", short: "AI", icon: Sparkles, href: "/ai" },
];

export const navFor = (role: Role) => NAV.filter((n) => !n.managersOnly || role !== "worker");

export const isActive = (href: string, pathname: string | null) =>
  pathname !== null && (href === "/" ? pathname === "/" : pathname.startsWith(href));

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-7 place-items-center rounded-md bg-foreground text-sm font-bold text-white">
        A
      </span>
      <span className="text-lg font-semibold tracking-tight">Agriflow</span>
    </div>
  );
}

export function Sidebar({
  farmName,
  role,
  open,
  onClose,
}: {
  farmName: string;
  role: Role;
  open: boolean;
  onClose: () => void;
}) {
  const items = navFor(role);
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={onClose} aria-hidden />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-card px-4 py-5 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 print:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-2">
          <Logo />
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-background lg:hidden" aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>

        {/* The active link depends on the URL, which isn't known while prerendering
            dynamic routes, so it streams in behind a plain fallback. */}
        <Suspense fallback={<NavLinks items={items} pathname={null} onNavigate={onClose} />}>
          <ActiveNavLinks items={items} onNavigate={onClose} />
        </Suspense>

        <div className="rounded-xl border border-line bg-background p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Active Farm</p>
          <p className="mt-1 truncate text-sm font-semibold">{farmName}</p>
          <SignOutButton className="mt-3 flex items-center gap-2 text-xs text-muted hover:text-foreground">
            <LogOut className="size-3.5" />
            Sign out
          </SignOutButton>
        </div>
      </aside>
    </>
  );
}

function ActiveNavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate: () => void }) {
  return <NavLinks items={items} pathname={usePathname()} onNavigate={onNavigate} />;
}

function NavLinks({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string | null;
  onNavigate: () => void;
}) {
  return (
    <nav className="mt-8 flex flex-1 flex-col gap-1">
      {items.map(({ label, icon: Icon, href }) => {
        const active = isActive(href, pathname);
        return (
          <Link
            key={label}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active ? "bg-foreground text-white" : "text-neutral-700 hover:bg-background"
            }`}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
