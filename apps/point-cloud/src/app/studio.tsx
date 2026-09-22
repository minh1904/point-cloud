"use client";

import { Button } from "@atelier/ui";
import dynamic from "next/dynamic";
import { useState } from "react";

import type { RenderStats } from "@/scene/render-info";

// WebGL only exists in the browser, so the canvas is never server-rendered:
// no empty markup to hydrate, and scene code may touch window freely.
const Stage = dynamic(() => import("@/scene/stage").then((m) => m.Stage), { ssr: false });

export function Studio() {
  const [spinning, setSpinning] = useState(true);
  const [stats, setStats] = useState<RenderStats | null>(null);

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <Stage spinning={spinning} onStats={setStats} />
      <div className="absolute top-3 left-3 flex items-center gap-3">
        <Button variant="outline" onClick={() => setSpinning((s) => !s)}>
          {spinning ? "Pause" : "Spin"}
        </Button>
        {stats && (
          <span className="font-mono text-2xs text-muted-foreground tabular-nums">
            {stats.calls} draw call{stats.calls === 1 ? "" : "s"} ·{" "}
            {stats.points.toLocaleString("en-US")} points
          </span>
        )}
      </div>
    </main>
  );
}
