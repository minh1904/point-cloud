import { Button as BaseButton } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./cn";

// Open popups (aria-expanded / data-popup-open) keep the hover look.
const buttonVariants = cva(
  [
    "inline-flex shrink-0 cursor-pointer items-center justify-center border border-transparent",
    "font-medium whitespace-nowrap select-none outline-none transition-colors",
    "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
    "disabled:pointer-events-none disabled:opacity-50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        default: [
          "bg-primary text-primary-foreground",
          "hover:bg-[color-mix(in_oklab,var(--color-primary)_88%,black)]",
          "active:bg-[color-mix(in_oklab,var(--color-primary)_82%,black)]",
          "aria-expanded:bg-[color-mix(in_oklab,var(--color-primary)_88%,black)]",
        ],
        outline: [
          "border-border/12 bg-input/10 text-foreground",
          "hover:border-border/20 hover:bg-input/15 active:bg-input/15",
          "aria-expanded:border-border/45 aria-expanded:bg-input/15",
          "data-[popup-open]:border-border/45 data-[popup-open]:bg-input/15",
        ],
        secondary: [
          "bg-secondary/8 text-secondary-foreground",
          "hover:bg-secondary/20 active:bg-secondary/20 aria-expanded:bg-secondary/20",
        ],
        ghost: [
          "text-foreground",
          "hover:bg-input/10 active:bg-input/10 aria-expanded:bg-input/10",
        ],
        "ghost-muted": [
          "text-foreground/60",
          "hover:bg-input/10 hover:text-foreground active:bg-input/10 active:text-foreground",
          "aria-expanded:bg-input/10 aria-expanded:text-foreground",
        ],
        destructive: [
          "border-destructive/30 bg-destructive/15 text-destructive",
          "hover:border-destructive/60 hover:bg-destructive/25 active:bg-destructive/25",
          "focus-visible:border-destructive focus-visible:ring-destructive/20",
        ],
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-7 gap-1 px-2 text-xs-plus [&_svg:not([class*='size-'])]:size-3.5",
        xxs: "h-[18px] gap-1 px-1.5 text-[11px] [&_svg:not([class*='size-'])]:size-2.5",
        xs: "h-[22px] gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-2.5",
        sm: "h-6 gap-1 px-2 text-xs/relaxed [&_svg:not([class*='size-'])]:size-3",
        lg: "h-[34px] gap-1 px-3.5 text-sm/relaxed tracking-tight [&_svg:not([class*='size-'])]:size-3.5",
        xl: "h-10 gap-1.5 px-3 text-sm/relaxed [&_svg:not([class*='size-'])]:size-4",
        icon: "size-7 text-xs-plus [&_svg:not([class*='size-'])]:size-3.5",
        "icon-xs": "size-[22px] text-xs [&_svg:not([class*='size-'])]:size-2.5",
        "icon-sm": "size-6 text-xs/relaxed [&_svg:not([class*='size-'])]:size-3",
        "icon-lg": "size-[34px] text-sm/relaxed [&_svg:not([class*='size-'])]:size-4",
      },
      radius: {
        default: "rounded-lg",
        md: "rounded-md",
        xl: "rounded-xl",
        full: "rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      radius: "default",
    },
  },
);

export interface ButtonProps
  extends Omit<BaseButton.Props, "className">,
    VariantProps<typeof buttonVariants> {
  className?: string;
}

export function Button({ variant, size, radius, className, ...props }: ButtonProps) {
  return (
    <BaseButton
      data-slot="button"
      className={cn(buttonVariants({ variant, size, radius }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
