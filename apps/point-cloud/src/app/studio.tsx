"use client";

import { Button, Panel, Slider } from "@atelier/ui";
import dynamic from "next/dynamic";
import { useState } from "react";

import { defaultParticleParams, type ParticleParams } from "@/scene/particle-field";
import type { RenderStats } from "@/scene/render-info";

// WebGL only exists in the browser, so the canvas is never server-rendered:
// no empty markup to hydrate, and scene code may touch window freely.
const Stage = dynamic(() => import("@/scene/stage").then((m) => m.Stage), { ssr: false });

export function Studio() {
  const [playing, setPlaying] = useState(true);
  const [stats, setStats] = useState<RenderStats | null>(null);
  const [params, setParams] = useState<ParticleParams>(defaultParticleParams);

  // Each slider writes one field. For now every change re-renders the scene
  // component; roadmap step 7.3 moves this to transient store updates.
  const set = (key: keyof ParticleParams) => (value: number) =>
    setParams((current) => ({ ...current, [key]: value }));

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <Stage params={params} playing={playing} onStats={setStats} />

      <div className="absolute top-3 left-3 flex items-center gap-3">
        <Button variant="outline" onClick={() => setPlaying((p) => !p)}>
          {playing ? "Pause" : "Play"}
        </Button>
        {stats && (
          <span className="font-mono text-2xs text-muted-foreground tabular-nums">
            {stats.calls} draw call{stats.calls === 1 ? "" : "s"} ·{" "}
            {stats.points.toLocaleString("en-US")} points
          </span>
        )}
      </div>

      <Panel title="Particles" className="absolute top-3 right-3">
        <Slider
          label="Size"
          value={params.size}
          onValueChange={set("size")}
          min={0.005}
          max={0.1}
          step={0.001}
          format={{ maximumFractionDigits: 3 }}
        />
        <Slider
          label="Softness"
          value={params.softness}
          onValueChange={set("softness")}
          format={{ maximumFractionDigits: 2 }}
        />
        <Slider
          label="Drift"
          value={params.driftAmplitude}
          onValueChange={set("driftAmplitude")}
          max={0.3}
          step={0.005}
          format={{ maximumFractionDigits: 3 }}
        />
        <Slider
          label="Speed"
          value={params.driftSpeed}
          onValueChange={set("driftSpeed")}
          max={3}
          step={0.1}
          format={{ maximumFractionDigits: 1 }}
        />
        <Button variant="ghost-muted" size="sm" className="mt-1" onClick={() => setParams(defaultParticleParams)}>
          Reset
        </Button>
      </Panel>
    </main>
  );
}
