# P9.1 · GPGPU ping-pong: thứ duy nhất trong renderer có trí nhớ

## Mục tiêu

Đẩy đám mây ra khỏi con trỏ, rồi để nó tự về chỗ cũ. Roadmap gọi đây là **thứ duy nhất bản gốc UntilLabs không có**.

Xong khi rê chuột qua đám mây thì thấy một lỗ tròn, và rời chuột ra thì lỗ khép lại.

## Khái niệm

### 1. Vì sao cái này không thể stateless như mọi thứ khác

[P4](p4-2-curl-noise.md) lấy làm nguyên tắc: toàn bộ độ dịch curl được **tính lại từ `uTime`** mỗi frame. Không có gì để lưu, không có gì lệch pha, đổi tham số giữa chừng không cần reset.

"Đẩy mấy hạt này ra rồi để chúng lắng về" thì không thể làm vậy. Một hạt **đang ở đâu** phụ thuộc vào con trỏ **đã từng ở đâu**, không phụ thuộc vào bây giờ là mấy giờ.

Đó là **lịch sử**, và lịch sử phải nằm ở đâu đó.

### 2. Render target là một mảng, fragment shader là thân vòng lặp

Nó nằm trong một texture, và texture đó được cập nhật bằng cách **render**.

Đây là toàn bộ ý tưởng GPGPU trên web, và nó gọn tới mức đáng nhớ:

| Khái niệm CPU | Tương đương GPU ở đây |
|---|---|
| mảng `displacement[65536]` | một render target 256×256 |
| thân vòng lặp `for (i…)` | fragment shader |
| chạy vòng lặp | một lệnh `gl.render()` |
| chỉ số `i` | toạ độ texel, đọc qua `vUv` |

Một texel mỗi hạt, nên "vòng lặp" chạy 65.536 lần **song song**.

### 3. Ping-pong: vì sao phải có **hai** texture

Một shader **không thể vừa đọc vừa ghi cùng một texture** trong một pass. Kết quả sẽ phụ thuộc vào texel nào GPU tình cờ xong trước — hành vi không xác định, và khác nhau giữa các máy.

Nên có hai, và chúng đổi chỗ mỗi frame:

```
frame n:    đọc A ──▶ [simulation] ──▶ ghi B      rồi hoán đổi
frame n+1:  đọc B ──▶ [simulation] ──▶ ghi A      rồi hoán đổi
```

Cái tên "ping-pong" đúng nghĩa đen. Trong code nó là hai dòng:

```ts
current.current = rig.current.ping.write.texture;
rig.current.ping = { read: rig.current.ping.write, write: rig.current.ping.read };
```

### 4. Lưu **độ dịch**, không lưu **vị trí**

Quyết định thiết kế quan trọng nhất của bước này.

Vị trí gốc (`home`) vẫn đến từ hai texture byte của bundle, y hệt [P3.3](p3-3-16-bit-positions.md). Texture mới chỉ nói **mỗi hạt đã bị đẩy xa khỏi nhà bao nhiêu**.

Hệ quả:

- Đường giải mã, `bounds`, và toàn bộ định dạng P3/P8 **không bị đụng tới**.
- Tắt tính năng đi là **cộng thêm số 0**, không phải một nhánh `if`.
- Bản xuất ([P8](p8-1-dinh-dang-bundle.md)) không cần biết tính năng này tồn tại.

Nếu lưu vị trí tuyệt đối thì mọi thứ trên đều phải đi qua simulation, kể cả khi người dùng không bao giờ chạm chuột vào.

### 5. Lực đo từ **nhà**, không đo từ chỗ hạt đang bị đẩy tới

```glsl
vec3 toHome = home - uPointer;
```

Nếu đo từ vị trí đã bị đẩy, một hạt sẽ **cưỡi trên đầu sóng**: càng bị đẩy càng xa tâm nhưng vẫn trong bán kính, nên vẫn nhận lực, nên đi mãi.

Đo từ nhà thì lực là một **thuộc tính của chỗ đó**, và đám mây mở ra một cái lỗ có kích thước đoán trước được.

### 6. Hồi phục kiểu mũ, không kiểu trừ dần

```glsl
displacement *= exp(-uRelax * uDelta);
```

Viết `displacement *= 1.0 - uRelax * uDelta` sẽ khiến tốc độ về nhà **phụ thuộc vào frame rate**: máy 120fps kéo hạt về nhanh gấp đôi máy 60fps.

