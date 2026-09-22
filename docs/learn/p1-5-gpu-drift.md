# P1.5 · Hạt tự trôi trên GPU (và slider đầu tiên)

## Mục tiêu

60.000 hạt trôi lững lờ, mỗi hạt một quỹ đạo riêng — mà CPU **không tính vị trí hạt nào**. Góc phải có panel với 4 slider (Size, Softness, Drift, Speed) chỉnh trực tiếp khi đang chạy; đây là component `Slider` và `Panel` đầu tiên của bộ Atelier.

## Khái niệm

### 1. Hai cách làm hạt chuyển động

| | Tính trên CPU | Tính trên GPU (cách ta làm) |
|---|---|---|
| Mỗi frame | JS lặp 60.000 hạt, sửa `Float32Array`, upload lại 720 KB lên GPU | JS chỉ đổi **một số**: `uTime` |
| Chi phí | Tăng theo số hạt, nghẽn ở CPU và băng thông | Gần như không đổi, GPU chạy song song |
| Hạn chế | Linh hoạt tuỳ ý | Vị trí phải tính được **chỉ từ** dữ liệu gốc + thời gian (không "nhớ" frame trước) |

Cách GPU gọi là chuyển động **không trạng thái** (stateless): vị trí ở giây thứ `t` là một hàm `f(vị trí gốc, số ngẫu nhiên riêng, t)`. Không có vận tốc, không có lực, không tích luỹ. Bản UntilLabs thật cũng làm đúng kiểu này (xem mục 3 của [bài nghiên cứu](../research/01-untillabs-method.md)).

### 2. Cùng một đoạn code, 60.000 chuyển động khác nhau

GPU chạy **cùng một** vertex shader cho mọi hạt. Muốn mỗi hạt đi một đường riêng, phải cho mỗi hạt **dữ liệu riêng**: attribute `aRandomness` gồm 3 số ngẫu nhiên [0, 1) cho mỗi hạt.

```glsl
vec3 drift = vec3(
  sin(uTime * 0.5 + aRandomness.x * 10.0) * aRandomness.x,
  cos(uTime * 0.3 + aRandomness.y * 10.0) * aRandomness.y,
  sin(uTime * 0.4 + aRandomness.z * 10.0) * aRandomness.z
);
```

Mỗi trục là một dao động `sin`. Phân tích một dòng:

```
sin( uTime * 0.5  +  aRandomness.x * 10.0 )  *  aRandomness.x
     └ tần số ┘      └──── pha ────┘            └ biên độ ┘
```

- **Biên độ** (amplitude) — hạt lắc xa bao nhiêu. Nhân với số ngẫu nhiên → hạt lắc nhiều, hạt lắc ít.
- **Pha** (phase) — hạt đang ở đâu trong chu kỳ. `× 10.0` rải pha ra nhiều vòng, nên các hạt không lắc đồng loạt.
- **Tần số** (frequency) — lắc nhanh hay chậm. Ba trục dùng ba tần số khác nhau (0.5, 0.3, 0.4) nên ba dao động **không bao giờ trùng nhịp** → quỹ đạo trông như đi lang thang, không lặp một vòng dễ đoán.

Sau đó `drift` được cộng vào vị trí **trước** khi nhân ma trận, nên chuyển động diễn ra trong object space và xoay theo khối cầu.

### 3. Vì sao cộng dồn `uTime` trên CPU thay vì nhân tốc độ trong shader

Cách "tự nhiên" là truyền thời gian thật và nhân tốc độ trong shader: `sin(elapsed * speed * 0.5 + …)`. Nhưng khi kéo slider Speed từ 1 lên 2, **pha của mọi hạt nhảy ngay lập tức** (vì `elapsed × 2` khác xa `elapsed × 1` khi `elapsed` đã lớn) → cả đám hạt giật một cái.

Cách đúng: mỗi frame cộng thêm một đoạn nhỏ:

```ts
uTime += delta * driftSpeed;
```

Đổi tốc độ chỉ làm **đoạn cộng thêm** to hơn — thời gian vẫn liền mạch, chuyển động uốn mượt sang nhịp mới. Đây là mẹo dùng mãi cho mọi tham số "tốc độ".

### 4. Slider là một `<input type="range">` trá hình

Slider của Atelier (dựng trên Base UI) trông như một thanh 28px có nhãn và giá trị bên trong, nhưng bên dưới là một `<input type="range">` **ẩn về mặt thị giác**. Nhờ đó nó tự có:

