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
 * has changed since it last looked.
 *
 * ## Why a clip does not have that problem
 *
 * `captureStream()` taps the canvas at the source, so the compositor hands it
 * every frame as it is produced. No copy of anything we were not already
 * drawing, and no need to preserve anything.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";

import { downloadBlob } from "@/bundle/export-bundle";
import { useSessionStore } from "@/store/session-store";

/** After the screen render at priority 1, while the drawing buffer is alive. */
const CAPTURE_PRIORITY = 2;

/** Frames per second asked of the recorder. */
const RECORDING_FPS = 60;

/** `point-cloud-2026-09-24-1432.png` — sortable, and says what it is. */
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

/** The best webm the browser will give us, or nothing. */
function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;

  // VP9 first: noticeably better at the flat gradients and fine grain this
  // renderer produces, and supported wherever MediaRecorder is except Safari.
  for (const type of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

export function Capture() {
  const gl = useThree((state) => state.gl);
  const seen = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const recording = useSessionStore((state) => state.recording);
  const stopRecording = useSessionStore((state) => state.toggleRecording);

  useFrame(() => {
    const request = useSessionStore.getState().stillRequest;
    if (request === seen.current) return;
    seen.current = request;

    gl.domElement.toBlob((blob) => {
      if (blob) downloadBlob(blob, captureName("png"));
    }, "image/png");
  }, CAPTURE_PRIORITY);

  useEffect(() => {
    if (!recording) return;

    const mimeType = pickMimeType();
    if (!mimeType) {
      console.warn("this browser cannot record the canvas");
      stopRecording();
      return;
    }

    const chunks: Blob[] = [];
    const media = new MediaRecorder(gl.domElement.captureStream(RECORDING_FPS), {
      mimeType,
      videoBitsPerSecond: 12_000_000,
    });

    media.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    media.onstop = () => downloadBlob(new Blob(chunks, { type: mimeType }), captureName("webm"));

    media.start();
    recorder.current = media;

    return () => {
      // Cleanup is where the file is written, which reads oddly and is right:
      // stopping is the only way a recording ever ends, whether the button was
      // pressed or the component unmounted.
      if (media.state !== "inactive") media.stop();
      recorder.current = null;
    };
  }, [recording, gl, stopRecording]);

  return null;
}
