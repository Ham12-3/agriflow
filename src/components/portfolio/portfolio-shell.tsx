"use client";

import { Circle, LogOut, Menu, Network, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { switchFarmAction } from "@/app/(auth)/actions";
import { SignOutButton, type ShellFarm } from "@/components/header";
import { Logo } from "@/components/sidebar";

export function PortfolioShell({
  user,
  farms,
  children,
}: {
  user: { name: string };
  farms: ShellFarm[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen">
      {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-card px-4 py-5 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-2">
          <Logo />
          <button onClick={() => setOpen(false)} className="rounded-md p-1 text-muted lg:hidden" aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>
        <Suspense fallback={<Nav pathname={null} />}>
          <ActiveNav />
        </Suspense>

        <p className="mt-6 px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Quick access</p>
        <div className="mt-2 flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {farms.map((f) => (
            <form key={f.id} action={switchFarmAction.bind(null, f.id)}>
              <button type="submit" className="w-full truncate rounded-lg px-3 py-2 text-left text-sm text-neutral-700 hover:bg-background">
                {f.name}
              </button>
            </form>
          ))}
        </div>

        <div className="rounded-xl border border-line bg-background p-4">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="text-xs text-muted">
            {farms.length} {farms.length === 1 ? "Farm" : "Farms"}
          </p>
          <SignOutButton className="mt-3 flex items-center gap-2 text-xs text-muted hover:text-foreground">
            <LogOut className="size-3.5" /> Sign out
          </SignOutButton>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex h-14 items-center border-b border-line bg-card px-4 lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-md p-1.5" aria-label="Open menu">
            <Menu className="size-5" />
          </button>
        </header>
        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

function ActiveNav() {
  return <Nav pathname={usePathname()} />;
}

function Nav({ pathname }: { pathname: string | null }) {
  const links = [
    { href: "/overview", label: "Overview", icon: Circle },
    { href: "/farms", label: "My farms", icon: Network },
  ];
  return (
    <nav className="mt-8 flex flex-col gap-1">
      {links.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${active ? "bg-foreground text-white" : "text-neutral-700 hover:bg-background"}`}
          >
            <Icon className="size-4" /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
