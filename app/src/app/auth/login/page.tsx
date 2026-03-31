"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Hexagon } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [publicRegistration, setPublicRegistration] = useState(true);

  useEffect(() => {
    // If no users exist yet, redirect to first-boot setup wizard
    fetch("/api/setup/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.setupComplete === false) {
          router.replace("/setup");
        }
      })
      .catch((err) => {
        console.warn("[pilox] login: setup status fetch failed", err);
      });

    fetch("/api/auth/registration-status")
      .then((r) => (r.ok ? r.json() : { publicRegistration: true }))
      .then((d) => setPublicRegistration(d.publicRegistration !== false))
      .catch((err) => {
        console.warn("[pilox] login: registration status fetch failed", err);
      });
  }, [router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const { signIn } = await import("next-auth/react");
    const result = await signIn("credentials", {
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password");
      setLoading(false);
    } else {
      // Session cookie may not be visible to the next request immediately after `signIn`
      // resolves; polling avoids treating a transient 401 as "no MFA" and pushing `/` while
      // still unauthenticated (Home redirects back to login and E2E hangs).
      let mfaRequired = false;
      let mfaVerified = true;
      let authenticated = false;
      for (let i = 0; i < 50; i++) {
        const st = await fetch("/api/auth/mfa/status", { credentials: "same-origin" });
        if (st.ok) {
          const mfa = (await st.json()) as {
            authenticated?: boolean;
            mfaRequired?: boolean;
            mfaVerified?: boolean;
          };
          authenticated = mfa.authenticated === true;
          mfaRequired = Boolean(mfa.mfaRequired);
          mfaVerified = Boolean(mfa.mfaVerified);
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!authenticated) {
        setError("Could not establish a session. Please try again.");
        setLoading(false);
        return;
      }
      if (mfaRequired && !mfaVerified) {
        router.push("/auth/mfa");
        router.refresh();
        setLoading(false);
        return;
      }
      router.push("/");
      router.refresh();
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex w-[400px] flex-col items-center gap-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center bg-primary pilox-cta-glow">
            <Hexagon className="h-7 w-7 text-primary-foreground" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <h1 className="font-pilox-head text-xl font-semibold text-foreground">
              Welcome to Pilox
            </h1>
            <p className="text-sm text-muted-foreground">Sign in to your account</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
          {error && (
            <div
              role="alert"
              className="border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-[13px] text-foreground">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              required
              className="h-10 border border-border bg-[var(--pilox-bg-input)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-ring"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-[13px] text-foreground">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              required
              className="h-10 border border-border bg-[var(--pilox-bg-input)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-ring"
            />
            <div className="flex justify-end">
              <Link
                href="/auth/forgot-password"
                className="text-[13px] text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="pilox-btn-motion mt-2 flex h-10 items-center justify-center bg-primary text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {/* Footer */}
        {publicRegistration ? (
          <p className="text-[13px] text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href="/auth/register"
              className="font-medium text-primary hover:underline"
            >
              Create one
            </Link>
          </p>
        ) : (
          <p className="text-center text-[13px] text-muted-foreground">
            Self-service signup is disabled. Ask an administrator for an
            account.
          </p>
        )}
      </div>
    </div>
  );
}
