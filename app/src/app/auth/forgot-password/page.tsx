"use client";

import { useState } from "react";
import Link from "next/link";
import { Hexagon, ArrowLeft, Mail, CheckCircle } from "lucide-react";

type Step = "email" | "sent" | "reset" | "success";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSendReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        setStep("sent");
      } else {
        const data = await res.json();
        setError(data.error ?? "Something went wrong");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (res.ok) {
        setStep("success");
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to reset password");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex w-[400px] flex-col items-center gap-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center bg-primary pilox-cta-glow">
            <Hexagon className="h-7 w-7 text-primary-foreground" />
          </div>
        </div>

        {/* Step: Enter email */}
        {step === "email" && (
          <>
            <div className="flex flex-col items-center gap-1">
              <h1 className="font-pilox-head text-xl font-semibold text-foreground">
                Forgot your password?
              </h1>
              <p className="text-center text-sm text-muted-foreground">
                Enter your email and we&apos;ll send you a reset link
              </p>
            </div>

            <form
              onSubmit={handleSendReset}
              className="flex w-full flex-col gap-4"
            >
              {error && (
                <div className="border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] text-foreground">Email</label>
                <input
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className="h-10 border border-border bg-[var(--pilox-bg-input)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-ring"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="pilox-btn-motion mt-2 flex h-10 items-center justify-center bg-primary text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
            </form>

            <Link
              href="/auth/login"
              className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-[var(--pilox-fg-secondary)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to login
            </Link>
          </>
        )}

        {/* Step: Email sent confirmation */}
        {step === "sent" && (
          <>
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--pilox-green)]/10">
                <Mail className="h-7 w-7 text-[var(--pilox-green)]" />
              </div>
              <h1 className="font-pilox-head text-xl font-semibold text-foreground">
                Check your email
              </h1>
              <p className="text-center text-sm text-muted-foreground">
                We sent a password reset link to{" "}
                <span className="text-foreground">{email}</span>
              </p>
            </div>

            <div className="flex w-full flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] text-foreground">
                  Reset Token
                </label>
                <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste reset token from email"
                  className="h-10 border border-border bg-[var(--pilox-bg-input)] px-3 font-mono text-[13px] text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-ring"
                />
              </div>
              <button
                onClick={() => {
                  if (token.trim()) setStep("reset");
                }}
                disabled={!token.trim()}
                className="pilox-btn-motion flex h-10 items-center justify-center bg-primary text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                Continue
              </button>
            </div>

            <button
              onClick={() => setStep("email")}
              className="text-[13px] text-muted-foreground hover:text-[var(--pilox-fg-secondary)]"
            >
              Didn&apos;t receive it? Try again
            </button>
          </>
        )}

        {/* Step: Enter new password */}
        {step === "reset" && (
          <>
            <div className="flex flex-col items-center gap-1">
              <h1 className="font-pilox-head text-xl font-semibold text-foreground">
                Set new password
              </h1>
              <p className="text-center text-sm text-muted-foreground">
                Choose a strong password for your account
              </p>
            </div>

            <form
              onSubmit={handleResetPassword}
              className="flex w-full flex-col gap-4"
            >
              {error && (
                <div className="border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] text-foreground">
                  New Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                  className="h-10 border border-border bg-[var(--pilox-bg-input)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-ring"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] text-foreground">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  required
                  minLength={8}
                  className="h-10 border border-border bg-[var(--pilox-bg-input)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-ring"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="pilox-btn-motion mt-2 flex h-10 items-center justify-center bg-primary text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? "Resetting..." : "Reset Password"}
              </button>
            </form>
          </>
        )}

        {/* Step: Success */}
        {step === "success" && (
          <>
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--pilox-green)]/10">
                <CheckCircle className="h-7 w-7 text-[var(--pilox-green)]" />
              </div>
              <h1 className="font-pilox-head text-xl font-semibold text-foreground">
                Password reset!
              </h1>
              <p className="text-center text-sm text-muted-foreground">
                Your password has been successfully reset. You can now sign in
                with your new password.
              </p>
            </div>

            <Link
              href="/auth/login"
              className="pilox-btn-motion flex h-10 w-full items-center justify-center bg-primary text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Sign In
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
