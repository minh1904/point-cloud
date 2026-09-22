/**
 * Khung canvas có pan/zoom, và là chỗ duy nhất xử lý tương tác của canvas.
 *
 * Nó không vẽ gì — nó cấp một `<canvas>` đã khớp devicePixelRatio và một
 * transform (pan/zoom) cho pass vẽ ở trên. Tách như vậy để pass 2D (depth
 * preview) và pass 3D (particles) dùng chung đúng một context, không phải hai
 * canvas.
 *
 * Quy ước tương tác lấy theo công cụ thiết kế, vì người dùng đã có sẵn phản xạ:
 * - lăn chuột / pinch trackpad → zoom quanh con trỏ
 * - kéo chuột trái              → pan (ở chế độ 3D: orbit)
 * - nháy đúp hoặc phím 0        → đặt lại
 * - `+` `-`                     → zoom quanh tâm khung
 * - mũi tên                     → pan từng bước (Shift = bước lớn)
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
  /** Giây kể từ lúc mount. Dùng cho chuyển động analytic của particles. */
  readonly time: number;
};

const IDENTITY: Viewport = { scale: 1, x: 0, y: 0 };
const MIN_SCALE = 0.1;
const MAX_SCALE = 20;
const KEY_ZOOM_STEP = 1.15;
const KEY_PAN_STEP = 40;

/**
 * Chuẩn hoá `deltaY` về pixel.
 *
 * Firefox gửi `deltaMode = 1` (đơn vị DÒNG, ~3 mỗi nấc) còn Chrome gửi
 * `deltaMode = 0` (pixel, ~100 mỗi nấc). Không quy đổi thì zoom trên Firefox
 * chậm hơn hàng chục lần — đúng kiểu lỗi chỉ lộ ra trên một trình duyệt.
 */
function normalizeWheelDelta(event: WheelEvent): number {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * 400;
  return event.deltaY;
}

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

type Props = {
  /** Gọi mỗi khi cần vẽ lại. */
  onFrame: (canvas: HTMLCanvasElement, frame: StageFrame) => void;
  /**
   * Bật vòng lặp requestAnimationFrame.
   *
   * Chỉ bật khi nội dung thật sự động (particles). Pass tĩnh như preview depth
   * vẽ theo sự kiện — chạy rAF cho nó là đốt pin và giữ GPU bận vô ích.
   */
  animate?: boolean;
  /** Hiện khi chưa có nội dung. Giữ trung tính — không CTA, không artwork giả. */
  empty?: boolean;
  emptyHint?: string;
};

