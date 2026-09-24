"use client";

/**
 * Taking a picture of the picture (P9.3).
 *
 * ## Why a still has to be grabbed *inside* the frame
 *
 * WebGL canvases are created with `preserveDrawingBuffer: false`, which means
 * the browser is free to throw the rendered pixels away the moment the frame
 * is handed to the compositor. Call `toBlob()` from a click handler and you
 * reliably get a blank image.
 *
 * Turning `preserveDrawingBuffer` on fixes it and makes **every** frame pay
 * for a copy, forever, so that a button pressed once a week works. The cheaper
 * answer is to ask during the frame: a `useFrame` at priority 2 runs
 * immediately after `ScenePass` has drawn to the screen at priority 1, while
 * the buffer is still valid.
 *
 * That is also why the request is a counter in a store rather than a callback.
 * The frame loop cannot listen for events; it can only notice that a number
 * has changed since it last looked — the same shape as the intro's replay
 * counter (P7.3).
 *
 * ## What used to be here
 *
 * A `MediaRecorder` over `captureStream()` recorded the viewport to webm. It
 * worked and it was removed: a screen recorder does the same job without this
 * app having to own codec selection, bitrates and a recording state that can
 * outlive the component. What is left is the one thing a screen recorder
 * cannot do — capture the canvas at its own resolution, with nothing else in
 * the frame.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";

import { downloadBlob } from "@/bundle/export-bundle";
import { useSessionStore } from "@/store/session-store";

/** After the screen render at priority 1, while the drawing buffer is alive. */
const CAPTURE_PRIORITY = 2;

/** `point-cloud-2026-09-24-143207.png` — sortable, and says what it is. */
function captureName(extension: string): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    "point-cloud-",
    now.getFullYear(),
    "-",
    pad(now.getMonth() + 1),
    "-",
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
    ".",
    extension,
  ].join("");
}

export function Capture() {
  const gl = useThree((state) => state.gl);
  const seen = useRef(0);

  useFrame(() => {
    const request = useSessionStore.getState().stillRequest;
    if (request === seen.current) return;
    seen.current = request;

    gl.domElement.toBlob((blob) => {
      if (blob) downloadBlob(blob, captureName("png"));
    }, "image/png");
  }, CAPTURE_PRIORITY);

  return null;
}