- điều khiển bằng bàn phím: ← → (một bước), Page Up/Down (bước lớn), Home/End;
- trình đọc màn hình đọc được tên ("Size") và giá trị;
- tên truy cập lấy từ `aria-label`.

Tự vẽ một slider bằng `div` thì phải tự làm lại toàn bộ những thứ đó — lý do chính để dựng Atelier trên Base UI.

## Đi qua code

**`apps/point-cloud/src/scene/sphere-field.ts`** — `createRandomness(count)`: 3 số / hạt.

**`shaders/points.vert.glsl`** — tính `drift`, cộng vào `position` thành `displaced`, rồi mới nhân `modelViewMatrix`.

**`scene/particle-field.tsx`**

```tsx
<bufferAttribute attach="attributes-aRandomness" args={[randomness, 3]} />   // 3 số / hạt

useFrame((_, delta) => {
  material.current.uniforms.uTime.value += delta * driftSpeed;   // chỉ một số mỗi frame
});
```

`ParticleParams` + `defaultParticleParams` gom 4 tham số chỉnh được vào một chỗ; `Studio` giữ chúng trong state và nút **Reset** trả về mặc định.

**`packages/ui/src/slider.tsx`** — `BaseSlider.Root / Control / Track / Indicator / Thumb / Label / Value`. Cả thanh 28px là vùng bấm; phần tô (`Indicator`) cho thấy giá trị; nhãn và số nằm trong một lớp `pointer-events-none` phủ lên trên để không cản thao tác kéo.

**`packages/ui/src/panel.tsx`** — bề mặt nổi: nền `popover` trong suốt 75% + `backdrop-blur` để nổi trên viewport đang chuyển động mà vẫn đọc được chữ.

## Lỗi đã gặp

1. **Test không tìm thấy slider.** `getByRole("slider")` thất bại dù `<input type="range" aria-label="Size">` có trong DOM. Hai lý do: Base UI ẩn thumb (`visibility: hidden`) cho đến khi đo được bố cục — mà jsdom không bao giờ tính bố cục; và jsdom không gán role `slider` cho input đó như trình duyệt. Sửa: tìm input theo nhãn (`getByLabelText("Size", { selector: "input" })`) — vẫn kiểm tra đúng tên truy cập. Cách tìm ra: in thẳng DOM mà component render ra, đừng đoán.
2. **Phần tô của slider gần như vô hình.** Màu `input/25` trên nền tối quá gần màu track. Đổi sang `foreground/10` — nổi rõ ở cả theme tối lẫn sáng. Chỉ phát hiện được khi **nhìn trên trình duyệt**, test không bắt được lỗi thị giác.
3. **Hiện tại mỗi lần kéo slider, React render lại component cảnh.** Chấp nhận được với 4 slider, nhưng không phải cách tối ưu; bước 7.3 của roadmap sẽ chuyển sang cập nhật uniform trực tiếp không qua React render.

## Tự thử

1. Đặt cả ba tần số bằng nhau (0.5, 0.5, 0.5). Quỹ đạo của một hạt thành hình gì? *(Gợi ý: ba dao động cùng nhịp → đường thẳng hoặc elip.)*
2. Bỏ `* aRandomness.x` ở cuối mỗi dòng (biên độ như nhau). Chuyển động có còn "tự nhiên" không?
3. Bỏ `+ aRandomness.x * 10.0` (cùng pha). Kéo Drift lên cao — thấy cả khối "thở" đồng loạt không?
4. Thử lỗi giật pha: trong `useFrame`, đổi thành `uTime.value = state.clock.elapsedTime * driftSpeed` (cần lấy `state` từ tham số đầu). Kéo slider Speed và quan sát.
5. Mở DevTools → Performance, ghi 5 giây. So thời gian "Scripting" với lúc tắt Drift (Speed = 0). Có khác đáng kể không? Vì sao?

## Đọc thêm

- [The Book of Shaders — Shaping functions](https://thebookofshaders.com/05/) — trực quan hoá `sin`, biên độ, tần số, pha
- [MDN — `<input type="range">`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/range)
- [Base UI — Slider](https://base-ui.com/react/components/slider)
- [WAI-ARIA Authoring Practices — Slider pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/) — hành vi bàn phím chuẩn của slider
