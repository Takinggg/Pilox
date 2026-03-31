"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Wallet } from "lucide-react";
import { toast } from "sonner";

type WalletPayload = {
  balanceMinor: number;
  currency: string;
  updatedAt: string | null;
  /** Minor units charged per 1,000 total tokens when inference metering is enabled (0 = off). */
  billingUsageMinorPer1kTokens?: number;
  stripe?: {
    checkoutEnabled: boolean;
    customerPortalEnabled: boolean;
    subscriptionCheckoutEnabled: boolean;
  };
};

type LedgerRow = {
  id: string;
  entryType: string;
  signedAmountMinor: number;
  currency: string;
  createdAt: string;
};

type LedgerPayload = {
  items: LedgerRow[];
  meta: { total: number; limit: number; offset: number };
};

export function BillingSettingsPanel() {
  const searchParams = useSearchParams();
  const checkoutToastDone = useRef(false);
  const [data, setData] = useState<WalletPayload | null>(null);
  const [ledger, setLedger] = useState<LedgerPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amountDollars, setAmountDollars] = useState(10);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [subscribeBusy, setSubscribeBusy] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);

  const loadBilling = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wRes, lRes] = await Promise.all([
        fetch("/api/billing/wallet"),
        fetch("/api/billing/ledger?limit=15"),
      ]);
      if (!wRes.ok) {
        const j = await wRes.json().catch((err) => {
          console.warn("[pilox] billing: wallet error body parse failed", err);
          return {};
        });
        throw new Error(typeof j.message === "string" ? j.message : wRes.statusText);
      }
      setData((await wRes.json()) as WalletPayload);
      if (lRes.ok) {
        setLedger((await lRes.json()) as LedgerPayload);
      } else {
        setLedger(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load billing");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBilling();
  }, [loadBilling]);

  useEffect(() => {
    const c = searchParams.get("checkout");
    if (!c || checkoutToastDone.current) return;
    checkoutToastDone.current = true;
    if (c === "success") {
      toast.success("Payment completed — your balance updates when Stripe sends the webhook.");
      void loadBilling();
    } else if (c === "cancel") {
      toast.message("Checkout was cancelled.");
    }
  }, [searchParams, loadBilling]);

  const formatted =
    data == null
      ? "—"
      : new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: data.currency.toUpperCase(),
        }).format(data.balanceMinor / 100);

  const checkoutEnabled = data?.stripe?.checkoutEnabled ?? false;
  const subscriptionEnabled = data?.stripe?.subscriptionCheckoutEnabled ?? false;
  const portalEnabled = data?.stripe?.customerPortalEnabled ?? false;
  const usageMinorPer1k = data?.billingUsageMinorPer1kTokens ?? 0;
  const usageMeteringEnabled = usageMinorPer1k > 0;
  const usageRateFormatted =
    data && usageMeteringEnabled
      ? new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: data.currency.toUpperCase(),
        }).format(usageMinorPer1k / 100)
      : null;

  function formatLedgerAmount(row: LedgerRow) {
    const cur = row.currency.toUpperCase();
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cur,
      signDisplay: "always",
    }).format(row.signedAmountMinor / 100);
  }

  function entryLabel(type: string) {
    if (type === "credit") return "Credit";
    if (type === "debit_refund") return "Refund (debit)";
    if (type === "usage_debit") return "Inference usage";
    return type;
  }

  async function startCheckout() {
    const amountMinor = Math.round(Number(amountDollars) * 100);
    if (!Number.isFinite(amountMinor) || amountMinor < 100) {
      toast.error("Enter at least 1.00 in your currency.");
      return;
    }
    setCheckoutBusy(true);
    try {
      const res = await fetch("/api/billing/stripe/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountMinor,
          currency: data?.currency ?? "usd",
        }),
      });
      const j = await res.json().catch((err) => {
        console.warn("[pilox] billing: checkout response JSON parse failed", err);
        return {};
      });
      if (!res.ok) {
        toast.error(typeof j.message === "string" ? j.message : "Checkout failed");
        return;
      }
      const url = typeof j.url === "string" ? j.url : null;
      if (url) window.location.href = url;
      else toast.error("No redirect URL from Stripe.");
    } catch (err) {
      console.warn("[pilox] billing: checkout request failed", err);
      toast.error("Checkout request failed");
    } finally {
      setCheckoutBusy(false);
    }
  }

  async function startSubscription() {
    setSubscribeBusy(true);
    try {
      const res = await fetch("/api/billing/stripe/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "subscription" }),
      });
      const j = await res.json().catch((err) => {
        console.warn("[pilox] billing: subscription checkout JSON parse failed", err);
        return {};
      });
      if (!res.ok) {
        toast.error(typeof j.message === "string" ? j.message : "Subscription checkout failed");
        return;
      }
      const url = typeof j.url === "string" ? j.url : null;
      if (url) window.location.href = url;
      else toast.error("No redirect URL from Stripe.");
    } catch (err) {
      console.warn("[pilox] billing: subscription checkout failed", err);
      toast.error("Subscription checkout failed");
    } finally {
      setSubscribeBusy(false);
    }
  }

  async function openPortal() {
    setPortalBusy(true);
    try {
      const res = await fetch("/api/billing/stripe/customer-portal", { method: "POST" });
      const j = await res.json().catch((err) => {
        console.warn("[pilox] billing: portal response JSON parse failed", err);
        return {};
      });
      if (!res.ok) {
        toast.error(typeof j.message === "string" ? j.message : "Portal failed");
        return;
      }
      const url = typeof j.url === "string" ? j.url : null;
      if (url) window.location.href = url;
      else toast.error("No portal URL from Stripe.");
    } catch (err) {
      console.warn("[pilox] billing: portal request failed", err);
      toast.error("Portal request failed");
    } finally {
      setPortalBusy(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-[var(--pilox-surface-lowest)]">
          <Wallet className="h-5 w-5 text-[var(--pilox-fg-secondary)]" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Billing & wallet</h2>
          <p className="text-xs text-muted-foreground">
            Balance updates from Stripe webhooks. Set{" "}
            <code className="rounded bg-[var(--pilox-surface-lowest)] px-1 font-mono text-[11px]">STRIPE_SECRET_KEY</code> and{" "}
            <code className="rounded bg-[var(--pilox-surface-lowest)] px-1 font-mono text-[11px]">STRIPE_WEBHOOK_SECRET</code> for
            credits; optional <code className="font-mono text-[11px]">STRIPE_SUBSCRIPTION_PRICE_ID</code> for
            subscriptions. See <code className="font-mono text-[11px]">docs/PRODUCTION.md</code> (section 2.1) and{" "}
            <code className="font-mono text-[11px]">docs/STRIPE_LOCAL_DEV.md</code>.
          </p>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && data && (
        <>
          <div className="rounded-xl border border-border bg-[var(--pilox-surface-lowest)] p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Account balance</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{formatted}</p>
            {data.updatedAt && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Last update: {new Date(data.updatedAt).toLocaleString()}
              </p>
            )}
            {usageMeteringEnabled && usageRateFormatted && (
              <p className="mt-3 rounded-lg border border-border bg-card px-3 py-2 text-[12px] leading-snug text-[var(--pilox-fg-secondary)]">
                Inference metering is on:{" "}
                <span className="font-medium text-foreground">{usageRateFormatted}</span> per 1,000 tokens
                (input + output), applied when token usage syncs from the runtime.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-border bg-[var(--pilox-surface-lowest)] p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Add funds</p>
            {!checkoutEnabled ? (
              <p className="text-sm text-muted-foreground" data-testid="billing-checkout-disabled-hint">
                Stripe Checkout is not configured (missing <code className="font-mono text-xs">STRIPE_SECRET_KEY</code>
                ).
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {[5, 10, 25, 50].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setAmountDollars(d)}
                      className="rounded-md border border-[#333] bg-card px-2.5 py-1 text-[11px] text-[var(--pilox-fg-secondary)] hover:border-primary hover:text-foreground"
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Amount ({data.currency.toUpperCase()})</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={amountDollars}
                    onChange={(e) => setAmountDollars(Number(e.target.value))}
                    className="h-9 w-32 rounded-lg border border-border bg-card px-3 text-[13px] text-foreground outline-none focus:border-primary"
                  />
                </div>
                <button
                  type="button"
                  data-testid="billing-pay-with-stripe"
                  disabled={checkoutBusy}
                  onClick={() => void startCheckout()}
                  className="h-9 rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
                >
                  {checkoutBusy ? "Redirecting…" : "Pay with Stripe"}
                </button>
                </div>
              </>
            )}
          </div>

          <div className="rounded-xl border border-border bg-[var(--pilox-surface-lowest)] p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Recent activity</p>
            {!ledger || ledger.items.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No ledger entries yet — top up or receive a webhook first.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[320px] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Date</th>
                      <th className="py-2 pr-3 font-medium">Type</th>
                      <th className="py-2 font-medium tabular-nums">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.items.map((row) => (
                      <tr key={row.id} className="border-b border-border text-[var(--pilox-fg-secondary)]">
                        <td className="py-2 pr-3 text-[var(--pilox-fg-secondary)]">
                          {new Date(row.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2 pr-3">{entryLabel(row.entryType)}</td>
                        <td className="py-2 tabular-nums text-foreground">{formatLedgerAmount(row)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ledger.meta.total > ledger.items.length && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Showing {ledger.items.length} of {ledger.meta.total} entries — use{" "}
                    <code className="rounded bg-card px-1 font-mono text-[10px]">GET /api/billing/ledger</code>{" "}
                    for pagination.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-border bg-[var(--pilox-surface-lowest)] p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Subscription</p>
            {!checkoutEnabled ? (
              <p className="text-sm text-muted-foreground">Configure Stripe to enable Checkout.</p>
            ) : !subscriptionEnabled ? (
              <p className="text-sm text-muted-foreground">
                Set <code className="font-mono text-xs">STRIPE_SUBSCRIPTION_PRICE_ID</code> to a recurring Price (
                <code className="font-mono text-xs">price_…</code>) in the environment, or pass{" "}
                <code className="font-mono text-xs">priceId</code> via the API.
              </p>
            ) : (
              <button
                type="button"
                disabled={subscribeBusy}
                onClick={() => void startSubscription()}
                className="h-9 w-fit rounded-lg border border-[var(--pilox-blue)]/40 bg-[var(--pilox-blue)]/20/40 px-4 text-[13px] text-[var(--pilox-blue)] hover:bg-[var(--pilox-blue)]/20 disabled:opacity-50"
              >
                {subscribeBusy ? "Redirecting…" : "Subscribe (recurring)"}
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-border bg-[var(--pilox-surface-lowest)] p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Stripe account</p>
            {!checkoutEnabled ? (
              <p className="text-sm text-muted-foreground">Configure Stripe keys to enable the customer portal.</p>
            ) : !portalEnabled ? (
              <p className="text-sm text-muted-foreground">
                Complete a purchase once to link your Pilox user to a Stripe Customer — then you can manage payment
                methods and invoices here.
              </p>
            ) : (
              <button
                type="button"
                disabled={portalBusy}
                onClick={() => void openPortal()}
                className="h-9 w-fit rounded-lg border border-border bg-[var(--pilox-elevated)] px-4 text-[13px] text-foreground hover:bg-[var(--pilox-elevated)] disabled:opacity-50"
              >
                {portalBusy ? "Opening…" : "Open billing portal"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
