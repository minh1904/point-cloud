/**
 * Panel điều khiển. Thay cho controls panel do Toolcraft runtime dựng.
 *
 * Thứ tự section theo độ gắn kết (cohesion), không theo tần suất dùng: Source →
 * View → Geometry. Người dùng đi từ trên xuống một lần khi bắt đầu, rồi sau đó
 * chỉ quay lại section liên quan tới thứ họ đang tinh chỉnh.
 */

import { DEPTH_MODELS } from "@/depth/registry";
import { BREATHING, CURL, DEPTH, FBM, PARTICLE } from "@/shared/config";
import { useActiveModel, useStudio, type ViewMode } from "@/store/studio";
import type { Colormap, Projection } from "@/shared/types";

import { Dropzone } from "./Dropzone";
import {
  Badge,
  Button,
  Notice,
  Panel,
  Progress,
  Section,
  Segmented,
  Select,
  Slider,
  type SelectOption,
} from "./primitives";

const VIEW_OPTIONS: readonly SelectOption<ViewMode>[] = [
  { value: "depth", label: "2D Depth" },
  { value: "particles", label: "3D Particles" },
];

const COLORMAP_OPTIONS: readonly SelectOption<Colormap>[] = [
  { value: "grayscale", label: "Grayscale" },
  { value: "turbo", label: "Turbo" },
  { value: "inferno", label: "Inferno" },
];

const GRID_OPTIONS: readonly SelectOption<string>[] = PARTICLE.gridSizes.map(
  (size) => ({
    value: String(size),
    label: `${size} × ${size}`,
    hint: `${((size * size) / 1000).toFixed(0)}k hạt`,
  }),
);

