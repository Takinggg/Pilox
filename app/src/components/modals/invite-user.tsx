"use client";

import { useState, useEffect, useCallback } from "react";
import { X, UserPlus } from "lucide-react";
import { toast } from "sonner";

interface InviteUserProps {
  open: boolean;
  onClose: () => void;
  onInvited?: () => void;
}

export function InviteUser({ open, onClose, onInvited }: InviteUserProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "operator" | "viewer">("operator");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [open, handleEscape]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });

      if (res.ok) {
        toast.success(`User ${email} invited`);
        setEmail("");
        setName("");
        setPassword("");
        onInvited?.();
        onClose();
      } else {
        const data = await res.json();
        toast.error(data.error ?? "Failed to invite user");
      }
    } catch {
      toast.error("Network error");
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="dialog" aria-modal="true" aria-labelledby="invite-user-title">
      <div className="w-[440px] rounded-xl border border-border bg-card p-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            <h2 id="invite-user-title" className="text-base font-semibold text-foreground">
              Invite User
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-[var(--pilox-fg-secondary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-name" className="text-[13px] text-foreground">Full Name</label>
            <input
              id="invite-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              required
              className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-email" className="text-[13px] text-foreground">Email</label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@company.com"
              required
              className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-password" className="text-[13px] text-foreground">
              Temporary Password
            </label>
            <input
              id="invite-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              required
              minLength={8}
              className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] text-foreground">Role</label>
            <div className="flex gap-2">
              {(["viewer", "operator", "admin"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-[13px] font-medium capitalize transition-colors ${
                    role === r
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-[var(--pilox-fg-secondary)]"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 flex-1 items-center justify-center rounded-lg border border-border text-[13px] font-medium text-foreground hover:bg-[var(--pilox-elevated)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex h-10 flex-1 items-center justify-center rounded-lg bg-primary text-[13px] font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Send Invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
