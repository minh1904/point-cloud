"use client";

import { useEffect, useRef } from "react";

import type { RgbaBytes } from "@/photo/decode-image";

export interface PreviewPixels {
  width: number;
  height: number;
  /** RGBA bytes, row 0 at the top. */
  data: RgbaBytes;
}

interface PixelPreviewProps {
  pixels: PreviewPixels | null;
  /** Accessible description of what the preview shows. */
  label: string;
  className?: string;
}

/**
 * Paints an RGBA buffer into a canvas (P6.1).
 *
 * The canvas keeps the image's own pixel dimensions and CSS shrinks it to fit
 * the panel, which is the one place in this project where browser scaling is
 * the right answer: this is a thumbnail for a human, not data for a shader.
 *
 * `putImageData` is deliberately not `drawImage`. It writes bytes straight
 * into the backing store with no scaling, no smoothing and no colour
 * management, so what you see is what the buffer holds — which is the whole
 * point of a preview that exists to catch a wrong pipeline stage.
 */
export function PixelPreview({ pixels, label, className }: PixelPreviewProps) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    if (!element || !pixels) return;

    // Assigning width/height also clears the canvas, so a smaller image never
    // leaves the previous one showing around its edges.
    element.width = pixels.width;
    element.height = pixels.height;

    const context = element.getContext("2d");
    context?.putImageData(new ImageData(pixels.data, pixels.width, pixels.height), 0, 0);
  }, [pixels]);

  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={label}
      className={className}
    />
  );
}
