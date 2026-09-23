"use client";

import { Button, Panel, type PanelProps } from "@atelier/ui";
import { useState } from "react";

import { BUILT_IN_PRESETS } from "@/params/presets";
import { useParamsStore } from "@/store/params-store";
import { applyPreset, usePresetsStore } from "@/store/presets-store";

interface PresetsPanelProps {
  panel: Omit<PanelProps, "children">;
}

/**
 * Built-in looks, and somewhere to keep your own (P7.5).
 *
 * The name field is a plain `<input>` rather than a `prompt()`. A modal dialog
 * blocks the whole page — including the render loop behind it — and this panel
 * sits next to a canvas that is supposed to keep moving.
 */
export function PresetsPanel({ panel }: PresetsPanelProps) {
  const [name, setName] = useState("");
  const presets = usePresetsStore((state) => state.presets);
  const save = usePresetsStore((state) => state.save);
  const remove = usePresetsStore((state) => state.remove);
  const reset = useParamsStore((state) => state.reset);

  const submit = () => {
    if (!name.trim()) return;
    save(name);
    setName("");
  };

  return (
    <Panel {...panel}>
      <div className="flex flex-wrap gap-1">
        {BUILT_IN_PRESETS.map((preset) => (
          <Button
            key={preset.name}
            variant="ghost-muted"
            size="xs"
            onClick={() => applyPreset(preset.values)}
          >
            {preset.name}
          </Button>
        ))}
      </div>

      {presets.length > 0 && (
        <div className="mt-1 flex flex-col gap-0.5">
          {presets.map((preset) => (
            <div key={preset.name} className="flex items-center gap-1">
              <Button
                variant="ghost-muted"
                size="xs"
                className="min-w-0 flex-1 justify-start"
                onClick={() => applyPreset(preset.values)}
              >
                <span className="truncate">{preset.name}</span>
              </Button>
              <Button
                variant="ghost-muted"
                size="icon-xs"
                aria-label={`Delete preset ${preset.name}`}
                onClick={() => remove(preset.name)}
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-1 flex gap-1">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
            // Without this, Escape would bubble to the window shortcut and
            // close the inspector from inside a text field.
            if (event.key === "Escape") event.stopPropagation();
          }}
          placeholder="Save as…"
          aria-label="Preset name"
          className="h-6 min-w-0 flex-1 rounded-md border border-border/12 bg-input/10 px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
        />
        <Button variant="ghost-muted" size="sm" disabled={!name.trim()} onClick={submit}>
          Save
        </Button>
      </div>

      <Button variant="ghost-muted" size="sm" className="mt-1" onClick={reset}>
        Reset all
      </Button>
    </Panel>
  );
}