`exp(-k·dt)` thì không: hai lần bước `dt/2` cho đúng kết quả của một bước `dt`, vì `exp(a)·exp(b) = exp(a+b)`. Đây là công thức đáng thuộc cho mọi thứ "tiến dần về một giá trị theo thời gian".

Và `uDelta` bị kẹp:

```ts
uDelta.value = Math.min(delta, 1 / 30);
```

Một tab quay lại từ chế độ nền báo `delta` vài **giây**. Một frame như thế sẽ bắn cả đám mây ra khỏi màn hình.

### 7. Swirl: xoay lực 90°

```glsl
vec2 sideways = vec2(-direction.y, direction.x);
direction = normalize(mix(direction, sideways, uSwirl) + 0.0001);
```

Xoay vector đẩy 90° biến "chạy trốn" thành "xoay quanh". Đúng cùng một mẹo khiến curl noise ở [P4.2](p4-2-curl-noise.md) tuần hoàn thay vì dồn đống — và cũng là lý do hai hiệu ứng trông như họ hàng.

### 8. Priority -3: trung thực về số draw call

```ts
const SIMULATION_PRIORITY = -3;
```

`RenderInfo` đọc bộ đếm draw call ở -2 và `ScenePass` reset nó ở -1. Đặt simulation ở -3 nghĩa là lần vẽ của nó **được tính vào con số HUD báo** — và khi con trỏ đang hoạt động thì thật sự có **ba** draw call, không phải hai.

Dễ hơn nhiều nếu giấu nó đi. Nhưng một HUD nói dối về chi phí thì tệ hơn không có HUD.

## Đi qua code

### `apps/point-cloud/src/shaders/decode.glsl` (mới)

Hai shader giờ cần cùng một phép giải mã, nên nó thành `pc_decode` — chunk thứ ba của dự án, dùng đúng cơ chế `ShaderChunk` mà [P4.1](p4-1-value-noise-fbm.md) dựng lên.

### `apps/point-cloud/src/scene/use-pointer-field.ts` (mới)

Toàn bộ rig (material, scene, camera, raycaster, hai target) nằm trong **một ref**, dựng trong effect:

```ts
const rig = useRef<Rig | null>(null);
useEffect(() => { /* dựng */ rig.current = {...}; return () => { /* dispose */ }; }, [...]);
```

Không phải `useMemo`, và lý do là một luật lint: `react-hooks/immutability` từ chối để một frame callback sửa thứ mà memo trả về — mà một shader material **sinh ra để bị sửa**. Ref do chính hook này tạo là ngoại lệ mà luật cho phép, và dựng đối tượng GL sau khi mount vốn cũng là hình dạng đúng hơn.

Vị trí con trỏ trong không gian thế giới lấy bằng cách bắn tia vào mặt phẳng `z = 0`:

```ts
rig.current.raycaster.setFromCamera(rig.current.ndc, camera);
const reached = rig.current.raycaster.ray.intersectPlane(rig.current.plane, rig.current.hit) !== null;
```

Đám mây là một lớp nổi mỏng quanh z = 0, nên đó là câu trả lời đủ tốt cho "hạt nào đang dưới con trỏ" — và rẻ hơn rất nhiều so với raycast 65.536 điểm.

Còn toạ độ NDC thì **tự đo**, không lấy từ R3F — xem lỗi số 4 bên dưới:

```ts
const rect = element.getBoundingClientRect();
ndc.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
ndc.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
```

### `apps/point-cloud/src/params/schema.ts`

Năm núm vặn mới = **năm entry**. Schema mọc thêm một `stage: "pointer"`, `UNIFORM_PARAMS` mọc thêm một danh sách, và `applyPointerUniforms` là một dòng đọc nó. Panel "Pointer" tự xuất hiện trong inspector mà không viết một dòng JSX nào.

Đó là tiền lãi của [P7.2](p7-2-param-schema.md): một material thứ ba tốn ba dòng, không phải một bản sao của toàn bộ hệ thống nối dây.

## Lỗi đã gặp

