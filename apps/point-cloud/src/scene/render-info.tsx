"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";

export interface RenderStats {
  calls: number;
  points: number;
}

/**
 * Reports renderer.info a couple of times per second. useFrame runs before the
 * frame is drawn, so the numbers describe the previous frame — fine for a HUD.
 */
export function RenderInfo({ onStats }: { onStats: (stats: RenderStats) => void }) {
  const info = useThree((state) => state.gl.info);
  const elapsed = useRef(0);

  useFrame((_, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 0.5) return;
    elapsed.current = 0;
    onStats({ calls: info.render.calls, points: info.render.points });
  });

  return null;
}
