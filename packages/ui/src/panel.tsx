import type { ReactNode } from "react";

import { cn } from "./cn";

export interface PanelProps {
  /** Small uppercase heading at the top of the panel. */
  title?: string;
  children: ReactNode;
  className?: string;
  /**
   * Turns the heading into a toggle that hides the body. Needs `title`;
   * the panel keeps no state of its own, so pass `collapsed` with it.
   */
  collapsible?: boolean;
  /** Whether the body is hidden. Only read when `collapsible` is set. */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

const headingClass =
  "px-1 pt-0.5 pb-1 text-2xs font-medium tracking-wide text-muted-foreground uppercase";

/**
 * A floating surface for controls. The translucent popover color plus blur
 * lets it sit over a live viewport without hiding what is behind it.
 */
export function Panel({
  title,
  children,
  className,
  collapsible,
  collapsed,
  onCollapsedChange,
}: PanelProps) {
  const isCollapsed = Boolean(collapsible && collapsed);

  return (
    <section
      data-slot="panel"
      data-collapsed={isCollapsed ? "" : undefined}
      aria-label={title}
      className={cn(
        "flex w-64 flex-col gap-1 rounded-xl border border-border/12 bg-popover/75 p-2 backdrop-blur-md",
        className,
      )}
    >
      {title &&
        (collapsible ? (
          <h2>
            <button
              type="button"
              aria-expanded={!isCollapsed}
              onClick={() => onCollapsedChange?.(!isCollapsed)}
              className={cn(
                headingClass,
                "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md",
                "outline-none transition-colors hover:text-foreground",
                "focus-visible:ring-2 focus-visible:ring-ring/30",
              )}
            >
              {title}
              {/* Points down when open, right when collapsed — the usual
                  disclosure cue, drawn inline so the package stays icon-free. */}
              <svg
                viewBox="0 0 12 12"
                aria-hidden="true"
                className={cn(
                  "size-3 shrink-0 transition-transform",
                  isCollapsed && "-rotate-90",
                )}
              >
                <path
                  d="M3 4.5 6 7.5 9 4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </h2>
        ) : (
          <h2 className={headingClass}>{title}</h2>
        ))}
      {!isCollapsed && children}
    </section>
  );
}
