"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Shield } from "lucide-react";
import { SettingsDeploymentNotice } from "./settings-deployment-notice";

type MFAStatus = { enabled: boolean; hasPendingSetup: boolean };

type SetupPayload = {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
};

export function MfaSettingsPanel() {
  const [status, setStatus] = useState<MFAStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState<SetupPayload | null>(null);
  const [confirmToken, setConfirmToken] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/auth/mfa/setup");
      if (!r.ok) {
        setStatus(null);
        return;
      }
      const j = (await r.json()) as MFAStatus;
      setStatus(j);
      if (!j.hasPendingSetup) {
        setSetup(null);
        setConfirmToken("");
      }
    } catch (err) {
      console.warn("[pilox] mfa-settings: load status failed", err);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function startSetup() {
    setBusy(true);
    try {
      const r = await fetch("/api/auth/mfa/setup", { method: "POST" });
      const j = await r.json().catch((e) => {
        console.warn("[pilox] mfa-settings: start setup JSON parse failed", e);
        return {};
      });
      if (!r.ok) {
        toast.error(typeof j.error === "string" ? j.error : "Could not start MFA setup");
        return;
      }
      setSetup(j as SetupPayload);
      setConfirmToken("");
      toast.message("Scan the QR code with your authenticator app");
    } catch (err) {
      console.warn("[pilox] mfa-settings: start setup request failed", err);
      toast.error("Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup() {
    const t = confirmToken.replace(/\s/g, "");
    if (!/^\d{6}$/.test(t)) {
      toast.error("Enter a 6-digit code");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/auth/mfa/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t }),
      });
      const j = await r.json().catch((e) => {
        console.warn("[pilox] mfa-settings: confirm JSON parse failed", e);
        return {};
      });
      if (!r.ok) {
        toast.error(typeof j.error === "string" ? j.error : "Invalid code");
        return;
      }
      toast.success("Two-factor authentication enabled");
      setSetup(null);
      setConfirmToken("");
      await load();
    } catch (err) {
      console.warn("[pilox] mfa-settings: confirm request failed", err);
      toast.error("Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!confirm("Disable two-factor authentication for your account?")) return;
    setBusy(true);
    try {
      const r = await fetch("/api/auth/mfa/disable", { method: "DELETE" });
      const j = await r.json().catch((e) => {
        console.warn("[pilox] mfa-settings: disable JSON parse failed", e);
        return {};
      });
      if (!r.ok) {
        toast.error(typeof j.error === "string" ? j.error : "Could not disable MFA");
        return;
      }
      toast.success("Two-factor authentication disabled");
      await load();
    } catch (err) {
      console.warn("[pilox] mfa-settings: disable request failed", err);
      toast.error("Request failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading security settings…</p>;
  }

  if (!status) {
    return (
      <p className="text-sm text-muted-foreground">
        Could not load MFA status. Sign in again and retry.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6 rounded-xl border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--pilox-green)]/20/40">
          <Shield className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Two-factor authentication (TOTP)</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Require a time-based code from an authenticator app when you sign in.
          </p>
        </div>
      </div>

      <SettingsDeploymentNotice title="After you enable MFA">
        <p>
          Your next sign-in will ask for a 6-digit code. If you enable MFA while already signed in,
          you will be prompted to verify before accessing the dashboard.
        </p>
      </SettingsDeploymentNotice>

      {status.enabled ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-[var(--pilox-fg-secondary)]">
            Status: <span className="font-medium text-primary">Enabled</span>
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void disable()}
            className="h-9 w-fit rounded-lg border border-destructive/30 px-4 text-[13px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            Disable MFA
          </button>
        </div>
      ) : setup ? (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Scan this QR code, then enter the 6-digit code to confirm.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={setup.qrCodeDataUrl}
            alt="MFA QR code"
            className="h-48 w-48 rounded-lg border border-border bg-white p-2"
          />
          <p className="font-mono text-[11px] break-all text-[var(--pilox-fg-secondary)]">
            Secret (manual entry): {setup.secret}
          </p>
          <div className="flex max-w-xs flex-col gap-2">
            <label className="text-xs text-muted-foreground">Confirmation code</label>
            <input
              value={confirmToken}
              onChange={(e) => setConfirmToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 font-mono text-foreground outline-none focus:border-primary"
              placeholder="000000"
              maxLength={6}
            />
            <button
              type="button"
              disabled={busy || confirmToken.length !== 6}
              onClick={() => void confirmSetup()}
              className="h-9 rounded-lg bg-secondary text-[13px] font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
            >
              Confirm and enable
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void startSetup()}
          className="h-9 w-fit rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
        >
          Set up authenticator
        </button>
      )}
    </div>
  );
}
