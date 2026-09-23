"use client";

import { useFrame } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import type { Vector3 } from "three";

import type { IntroClock } from "./particle-field";

/**
 * The camera half of the intro (P5.5): a slow push in while the cloud arrives.
 *
 * Revealing the particles and moving the camera at the same time is what makes
 * the two read as a single event rather than two animations that happen to
 * overlap. The end point is wherever the camera already was when the intro
 * started, so replaying after the viewer has orbited returns to *their*
 * framing instead of snapping back to the default one.
 *
 * This only ever reads the clock. `ParticleField` owns it and advances it,
 * because the component that mutates a ref has to be the one that created it.
 *
 * P7.3 — there is no `replay` prop any more, and none is needed: the frame
 * where progress reaches 1 clears the remembered distance, so a replay finds
 * it already cleared and measures the viewer's current framing afresh.
 */
export function IntroDolly({ clock }: { clock: RefObject<IntroClock> }) {
  const endDistance = useRef<number | null>(null);

  useFrame(({ camera, controls }) => {
    const progress = clock.current.value;
    if (progress >= 1) {
      endDistance.current = null;
      return;
    }

    const target = (controls as { target?: Vector3 } | null)?.target;
    if (!target) return;

    endDistance.current ??= camera.position.distanceTo(target);

    // Cubic ease-out: most of the travel happens early, so the final moments
    // settle into place rather than arrive at speed.
    const eased = 1 - (1 - progress) ** 3;
    camera.position
      .sub(target)
      .setLength(endDistance.current * (1 + (1 - eased) * 0.5))
      .add(target);
  });

  return null;
}
