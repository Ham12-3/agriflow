import { Logo } from "@/components/sidebar";

// Log in / Sign up / Join: brand panel on the left (from the design), form on the right.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen bg-card lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-background p-10 lg:flex">
        <Logo />
        <div className="max-w-md">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Farm management, simplified
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight">
            Your farms. Your numbers.
            <br />
            One clear overview.
          </h1>
          <p className="mt-3 text-sm text-muted">
            Stay on top of livestock, production and finances. Make informed decisions for every
            farm you manage.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-line bg-card p-4">
              <p className="text-[11px] uppercase tracking-[0.08em] text-muted">Livestock count</p>
              <p className="mt-2 text-xl font-semibold">14,527</p>
              <p className="text-xs text-muted">Head across 3 farms</p>
            </div>
            <div className="rounded-2xl border border-line bg-card p-4">
              <p className="text-[11px] uppercase tracking-[0.08em] text-muted">Total revenue</p>
              <p className="mt-2 text-xl font-semibold">₦10.2M</p>
              <p className="text-xs text-muted">Portfolio overview</p>
            </div>
          </div>
          <div className="mt-3 rounded-2xl border border-line bg-card p-4">
            <div className="flex justify-between text-xs">
              <span className="font-semibold">Revenue by Farm</span>
              <span className="uppercase tracking-[0.08em] text-muted">Sample overview</span>
            </div>
            {[
              ["Farm 1", "₦3.2M", 30],
              ["Farm 2", "₦2.9M", 22],
              ["Farm 3", "₦4.1M", 48],
            ].map(([name, value, pct]) => (
              <div key={name} className="mt-3">
                <div className="flex justify-between text-xs">
                  <span>{name}</span>
                  <span className="font-semibold">{value}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-neutral-200">
                  <div className="h-full rounded-full bg-foreground" style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted">© 2026 Agriflow. All rights reserved.</p>
      </aside>

      <main className="flex flex-col p-6 sm:p-10">{children}</main>
    </div>
  );
}
