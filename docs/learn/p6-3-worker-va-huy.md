# P6.3 · Web Worker: chạy model mà không đứng hình, và huỷ cho thật

## Mục tiêu

Chạy model depth mà giữ nguyên 60 fps, có thanh tiến trình, và có nút Cancel **huỷ thật**.

Bước này ít toán, nhiều kiến trúc. Ba thứ đáng học: vì sao một luồng thứ hai là câu trả lời duy nhất, `postMessage` sao chép hay chuyển giao dữ liệu, và vì sao "huỷ" ở đây phải là giết cả worker.

## Khái niệm

### 1. Main thread là một hàng đợi

Trình duyệt chạy JS của trang trên **một** luồng. `requestAnimationFrame`, sự kiện chuột, React render, và mọi vòng lặp `for` của ta đều xếp cùng một hàng.

Suy ra: bất cứ đoạn tính toán nào chạy 500ms thì trong 500ms đó **không có frame nào được vẽ**. Không drift, không orbit, không intro. Canvas đứng hình.

Inference của Depth Anything mất khoảng nửa giây trên GPU tốt và vài giây trên WASM. Không có cách nào "chia nhỏ ra cho đỡ giật" — nó là một lời gọi vào WASM/WebGPU, không nhả lại quyền điều khiển.

**Web Worker** là luồng thứ hai, có event loop riêng, không có DOM. Đúng bằng những gì việc này cần.

```ts
const created = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
```

Dạng `new URL(…, import.meta.url)` là cách **mọi bundler** nhận ra "đây là một entry point của worker". Truyền một chuỗi trần thì lúc chạy nó đi tìm một file chưa bao giờ được sinh ra.

### 2. Worker không thấy gì của bạn cả

Worker không dùng chung bộ nhớ, không có `window`, không có `document`. Nó chỉ nhận **thông điệp**.

Mà thông điệp thì đi qua **structured clone**: trình duyệt sao chép sâu dữ liệu. Sao chép 4 MB pixel mất khoảng một mili-giây — rẻ, nhưng không miễn phí.

Có cách thoát: **transferable**. Kèm `ArrayBuffer` vào danh sách thứ hai của `postMessage` thì buffer được **chuyển giao** — bên gửi mất quyền truy cập (buffer bị "detach", độ dài về 0), bên nhận lấy nguyên bộ nhớ, không sao chép byte nào.

Trong repo này có đúng một quy tắc, và nó đáng ghi nhớ:

```ts
// Gửi đi: KHÔNG chuyển giao. Main thread vẫn phải vẽ preview từ buffer này.
image: { width, height, data: photo.data.buffer }

// Trả về: CÓ chuyển giao. Worker không còn việc gì với nó nữa.
post({ kind: "depth", …, data: buffer }, [buffer]);
```

Chuyển giao nhầm buffer ảnh gốc là một bug rất khó chịu: ảnh vẫn hiện, mọi thứ vẫn chạy, cho tới lần thứ hai ai đó đọc `pixels.data` và thấy một mảng rỗng.

### 3. Tiến trình: hai loại, và loại thứ hai trung thực hơn

`transformers.js` nhận `progress_callback` và báo về từng file đang tải, có `progress` theo phần trăm. Đó là loại **đo được**.

Nhưng "khởi động WebGPU", "làm nóng model", "đang suy luận" thì **không đo được** — chúng xong khi chúng xong. Protocol mã hoá điều đó thẳng vào kiểu dữ liệu:

```ts
/** 0…1, hoặc -1 khi bước này không có độ dài đo được. */
value: number;
```

UI vẽ thanh tiến trình đầy 35% và đứng yên khi gặp `-1`. Thà thế còn hơn bịa ra một con số chạy đều.

### 4. Huỷ: lời nói suông và hành động thật

Không có cách nào ngắt một phiên inference ONNX đang chạy. Cụ thể:

- Gửi `postMessage({kind: "cancel"})` thì **thông điệp nằm trong hàng đợi của worker** cho tới khi model chạy xong — đúng cái quãng chờ ta muốn thoát khỏi.
- `AbortSignal` không có gì để abort, vì không có `fetch` nào đang chờ.
- Một cờ boolean mà worker lịch sự kiểm tra giữa các bước sẽ không huỷ gì cả **trong đúng bước tốn thời gian**.

Nên `cancelJobs()` **giết worker**:

```ts
export function cancelJobs(): void {
  const running = worker;
  worker = null;
  for (const job of pending.values()) job.reject(new Error("cancelled"));
  pending.clear();
  running?.terminate();
}
```

`terminate()` dừng thật, trả CPU lại ngay lập tức. Cái giá là pipeline đã nạp bị mất; lần chạy sau dựng lại từ cache của trình duyệt, mất một hai giây. Đó là một cái giá rõ ràng, đổi lấy một nút Cancel không nói dối.