1. **Luật immutability chặn `useMemo` + `useFrame`.** Đã mô tả ở trên. Cách sửa (rig trong ref, dựng trong effect) tốt hơn bản gốc.
2. **`sampler2D` để `null` KHÔNG đọc ra 0.** three.js thay bằng một texture **trắng** mặc định, nên mọi hạt sẽ bị đẩy nguyên một đơn vị thế giới ở frame đầu tiên. Phải có một texture 1×1 toàn 0 làm giá trị khởi tạo — `ZERO_DISPLACEMENT`, một singleton 4 byte.
3. **Một cú click giết hiệu ứng.** Bản đầu cho `pointerup` tắt cờ "con trỏ đang ở trên canvas", với lý do "ngón tay nhấc lên thì ngừng đẩy". Với **chuột** thì mọi thao tác xoay camera đều kết thúc bằng `pointerup`, nên chỉ cần kéo camera một lần là hiệu ứng chết hẳn — cho tới khi đưa chuột ra khỏi canvas rồi vào lại, vì cờ chỉ được bật lại bởi `pointerenter`.

   Kịch bản test của mình chỉ hover chứ không click nên không lộ ra; người dùng thật click ngay lập tức. Bản sửa: lấy `pointermove` làm nguồn sự thật (nó **tự khẳng định lại liên tục**, thay vì bật một lần rồi thôi), và `pointerup` chỉ tắt cờ khi `event.pointerType !== "mouse"`.

   Bài học rộng hơn: **một cờ trạng thái được bật bởi một sự kiện xảy ra một lần là một cái bẫy.** Nếu có bất kỳ đường nào tắt nó sai, nó không tự phục hồi.

4. **`state.pointer` của R3F đứng yên ở (0, 0).** Bản đầu đọc vị trí con trỏ từ `useFrame(({ pointer }) => …)` — cách mọi ví dụ R3F đều làm. Nó luôn trả về (0, 0), tức **chính giữa màn hình**.

   Lý do: R3F chỉ raycast — và do đó chỉ cập nhật `state.pointer` — khi trong scene **có object đăng ký handler chuột**. Scene này không có cái nào (OrbitControls tự nghe DOM), nên R3F tối ưu bằng cách bỏ qua hẳn, và `pointer` giữ nguyên giá trị khởi tạo mãi mãi.

   Triệu chứng độc ác ở chỗ nó **trông như đang chạy**: một cái lỗ mở ra ở giữa canvas dù con trỏ ở đâu. Mọi lần kiểm đầu tiên của mình đều tình cờ hover gần giữa, nên nó "đúng". Chỉ khi hover xuống góc dưới trái và thấy lỗ vẫn nằm giữa thì mới lộ.

   Bản sửa: tự đo NDC từ `getBoundingClientRect()` trong đúng listener `pointermove` đã có sẵn. Ít phụ thuộc hơn, và không lệ thuộc vào một tối ưu hoá của thư viện.

   Bài học: **một tối ưu hoá "chỉ làm khi có ai cần" sẽ im lặng đưa cho bạn giá trị mặc định** nếu bạn là người cần mà không đăng ký.

5. **Không kiểm được bằng mắt trong suốt quá trình viết**, vì cửa sổ Chrome bị thu nhỏ (xem [P9.2](p9-2-quality-tiers.md)). Thay vào đó: **biên dịch và link shader trong một WebGL2 context dựng riêng** ngay trong tab — nó bắt được lỗi cú pháp, biến chưa khai, và cho biết uniform nào sống sót qua trình tối ưu. Cả 13 uniform đều còn, nghĩa là không có cái nào gõ sai tên.

## Tự thử

1. **Kéo `Force` lên rồi rê chuột.** Rời chuột khỏi canvas — lỗ khép lại trong bao lâu? Giờ kéo `Return` xuống 0.3 và thử lại.
2. **Bấm `Push` thành `Pull`.** Hạt tụ về hay tản ra? Để `Reach` lớn và `Force` nhỏ xem sao.
3. **Kéo `Swirl` lên 1.** Chuyển động đổi kiểu thế nào, và nó gợi nhớ tới hiệu ứng nào khác trong dự án?
4. **Đổi `exp(-uRelax * uDelta)` thành `1.0 - uRelax * uDelta`** trong `pointer.frag.glsl`. Rồi kéo `Return` lên 10 — chuyện gì xảy ra, và vì sao?
5. **Bỏ kẹp `Math.min(delta, 1/30)`**, chuyển sang tab khác 10 giây rồi quay lại. Đám mây đi đâu?
6. **Nhìn số draw call** ở status bar khi `Force` bằng 0 và khi lớn hơn 0. Đợi 4 giây sau khi về 0 — vì sao nó quay lại 2?

## Đọc thêm

- [MDN — `WebGLRenderingContext.framebufferTexture2D`](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/framebufferTexture2D)
- [three.js — `WebGLRenderTarget`](https://threejs.org/docs/#api/en/renderers/WebGLRenderTarget)
- [Wikipedia — Exponential decay](https://en.wikipedia.org/wiki/Exponential_decay)
- [P4.2 · Curl noise](p4-2-curl-noise.md) — cùng mẹo xoay 90°
