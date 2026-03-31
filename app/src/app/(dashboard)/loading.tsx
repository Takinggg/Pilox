export default function DashboardLoading() {
  return (
    <div className="flex h-full flex-col gap-6 p-8">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-40 animate-pulse rounded-lg bg-[var(--pilox-elevated)]" />
          <div className="h-4 w-64 animate-pulse rounded bg-[var(--pilox-elevated)]" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-32 animate-pulse rounded-lg bg-[var(--pilox-elevated)]" />
          <div className="h-9 w-28 animate-pulse rounded-lg bg-[var(--pilox-elevated)]" />
        </div>
      </div>

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-16 animate-pulse rounded bg-[var(--pilox-elevated)]" />
              <div className="h-5 w-12 animate-pulse rounded-full bg-[var(--pilox-elevated)]" />
            </div>
            <div className="h-8 w-20 animate-pulse rounded bg-[var(--pilox-elevated)]" />
            <div className="h-3 w-28 animate-pulse rounded bg-[var(--pilox-elevated)]" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="flex flex-1 flex-col rounded-xl border border-border bg-card">
        <div className="flex h-10 items-center border-b border-border px-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="mr-6 h-3 w-14 animate-pulse rounded bg-[var(--pilox-elevated)]"
            />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`flex items-center px-5 py-3 ${i > 0 ? "border-t border-border" : ""}`}
          >
            <div className="h-4 flex-1 animate-pulse rounded bg-[var(--pilox-elevated)]" />
            <div className="ml-4 h-4 w-16 animate-pulse rounded bg-[var(--pilox-elevated)]" />
            <div className="ml-4 h-4 w-20 animate-pulse rounded bg-[var(--pilox-elevated)]" />
            <div className="ml-4 h-4 w-12 animate-pulse rounded bg-[var(--pilox-elevated)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
