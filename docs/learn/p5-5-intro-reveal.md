# P5.5 · Intro: hạt hiện dần

## Mục tiêu

Bức ảnh hiện ra từ hư không: từng mảng hạt đáp xuống theo nhịp riêng, một vòng lấy nét nở dần từ tâm, và camera đẩy vào chậm rãi.

Kỹ thuật đằng sau chỉ có một ý: **65.536 timeline riêng biệt, sinh ra từ đúng một con số**.

## Khái niệm

### 1. Một uniform, và mỗi hạt tự đọc lấy phần của mình

Cách làm hiển nhiên là giữ trạng thái cho từng hạt: đã hiện chưa, hiện bao nhiêu. Với 65k hạt, đó là một buffer phải cập nhật mỗi frame trên CPU — thứ P4 vừa mất công tránh.

Cách đúng là đảo ngược câu hỏi. Thay vì hỏi *"hạt nào nên hiện bây giờ?"*, ta cho mỗi hạt tự trả lời *"tôi đã tới lượt chưa?"*:

```glsl
uniform float uProgress;   // 0 → 1, một con số duy nhất
// …
vReveal = smoothstep(delay, delay + 0.34, uProgress);
```

`delay` được tính từ chính hạt đó, tất định, không lưu ở đâu cả. CPU chỉ đẩy một `float` mỗi frame. Số hạt có tăng lên một triệu thì chi phí CPU vẫn y nguyên.

### 2. Hai loại ngẫu nhiên, trộn với nhau

```glsl
float grain = hash32(texel + 41.3).z;
float clump = pcFbm(aParticleUv * 2.0);
float delay = mix(grain, clump, 0.4) * 0.62;
```

Hai thành phần này làm hai việc khác hẳn nhau, và chỉ một mình thì cái nào cũng dở:

| Chỉ dùng | Trông như |
|---|---|
| `grain` (hash mỗi hạt) | một lớp sương mờ dâng lên đều — không có cấu trúc |
| `clump` (fBM) | từng mảng lớn bật lên nguyên khối — quá gọn gàng |

Trộn 60 : 40 cho ra **những mảng hiện dần với mép lởm chởm**. Đây chính là tỉ lệ bản gốc dùng (research note §5: *"trộn từ `random(uv, index)` và `fbm(uv*2)` với tỉ lệ 0.4"*).

Nguyên tắc chung đáng nhớ: **nhiễu cho kết cấu, fBM cho hình dáng.** Hầu hết hiệu ứng "hữu cơ" là một phép trộn giữa hai thứ đó.

### 3. Vòng lấy nét, và vì sao nó phải xấu

```glsl
float ragged = pcFbm(vec2(angle * 1.7, radius * 5.0)) * 0.13 + sin(angle * 6.0) * 0.025;
float ring = smoothstep(radius + ragged - 0.09, radius + ragged + 0.09, uProgress * 0.92);
```

Một vòng tròn nở ra từ tâm sẽ đọc thành **hiệu ứng chuyển cảnh** — thứ ai cũng nhận ra là đồ hoạ. Làm méo mép của nó thì nó đọc thành **ống kính đang dò nét**.

Phép méo có hai tầng: fBM theo góc và bán kính cho biến dạng bất quy tắc, cộng một sóng `sin(angle * 6)` rất nhẹ cho một nhịp mơ hồ. Tầng thứ hai một mình thì lộ; một mình fBM thì hơi lỏng lẻo. Cùng nhau thì không đoán được mà vẫn có nhịp.

Đưa `angle` vào noise có một hệ quả đáng lưu ý: `atan` nhảy từ +π sang −π ở phía sau, nên vòng có một chỗ nối. Ở biên độ này thì không thấy — nhưng đẩy hệ số 0.13 lên cao là nó lộ ra.

### 4. Camera đẩy vào, để hai thứ thành một

```tsx
const eased = 1 - (1 - progress) ** 3;
camera.position.sub(target).setLength(end * (1 + (1 - eased) * 0.5)).add(target);
```

Hạt hiện dần và camera đẩy vào cùng lúc là thứ khiến chúng đọc thành **một sự kiện** chứ không phải hai animation tình cờ trùng nhau.

Ease-out bậc ba: phần lớn quãng đường đi ngay lúc đầu, nên những khoảnh khắc cuối *lắng xuống* thay vì lao tới. Chuyển động cơ học tuyến tính luôn tố cáo bản thân nó.

Điểm đến là **vị trí camera đang đứng lúc intro bắt đầu**, không phải vị trí mặc định. Nên bấm Replay sau khi đã xoay camera sẽ quay về khung hình *của người xem*, chứ không giật về khung gốc.

### 5. Đồng hồ intro sống ở đâu — và vì sao

Tiến trình đổi mỗi frame. Để nó trong React state nghĩa là re-render 60 lần/giây để animate một uniform — đúng cái bẫy mà roadmap 7.3 sinh ra để đóng lại.

Nên nó nằm trong một `useRef`, và React state chỉ giữ **một bộ đếm** `introReplay`. Bấm nút thì tăng bộ đếm; một `useEffect` thấy nó đổi và reset đồng hồ về 0.

Chỗ đặt cái ref lại do ESLint quyết định:

