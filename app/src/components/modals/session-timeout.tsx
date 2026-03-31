"use client";

import { useState, useEffect } from "react";
import { Clock, LogOut } from "lucide-react";

interface SessionTimeoutProps {
  open: boolean;
  remainingSeconds: number;
  onExtend: () => void;
  onLogout: () => void;
}

export function SessionTimeout({
  open,
  remainingSeconds,
  onExtend,
  onLogout,
}: SessionTimeoutProps) {
  const [countdown, setCountdown] = useState(remainingSeconds);

  useEffect(() => {
    setCountdown(remainingSeconds);
  }, [remainingSeconds]);

  useEffect(() => {
    if (!open || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          onLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [open, countdown, onLogout]);

  if (!open) return null;

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[400px] rounded-xl border border-border bg-card p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--pilox-yellow)]/10">
            <Clock className="h-7 w-7 text-[var(--pilox-yellow)]" />
          </div>

          <div className="flex flex-col items-center gap-1">
            <h2 className="text-base font-semibold text-foreground">
              Session Expiring
            </h2>
            <p className="text-center text-sm text-muted-foreground">
              Your session will expire due to inactivity
            </p>
          </div>

          <div className="flex items-center gap-1 font-mono text-3xl font-bold text-[var(--pilox-yellow)]">
            <span>{String(minutes).padStart(2, "0")}</span>
            <span className="animate-pulse">:</span>
            <span>{String(seconds).padStart(2, "0")}</span>
          </div>

          <div className="flex w-full gap-3">
            <button
              onClick={onLogout}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-border text-[13px] font-medium text-foreground hover:bg-[var(--pilox-elevated)]"
            >
              <LogOut className="h-4 w-4" /> Log Out
            </button>
            <button
              onClick={onExtend}
              className="flex h-10 flex-1 items-center justify-center rounded-lg bg-primary text-[13px] font-medium text-white hover:bg-primary/90"
            >
              Stay Signed In
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
