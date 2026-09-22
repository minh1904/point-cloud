/**
 * Shell của app và nơi điều phối.
 *
 * Vai trò giống `app-composition.tsx` cũ: nó là chỗ duy nhất biết cả `depth`,
 * `scene` và `store` tồn tại, nhờ vậy các module đó không phải import lẫn nhau.
 *
 * Toàn bộ logic "khi nào chạy lại cái gì" nằm ở đây. Bảng quyết định:
 *
 * | Đổi cái gì   | Chạy lại inference | Vẽ lại |
 * |--------------|--------------------|--------|
 * | ảnh          | có                 | có     |
 * | modelId      | có                 | có     |
 * | viewMode     | không              | có     |
 * | colormap     | không              | có     |
 * | split        | không              | có     |
 * | depthScale   | không              | có     |
 *
 * Điểm quan trọng: kéo slider KHÔNG chạy lại AI. Nếu có, app không dùng được.
 */

import { useCallback, useEffect, useState } from "react";

import { estimateDepth, releaseDepthWorker } from "@/depth/depth-client";
import type { RawPixels } from "@/depth/protocol";
import { disposeStage, renderStage } from "@/scene/stage-renderer";
import {
  downloadBlob,
  exportPointCloud,
} from "@/pointcloud/export-client";
import { useActiveModel, useStudio } from "@/store/studio";

import { CanvasStage, type StageFrame } from "@/ui/CanvasStage";
import { ControlsPanel } from "@/ui/ControlsPanel";
import { useImagePaste } from "@/ui/use-image-paste";
import { Toolbar, ToolbarCell, ToolbarDivider } from "@/ui/primitives";

/**
 * Giải mã file ảnh thành pixel thô.
 *
 * Downscale về tối đa 1536px cạnh dài: model resize xuống 322-518px dù sao, nên
 * ảnh 6000px chỉ tốn bộ nhớ và thời gian giải mã. 1536 vẫn thừa chi tiết cho
 * lưới 512² và cho depth map.
 */
const MAX_EDGE = 1536;

async function decodeImage(file: File): Promise<RawPixels> {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));

  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Không lấy được OffscreenCanvas 2D context.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const image = context.getImageData(0, 0, width, height);
  return { data: image.data, width, height };
}

