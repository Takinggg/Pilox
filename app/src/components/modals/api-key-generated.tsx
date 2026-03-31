"use client";

import { useState } from "react";
import { X, Key, Copy, CheckCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface ApiKeyGeneratedProps {
  open: boolean;
  apiKey: string;
  keyName: string;
  onClose: () => void;
}

export function ApiKeyGenerated({
  open,
  apiKey,
  keyName,
  onClose,
}: ApiKeyGeneratedProps) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  function handleCopy() {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    toast.success("API key copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[480px] rounded-xl border border-border bg-card p-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              API Key Generated
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-[var(--pilox-fg-secondary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 rounded-lg border border-[var(--pilox-yellow)]/30 bg-[var(--pilox-yellow)]/10 px-4 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--pilox-yellow)]" />
            <p className="text-xs text-[var(--pilox-yellow)]">
              This key will only be shown once. Copy it now and store it
              securely.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] text-muted-foreground">Key Name</label>
            <span className="text-sm font-medium text-foreground">
              {keyName}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] text-muted-foreground">API Key</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-xs text-primary select-all">
                {apiKey}
              </code>
              <button
                onClick={handleCopy}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-[var(--pilox-elevated)] hover:text-[var(--pilox-fg-secondary)]"
              >
                {copied ? (
                  <CheckCircle className="h-4 w-4 text-primary" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <button
            onClick={onClose}
            className="mt-2 flex h-10 items-center justify-center rounded-lg bg-primary text-[13px] font-medium text-white hover:bg-primary/90"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
