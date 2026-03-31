"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Hexagon } from "lucide-react";

export default function MfaChallengePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/mfa/verify-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: code.replace(/\s/g, "") }),
      });
      const data = (await res.json().catch((err) => {
        console.warn("[pilox] mfa: verify-session response JSON parse failed", err);
        return {};
      })) as {
        error?: string;
        remainingAttempts?: number;
        lockedUntil?: string;
      };

      if (!res.ok) {
        if (res.status === 429 && data.lockedUntil) {
          setError(`Too many attempts. Locked until ${data.lockedUntil}`);
        } else {
          setError(
            data.error ||
              (typeof data.remainingAttempts === "number"
                ? `Invalid code. Attempts left: ${data.remainingAttempts}`
                : "Invalid code")
          );
        }
        setLoading(false);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch (err) {
      console.warn("[pilox] mfa: verify-session request failed", err);
      setError("Request failed. Try again.");
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex w-full max-w-[400px] flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center bg-primary pilox-cta-glow">
            <Hexagon className="h-7 w-7 text-primary-foreground" />
          </div>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="font-pilox-head text-xl font-semibold text-foreground">Two-factor authentication</h1>
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code from your authenticator app.
            </p>
          </div>
        </div>

        <form onSubmit={(e) => void onSubmit(e)} className="flex w-full flex-col gap-4">
          {error && (
            <div className="border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="mfa-code" className="text-[13px] text-foreground">
              Authentication code
            </label>
            <input
              id="mfa-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d*"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="h-11 border border-border bg-[var(--pilox-bg-input)] px-3 text-center font-mono text-lg tracking-widest text-foreground outline-none focus:border-ring"
              placeholder="000000"
              disabled={loading}
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={loading || code.replace(/\s/g, "").length < 6}
            className="pilox-btn-motion h-11 bg-secondary text-[13px] font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
          >
            {loading ? "Verifying…" : "Verify"}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          <Link href="/auth/login" className="text-[var(--pilox-fg-secondary)] underline hover:text-foreground">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
