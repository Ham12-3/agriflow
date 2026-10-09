export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-56 rounded-lg bg-neutral-200" />
      <div className="h-24 rounded-2xl bg-neutral-200/70" />
      <div className="h-80 rounded-2xl bg-neutral-200/70" />
    </div>
  );
}
