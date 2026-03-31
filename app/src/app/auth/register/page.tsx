"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Hexagon } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [publicRegistration, setPublicRegistration] = useState<boolean | null>(
    null
  );

  useEffect(() => {
    fetch("/api/auth/registration-status")
      .then((r) => (r.ok ? r.json() : { publicRegistration: false }))
      .then((d) => setPublicRegistration(d.publicRegistration !== false))
      .catch((err) => {
        console.warn("[pilox] register: registration-status fetch failed", err);
        setPublicRegistration(false);
      });
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        email: formData.get("email"),
        password: formData.get("password"),
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Registration failed");
      setLoading(false);
      return;
    }

    router.push("/auth/login");
  }

  if (publicRegistration === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!publicRegistration) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex w-[400px] flex-col items-center gap-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center bg-primary pilox-cta-glow">
            <Hexagon className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="font-pilox-head text-xl font-semibold text-foreground">
            Sign-up is disabled
          </h1>
          <p className="text-sm text-muted-foreground">
            This instance does not allow public registration. Contact an
            administrator.
          </p>
          <Link
            href="/auth/login"
            className="text-[13px] font-medium text-primary hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
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
              Create an account
            </h1>
            <p className="text-sm text-muted-foreground">Get started with Pilox</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
          {error && (
            <div className="border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] text-foreground">Full Name</label>
            <input
              name="name"
              placeholder="John Doe"
              required
              className="h-10 border border-border bg-[var(--pilox-bg-input)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-ring"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] text-foreground">Email</label>
            <input
              name="email"
              type="email"
              placeholder="you@company.com"
              required
              className="h-10 border border-border bg-[var(--pilox-bg-input)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-ring"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] text-foreground">Password</label>
            <input
              name="password"
              type="password"
              placeholder="Minimum 8 characters"
              minLength={8}
              required
              className="h-10 border border-border bg-[var(--pilox-bg-input)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-ring"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="pilox-btn-motion mt-2 flex h-10 items-center justify-center bg-primary text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        {/* Footer */}
        <p className="text-[13px] text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/auth/login"
            className="font-medium text-primary hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
