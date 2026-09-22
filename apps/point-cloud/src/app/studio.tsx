"use client";

import { Button, Panel, Slider } from "@atelier/ui";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";

import {
  defaultParticleParams,
  type ParticleParams,
} from "@/scene/particle-field";
import type { RenderStats } from "@/scene/render-info";
import { defaultPostParams, type PostParams } from "@/scene/scene-pass";
import type { OrbitControlsHandle } from "@/scene/stage";

// WebGL only exists in the browser, so the canvas is never server-rendered:
// no empty markup to hydrate, and scene code may touch window freely.
const Stage = dynamic(() => import("@/scene/stage").then((m) => m.Stage), {
  ssr: false,
});

export function Studio() {
  const [playing, setPlaying] = useState(true);
  const [stats, setStats] = useState<RenderStats | null>(null);
  const [params, setParams] = useState<ParticleParams>(defaultParticleParams);
  const [postParams, setPostParams] = useState<PostParams>(defaultPostParams);
  const controls = useRef<OrbitControlsHandle>(null);

  // Each slider writes one field. For now every change re-renders the scene
  // component; roadmap step 7.3 moves this to transient store updates.
  const setParticle = (key: keyof ParticleParams) => (value: number) =>
    setParams((current) => ({ ...current, [key]: value }));
  const setPost = (key: keyof PostParams) => (value: number) =>
    setPostParams((current) => ({ ...current, [key]: value }));

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <Stage
        params={params}
        postParams={postParams}
        playing={playing}
        onStats={setStats}
        controlsRef={controls}
      />

      <div className="absolute top-3 left-3 flex items-center gap-2">
        <Button variant="outline" onClick={() => setPlaying((p) => !p)}>
          {playing ? "Pause" : "Play"}
        </Button>
        {/* Restores the camera state the controls saved when they mounted. */}
        <Button variant="ghost-muted" onClick={() => controls.current?.reset()}>
          Reset view
        </Button>
        {stats && (
          <span className="font-mono text-2xs text-muted-foreground tabular-nums">
            {stats.fps} fps · {stats.calls} draw call{stats.calls === 1 ? "" : "s"} ·{" "}
            {stats.points.toLocaleString("en-US")} points
          </span>
        )}
      </div>

      <div className="absolute top-3 right-3 flex flex-col gap-2">
        <Panel title="Particles">
          <Slider
            label="Size"
            value={params.size}
            onValueChange={setParticle("size")}
            min={0.005}
            max={0.1}
            step={0.001}
            format={{ maximumFractionDigits: 3 }}
          />
          <Slider
            label="Softness"
            value={params.softness}
            onValueChange={setParticle("softness")}
            format={{ maximumFractionDigits: 2 }}
          />
          <Slider
            label="Drift"
            value={params.driftAmplitude}
            onValueChange={setParticle("driftAmplitude")}
            max={0.3}
            step={0.005}
            format={{ maximumFractionDigits: 3 }}
          />
          <Slider
            label="Speed"
            value={params.driftSpeed}
            onValueChange={setParticle("driftSpeed")}
            max={3}
            step={0.1}
            format={{ maximumFractionDigits: 1 }}
          />
          <Button
            variant="ghost-muted"
            size="sm"
            className="mt-1"
            onClick={() => setParams(defaultParticleParams)}
          >
            Reset
          </Button>
        </Panel>

        <Panel title="Post effects">
          <Slider
            label="Scale"
            value={postParams.renderScale}
            onValueChange={setPost("renderScale")}
            min={0.5}
            max={1}
            step={0.05}
            format={{ style: "percent" }}
          />
          <Slider
            label="Vignette"
            value={postParams.vignette}
            onValueChange={setPost("vignette")}
            step={0.01}
            format={{ maximumFractionDigits: 2 }}
          />
          <Slider
            label="Chromatic"
            value={postParams.chromaticAberration}
            onValueChange={setPost("chromaticAberration")}
            max={0.02}
            step={0.0005}
            format={{ maximumFractionDigits: 4 }}
          />
          <Slider
            label="Grain"
            value={postParams.grain}
            onValueChange={setPost("grain")}
            max={0.15}
            step={0.005}
            format={{ maximumFractionDigits: 3 }}
          />
          <Button
            variant="ghost-muted"
            size="sm"
            className="mt-1"
            onClick={() => setPostParams(defaultPostParams)}
          >
            Reset
          </Button>
        </Panel>
      </div>
    </main>
  );
}