### 5. Hai lượt depth: đường nhanh rồi đường tốt

Store không chạy model rồi ngồi đợi. Nó chạy **hai lượt**:

```ts
const quick = await runDepth(pixels, "heuristic");   // vài ms
set({ depth: quick });
void measureImportance();
// …rồi mới
const estimated = await runDepth(pixels, depthModel, onProgress);
set({ depth: estimated });
void measureImportance();
```

Nghĩa là: thả ảnh vào → có ngay bản đồ độ sâu thô để preview và để 6.4 làm việc → model về thì thay thế. Nếu model hỏng, bản heuristic vẫn nằm đó, và trạng thái `error` chỉ là một cảnh báo chứ không phải ngõ cụt.

## Đi qua code

### `apps/point-cloud/src/photo/worker-protocol.ts` (mới)

File chỉ có kiểu. Nó tồn tại vì **cả hai bên đều import nó và không bên nào được import bên kia**: worker không được kéo React vào, còn main thread không được kéo 10 MB thư viện inference vào chỉ để biết hình dạng của một thông điệp.

### `apps/point-cloud/src/photo/worker.ts` (mới)

Điểm quan trọng nhất ở đây là một dòng `import` **không** nằm ở đầu file:

```ts
const { modelDepth } = await import("./depth/model-depth");
```

Import động, bên trong nhánh dùng model. Nhờ vậy worker khởi động trong vài mili-giây, và ai không bao giờ chọn model thì không bao giờ tải thư viện.

### `apps/point-cloud/src/photo/worker-client.ts` (mới)

Một `Map<number, Pending>` ghép thông điệp trả về với `Promise` đang chờ, qua `id` tăng dần. Hàm `send()` gói mẫu đó lại một lần cho cả ba loại việc (depth, importance, build).

### `apps/point-cloud/src/app/depth-panel.tsx` (mới)

Panel này tồn tại vì **preview**. Bản đồ độ sâu là một nghìn con số vô hình cho tới khi được vẽ ra, và hai kiểu hỏng đáng sợ nhất đều lộ ngay trên một thumbnail:

- **lộn ngược** — gần phải tối, xa phải sáng;
- **phẳng lì** — chủ thể phải là một hình, không phải một vệt nhoè.

## Lỗi đã gặp

1. **Suýt dùng `photo.data.buffer` trong danh sách transfer.** Đã viết đúng ngay từ đầu nhờ nghĩ trước, nhưng đây là lỗi *sẽ* xảy ra với ai đó: triệu chứng là preview biến mất ở lần thao tác thứ hai, còn thông báo lỗi thì không có.
2. **`ArrayBufferLike` không phải `ArrayBuffer`.** TypeScript 6 phân biệt hai cái, và `Float32Array#buffer` khai kiểu rộng hơn. Phải `as ArrayBuffer` ở biên gửi/nhận. Khó chịu nhưng đúng: một `SharedArrayBuffer` thì không transfer được thật.
3. **Cửa sổ Chrome bị thu nhỏ làm mọi phép đo fps vô nghĩa.** Tab ở trạng thái `hidden` thì `requestAnimationFrame` gần như không chạy, nên "worker có giữ được 60fps không" không kiểm được. Phải đưa cửa sổ ra trước rồi mới đo.

## Tự thử

1. **Chứng minh worker có tác dụng.** Đổi `estimateDepth` trong store để gọi thẳng `modelDepth` trên main thread (import tĩnh). Thả ảnh và nhìn đồng hồ fps ở góc trên bên trái. Sau đó hoàn tác.
2. **Bấm Cancel giữa lúc tải.** Xoá cache trình duyệt, thả ảnh, bấm Cancel khi thanh tiến trình đang chạy. Tab Network dừng lại chứ? Preview còn lại bản heuristic chứ?
3. **Thử huỷ kiểu "lịch sự".** Thay `terminate()` bằng một `postMessage({kind:"cancel"})` mà worker kiểm tra giữa các bước. Bấm Cancel khi model đang suy luận và đo xem bao lâu sau nó mới thật sự dừng.
4. **Đo giá của structured clone.** Trong `worker-client.ts`, bọc `target.postMessage(...)` giữa hai `performance.now()`. Với ảnh 1024² là bao nhiêu? Thử thêm cả trường hợp transfer để so.
5. **Thả hai ảnh thật nhanh.** Bỏ dòng `if (mine !== depthRun) return;` trong store rồi thử lại. Cái gì hiện ra, và vì sao token lại cần thiết?

## Đọc thêm

- [MDN — Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)
- [MDN — Transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)
- [MDN — `Worker.terminate()`](https://developer.mozilla.org/en-US/docs/Web/API/Worker/terminate)
- [MDN — The structured clone algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)
- [Tài liệu transformers.js](https://huggingface.co/docs/transformers.js/index)
