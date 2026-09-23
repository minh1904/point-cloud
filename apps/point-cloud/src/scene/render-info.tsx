"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";

import { useSessionStore } from "@/store/session-store";

/**
 * Reports renderer.info and estimated frame rate a couple of times per second.
 * Priority -2 reads the completed previous frame before ScenePass resets the
 * counters for its two render passes.
 *
 * Twice a second is slow enough that writing to the store — and re-rendering
 * the one status-bar line that reads it — costs nothing. Every hundredth of a
 * second would be a different conversation.
 */
export function RenderInfo() {
  const info = useThree((state) => state.gl.info);
  const setStats = useSessionStore((state) => state.setStats);
  const elapsed = useRef(0);
  const frames = useRef(0);

  useFrame((_, delta) => {
    elapsed.current += delta;
    frames.current += 1;
    if (elapsed.current < 0.5) return;
    const fps = Math.round(frames.current / elapsed.current);
    elapsed.current = 0;
    frames.current = 0;
    setStats({ fps, calls: info.render.calls, points: info.render.points });
  }, -2);

  return null;
}
