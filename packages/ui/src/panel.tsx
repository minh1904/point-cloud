import type { ReactNode } from "react";

import { cn } from "./cn";

export interface PanelProps {
  /** Small uppercase heading at the top of the panel. */
  title?: string;
  children: ReactNode;
  className?: string;
}

/**
 * A floating surface for controls. The translucent popover color plus blur
 * lets it sit over a live viewport without hiding what is behind it.
 */
export function Panel({ title, children, className }: PanelProps) {
  return (
    <section
      data-slot="panel"
      aria-label={title}
      className={cn(
        "flex w-64 flex-col gap-1 rounded-xl border border-border/12 bg-popover/75 p-2 backdrop-blur-md",
        className,
      )}
    >
      {title && (
        <h2 className="px-1 pt-0.5 pb-1 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
