"use client";

import { LayoutGrid, LogOut, MoreHorizontal, Tractor, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import type { Role } from "@/lib/auth";
import { SignOutButton } from "./header";
import { isActive, navFor, type NavItem } from "./sidebar";

// Phone navigation from the design: four tabs plus "More", which opens a sheet
// with the remaining pages.
const TABS = ["/", "/production", "/inventory", "/finances"];

export function MobileNav({ role }: { role: Role }) {
  const items = navFor(role);
  const tabs = items.filter((i) => TABS.includes(i.href)).slice(0, 4);
  const more = items.filter((i) => !tabs.includes(i));
  return (
    <Suspense fallback={<Bar tabs={tabs} more={more} pathname={null} />}>
      <ActiveBar tabs={tabs} more={more} />
    </Suspense>
  );
}

function ActiveBar({ tabs, more }: { tabs: NavItem[]; more: NavItem[] }) {
  return <Bar tabs={tabs} more={more} pathname={usePathname()} />;
}

function Bar({ tabs, more, pathname }: { tabs: NavItem[]; more: NavItem[]; pathname: string | null }) {
  const [sheet, setSheet] = useState(false);
  const moreActive = more.some((i) => isActive(i.href, pathname));

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
      >
        {tabs.map(({ short, icon: Icon, href }) => {
          const active = isActive(href, pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${active ? "text-good" : "text-muted"}`}
            >
              <span className={`grid h-7 w-12 place-items-center rounded-full ${active ? "bg-good-soft" : ""}`}>
                <Icon className="size-4" />
              </span>
              {short}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setSheet(true)}
          aria-expanded={sheet}
          className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${moreActive ? "text-good" : "text-muted"}`}
        >
          <span className={`grid h-7 w-12 place-items-center rounded-full ${moreActive ? "bg-good-soft" : ""}`}>
            <MoreHorizontal className="size-4" />
          </span>
          More
        </button>
      </nav>

      {sheet && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/80 md:hidden" onClick={() => setSheet(false)}>
          <button
            type="button"
            onClick={() => setSheet(false)}
            className="mx-auto mb-6 grid size-10 place-items-center rounded-full bg-card"
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
          <div
            role="dialog"
            aria-label="More pages"
            onClick={(e) => e.stopPropagation()}
            className="rounded-t-3xl bg-card p-5 pb-24"
          >
            <div className="grid grid-cols-4 gap-3">
              {[
                ...more,
                { label: "All farms", short: "Overview", icon: LayoutGrid, href: "/overview" },
                { label: "My farms", short: "My farms", icon: Tractor, href: "/farms" },
              ].map(({ short, icon: Icon, href }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setSheet(false)}
                  className="flex flex-col items-center gap-1.5 rounded-xl py-2 text-[11px] font-medium text-neutral-700"
                >
                  <span className={`grid size-11 place-items-center rounded-full border ${isActive(href, pathname) ? "border-foreground bg-foreground text-white" : "border-line"}`}>
                    <Icon className="size-4" />
                  </span>
                  {short}
                </Link>
              ))}
              <SignOutButton className="flex w-full flex-col items-center gap-1.5 rounded-xl py-2 text-[11px] font-medium text-bad">
                <span className="grid size-11 place-items-center rounded-full border border-line">
                  <LogOut className="size-4" />
                </span>
                Sign out
              </SignOutButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
