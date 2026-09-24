# P7.7 · Phím tắt, HUD hiệu năng, và bảng liệt kê phím tắt

## Mục tiêu

Ba thứ nhỏ khép lại P7: bàn phím điều khiển được công cụ, những con số luôn đúng có chỗ của riêng chúng, và có cách **tìm ra** các phím tắt.

Xong khi phím tắt được liệt kê trong một bảng trợ giúp.

## Khái niệm

### 1. Một công cụ có phím tắt mà không ai tìm ra được thì chỉ có phím tắt cho người viết nó

Đây là toàn bộ lý do bảng trợ giúp tồn tại. Phím tắt không khám phá được là tính năng dành riêng cho tác giả.

Và nó đặt ra một câu hỏi thiết kế thật: bảng đó nên được **sinh ra từ** handler, hay viết tay?

Dự án này chọn viết tay, và ghi lý do ngay trong file:

> Driving the handler from this table would mean encoding modifiers,
> `preventDefault` and the typing guard as data, and the table would stop being
> readable long before the handler started being shorter.

Đó là một đánh đổi trái với tinh thần [P7.2](p7-2-param-schema.md), nơi schema thắng rõ ràng. Khác biệt: tham số có **bốn** người tiêu thụ, phím tắt có hai. Một nguồn sự thật duy nhất trả giá bằng sự trừu tượng, và giá đó chỉ đáng khi số người tiêu thụ đủ nhiều.

### 2. Listener trên `window`, và hai lớp bảo vệ

```ts
window.addEventListener("keydown", onKeyDown);
```

Không phải `onKeyDown` trên một div bọc ngoài: cái đó chỉ bắn khi có thứ gì bên trong đang focus, mà thứ người xem hay focus nhất là canvas — vốn không focus được.

Hai lớp bảo vệ:

```ts
if (isTyping(event.target)) return;              // đang gõ thì để yên
// …
if (meta || event.altKey) return;                 // phím trần mới tới lượt ta
```

Lớp thứ hai đáng nói. Sau khi xử lý xong Ctrl+Z và Ctrl+Y, mọi thứ còn lại là **phím trần**. Nếu không chặn ở đây thì Ctrl+R (reload) sẽ chạy nhầm vào nhánh `case "r"` và replay intro thay vì tải lại trang — cướp một phím tắt của trình duyệt là hành vi thù địch.

### 3. `<kbd>` là một phần tử thật

```tsx
<kbd className="…">{children}</kbd>
```

`<kbd>` có nghĩa thật trong HTML — "đây là thứ gõ từ bàn phím" — và trình đọc màn hình thông báo đúng như vậy. Một `<span>` được style cho giống phím sẽ trông y hệt và được đọc như văn xuôi bình thường, mà với một danh sách phím thì đó là ấn tượng sai.

Đây là component Atelier thứ ba mà P7 kéo vào (sau `FileDrop` ở P6 và `Slider.onValueCommitted`), và nó theo đúng quy tắc của P-UI: **không có component nào mà không có người dùng**.

### 4. Lớp phủ trợ giúp **không** phải `<dialog>`

```tsx
<div role="presentation" onClick={toggleHelp} className="absolute inset-0 z-20 …">
  <div role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
```

`<dialog showModal()>` bẫy focus, chặn tương tác với phần còn lại của trang, và khiến mọi thứ khác thành `inert`. Với một hộp thoại xác nhận thì đúng. Với một bảng tra cứu ngồi cạnh một canvas đang chạy thì sai.

`onClick` ở lớp ngoài đóng bảng; `stopPropagation` ở lớp trong ngăn việc bấm vào nội dung cũng đóng nó. Đó là mẫu "click outside" viết bằng hai dòng thay vì một listener toàn cục.

### 5. Nơi đặt những con số luôn đúng

fps, draw call và số điểm từng nằm ở góc trên bên trái, đè lên bầu trời trong ảnh. P7.7 đưa chúng xuống một **status bar** — chỗ mà công cụ đặt những con số luôn đúng và không bao giờ khẩn cấp.

> **Cập nhật ở P9:** status bar đã bị gỡ và các con số chuyển vào chính bảng trợ giúp này. Lý do: chúng là **những con số bạn đi tìm**, không phải những con số bạn nhìn cả ngày — và một dải chữ chạy ngang đáy màn hình lấy mất một hàng của thứ mà app thật sự nói về. Lập luận ở mục này vẫn là lập luận đúng cho *nhịp cập nhật*, chỉ là chỗ đặt thì đổi.

