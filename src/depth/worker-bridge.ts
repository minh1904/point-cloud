/**
 * Ranh giới duy nhất chạm tới `Worker` trong toàn bộ product code.
 *
 * Vì sao tách khỏi depth-client.ts: gate `dom-capability-erasure` từ chối một
 * file vừa sở hữu quyền điều khiển lib.dom vừa phơi ra API structural giàu ngữ
 * nghĩa — nó gọi đó là "erase interaction authority into a structural boundary".
 * Thông điệp của gate nói thẳng cách sửa: *"Split the file, move logic behind a
 * focused product boundary."*
 *
 * Nên file này chỉ có một việc: bơm byte qua lại. Nó không biết depth là gì,
 * không biết model nào, không giữ logic huỷ run. Toàn bộ ngữ nghĩa nằm ở
 * depth-client.ts, nơi không có một kiểu lib.dom nào.
 */

type ResponseSink = (value: unknown) => void;

let worker: Worker | null = null;
let sink: ResponseSink | null = null;
let onCrash: (() => void) | null = null;

/** Đăng ký nơi nhận message thô. Gọi một lần, trước lần gửi đầu tiên. */
export function setWorkerSinks(
  onResponse: ResponseSink,
  onWorkerCrash: () => void,
): void {
  sink = onResponse;
  onCrash = onWorkerCrash;
}

function ensureWorker(): void {
  if (worker) return;
  worker = new Worker(new URL("./depth-worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (event: MessageEvent) => {
    sink?.(event.data);
  };
  worker.onerror = () => {
    onCrash?.();
  };
}

/** Tạo worker sớm để lần inference đầu không phải chờ khởi tạo. */
export function warmWorker(): void {
  ensureWorker();
}

/**
 * Gửi một message đã dựng sẵn. `message` là `unknown` có chủ ý: file này không
 * cần biết shape, và nhận `unknown` giữ cho nó không thành một structural
 * boundary mang ngữ nghĩa sản phẩm.
 *
 * KHÔNG có transfer list. Khai một tham số `ArrayBuffer[]` để chuyển tiếp vào
 * `postMessage` (nhận `Transferable[]`, một union của lib.dom) chính là kiểu
 * "erase DOM capability vào structural boundary" mà gate từ chối.
 *
 * Nên pixel được **clone** thay vì transfer: khoảng 8 MB cho ảnh 1920×1080, chừng
 * 5-10 ms. Đổi lại caller giữ được mảng pixel của mình — đúng thứ đường export ở
 * P3 cần, nên hoá ra lại tiết kiệm một lần giải mã ảnh.
 */
export function sendToWorker(message: unknown): void {
  ensureWorker();
  if (!worker) return;
  worker.postMessage(message);
}

/** Đóng worker. An toàn khi gọi nhiều lần. */
export function stopWorker(): void {
  if (!worker) return;
  worker.terminate();
  worker = null;
}
