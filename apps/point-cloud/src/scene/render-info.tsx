"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";

export interface RenderStats {
  calls: number;
  points: number;
}

/**
 * Reports renderer.info a couple of times per second. Priority -2 reads the
 * completed previous frame before ScenePass resets the counters for its two
 * render passes.
 */
export function RenderInfo({
  onStats,
}: {
  onStats: (stats: RenderStats) => void;
}) {
  const info = useThree((state) => state.gl.info);
  const elapsed = useRef(0);

  useFrame((_, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 0.5) return;
    elapsed.current = 0;
    onStats({ calls: info.render.calls, points: info.render.points });
  }, -2);

  return null;
}