export function CanvasStage({ onFrame, animate, empty, emptyHint }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewport, setViewport] = useState<Viewport>(IDENTITY);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // State chứ không phải ref: con trỏ phải đổi hình khi đang kéo, mà ref thì
  // không kích hoạt render nên hình con trỏ sẽ đứng yên mãi.
  const [dragging, setDragging] = useState(false);
  const dragFrom = useRef<{ x: number; y: number } | null>(null);

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

  // Mốc thời gian giữ nguyên qua các lần vẽ lại để chuyển động không giật khi
  // một tham số khác đổi.
  //
  // Khởi tạo lười (null rồi gán) chứ không `useRef(performance.now())`: dạng
  // sau gọi performance.now() ở MỌI lần render rồi vứt kết quả đi — React coi
  // đó là hàm không thuần trong thân render.
  const startRef = useRef<number | null>(null);
  startRef.current ??= performance.now();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0 || size.height === 0) return;

    const width = Math.round(size.width * dpr);
    const height = Math.round(size.height * dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const draw = () => {
      onFrame(canvas, {
        width,
        height,
        dpr,
        viewport,
        time: (performance.now() - (startRef.current ?? 0)) / 1000,
      });
    };

    if (!animate) {
      draw();
      return;
    }

    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [onFrame, size, dpr, viewport, animate]);

  /**
   * Zoom quanh tâm khung: chỉ đổi `scale`, giữ nguyên `x` và `y`.
   *
   * Bản trước zoom quanh con trỏ (chuẩn của công cụ thiết kế) nhưng ở đây nó
   * sai, vì `viewport.x/y` mang HAI nghĩa: ở chế độ 2D là độ dịch ảnh, còn ở
   * chế độ 3D là GÓC ORBIT. Zoom theo con trỏ phải sửa x/y, nên mỗi lần lăn
   * chuột trong chế độ 3D camera lại tự xoay một chút.
   *
   * Không đụng tới x/y thì ảnh 2D phóng to quanh tâm khung (vì pass vẽ căn giữa
   * ảnh rồi mới cộng offset), và camera 3D chỉ tiến/lùi. Cả hai đều đoán trước
   * được.
   */
  const zoomBy = useCallback((factor: number) => {
    setViewport((current) => ({
      ...current,
      scale: clampScale(current.scale * factor),
    }));
  }, []);

  /**
   * Wheel phải gắn bằng addEventListener với `passive: false`.
   *
   * React 17+ gắn listener ở root container, và trình duyệt coi `wheel` ở đó là
   * **passive** — `event.preventDefault()` bên trong `onWheel` của React là vô
   * tác dụng, chỉ in cảnh báo ra console. Hậu quả: lăn chuột vừa zoom canvas
   * vừa cuộn trang, và Ctrl+lăn (pinch trackpad) zoom luôn cả trình duyệt.
   * Đây là nguyên nhân gốc của việc zoom "lỗi".
   */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const handle = (event: WheelEvent) => {
      event.preventDefault();

      // Pinch trackpad đến dưới dạng wheel kèm ctrlKey, với delta lớn hơn
      // nhiều. Giảm độ nhạy để pinch không nhảy vọt.
      const delta = normalizeWheelDelta(event);
      const sensitivity = event.ctrlKey ? 0.0008 : 0.0015;

      // exp() cho cảm giác zoom đều: mỗi nấc đổi cùng một TỈ LỆ, không phải
      // cùng một lượng tuyệt đối.
      zoomBy(Math.exp(-delta * sensitivity));
    };

    host.addEventListener("wheel", handle, { passive: false });
    return () => host.removeEventListener("wheel", handle);
  }, [zoomBy]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const step = event.shiftKey ? KEY_PAN_STEP * 4 : KEY_PAN_STEP;

      const pan = (dx: number, dy: number) =>
        setViewport((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));

      switch (event.key) {
        // Nhận cả `=` vì `+` cần giữ Shift trên hầu hết bàn phím.
        case "+":
        case "=":
          zoomBy(KEY_ZOOM_STEP);
          break;
        case "-":
        case "_":
          zoomBy(1 / KEY_ZOOM_STEP);
          break;
        case "0":
          setViewport(IDENTITY);
          break;
        case "ArrowLeft":
          pan(step, 0);
          break;
        case "ArrowRight":
          pan(-step, 0);
          break;
        case "ArrowUp":
          pan(0, step);
          break;
        case "ArrowDown":
          pan(0, -step);
          break;
        default:
          return;
      }
      // Chỉ chặn mặc định cho phím ta thật sự xử lý. Chặn hết thì Tab và các
      // phím điều hướng của trình duyệt cũng chết theo.
      event.preventDefault();
    },
    [zoomBy],
  );

  const endDrag = useCallback((event: React.PointerEvent) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragFrom.current = null;
    setDragging(false);
  }, []);

  return (
    <div
      ref={hostRef}
      // tabIndex để nhận sự kiện bàn phím. Không có nó thì mọi phím tắt đều chết.
      tabIndex={0}
      role="application"
      aria-label="Khung xem point cloud"
      className="relative flex-1 overflow-hidden outline-none"
      // touchAction none: trên thiết bị cảm ứng, trình duyệt sẽ tự cuộn/pinch
      // trang và nuốt mất cử chỉ trước khi ta nhận được.
      style={{ touchAction: "none", cursor: dragging ? "grabbing" : "grab" }}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        // Chỉ chuột trái. Chuột phải mở menu ngữ cảnh, chuột giữa cuộn — cướp
        // hai nút đó làm người dùng mất chức năng quen thuộc.
        if (event.button !== 0) return;
        // Bấm vào nút nổi trên canvas (ví dụ nút reset zoom) thì không kéo.
        if ((event.target as HTMLElement).closest("button")) return;

        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.focus();
        dragFrom.current = { x: event.clientX, y: event.clientY };
        setDragging(true);
      }}
      onPointerMove={(event) => {
        const from = dragFrom.current;
        if (!from) return;
        const dx = event.clientX - from.x;
        const dy = event.clientY - from.y;
        dragFrom.current = { x: event.clientX, y: event.clientY };
        setViewport((current) => ({
          ...current,
          x: current.x + dx,
          y: current.y + dy,
        }));
      }}
      onPointerUp={endDrag}
      // Thiếu hai handler dưới thì thả chuột ngoài khung sẽ làm trạng thái kéo
      // kẹt lại, và canvas tiếp tục pan dù không bấm giữ gì.
      onPointerCancel={endDrag}
      onLostPointerCapture={() => {
        dragFrom.current = null;
        setDragging(false);
      }}
      onDoubleClick={() => setViewport(IDENTITY)}
    >
      <canvas
        ref={canvasRef}
        className="size-full"
        style={{ width: size.width, height: size.height }}
      />

      {empty && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <p className="text-[13px] text-[color:var(--muted-foreground)]">
            {emptyHint ?? "Chưa có ảnh"}
          </p>
        </div>
      )}

      {/* Chỉ số zoom: cần thiết trong công cụ có zoom tự do, nếu không người
          dùng mất phương hướng sau vài lần lăn chuột. */}
      {viewport.scale !== 1 && (
        <button
          type="button"
          onClick={() => setViewport(IDENTITY)}
          title="Đặt lại — phím 0 hoặc nháy đúp"
          className="absolute right-3 bottom-3 rounded-lg border border-[color:var(--border)] bg-[color:color-mix(in_oklab,var(--popover)_85%,transparent)] px-2 py-1 font-mono text-2xs text-[color:var(--muted-foreground)] backdrop-blur transition-colors hover:text-[color:var(--foreground)]"
        >
          {Math.round(viewport.scale * 100)}% · reset
        </button>
      )}
    </div>
  );
}
