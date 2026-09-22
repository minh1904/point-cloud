/**
 * State của studio.
 *
 * Thay cho runtime schema state của Toolcraft. Dùng zustand vì state này phải
 * đọc được từ cả cây React (panel) và code không-React (render loop Three.js) —
 * `useSyncExternalStore` bên dưới zustand cho phép cả hai mà không cần context.
 *
 * Phân tách có chủ đích: **tham số** (user điều chỉnh, sẽ persist) tách khỏi
 * **dữ liệu dẫn xuất** (ảnh, depth map, tiến trình — không persist, tính lại
 * được). Gộp chung là cách nhanh nhất để lỡ ghi 8 MB pixel vào localStorage.
 */

import { create } from "zustand";

import { DEFAULT_DEPTH_MODEL_ID, resolveDepthModel } from "@/depth/registry";
import type { RawPixels } from "@/depth/protocol";
import { BREATHING, CURL, DEPTH, FBM, PARTICLE } from "@/shared/config";
import type {
  Colormap,
  DepthMap,
  Projection,
  ProgressReport,
} from "@/shared/types";

export type ViewMode = "depth" | "particles";

/** Tham số do user điều chỉnh. Chỉ phần này nên được persist. */
export type Params = {
  modelId: string;
  viewMode: ViewMode;
  colormap: Colormap;
  splitPosition: number;
  depthScale: number;
  gridSize: number;
  projection: Projection;
  pointSize: number;
  fbmAmp: number;
  fbmFreq: number;
  fbmSpeed: number;
  curlStrength: number;
  breathAmp: number;
  breathSpeed: number;
  gzip: boolean;
};

/** Dữ liệu dẫn xuất. Không persist — tính lại được từ ảnh. */
type Derived = {
  fileName: string | null;
  /** Pixel ảnh gốc. Giữ lại để đường export ở P3 không phải giải mã lần nữa. */
  pixels: RawPixels | null;
  depth: DepthMap | null;
  progress: ProgressReport | null;
  error: string | null;
};

type Actions = {
  setParam: <K extends keyof Params>(key: K, value: Params[K]) => void;
  setSource: (fileName: string, pixels: RawPixels) => void;
  clearSource: () => void;
  setDepth: (depth: DepthMap) => void;
  setProgress: (progress: ProgressReport | null) => void;
  setError: (error: string | null) => void;
  reset: () => void;
};

const INITIAL_PARAMS: Params = {
  modelId: DEFAULT_DEPTH_MODEL_ID,
  viewMode: "depth",
  colormap: "turbo",
  splitPosition: 0.5,
  depthScale: DEPTH.scaleDefault,
  gridSize: PARTICLE.defaultGrid,
  projection: "relief",
  pointSize: PARTICLE.pointSizeDefault,
  fbmAmp: FBM.amplitudeDefault,
  fbmFreq: FBM.frequencyDefault,
  fbmSpeed: FBM.speedDefault,
  curlStrength: CURL.strengthDefault,
  breathAmp: BREATHING.amplitudeDefault,
  breathSpeed: BREATHING.speedDefault,
  gzip: true,
};

const INITIAL_DERIVED: Derived = {
  fileName: null,
  pixels: null,
  depth: null,
  progress: null,
  error: null,
};

export const useStudio = create<Params & Derived & Actions>((set) => ({
  ...INITIAL_PARAMS,
  ...INITIAL_DERIVED,

  setParam: (key, value) =>
    set((state) => {
      const next: Partial<Params> = { [key]: value };

      // Đổi model có thể làm `projection` hiện tại thành vô nghĩa: model
      // relative không có focal length nên không unproject được. Tự đưa về
      // relief thay vì để state sai tồn tại.
      if (key === "modelId") {
        const model = resolveDepthModel(value as string);
        if (model.kind !== "metric" && state.projection === "perspective") {
          next.projection = "relief";
        }
      }
      return next;
    }),

  setSource: (fileName, pixels) =>
    // Ảnh mới thì depth cũ vô giá trị — xoá ngay để canvas không hiện depth của
    // ảnh trước trong lúc chờ inference.
    set({ fileName, pixels, depth: null, error: null, progress: null }),

  clearSource: () => set({ ...INITIAL_DERIVED }),

  setDepth: (depth) => set({ depth, progress: null, error: null }),
  setProgress: (progress) => set({ progress }),
  setError: (error) => set({ error, progress: null }),

  reset: () => set({ ...INITIAL_PARAMS }),
}));

/** Model đang chọn, đã giải quyết id lạ về default. */
export function useActiveModel() {
  return resolveDepthModel(useStudio((state) => state.modelId));
}
