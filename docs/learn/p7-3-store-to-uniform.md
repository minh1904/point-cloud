# P7.3 · Từ store thẳng vào uniform, không đi qua React

## Mục tiêu

Kéo một slider từng là: sáu mươi lần `setState` mỗi giây trên `Studio`, mỗi lần render lại cả cây bên dưới — `Stage`, `Canvas`, `ParticleField`, và cái `useEffect` chép tham số vào uniform — để đổi **một số float trên GPU**.

Nó chạy được. Comment `roadmap step 7.3 moves this to transient store updates` nằm trong `studio.tsx` từ P1 để chờ bước này.

Xong khi kéo slider giữ nguyên 60 fps, và chính xác hơn: khi kéo slider **không render lại gì ngoài slider đó**.

## Khái niệm

### 1. React không phải đường dẫn cho dữ liệu 60 lần/giây

Vòng đời React được thiết kế cho "trạng thái đổi thì giao diện đổi theo". Một uniform không phải giao diện — nó là một ô nhớ mà GPU đọc trước mỗi lần vẽ.

Đưa nó qua React nghĩa là mỗi frame của một cú kéo phải chạy: so sánh state → render lại component → so sánh dependency của effect → chạy effect → gán uniform. Bốn bước đầu tồn tại để phục vụ một thứ mà bước thứ năm làm xong trong một phép gán.

### 2. `getState()` không đăng ký

Đây là toàn bộ mẹo, và nó chỉ dài một dòng:

```ts
export function readParams(): ParamValues {
  return useParamsStore.getState().values;
}
```

Hook `useParamsStore(selector)` **đăng ký**: component render lại khi selector trả về giá trị khác. `useParamsStore.getState()` chỉ **đọc** — không đăng ký, không render, không gì cả.

Và `useFrame` đã chạy mỗi frame rồi. Đọc store trong đó là miễn phí về mặt React.

```ts
useFrame(({ size, viewport }, delta) => {
  const values = readParams();
  applyPointUniforms(current.uniforms, values, { … });
});
```

Đặt tên hàm là `readParams` chứ không gọi thẳng `getState` là có chủ ý: nó **nói ra** rằng đọc ở đây là cố tình không gây render.

### 3. Ghi mọi uniform mỗi frame nghe phí — và không phí

Phản xạ đầu tiên là chỉ ghi khi giá trị đổi: đăng ký store, so sánh, ghi.

Nhưng một uniform chỉ là một thuộc tính JavaScript trên một object mà three.js **dù sao cũng duyệt qua** trước mỗi draw call. Mười ba phép gán mỗi frame nằm dưới ngưỡng đo được.

Đổi lại, không phải đăng ký gì, không có vấn đề thứ tự giữa lúc material mount và lúc store đổi, và không bao giờ có giá trị cũ. Uniform **luôn luôn** là thứ store đang nói. Đó là một tính chất mạnh hơn hẳn "đồng bộ sau mỗi lần đổi".

### 4. Hai ngoại lệ, và chúng trung thực

Không phải tham số nào cũng hợp với vòng lặp frame:

- **`renderScale`** quyết định kích thước offscreen buffer. Đổi nó là **cấp phát bộ nhớ GPU** — một sự kiện, không phải một phép gán mỗi frame. Nó ở lại dạng đăng ký React trong `ScenePass`.
- **`grade`** đặt tên một file PNG. Tải file là side effect có vòng đời (đang tải, xong, dispose). Nó ở lại dạng đăng ký trong `ParticleField`.

Quy tắc rút ra: **giá trị** đi qua vòng lặp frame; **tài nguyên** đi qua React.

### 5. Nửa còn lại: inspector cũng phải hẹp

Scene không render vì nó không đăng ký. Nhưng inspector thì phải render — slider cần hiện số mới.

Mẹo là mỗi control đăng ký **đúng giá trị của riêng nó**:

```tsx
const value = useParamsStore((state) => state.values[param.key]);
```

Zustand so sánh thứ selector trả về. Kéo `size` thông báo cho control `size` và không cho ai khác. Hai mươi control trên màn hình, một cái render lại.

Nếu viết `useParamsStore((s) => s.values)` thì cả hai mươi cùng render — vẫn nhanh hơn trước, nhưng sai tinh thần.

### 6. `Stage` không nhận prop nào nữa

```tsx
export const Stage = memo(function Stage({ controlsRef }: StageProps) { … });
```

