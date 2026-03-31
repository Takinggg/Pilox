"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { TriangleAlert, Trash2 } from "lucide-react";

interface DeleteConfirmProps {
  open: boolean;
  agentName: string;
  agentId: string;
  onClose: () => void;
  onDeleted?: () => void;
}

export function DeleteConfirm({
  open,
  agentName,
  agentId,
  onClose,
  onDeleted,
}: DeleteConfirmProps) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  function handleClose() {
    setConfirmText("");
    setDeleting(false);
    dialogRef.current?.close();
    onClose();
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(`Agent "${agentName}" deleted`);
        handleClose();
        onDeleted?.();
      } else {
        toast.error("Couldn't delete agent. Check your connection and try again.");
      }
    } catch {
      toast.error("Couldn't delete agent. Check your connection and try again.");
    }
    setDeleting(false);
  }

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  const canDelete = confirmText === agentName;

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      className="w-[420px] border border-border bg-card p-0 text-foreground backdrop:bg-black/60"
      aria-labelledby="delete-confirm-title"
    >
      <div className="flex flex-col gap-5 p-6">
        <div className="flex h-12 w-12 items-center justify-center bg-destructive/10">
          <TriangleAlert className="h-6 w-6 text-destructive" />
        </div>

        <div className="flex flex-col gap-2">
          <h2 id="delete-confirm-title" className="text-lg font-semibold text-foreground">
            Delete Agent
          </h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Are you sure you want to delete &ldquo;{agentName}&rdquo;? This
            action cannot be undone. All data, logs, and configuration will be
            permanently removed.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="delete-confirm-input" className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
            Type the agent name to confirm
          </label>
          <input
            id="delete-confirm-input"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={agentName}
            autoFocus
            className="h-10 border border-border bg-[var(--pilox-surface-lowest)] px-3 text-sm text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-destructive"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="flex h-9 items-center border border-border px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-[var(--pilox-elevated)]"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!canDelete || deleting}
            className="flex h-9 items-center gap-2 bg-destructive px-4 text-[13px] font-medium text-white transition-colors hover:bg-destructive/90 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deleting ? "Deleting..." : "Delete Agent"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
