import { Lock } from "lucide-react";

export function NoAccess({ what }: { what: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-line bg-card p-8 text-center">
      <Lock className="mx-auto size-6 text-muted" />
      <h2 className="mt-3 text-lg font-semibold">{what} is for farm managers</h2>
      <p className="mt-1 text-sm text-muted">
        Ask your farm owner to change your role on the Team page if you need access.
      </p>
    </div>
  );
}