export function ControlsPanel({
  onFile,
  onClear,
  onExport,
  exporting,
  exportProgress,
}: {
  onFile: (file: File) => void;
  onClear: () => void;
  onExport: () => void;
  exporting: boolean;
  exportProgress: number;
}) {
  const params = useStudio();
  const model = useActiveModel();
  const setParam = useStudio((state) => state.setParam);
  const reset = useStudio((state) => state.reset);

  const modelOptions: readonly SelectOption<string>[] = DEPTH_MODELS.map(
    (entry) => ({
      value: entry.id,
      label: entry.label,
      hint: `${entry.sizeMB} MB`,
    }),
  );

  const projectionOptions: readonly SelectOption<Projection>[] =
    model.kind === "metric"
      ? [
          { value: "relief", label: "Relief" },
          { value: "perspective", label: "Perspective" },
        ]
      : [{ value: "relief", label: "Relief" }];

  return (
    <Panel title="Point Cloud Studio" onReset={reset}>
      <Section title="Source">
        <Dropzone
          fileName={params.fileName}
          onFile={onFile}
          onClear={onClear}
        />

        <Select
          label="Depth model"
          value={params.modelId}
          options={modelOptions}
          onChange={(value) => setParam("modelId", value)}
        />

        <div className="flex items-center gap-2">
          <Badge kind={model.badge} />
          <span className="text-2xs text-[color:var(--muted-foreground)]">
            {model.kind === "metric" ? "mét thật" : "tương đối"} ·{" "}
            {model.inputSize}px · {model.dtype}
          </span>
        </div>

        {/* Cảnh báo TRƯỚC khi tải, không phải sau. 190 MB trên 4G là vài phút. */}
        {model.sizeMB > 100 && (
          <Notice tone="warn">
            Model này {model.sizeMB} MB. Lần đầu sẽ tải lâu, và máy yếu có thể
            không đủ bộ nhớ.
          </Notice>
        )}

        {params.progress && (
          <Progress
            label={
              {
                downloading: "Đang tải model",
                loading: "Đang khởi tạo",
                running: "Đang phân tích",
                building: "Đang dựng point cloud",
              }[params.progress.phase]
            }
            ratio={params.progress.ratio}
          />
        )}

        {params.error && <Notice tone="error">{params.error}</Notice>}
      </Section>

      <Section title="View">
        <Segmented
          value={params.viewMode}
          options={VIEW_OPTIONS}
          onChange={(value) => setParam("viewMode", value)}
        />

        {params.viewMode === "depth" ? (
          <>
            <Select
              label="Colormap"
              value={params.colormap}
              options={COLORMAP_OPTIONS}
              onChange={(value) => setParam("colormap", value)}
            />
            <Slider
              label="So sánh"
              value={params.splitPosition}
              min={0}
              max={1}
              onChange={(value) => setParam("splitPosition", value)}
              format={(value) => `${Math.round(value * 100)}%`}
            />
          </>
        ) : (
          <Slider
            label="Cỡ hạt"
            value={params.pointSize}
            min={PARTICLE.pointSizeMin}
            max={PARTICLE.pointSizeMax}
            step={0.1}
            onChange={(value) => setParam("pointSize", value)}
            format={(value) => value.toFixed(1)}
          />
        )}

        {params.viewMode === "particles" && params.pointSize > 8 && (
          <p className="m-0 text-2xs text-[color:var(--muted-foreground)]">
            Hạt to làm hạt chồng nhau thành mảng màu, nhưng chi phí là fill rate
            — đo thực tế với cỡ 11: lưới 256² đạt 100 fps, 384² còn 54, 512² còn
            32. Giảm lưới nếu thấy giật.
          </p>
        )}
      </Section>

      {params.viewMode === "particles" && (
        <Section title="Motion">
          <Slider
            label="fBM — biên độ"
            value={params.fbmAmp}
            min={FBM.amplitudeMin}
            max={FBM.amplitudeMax}
            onChange={(value) => setParam("fbmAmp", value)}
          />
          <Slider
            label="fBM — tần số"
            value={params.fbmFreq}
            min={FBM.frequencyMin}
            max={FBM.frequencyMax}
            onChange={(value) => setParam("fbmFreq", value)}
          />
          <Slider
            label="fBM — tốc độ"
            value={params.fbmSpeed}
            min={FBM.speedMin}
            max={FBM.speedMax}
            onChange={(value) => setParam("fbmSpeed", value)}
          />
          <Slider
            label="Curl — độ xoáy"
            value={params.curlStrength}
            min={CURL.strengthMin}
            max={CURL.strengthMax}
            step={0.005}
            onChange={(value) => setParam("curlStrength", value)}
            format={(value) => value.toFixed(3)}
          />
          <Slider
            label="Thở — biên độ"
            value={params.breathAmp}
            min={BREATHING.amplitudeMin}
            max={BREATHING.amplitudeMax}
            step={0.005}
            onChange={(value) => setParam("breathAmp", value)}
            format={(value) => value.toFixed(3)}
          />
          <Slider
            label="Thở — tốc độ"
            value={params.breathSpeed}
            min={BREATHING.speedMin}
            max={BREATHING.speedMax}
            onChange={(value) => setParam("breathSpeed", value)}
          />
        </Section>
      )}

      <Section title="Geometry">
        <Slider
          label="Độ dày"
          value={params.depthScale}
          min={DEPTH.scaleMin}
          max={DEPTH.scaleMax}
          onChange={(value) => setParam("depthScale", value)}
        />

        <Select
          label="Lưới"
          value={String(params.gridSize)}
          options={GRID_OPTIONS}
          onChange={(value) => setParam("gridSize", Number(value))}
        />

        <Segmented
          label="Phép chiếu"
          value={params.projection}
          options={projectionOptions}
          onChange={(value) => setParam("projection", value)}
        />

        {model.kind !== "metric" && (
          <p className="m-0 text-2xs text-[color:var(--muted-foreground)]">
            Perspective cần model metric (có focal length). Model relative chỉ
            dựng được relief.
          </p>
        )}
      </Section>

      <Section title="Export">
        <Segmented
          label="Nén"
          value={params.gzip ? "gzip" : "plain"}
          options={[
            { value: "gzip", label: "gzip" },
            { value: "plain", label: "JSON thường" },
          ]}
          onChange={(value) => setParam("gzip", value === "gzip")}
        />

        {exporting ? (
          <Progress label="Đang dựng point cloud" ratio={exportProgress} />
        ) : (
          <Button
            variant="primary"
            onClick={onExport}
            disabled={!params.depth}
          >
            Export JSON
          </Button>
        )}

        <p className="m-0 text-2xs text-[color:var(--muted-foreground)]">
          Xuất trạng thái gốc (chưa cộng noise). Lưới {params.gridSize}² cho
          khoảng {Math.round((params.gridSize * params.gridSize) / 1000)}k hạt
          trước khi lọc biên.
        </p>
      </Section>
    </Panel>
  );
}