Từ bảy prop xuống một, và prop đó là ref. Cộng với `memo`, điều đó biến "canvas không render lại" từ một điều may mắn thành một điều được bảo đảm.

Để làm được, ba thứ phải rời khỏi prop:
- tham số → `params-store`
- `playing` và `introRun` → `session-store`
- `onStats` → `RenderInfo` tự ghi vào `session-store`

`introRun` là ví dụ đáng xem. Nó là **bộ đếm**, không phải sự kiện, vì vòng lặp frame là nơi duy nhất được phép chạm vào đồng hồ intro, và vòng lặp frame thì không nghe được sự kiện:

```ts
if (introSeen.current !== session.introRun) {
  introSeen.current = session.introRun;
  intro.current.value = 0;
}
```

## Đi qua code

### `apps/point-cloud/src/store/params-store.ts` (mới)

Zustand thường, không middleware. Điều làm nó "transient" không nằm trong store — nằm ở **cách người đọc đọc nó**.

### `apps/point-cloud/src/scene/particle-field.tsx`

Cái `useEffect` 40 dòng với mảng dependency 16 mục đã biến mất. Còn lại hai effect nhỏ cho dữ liệu của bundle (đổi khi dữ liệu đổi, không phải khi người dùng kéo), và một `useFrame` làm phần còn lại.

### `apps/point-cloud/src/scene/scene-pass.tsx`

```ts
useFrame(({ camera, clock, scene }) => {
  if (postMaterial.current) {
    const uniforms = postMaterial.current.uniforms as Uniforms;
    applyPostUniforms(uniforms, readParams());
    uniforms.uTime!.value = clock.elapsedTime;
  }
  …
});
```

Cùng một mẫu. `renderScale` thì vẫn ở trên, dạng đăng ký, vì nó cấp phát.

### `apps/point-cloud/src/scene/stage.tsx` — `Lens`

`Lens` vốn đã đọc fov trong `useFrame` từ P5.6, vì camera thuộc về R3F và sửa thứ hook trả về là lỗi lint. P7.3 biến điều vốn chỉ là "đúng" thành "tiện": vòng lặp giờ đọc được store mà không đăng ký.

## Lỗi đã gặp

1. **Lint chặn `const uniforms = material.current?.uniforms` rồi ghi vào nó.** Luật `react-hooks/immutability` cho phép ghi qua `material.current.uniforms.x.value` trực tiếp nhưng không cho qua biến trung gian — điều này đã ghi trong `status.md` từ P4. Cách thoát tốt hơn cả vá: đưa luôn texture LUT vào context của vòng lặp frame, xoá hẳn cái effect.
2. **Định dùng `subscribeWithSelector` và ghi uniform trong listener.** Nó chạy, và nó đẻ ra một câu hỏi về thứ tự: material chỉ mount sau khi bundle tải xong, nên effect đăng ký chạy khi ref còn null. Đọc trong `useFrame` không có vấn đề đó, vì `useFrame` chỉ chạy khi component đã mount.
3. **Suýt để `renderScale` vào vòng lặp frame cho "nhất quán".** Nó sẽ cấp phát một render target mới mỗi frame trong lúc kéo.

## Tự thử

1. **Thấy tận mắt.** React DevTools → Profiler → bật "Highlight updates" → kéo slider Size. Sau đó `git stash` bước này và thử lại trên bản cũ.
2. **Đo.** Đặt `console.count("ParticleField")` ở đầu `ParticleField` rồi kéo một slider hai giây. Con số nên là bao nhiêu?
3. **Phá phần hẹp.** Đổi `ParamControl` thành `useParamsStore((s) => s.values)` rồi bật Highlight updates. Bao nhiêu control nhấp nháy?
4. **Đổi ngoại lệ thành quy tắc.** Đưa `renderScale` vào `applyPointUniforms` và bỏ đăng ký trong `ScenePass`. Cái gì hỏng, và mất bao lâu mới thấy?
5. **Đếm phép gán.** Thêm một biến đếm vào `writeDeclared` và in ra mỗi giây. Có đúng 13 × fps không, và con số đó có làm bạn lo không?

## Đọc thêm

- [Zustand — Reading state without subscribing](https://zustand.docs.pmnd.rs/apis/create-store)
- [React Three Fiber — `useFrame`](https://r3f.docs.pmnd.rs/api/hooks#useframe)
- [React — `memo`](https://react.dev/reference/react/memo)
- [P1.5 · Hạt tự trôi trên GPU (và slider đầu tiên)](p1-5-gpu-drift.md) — nơi comment "7.3" được viết ra
