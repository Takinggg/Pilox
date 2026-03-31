"use client";

import { useRouter } from "next/navigation";
import { ShieldX } from "lucide-react";

export default function PermissionDeniedPage() {
  const router = useRouter();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-destructive/10">
        <ShieldX className="h-10 w-10 text-destructive" />
      </div>
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-xl font-semibold text-foreground">
          Access Restricted
        </h1>
        <p className="text-center text-sm text-muted-foreground">
          You don&apos;t have permission to access this page.
          <br />
          Contact your administrator for access.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-medium text-foreground hover:bg-[var(--pilox-elevated)]"
        >
          Go Back
        </button>
        <button
          onClick={() => router.push("/")}
          className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-medium text-white hover:bg-primary/90"
        >
          Dashboard
        </button>
      </div>
    </div>
  );
}
