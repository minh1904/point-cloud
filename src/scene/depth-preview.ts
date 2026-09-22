/**
 * Pass 2D: vẽ ảnh gốc và depth map cạnh nhau với thanh chia dọc.
 *
 * Canvas 2D chứ không WebGL, có chủ đích: pass này chỉ blit hai ảnh và vẽ một
 * đường thẳng. Dùng WebGL ở đây là thêm một context, một program, một vòng đời
 * tài nguyên để đổi lấy đúng con số không. Pass 3D (P2) mới cần WebGL.
 *
 * Hàm thuần theo nghĩa: mọi thứ nó cần đều nằm trong tham số, không đọc store,
 * không giữ state giữa các lần gọi.
 */

import { depthToRgba } from "@/depth/colormap";
import type { RawPixels } from "@/depth/protocol";
import type { Colormap, DepthMap } from "@/shared/types";

export type DepthPreviewInput = {
  readonly pixels: RawPixels;
  readonly depth: DepthMap | null;
  readonly colormap: Colormap;
  /** 0..1 — bên trái đường này là ảnh gốc, bên phải là depth. */
  readonly split: number;
  readonly dpr: number;
  readonly viewport: { readonly scale: number; readonly x: number; readonly y: number };
};

/**
 * Cache ảnh đã dựng, khoá theo (depth, colormap).
 *
 * Vì sao cần: `depthToRgba` duyệt từng pixel. Với ảnh 1024×1024 đó là hơn một
 * triệu vòng lặp — chạy lại mỗi lần kéo thanh split sẽ giật thấy rõ. Split đổi
 * rất thường xuyên, depth và colormap thì không.
 */
let cacheKey = "";
let cached: ImageBitmap | null = null;

async function getDepthBitmap(
  depth: DepthMap,
  colormap: Colormap,
): Promise<ImageBitmap> {
  const key = `${depth.modelId}:${depth.width}x${depth.height}:${colormap}`;
  if (key === cacheKey && cached) return cached;

  const rgba = depthToRgba(depth.data, colormap);
  const bitmap = await createImageBitmap(
    new ImageData(rgba, depth.width, depth.height),
  );

  cached?.close();
  cacheKey = key;
  cached = bitmap;
  return bitmap;
}

/** Giải phóng cache. Gọi khi đổi ảnh hoặc unmount. */
export function disposeDepthPreview(): void {
  cached?.close();
  cached = null;
  cacheKey = "";
}

let sourceKey = "";
let sourceBitmap: ImageBitmap | null = null;

async function getSourceBitmap(pixels: RawPixels): Promise<ImageBitmap> {
  const key = `${pixels.width}x${pixels.height}:${pixels.data.length}`;
  if (key === sourceKey && sourceBitmap) return sourceBitmap;

  const bitmap = await createImageBitmap(
    new ImageData(
      // ImageData cần chính mảng đó, không copy — nhưng pixels.data thuộc store
      // nên copy để tránh mọi khả năng bị chuyển quyền sở hữu.
      new Uint8ClampedArray(pixels.data.slice().buffer),
      pixels.width,
      pixels.height,
    ),
  );

  sourceBitmap?.close();
  sourceKey = key;
  sourceBitmap = bitmap;
  return bitmap;
}

/**
 * Vẽ một frame. Async vì `createImageBitmap` async; caller không cần chờ, frame
 * sau sẽ vẽ đè.
 */
export async function drawDepthPreview(
  canvas: HTMLCanvasElement,
  input: DepthPreviewInput,
): Promise<void> {
  const context = canvas.getContext("2d");
  if (!context) return;

  const { pixels, depth, colormap, split, dpr, viewport } = input;

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);

  // Fit ảnh vào khung rồi mới áp pan/zoom của user. `contain` chứ không `cover`:
  // đây là công cụ kiểm tra depth, cắt mất mép ảnh là mất thông tin.
  const fit = Math.min(
    canvas.width / pixels.width,
    canvas.height / pixels.height,
  );
  const scale = fit * viewport.scale;
  const drawWidth = pixels.width * scale;
  const drawHeight = pixels.height * scale;
  const left = (canvas.width - drawWidth) / 2 + viewport.x * dpr;
  const top = (canvas.height - drawHeight) / 2 + viewport.y * dpr;

  const source = await getSourceBitmap(pixels);
  context.drawImage(source, left, top, drawWidth, drawHeight);

  if (!depth) return;

  const bitmap = await getDepthBitmap(depth, colormap);
  const splitX = left + drawWidth * split;

  // Clip về nửa phải rồi vẽ depth đè lên — cho ra hiệu ứng thanh trượt so sánh
  // mà chỉ cần một lần drawImage.
  context.save();
  context.beginPath();
  context.rect(splitX, top, left + drawWidth - splitX, drawHeight);
  context.clip();
  context.drawImage(bitmap, left, top, drawWidth, drawHeight);
  context.restore();

  // Đường chia. Vẽ sau cùng để không bị ảnh che.
  context.strokeStyle = "rgba(255,255,255,0.85)";
  context.lineWidth = Math.max(1, dpr);
  context.beginPath();
  context.moveTo(splitX, top);
  context.lineTo(splitX, top + drawHeight);
  context.stroke();
}
