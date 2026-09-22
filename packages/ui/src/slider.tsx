import { Slider as BaseSlider } from "@base-ui/react/slider";

import { cn } from "./cn";

export interface SliderProps {
  /** Shown inside the track on the left and used as the accessible name. */
  label: string;
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Formats the value shown on the right (and announced to screen readers). */
  format?: Intl.NumberFormatOptions;
  disabled?: boolean;
  className?: string;
}

/**
 * Inline-label slider for dense inspectors: the whole 28px track is the hit
 * area, the fill shows the value, label and number sit inside the track.
 * Keyboard support (arrows, Page Up/Down, Home/End) comes from Base UI.
 */
export function Slider({
  label,
  value,
  defaultValue,
  onValueChange,
  min = 0,
  max = 1,
  step = 0.01,
  format,
  disabled,
  className,
}: SliderProps) {
  return (
    <BaseSlider.Root
      data-slot="slider"
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => onValueChange?.(next)}
      min={min}
      max={max}
      step={step}
      format={format}
      disabled={disabled}
      thumbAlignment="edge"
      className={cn("w-full data-[disabled]:opacity-50", className)}
    >
      <BaseSlider.Control className="group/slider relative flex h-7 w-full cursor-ew-resize touch-none items-center select-none data-[disabled]:cursor-default">
        <BaseSlider.Track className="relative h-full w-full overflow-hidden rounded-lg border border-border/12 bg-input/10 transition-colors group-hover/slider:border-border/20">
          <BaseSlider.Indicator className="h-full bg-foreground/10 transition-colors group-hover/slider:bg-foreground/15" />
          <BaseSlider.Thumb
            aria-label={label}
            className="h-3.5 w-0.5 rounded-full bg-foreground/60 outline-none transition-colors group-hover/slider:bg-foreground focus-visible:bg-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-[dragging]:bg-foreground"
          />
        </BaseSlider.Track>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-between gap-2 px-2 text-xs-plus">
          <BaseSlider.Label className="truncate text-muted-foreground">{label}</BaseSlider.Label>
          <BaseSlider.Value className="shrink-0 tabular-nums text-foreground" />
        </div>
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}
