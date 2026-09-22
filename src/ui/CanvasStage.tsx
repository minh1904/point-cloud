/**
 * Khung canvas có pan/zoom, thay cho canvas của Toolcraft.
 *
 * Nó không vẽ gì — nó cấp một `<canvas>` đã khớp devicePixelRatio và một
 * transform (pan/zoom) cho pass vẽ ở trên. Tách như vậy để pass 2D (depth
 * preview) và pass 3D (particles) dùng chung đúng một context, không phải hai
 * canvas.
 *
 * Quy ước tương tác lấy theo công cụ thiết kế, vì người dùng đã có sẵn phản xạ:
 * - lăn chuột / trackpad pinch → zoom quanh con trỏ
 * - kéo chuột hoặc Space+kéo    → pan
 * - nháy đúp                    → fit lại
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type Viewport = {
  /** Hệ số zoom. 1 = vừa khít khung. */
  readonly scale: number;
  /** Dịch chuyển tính theo pixel CSS. */
  readonly x: number;
  readonly y: number;
};

export type StageFrame = {
  /** Kích thước backing thật (đã nhân devicePixelRatio). */
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly viewport: Viewport;
};

const IDENTITY: Viewport = { scale: 1, x: 0, y: 0 };
const MIN_SCALE = 0.1;
const MAX_SCALE = 20;

type Props = {
  /** Gọi mỗi khi cần vẽ lại. Trả về hàm dọn nếu pass cần giải phóng tài nguyên. */
  onFrame: (canvas: HTMLCanvasElement, frame: StageFrame) => void;
  /** Hiện khi chưa có nội dung. Giữ trung tính — không CTA, không artwork giả. */
  empty?: boolean;
  emptyHint?: string;
};

export function CanvasStage({ onFrame, empty, emptyHint }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewport, setViewport] = useState<Viewport>(IDENTITY);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const dragging = useRef<{ x: number; y: number } | null>(null);

  // Theo dõi kích thước khung bằng ResizeObserver chứ không phải window resize:
  // panel có thể đổi rộng mà window thì không.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentRect;
      setSize({ width: box.width, height: box.height });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  // Clamp DPR ở 2. Màn 3x (điện thoại) làm số pixel phải tô tăng 2.25 lần so
  // với 2x mà mắt gần như không thấy khác — với particle system thì fill rate
  // mới là bottleneck, nên đây là tối ưu đáng giá nhất.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0 || size.height === 0) return;

    const width = Math.round(size.width * dpr);
    const height = Math.round(size.height * dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    onFrame(canvas, { width, height, dpr, viewport });
  }, [onFrame, size, dpr, viewport]);

  const onWheel = useCallback((event: React.WheelEvent) => {
    event.preventDefault();
    const host = hostRef.current;
    if (!host) return;

    const box = host.getBoundingClientRect();
    const pointerX = event.clientX - box.left;
    const pointerY = event.clientY - box.top;

    setViewport((current) => {
      // exp() cho cảm giác zoom đều: mỗi notch đổi cùng một TỈ LỆ, không phải
      // cùng một lượng tuyệt đối.
      const factor = Math.exp(-event.deltaY * 0.0015);
      const scale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, current.scale * factor),
      );
      const applied = scale / current.scale;

      // Giữ điểm dưới con trỏ đứng yên khi zoom — nếu không, zoom sâu sẽ đẩy
      // vùng đang xem ra khỏi khung.
      return {
        scale,
        x: pointerX - (pointerX - current.x) * applied,
        y: pointerY - (pointerY - current.y) * applied,
      };
    });
  }, []);

  return (
    <div
      ref={hostRef}
      className="relative flex-1 overflow-hidden"
      onWheel={onWheel}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragging.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerMove={(event) => {
        const from = dragging.current;
        if (!from) return;
        const dx = event.clientX - from.x;
        const dy = event.clientY - from.y;
        dragging.current = { x: event.clientX, y: event.clientY };
        setViewport((current) => ({
          ...current,
          x: current.x + dx,
          y: current.y + dy,
        }));
      }}
      onPointerUp={() => {
        dragging.current = null;
      }}
      onDoubleClick={() => setViewport(IDENTITY)}
      style={{ cursor: dragging.current ? "grabbing" : "grab" }}
    >
      <canvas
        ref={canvasRef}
        className="size-full"
        style={{ width: size.width, height: size.height }}
      />

      {empty && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <p className="text-[13px] text-[color:var(--muted-foreground)]">{emptyHint ?? "Chưa có ảnh"}</p>
        </div>
      )}

      {/* Chỉ số zoom: cần thiết trong công cụ có zoom tự do, nếu không người
          dùng mất phương hướng sau vài lần lăn chuột. */}
      {viewport.scale !== 1 && (
        <button
          type="button"
          onClick={() => setViewport(IDENTITY)}
          className="absolute right-3 bottom-3 rounded-lg border border-[color:var(--border)] bg-[color:color-mix(in_oklab,var(--popover)_85%,transparent)] px-2 py-1 font-mono text-2xs text-[color:var(--muted-foreground)] backdrop-blur transition-colors hover:text-[color:var(--foreground)]"
        >
          {Math.round(viewport.scale * 100)}% · reset
        </button>
      )}
    </div>
  );
}
