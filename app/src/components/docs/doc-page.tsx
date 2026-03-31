import type { ReactNode } from "react";

/** Path under your Pilox tree (no external link — open from checkout or release bundle). */
export function DocPath({ children }: { children: string }) {
  return (
    <code className="whitespace-nowrap" translate="no">
      {children}
    </code>
  );
}

export function DocPage({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="max-w-2xl pb-20">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      {lead ? (
        <p className="mt-3 text-sm leading-relaxed text-[var(--pilox-fg-secondary)] [&_a]:text-primary [&_a]:underline-offset-2 [&_a]:hover:underline">
          {lead}
        </p>
      ) : null}
      <div
        className={[
          "mt-8 space-y-4 text-sm leading-relaxed text-[var(--pilox-fg-secondary)]",
          "[&_h2]:mt-10 [&_h2]:mb-2 [&_h2]:scroll-mt-24 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground",
          "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:text-[var(--pilox-fg-secondary)]",
          "[&_p]:text-[var(--pilox-fg-secondary)]",
          "[&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5",
          "[&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1.5",
          "[&_a]:text-primary [&_a]:underline-offset-2 [&_a]:hover:underline",
          "[&_strong]:font-medium [&_strong]:text-[var(--pilox-fg-secondary)]",
          "[&_code]:rounded [&_code]:bg-[var(--pilox-elevated)] [&_code]:px-1.5 [&_code]:py-px [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-[var(--pilox-fg-secondary)]",
        ].join(" ")}
      >
        {children}
      </div>
    </article>
  );
}

export function DocCallout({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <aside className="rounded-lg border border-border bg-card px-4 py-3 text-[13px] leading-relaxed text-[var(--pilox-fg-secondary)]">
      {title ? <p className="mb-1.5 font-medium text-[var(--pilox-fg-secondary)]">{title}</p> : null}
      {children}
    </aside>
  );
}
