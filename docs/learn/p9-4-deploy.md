# P9.4 · Đưa lên mạng: ba thứ chỉ vỡ khi rời máy mình

## Mục tiêu

Chuẩn bị deploy lên Vercel. Xong khi có [`docs/deploy.md`](../deploy.md) và mọi thứ trong đó đã được kiểm.

**Lệnh deploy thì không nằm trong bài này** — nó cần tài khoản của chủ dự án, và đẩy một thứ ra công khai là quyết định của người sở hữu, không phải của công cụ.

## Khái niệm

### 1. Monorepo Bun là thứ Vercel không tự đoán đúng

| Thiết lập | Giá trị |
|---|---|
| Root directory | `apps/point-cloud` |
| Install command | `bun install` (chạy từ gốc repo) |
| Build command | `bun run build` |

Đặt root là gốc repo → không tìm thấy Next. Đặt là thư mục app mà cài không theo workspace → `@atelier/ui`, `@atelier/particle-image`, `@atelier/tokens` đều thiếu.

Đây là loại thông tin mà sáu tháng sau không ai nhớ nổi, nên nó thuộc về tài liệu chứ không thuộc về trí nhớ.

### 2. Trang này tải đồ từ hai origin khác

Phần bất thường nhất khi deploy dự án này:

| Cái gì | Từ đâu | Khi nào |
|---|---|---|
| Trọng số model, ~28–50 MB | `huggingface.co` | lần đầu thả ảnh |
| wasm của onnxruntime | `cdn.jsdelivr.net` | cùng lúc |
| Mọi thứ còn lại | origin của mình | luôn luôn |

Hai hệ quả:

- **Khách không thả ảnh thì không tải gì cả.** Thư viện được import động bên trong worker và trọng số chỉ tải khi cần, nên lần vào đầu tiên chỉ là đám mây mẫu và vài trăm KB. Đó là quyết định từ [P6.2](p6-2-chon-model-depth.md), và chính nó khiến một bản demo công khai trở nên hợp lý.
- **Nếu sau này thêm CSP thì phải cho phép cả hai host.** Hiện chưa có CSP nào, nên nó chạy mà không cần đụng tới. Một `connect-src` quên `huggingface.co` sẽ hỏng ở **đúng một chỗ** — ước lượng độ sâu — rồi âm thầm lùi về painter's cues, nhìn y như một lỗi của model.

### 3. COOP/COEP: cặp header hấp dẫn mà không nên bật

`onnxruntime-web` chạy WASM đa luồng khi có `SharedArrayBuffer`, và `SharedArrayBuffer` đòi:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Nó sẽ làm đường WASM nhanh lên vài lần. Và nó **không được bật**, vì lý do đáng nhớ:

> `require-corp` từ chối **mọi tài nguyên cross-origin** không gửi kèm `Cross-Origin-Resource-Policy` — mà hai origin ở mục trên chính là như vậy.

Tức là bật nó lên để tăng tốc **đường dự phòng** sẽ làm hỏng **đường chính**. WebGPU thì không bị ảnh hưởng theo cách nào cả.

Đây là một ví dụ sạch về việc tối ưu hoá không đọc được nếu chỉ nhìn một nửa hệ thống.

### 4. `immutable` an toàn vì **tên file là phiên bản**

```ts
async headers() {
  return [{
    source: "/:path(particles|luts)/:file*",
    headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
  }];
}
```

`immutable` nói với trình duyệt rằng nó **không cần cả gửi request kiểm tra**. Đó là khác biệt giữa một lần reload ấm tốn 0 và tốn bốn vòng round-trip.

Một năm là mức tối đa theo thông lệ, và nó an toàn ở đây **chính xác vì** một đám mây khác nằm ở một thư mục khác. Thay file tại chỗ mới là sai lầm, không phải việc cache.

Đã kiểm bằng `fetch` thật:

```
/particles/sample/color.png → public, max-age=31536000, immutable
/                           → no-cache, must-revalidate
```

### 5. Danh sách kiểm trước khi bấm nút

Cái đáng nói nhất trong [`docs/deploy.md`](../deploy.md) là mục cuối:

> 5. Mở trên điện thoại: inspector phải là sheet ở đáy, và status bar phải báo `auto: low` hoặc `auto: medium`.
>
> Điểm 5 là điểm không kiểm được từ một cửa sổ trình duyệt trên máy bàn, và là điểm dễ sai nhất.

Một danh sách kiểm mà mọi mục đều kiểm được từ chỗ đang ngồi thì không phải danh sách kiểm, đó là một lời trấn an.

## Đi qua code

### `apps/point-cloud/next.config.ts`

Thêm `headers()` và thêm `@atelier/particle-image` vào `transpilePackages` — package ship TypeScript nguồn, nên Next phải biên dịch nó, y như `@atelier/ui` từ P0.

### `docs/deploy.md` (mới)

## Lỗi đã gặp

1. **Quên `transpilePackages` cho package mới.** Lộ ra ở P8.6 khi route `/embed` build — nếu không thêm, Next coi nó là JS đã build sẵn và nghẹn ở cú pháp TypeScript.
2. **Suýt bật COOP/COEP** vì "WASM đa luồng nghe nhanh hơn". Phải lần theo `require-corp` tới tận hai origin ngoài mới thấy nó phá đúng thứ nó định giúp.

## Tự thử

1. **Kiểm header.** Trong console: `(await fetch('/particles/sample/color.png')).headers.get('cache-control')`.
2. **Xem cache hoạt động.** Mở DevTools → Network, reload hai lần, so cột Size của `color.png`.
3. **Thử chặn model.** DevTools → Network → chặn `huggingface.co`, rồi thả một ảnh. Panel Depth nói gì, và đám mây vẫn dựng được chứ?
4. **Thêm một CSP cố tình thiếu.** Đặt `connect-src 'self'` trong `headers()` và thả ảnh. Lỗi hiện ở đâu, và nó có dễ chẩn đoán không?
5. **Đo lần vào đầu tiên.** DevTools → Network → Disable cache → reload trang chủ. Tổng bao nhiêu KB trước khi thả ảnh?

## Đọc thêm

- [Tài liệu deploy của dự án](../deploy.md)
- [MDN — `Cache-Control`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control)
- [MDN — `Cross-Origin-Embedder-Policy`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Embedder-Policy)
- [Next.js — `headers`](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers)
