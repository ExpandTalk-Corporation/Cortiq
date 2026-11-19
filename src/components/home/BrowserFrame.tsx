import type { ReactNode } from "react";

export const EXAMPLE_LABEL = "Example data";

export function ExampleTag({ className = "" }: { className?: string }) {
  return (
    <span className={`rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground ${className}`}>
      {EXAMPLE_LABEL}
    </span>
  );
}

/** A browser-window frame for product mockups. Always carries the Example data label. */
export function BrowserFrame({ title, className = "", children }: { title?: string; className?: string; children: ReactNode }) {
  return (
    <figure className={`overflow-hidden rounded-xl border bg-background shadow-xl ${className}`}>
      <div className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-2">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
        {title && <span className="ml-2 truncate text-xs text-muted-foreground">{title}</span>}
        <ExampleTag className="ml-auto shrink-0" />
      </div>
      {children}
    </figure>
  );
}
