"use client";

import { Button, Panel, Slider } from "@atelier/ui";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";

import {
  defaultLensParams,
  defaultParticleParams,
  GRADES,
  type LensParams,
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
  const [lens, setLens] = useState<LensParams>(defaultLensParams);
  const [postParams, setPostParams] = useState<PostParams>(defaultPostParams);
  const controls = useRef<OrbitControlsHandle>(null);
  // Only a counter lives in React state. The intro's progress itself changes
  // every frame and stays inside the scene, because re-rendering sixty times a
  // second to animate a shader uniform is the trap step 7.3 exists to close.
  const [introReplay, setIntroReplay] = useState(0);

  // Each slider writes one field. For now every change re-renders the scene
  // component; roadmap step 7.3 moves this to transient store updates.
  type NumericParticleParam = {
    [K in keyof ParticleParams]: ParticleParams[K] extends number ? K : never;
  }[keyof ParticleParams];

  const setParticle = (key: NumericParticleParam) => (value: number) =>
    setParams((current) => ({ ...current, [key]: value }));
  const setLensParam = (key: keyof LensParams) => (value: number) =>
    setLens((current) => ({ ...current, [key]: value }));
  const setPost = (key: keyof PostParams) => (value: number) =>
    setPostParams((current) => ({ ...current, [key]: value }));

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <Stage
        params={params}
        lens={lens}
        introReplay={introReplay}
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
        <Button
          variant="ghost-muted"
          onClick={() => setIntroReplay((n) => n + 1)}
        >
          Replay intro
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
          <Button
            variant="ghost-muted"
            size="sm"
            className="mt-1"
            onClick={() => setParams(defaultParticleParams)}
          >
            Reset
          </Button>
        </Panel>

        <Panel title="Motion">
          <Slider
            label="Amplitude"
            value={params.noiseAmplitude}
            onValueChange={setParticle("noiseAmplitude")}
            max={0.15}
            step={0.001}
            format={{ maximumFractionDigits: 3 }}
          />
          <Slider
            label="Frequency"
            value={params.noiseFrequency}
            onValueChange={setParticle("noiseFrequency")}
            min={0.2}
            max={12}
            step={0.1}
            format={{ maximumFractionDigits: 1 }}
          />
          <Slider
            label="Scatter"
            value={params.noiseScatter}
            onValueChange={setParticle("noiseScatter")}
            max={4}
            step={0.05}
            format={{ maximumFractionDigits: 2 }}
          />
          <Slider
            label="Breathe"
            value={params.breathe}
            onValueChange={setParticle("breathe")}
            max={0.08}
            step={0.001}
            format={{ maximumFractionDigits: 3 }}
          />
          <Slider
            label="Speed"
            value={params.speed}
            onValueChange={setParticle("speed")}
            max={3}
            step={0.1}
            format={{ maximumFractionDigits: 1 }}
          />
          {/* P4.1 — paints the fBM field the motion is driven by, straight
              onto the particles. A proper Toggle arrives with P5. */}
          <Button
            variant={params.debugNoise ? "outline" : "ghost-muted"}
            size="sm"
            className="mt-1"
            onClick={() =>
              setParams((current) => ({ ...current, debugNoise: !current.debugNoise }))
            }
          >
            {params.debugNoise ? "Showing noise field" : "Show noise field"}
          </Button>
        </Panel>

        <Panel title="Lens">
          {/* Changing this dollies the camera to hold the framing, so what you
              see is perspective compression rather than a zoom. */}
          <Slider
            label="FOV"
            value={lens.fov}
            onValueChange={setLensParam("fov")}
            min={8}
            max={60}
            step={1}
            format={{ maximumFractionDigits: 0 }}
          />
          <Slider
            label="Focus"
            value={lens.focalDepth}
            onValueChange={setLensParam("focalDepth")}
            step={0.01}
            format={{ maximumFractionDigits: 2 }}
          />
          <Slider
            label="Range"
            value={lens.focalRange}
            onValueChange={setLensParam("focalRange")}
            min={0.02}
            max={1}
            step={0.01}
            format={{ maximumFractionDigits: 2 }}
          />
          <Slider
            label="Edge"
            value={lens.edgeBokeh}
            onValueChange={setLensParam("edgeBokeh")}
            step={0.01}
            format={{ maximumFractionDigits: 2 }}
          />
          <Slider
            label="Grade"
            value={lens.gradeIntensity}
            onValueChange={setLensParam("gradeIntensity")}
            step={0.01}
            format={{ maximumFractionDigits: 2 }}
          />
          {/* Cycles the baked LUTs. `neutral` is the identity grade: at full
              intensity it must leave the picture untouched, which is the only
              real test that the lookup maths is right. */}
          <Button
            variant="ghost-muted"
            size="sm"
            className="mt-1"
            onClick={() =>
              setLens((current) => ({
                ...current,
                grade: GRADES[(GRADES.indexOf(current.grade) + 1) % GRADES.length]!,
              }))
            }
          >
            LUT: {lens.grade}
          </Button>
          <Button
            variant="ghost-muted"
            size="sm"
            onClick={() => setLens(defaultLensParams)}
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
