import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/sidebar";

// Right-hand column of the auth screens: top link, centred form, footer.
export function AuthPage({
  prompt,
  linkLabel,
  href,
  children,
}: {
  prompt: string;
  linkLabel: string;
  href: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="lg:hidden">
          <Logo />
        </span>
        <p className="ml-auto text-xs text-muted">
          {prompt}{" "}
          <Link href={href} className="inline-flex items-center gap-0.5 font-semibold text-foreground hover:underline">
            {linkLabel} <ArrowUpRight className="size-3" />
          </Link>
        </p>
      </div>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
      <div className="flex justify-between text-[11px] text-muted">
        <span>Need help? Contact support</span>
        <span>Privacy · Terms</span>
      </div>
    </>
  );
}
