# P5.6 · Ống tele 16°

## Mục tiêu

Đổi đúng một con số — `fov: 45` thành `16` — và bức ảnh trở nên đáng tin hẳn.

Research note gọi đây là **bí quyết chính** của bản gốc (§2.2, §5). Đây cũng là bước rẻ nhất trong cả dự án, nên làm đầu tiên của P5: mọi bước sau đều phải chỉnh dưới khung hình này.

## Khái niệm

### 1. FOV không phải là zoom

Nhầm lẫn phổ biến nhất về ống kính. Thu hẹp FOV *trông giống* zoom, nhưng nếu chỉ đổi FOV thì đúng là zoom thật. Điều thú vị chỉ xuất hiện khi **đổi FOV và dời camera cùng lúc** để chủ thể giữ nguyên kích thước.

Lúc đó kích thước chủ thể không đổi, nhưng **quan hệ giữa gần và xa thì đổi**:

```
FOV rộng, camera gần            FOV hẹp, camera xa
  ╲       ╱                      ╲         ╱
   ╲ ┌─┐ ╱    hậu cảnh nhỏ        ╲ ┌─┐  ╱     hậu cảnh to,
    ╲│ │╱     → chiều sâu          ╲│ │ ╱      gần như cùng cỡ
     └─┘      bị phóng đại          └─┘        → cảnh phẳng lại
```

Ống góc rộng **phóng đại chiều sâu**; ống tele **nén chiều sâu**.

### 2. Vì sao nén chiều sâu lại cứu được relief nông

Đám mây điểm của ta dày 0.081 đơn vị trên bề ngang 3.0 — **2.7%**. Bản gốc còn nông hơn: 0.6%.

Với ống góc rộng, phối cảnh làm nổi bật chính xác cái ta không có. Mắt so sánh chỗ gần và chỗ xa, thấy chúng gần như y hệt, và kết luận: *đây là một tấm phẳng*.

Với ống tele, ngay cả cảnh thật cũng bị nén. Mắt không còn tín hiệu phối cảnh mạnh để đối chiếu, nên 2.7% chiều sâu ấy là đủ. Nó không còn trông "phẳng", nó trông **bị nén** — mà nén thì đúng là thứ ống tele làm.

Đây là điều làm cho cả P6 khả thi: độ sâu đơn ảnh luôn sai về tỉ lệ tuyệt đối, nhưng với relief nông cộng ống tele thì sai số ấy không có chỗ để lộ ra.

### 3. Dolly zoom, đúng nghĩa

Để giữ chủ thể cùng kích thước khi đổi FOV, khoảng cách phải tỉ lệ nghịch với `tan(fov/2)`:

```tsx
const ratio = Math.tan(applied.current * DEGREES * 0.5) / Math.tan(fov * DEGREES * 0.5);
lens.position.sub(target).multiplyScalar(ratio).add(target);
```

Đây chính là **dolly zoom** — cú máy của Hitchcock trong *Vertigo*. Trong phim nó dùng để gây chóng mặt; ở đây nó là cách duy nhất để thấy FOV thật sự làm gì, thay vì chỉ thấy ảnh to nhỏ.

### 4. Kích thước hạt cũng phải theo ống kính

Đây là lỗi mà bước này bới ra. Công thức kích thước hạt từ P1.4:

```glsl
float pixels = uSize * scale * (uScale / -mvPosition.z);
```

`uScale = height * dpr * 0.5` — **không có FOV trong đó**. Suốt P1 đến P4 điều này vô hại vì FOV cố định 45°. Nhưng nó ngầm giả định rằng phép chiếu có một độ phóng đại nhất định.

Độ phóng đại đúng là `1/tan(fov/2)`:

| FOV | `1/tan(fov/2)` |
|---|---|
| 45° | 2.41 |
| 16° | 7.12 |

Thiếu nó thì khi kéo slider FOV, cảnh phóng to gấp ba mà hạt giữ nguyên số pixel — bề mặt rã ra thành đốm. Sửa ở phía TypeScript:

