"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";

export interface RenderStats {
  fps: number;
  calls: number;
  points: number;
}

/**
 * Reports renderer.info and estimated frame rate a couple of times per second.
 * Priority -2 reads the completed previous frame before ScenePass resets the
 * counters for its two render passes.
 */
export function RenderInfo({
  onStats,
}: {
  onStats: (stats: RenderStats) => void;
}) {
  const info = useThree((state) => state.gl.info);
  const elapsed = useRef(0);
  const frames = useRef(0);

  useFrame((_, delta) => {
    elapsed.current += delta;
    frames.current += 1;
    if (elapsed.current < 0.5) return;
    const fps = Math.round(frames.current / elapsed.current);
    elapsed.current = 0;
    frames.current = 0;
    onStats({ fps, calls: info.render.calls, points: info.render.points });
  }, -2);

  return null;
}
