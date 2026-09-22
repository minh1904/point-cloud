/**
 * Phía main thread của depth inference: vòng đời worker và huỷ run lỗi thời.
 *
 * Vấn đề chính file này giải: user đổi model hoặc đổi ảnh giữa lúc đang
 * inference là chuyện thường. Không có cơ chế huỷ thì kết quả cũ (về sau) ghi đè
 * kết quả mới (về trước), và depth map hiện ra không khớp model đang chọn.
 *
 * Cách làm: đánh số mỗi run. Response mang runId; runId không khớp thì bỏ. Không
 * thật sự abort được inference — ONNX không cho — nhưng kết quả lỗi thời thì vô
 * hại.
 *
 * API là callback, không phải Promise. Hai lý do:
 *
 * 1. Gate `dom-capability-erasure` từ chối `new Promise` trong hàm cùng file với
 *    quyền điều khiển Worker — nó coi đó là việc đưa interaction authority của
 *    lib.dom vào một structural boundary của product.
 * 2. Callback vốn khớp hơn với chỗ dùng: một effect trong React cần huỷ khi
 *    dependency đổi, và `onProgress` phải gọi nhiều lần trong một run — thứ mà
 *    Promise không diễn tả được.
 *
 * Lưu ý kiểu: `Worker` nằm trong biến module-scope, không đi qua boundary hàm
 * nào (không làm tham số, không làm giá trị trả về, không bị closure bắt).
 */

import type { DepthMap, DepthModel, ProgressReport } from "@/shared/types";

import { parseDepthResponseMessage } from "./protocol";
import type { RawPixels, DepthRequestMessage } from "./protocol";
import {
  sendToWorker,
  setWorkerSinks,
  stopWorker,
  warmWorker,
} from "./worker-bridge";

/** Nơi nhận kết quả của một run. Không có kiểu lib.dom nào ở đây. */
export type DepthHandlers = {
  readonly onProgress: (report: ProgressReport) => void;
  readonly onResult: (map: DepthMap) => void;
  readonly onError: (error: Error) => void;
};

type Pending = DepthHandlers & { readonly runId: number };

let currentRun = 0;
let pending: Pending | null = null;

function handleResponse(value: unknown): void {
  const response = parseDepthResponseMessage(value);
  if (!response || response.kind === "released") return;

  const active = pending;
  // Bỏ mọi thứ thuộc run lỗi thời, kể cả progress — nếu không thanh tiến trình
  // sẽ nhảy ngược khi hai run chồng nhau.
  if (!active || response.runId !== active.runId) return;

  if (response.kind === "progress") {
    active.onProgress(response.report);
    return;
  }

  pending = null;
  if (response.kind === "error") {
    active.onError(new Error(response.message));
    return;
  }
  active.onResult({ ...response.result });
}

function failPending(message: string): void {
  const active = pending;
  pending = null;
  active?.onError(new Error(message));
}

let sinksReady = false;

/** Nối bridge một lần. Bridge không biết ngữ nghĩa, ta cấp cho nó hai callback. */
function ensureSinks(): void {
  if (sinksReady) return;
  setWorkerSinks(handleResponse, () => {
    failPending("Depth worker crashed.");
  });
  sinksReady = true;
}

/** Nạp sẵn worker trước khi có ảnh, để lần inference đầu không phải chờ khởi tạo. */
export function initDepthWorker(): void {
  ensureSinks();
  warmWorker();
}

/**
 * Chạy inference trên pixel thô.
 *
 * `pixels` được clone khi gửi (xem worker-bridge.ts), nên caller vẫn dùng lại
 * được mảng của mình sau khi gọi — đường export ở P3 cần đúng điều đó.
 *
 * Run trước đó nếu còn treo sẽ bị bỏ im lặng — bị thay thế không phải là lỗi,
 * nên không gọi `onError` của nó.
 */
export function estimateDepth(
  pixels: RawPixels,
  model: DepthModel,
  handlers: DepthHandlers,
): void {
  ensureSinks();
  const runId = ++currentRun;
  pending = { runId, ...handlers };

  const request: DepthRequestMessage = { kind: "estimate", runId, pixels, model };
  sendToWorker(request);
}

/**
 * Đóng worker và giải phóng session ONNX. Gọi khi scene unmount.
 *
 * Tăng currentRun để mọi run đang bay đều thành lỗi thời trước khi terminate.
 */
export function releaseDepthWorker(): void {
  currentRun++;
  pending = null;

  const release: DepthRequestMessage = { kind: "release" };
  sendToWorker(release);
  // Không chờ "released": terminate huỷ mọi thứ đang chạy, và giữ worker sống
  // để đợi một promise trong lúc unmount là cách dễ nhất để rò rỉ.
  stopWorker();
}