```tsx
const lensScale = 1 / Math.tan((lens.fov * Math.PI) / 360);
uniforms.uScale!.value = height * dpr * renderScale * 0.5 * lensScale;
```

Giá trị mặc định của `size` đổi từ 0.045 xuống 0.019 — không phải vì hình ảnh đổi, mà vì **đơn vị của nó cuối cùng đã đúng**.

## Đi qua code

### `apps/point-cloud/src/scene/stage.tsx`

Component `Lens` làm việc trong vòng lặp frame, không phải trong effect:

```tsx
useFrame(({ camera, controls }) => {
  if (applied.current === fov) return;
  // …dolly rồi đặt fov…
});
```

Lý do rất thực tế: camera thuộc về R3F, và sửa thứ một hook trả về vừa là lỗi lint (`react-hooks/immutability`) vừa là cách tốt để đánh nhau với renderer. Trong `useFrame`, `camera` là tham số của callback chứ không phải giá trị hook trả về.

Khoảng cách camera mặc định là **8.0**, không phải con số vừa khít khung:

```tsx
camera={{ position: [0, 0, 8], fov: defaultLensParams.fov }}
```

Vì bokeh mép của [P5.4](p5-4-edge-bokeh.md) đẩy hai cạnh ra thêm 13%. Khít bounds thì phần mép mềm rơi khỏi màn hình.

## Lỗi đã gặp

1. **Quên FOV trong công thức kích thước hạt.** Đổi sang 16° xong, cảnh phóng to gấp ba còn hạt giữ nguyên — bề mặt thành một màn đốm thưa. Mất một lúc mới nhận ra lỗi không nằm ở FOV mà ở một giả định ngầm đã nằm trong code từ P1.4. Loại lỗi này chỉ lộ ra khi một hằng số biến thành biến.
2. **Đoán khung hình bằng mắt trên ảnh chụp màn hình — sai.** Tôi tính khoảng cách camera từ kích thước ảnh chụp, và ra kết luận sai vì ảnh chụp bị co tỉ lệ không cố định. Chỉ khi chạy `({inner: [innerWidth, innerHeight], dpr: devicePixelRatio})` trong console mới có số thật (1244×766, dpr 1) và phép tính mới khớp. **Đo, đừng nhìn.**
3. **Trang không reload thật.** Vài vòng đầu tôi tưởng camera sai vì điều hướng tới cùng một URL không tạo reload cứng — React giữ nguyên camera cũ. `location.reload()` mới dứt điểm. Đáng nhớ khi debug bất cứ thứ gì chỉ chạy một lần lúc khởi tạo.

## Tự thử

1. **Kéo FOV từ 8 lên 60** và nhìn kỹ quan hệ giữa người và dãy núi. Chủ thể giữ nguyên cỡ — cái gì đổi?
2. **Tắt phần dolly.** Xoá đoạn `lens.position.sub(target)…` trong `Lens`. Giờ slider FOV chỉ còn là zoom. So sánh: cái nào nói cho bạn biết nhiều hơn về ống kính?
3. **Bỏ `lensScale`** khỏi `uScale`, rồi kéo FOV xuống 8. Bề mặt rã ra ở mức nào?
4. **Tìm FOV của mắt người.** Tra xem thị giác trung tâm của người khoảng bao nhiêu độ, rồi đặt slider vào đó. Ảnh trông tự nhiên hơn hay nhạt hơn?
5. **Đọc lại research note §2.2.** Bản gốc có relief 0.6% và FOV 16°. Của ta 2.7% và 16°. Ta có thể đẩy relief lên bao nhiêu trước khi ống tele hết che được?

## Đọc thêm

- [three.js — `PerspectiveCamera`](https://threejs.org/docs/#api/en/cameras/PerspectiveCamera)
- [Wikipedia — Dolly zoom](https://en.wikipedia.org/wiki/Dolly_zoom)
- [research/01-untillabs-method.md §5](../research/01-untillabs-method.md) — camera FOV 16° của bản gốc
