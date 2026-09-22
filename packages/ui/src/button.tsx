import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";

import { cx } from "./cx";

type Variant = "primary" | "secondary" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary: "bg-surface-raised text-fg border border-border hover:bg-surface-hover",
  ghost: "text-fg-muted hover:text-fg hover:bg-surface-hover",
};

export interface ButtonProps extends ComponentProps<typeof BaseButton> {
  variant?: Variant;
}

export function Button({ variant = "secondary", className, ...props }: ButtonProps) {
  return (
    <BaseButton
      className={cx(
        "inline-flex h-control items-center justify-center gap-1.5 rounded-control px-3",
        "text-sm font-medium select-none transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
        variants[variant],
        typeof className === "string" ? className : undefined,
      )}
      {...props}
    />
  );
}
