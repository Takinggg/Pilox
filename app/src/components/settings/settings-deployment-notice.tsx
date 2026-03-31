// SPDX-License-Identifier: BUSL-1.1
import { Info } from "lucide-react";

type Props = {
  title?: string;
  children?: React.ReactNode;
};

/**
 * Explains that a settings section reflects server env / infra, not in-app forms.
 */
export function SettingsDeploymentNotice({
  title = "Deployment configuration (read-only here)",
  children,
}: Props) {
  return (
    <div
      className="flex gap-3 rounded-xl border border-sky-900/45 bg-sky-950/25 px-4 py-3 text-[13px] text-sky-100/90"
      role="note"
    >
      <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-400/90" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sky-100">{title}</p>
        <div className="mt-1.5 text-[12px] leading-relaxed text-sky-100/85">
          {children ?? (
            <p>
              Values come from the app process environment (e.g. Docker Compose, Kubernetes, or{" "}
              <code className="rounded bg-[var(--pilox-surface-lowest)] px-1 font-mono text-[11px]">app/.env.local</code>
              ). Change them there and redeploy or restart the app — this screen is a dashboard, not the
              source of truth.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