export default function App() {
  const pixels = useStudio((state) => state.pixels);
  const depth = useStudio((state) => state.depth);
  const viewMode = useStudio((state) => state.viewMode);
  const colormap = useStudio((state) => state.colormap);
  const splitPosition = useStudio((state) => state.splitPosition);
  const depthScale = useStudio((state) => state.depthScale);
  const gridSize = useStudio((state) => state.gridSize);
  const pointSize = useStudio((state) => state.pointSize);
  const fbmAmp = useStudio((state) => state.fbmAmp);
  const fbmFreq = useStudio((state) => state.fbmFreq);
  const fbmSpeed = useStudio((state) => state.fbmSpeed);
  const curlStrength = useStudio((state) => state.curlStrength);
  const spread = useStudio((state) => state.spread);
  const breathAmp = useStudio((state) => state.breathAmp);
  const breathSpeed = useStudio((state) => state.breathSpeed);
  const modelId = useStudio((state) => state.modelId);
  const model = useActiveModel();

  const setSource = useStudio((state) => state.setSource);
  const clearSource = useStudio((state) => state.clearSource);
  const setDepth = useStudio((state) => state.setDepth);
  const setProgress = useStudio((state) => state.setProgress);
  const setError = useStudio((state) => state.setError);

  const onFile = useCallback(
    (file: File) => {
      disposeStage();
      void decodeImage(file)
        .then((decoded) => setSource(file.name, decoded))
        .catch((error: unknown) =>
          setError(
            error instanceof Error ? error.message : "Không đọc được ảnh.",
          ),
        );
    },
    [setSource, setError],
  );

  useImagePaste(onFile);

  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const onExport = useCallback(() => {
    const state = useStudio.getState();
    if (!state.depth || !state.pixels) return;

    setExporting(true);
    setExportProgress(0);
    exportPointCloud({
      depth: state.depth,
      pixels: state.pixels,
      grid: state.gridSize,
      depthScale: state.depthScale,
      projection: state.projection,
      sourceName: state.fileName ?? "pointcloud",
      modelId: state.modelId,
      gzip: state.gzip,
      onProgress: setExportProgress,
    })
      .then((result) => downloadBlob(result.blob, result.fileName))
      .catch((error: unknown) =>
        setError(error instanceof Error ? error.message : "Export thất bại."),
      )
      .finally(() => setExporting(false));
  }, [setError]);

  const onClear = useCallback(() => {
    clearSource();
  }, [clearSource]);

  // Chạy inference. Dependency CHỈ có pixels và model — đây là dòng code quyết
  // định việc kéo slider không gọi lại AI.
  useEffect(() => {
    if (!pixels) return;
    setProgress({ phase: "loading" });
    estimateDepth(pixels, model, {
      onProgress: setProgress,
      onResult: setDepth,
      onError: (error) => setError(error.message),
    });
  }, [pixels, model, setProgress, setDepth, setError]);

  // Giải phóng session ONNX khi rời app.
  useEffect(() => {
    return () => {
      releaseDepthWorker();
      disposeStage();
    };
  }, []);

  const onFrame = useCallback(
    (canvas: HTMLCanvasElement, frame: StageFrame) => {
      if (!pixels) return;
      renderStage(canvas, {
        pixels,
        depth,
        mode: viewMode,
        colormap,
        split: splitPosition,
        depthScale,
        gridSize,
        pointSize,
        fbmAmp,
        fbmFreq,
        fbmSpeed,
        curlStrength,
        spread,
        breathAmp,
        breathSpeed,
        dpr: frame.dpr,
        time: frame.time,
        viewport: frame.viewport,
      });
    },
    [
      pixels,
      depth,
      viewMode,
      colormap,
      splitPosition,
      depthScale,
      gridSize,
      pointSize,
      fbmAmp,
      fbmFreq,
      fbmSpeed,
      curlStrength,
      spread,
      breathAmp,
      breathSpeed,
    ],
  );

  return (
    // Canvas trải kín, panel và toolbar nổi lên trên — bố cục của Toolcraft.
    // `pointer-events-none` ở lớp phủ để kéo/zoom xuyên qua được xuống canvas;
    // từng tấm nổi tự bật lại `pointer-events-auto`.
    <div className="relative h-full overflow-clip">
      {/* flex để `flex-1` của CanvasStage có tác dụng — nếu không nó cao 0. */}
      <div className="absolute inset-0 flex">
        <CanvasStage
          onFrame={onFrame}
          animate={viewMode === "particles"}
          empty={!pixels}
          emptyHint="Kéo ảnh vào panel để bắt đầu"
        />
      </div>

      <div className="pointer-events-none absolute inset-0 flex items-start justify-between gap-2.5 p-2.5">
        <ControlsPanel
          onFile={onFile}
          onClear={onClear}
          onExport={onExport}
          exporting={exporting}
          exportProgress={exportProgress}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-2.5 flex justify-center">
        <Toolbar>
          <ToolbarCell mono>
            {pixels ? `${pixels.width}×${pixels.height}` : "chưa có ảnh"}
          </ToolbarCell>
          <ToolbarDivider />
          <ToolbarCell mono>
            {depth ? `depth ${depth.width}×${depth.height}` : "chưa có depth"}
          </ToolbarCell>
          <ToolbarDivider />
          <ToolbarCell>{modelId.split("/")[1] ?? modelId}</ToolbarCell>
          <ToolbarDivider />
          {/* Phím tắt vô hình thì coi như không tồn tại — liệt kê ngay tại chỗ. */}
          <ToolbarCell>
            lăn: zoom · kéo: {viewMode === "particles" ? "orbit" : "pan"} ·
            {" +/- 0"} · mũi tên
          </ToolbarCell>
        </Toolbar>
      </div>
    </div>
  );
}
