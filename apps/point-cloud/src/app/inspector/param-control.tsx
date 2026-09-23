"use client";

import { Button, Slider } from "@atelier/ui";

import type { Param } from "@/params/schema";
import { useParamsStore } from "@/store/params-store";

/**
 * One knob, rendered from its schema entry (P7.2).
 *
 * Every control subscribes to **its own value only**. Zustand compares what the
 * selector returns, so dragging `size` notifies the `size` control and nobody
 * else — twenty controls on screen, one of them re-renders. That is the other
 * half of 7.3: the scene does not render because it never subscribes, and the
 * inspector renders narrowly because each control subscribes to one field.
 */
export function ParamControl({ param }: { param: Param }) {
  const value = useParamsStore((state) => state.values[param.key]);
  const set = useParamsStore((state) => state.set);
  const commit = useParamsStore((state) => state.commit);

  if (param.kind === "number") {
    return (
      <Slider
        label={param.label}
        value={typeof value === "number" ? value : param.default}
        // Live while the drag runs…
        onValueChange={(next) => set(param.key, next)}
        // …and one history entry when the gesture ends (7.4).
        onValueCommitted={() => commit()}
        min={param.min}
        max={param.max}
        step={param.step}
        format={param.format}
      />
    );
  }

  if (param.kind === "toggle") {
    const on = value === true;
    return (
      <Button
        variant={on ? "outline" : "ghost-muted"}
        size="sm"
        className="mt-1"
        title={param.hint}
        onClick={() => {
          set(param.key, !on);
          commit();
        }}
      >
        {on ? (param.onLabel ?? param.label) : param.label}
      </Button>
    );
  }

  // An enum with three options does not need a listbox: cycling through them
  // is one tap, needs no popup, and keeps the panel the same height. A real
  // `Select` arrives when something has more options than fit in a label.
  const current = typeof value === "string" ? value : param.default;
  return (
    <Button
      variant="ghost-muted"
      size="sm"
      className="mt-1"
      title={param.hint}
      onClick={() => {
        const index = (param.options.indexOf(current) + 1) % param.options.length;
        set(param.key, param.options[index]!);
        commit();
      }}
    >
      {param.label}: {current}
    </Button>
  );
}