Và nó cập nhật hai lần mỗi giây — đó là nhịp `RenderInfo` ghi stats:

```ts
if (elapsed.current < 0.5) return;
```

Hai lần mỗi giây thì việc ghi vào store và render lại một dòng chữ không tốn gì. Một trăm lần mỗi giây sẽ là một cuộc trò chuyện khác hẳn, và là đúng thứ [P7.3](p7-3-store-to-uniform.md) vừa dọn dẹp.

### 6. Đo fps bằng cách đếm frame, không bằng `delta`

```ts
elapsed.current += delta;
frames.current += 1;
if (elapsed.current < 0.5) return;
const fps = Math.round(frames.current / elapsed.current);
```

Lấy `1 / delta` của một frame thì ra một con số nhảy loạn: một frame chậm bất thường (garbage collector, một lần cấp phát texture) làm nó tụt xuống 12 rồi lại lên 60. Đếm frame trong nửa giây là một trung bình — vẫn phản ứng đủ nhanh để thấy vấn đề, mà không nhấp nháy.

## Đi qua code

### `packages/ui/src/kbd.tsx` (mới)

Mười lăm dòng, và test của nó kiểm đúng điều quan trọng:

```ts
it("renders a real kbd element, not a styled span", () => {
  render(<Kbd>Ctrl</Kbd>);
  expect(screen.getByText("Ctrl").tagName).toBe("KBD");
});
```

### `apps/point-cloud/src/app/shell/use-shortcuts.ts` (mới)

Thứ tự trong handler là có chủ ý: tổ hợp có modifier trước, rồi cổng chặn modifier, rồi phím trần. Đọc từ trên xuống là đọc được quy tắc.

### `apps/point-cloud/src/app/shell/status-bar.tsx` (mới ở P7.7, **đã gỡ ở P9**)

Nó ẩn dần theo bề rộng, cùng kiểu với toolbar, để trên điện thoại còn lại fps và số điểm — hai con số trả lời "nó có chạy không" và "nó đang vẽ cái gì".

Ở P9 cả file biến mất và mấy con số đó chuyển xuống cuối `help-overlay.tsx`. Nhịp cập nhật thì không đổi: vẫn là hai lần mỗi giây do `RenderInfo` quyết định.

## Lỗi đã gặp

1. **Suýt quên cổng chặn modifier.** Ctrl+R sẽ replay intro **và** reload trang. Chỉ nhận ra khi viết `case "r"` ngay dưới nhánh Ctrl+Y.
2. **`event.key.toLowerCase()` với Escape** cho `"escape"`, không phải `"Escape"`. Rõ ràng khi đã biết, và là lý do `case` phải viết thường.
3. **Bảng trợ giúp ban đầu định sinh từ handler.** Viết thử được một phần ba thì thấy phải mã hoá cả modifier, `preventDefault` và điều kiện `isTyping` thành dữ liệu — trừu tượng đắt hơn thứ nó thay thế.

## Tự thử

1. **Mở bảng bằng `?`**, đóng bằng `Esc`, rồi bằng cách bấm ra ngoài. Cả ba đường đều hoạt động chứ?
2. **Bấm Ctrl+R.** Trang tải lại chứ? Rồi bỏ dòng `if (meta || event.altKey) return;` và thử lại.
3. **Thêm một phím tắt.** Cho `p` chuyển preset kế tiếp. Nhớ thêm nó vào `SHORTCUTS` — và để ý cảm giác khi phải sửa hai chỗ.
4. **Đo fps bằng một frame.** Đổi `RenderInfo` thành `Math.round(1 / delta)`, mở bảng trợ giúp bằng `?` và nhìn vài giây. Con số nhảy bao nhiêu?
5. **Kiểm `<kbd>`.** Bật trình đọc màn hình (Narrator trên Windows) và nghe bảng trợ giúp. Rồi đổi `<kbd>` thành `<span>` và nghe lại.

## Đọc thêm

- [MDN — `<kbd>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/kbd)
- [MDN — `KeyboardEvent.key` values](https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_key_values)
- [MDN — `<dialog>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog) — thứ file này cố tình không dùng
- [P2.3 · Thứ tự các render pass](p2-3-render-pass-order.md) — vì sao `RenderInfo` chạy ở priority -2
