import type { ReactNode } from "react";

import { cn } from "./cn";

export interface KbdProps {
  children: ReactNode;
  className?: string;
}

/**
 * A key as it looks on a keyboard.
 *
 * `<kbd>` is a real HTML element with real meaning — "this is keyboard input"
 * — and a screen reader announces it as such. Styling a `<span>` to look like
 * a key would read as ordinary prose, which for a list of shortcuts is exactly
 * the wrong impression.
 */
export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded",
        "border border-border/15 bg-input/15 px-1",
        "font-mono text-[11px] leading-none text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