```
Error: This value cannot be modified            react-hooks/immutability
`intro` cannot be modified
```

Bản đầu tôi để `Studio` giữ ref rồi truyền xuống `ParticleField` và `IntroDolly`. Rule chặn: **component sửa một ref phải là component đã tạo ra nó**. Ref truyền qua prop là dữ liệu chỉ đọc, hệt như mọi prop khác.

Nên cấu trúc lại: `ParticleField` sở hữu đồng hồ và đẩy nó tiến lên; `IntroDolly` nhận qua prop và **chỉ đọc**. Đúng một người viết, ai cũng đọc được — và đó là điều lẽ ra nên làm ngay từ đầu, không cần lint nhắc.

## Đi qua code

### `apps/point-cloud/src/shaders/points.vert.glsl`

Kích thước cũng tham gia, không chỉ alpha:

```glsl
pixels *= 0.4 + 0.6 * vReveal;
```

Hạt **lớn dần vào chỗ của nó** thay vì bật lên. Chỉ mờ dần thôi thì trông như chỉnh độ trong suốt; thêm kích thước thì trông như đang đáp xuống.

### `apps/point-cloud/src/scene/particle-field.tsx`

```tsx
const clock = intro.current;
if (clock.value < 1) {
  clock.value = Math.min(1, clock.value + delta / INTRO_SECONDS);
}
material.current.uniforms.uProgress!.value = clock.value;

if (!playing) return;
```

Để ý thứ tự: intro chạy **trước** lệnh `return` của Pause. Đóng băng chuyển động để ngắm kỹ một khung hình thì không nên đồng thời đóng băng đám mây ở trạng thái hiện được một nửa.

### `apps/point-cloud/src/scene/intro-dolly.tsx` (mới)

Chỉ đọc đồng hồ, không bao giờ ghi. Được render *bên trong* `<points>` — `useFrame` chạy bất kể component nằm đâu trong cây, nên đặt nó cạnh thứ sở hữu đồng hồ là hợp lý nhất.

## Lỗi đã gặp

1. **ESLint dạy lại tôi bài về quyền sở hữu.** Truyền một ref xuống rồi sửa nó ở component con là thói quen cũ, và `react-hooks/immutability` chặn đúng. Đây là **lần thứ hai** rule này định hình kiến trúc trong dự án — lần đầu là texture của drei ở [P3.2](p3-2-color-texture.md). Cả hai lần nó đều đúng.
2. **`aIndex` lại bị bỏ qua — lần thứ ba.** Roadmap ghi delay lấy từ `random(uv, index)`, và bản gốc dùng `aIndex` thật. Nhưng bản gốc **xáo trộn thứ tự hạt** trước khi đóng gói (research note §2.2: `corr(index, x) ≈ 0.003`), nên với họ chỉ số là ngẫu nhiên về mặt không gian. Bundle của ta chưa xáo — hạt vẫn theo thứ tự lưới — nên dùng chỉ số sẽ cho một vệt quét theo hàng, không phải ngẫu nhiên. Phải chờ **P6.9** (xáo trộn trước khi đóng gói) thì `aIndex` mới thật sự dùng được. Nó đã nằm trong geometry từ P3.1 mà vẫn chưa được shader đọc tới lần nào.
3. **Bắt được intro giữa chừng là nhờ tab bị throttle.** Tab nền chạy 3 fps, nên intro 2.6 giây kéo dài đủ để chụp được đúng lúc vòng lấy nét đang nở. Một lần hiếm hoi mà cái phiền toái đã theo suốt dự án lại có ích.

## Tự thử

1. **Bấm Replay intro** vài lần. Nó có chạy giống hệt nhau mỗi lần không? Vì sao? (So với một hệ mô phỏng thì câu trả lời sẽ khác.)
2. **Bỏ phần clump.** Đổi `mix(grain, clump, 0.4)` thành `grain`. Rồi thử `clump`. Mô tả sự khác nhau bằng lời trước khi đọc lại bảng ở mục 2.
3. **Tắt vòng lấy nét.** Xoá `min(…, ring)` trong `vReveal`. Mất đi cái gì?
4. **Làm vòng thành vòng tròn thật.** Đặt `ragged = 0.0`. Nó đọc thành hiệu ứng chuyển cảnh ngay lập tức — vì sao một hình hoàn hảo lại trông giả hơn?
5. **Đẩy mép lên.** Đổi hệ số `0.13` thành `0.6`. Tìm chỗ nối của `atan` ở phía sau vòng.
6. **Xoay camera rồi Replay.** Camera đẩy vào rồi dừng ở đâu? So sánh với nút Reset view.
7. **Làm chậm lại.** Đặt `INTRO_SECONDS = 12`, xem thật kỹ thứ tự các mảng hiện lên. Bạn có đoán được bản đồ fBM nằm bên dưới không?

## Đọc thêm

- [Inigo Quilez — Useful little functions](https://iquilezles.org/articles/functions/) (họ hàng của smoothstep và easing)
- [Khronos — `atan`](https://registry.khronos.org/OpenGL-Refpages/gl4/html/atan.xhtml)
- [research/01-untillabs-method.md §5](../research/01-untillabs-method.md) — reveal lệch pha và vòng tiêu cự của bản gốc
