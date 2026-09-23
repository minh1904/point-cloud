# P7.4 · Undo / redo, và vì sao một cú kéo là **một** bước

## Mục tiêu

Ctrl+Z quay lại, Ctrl+Shift+Z tiến tới, và một cú kéo slider là **đúng một** bước — không phải sáu mươi.

Bước này ngắn về code và đáng về ý tưởng: nó là bài học về việc **ranh giới của một hành động** không trùng với ranh giới của một sự thay đổi.

## Khái niệm

### 1. Lịch sử là một chồng ảnh chụp, không phải một chồng lệnh

Có hai cách làm undo:

| Cách | Lưu gì | Hợp khi |
|---|---|---|
| **Command pattern** | mỗi thao tác + cách đảo ngược nó | trạng thái to, thao tác nhiều loại |
| **Snapshot** | toàn bộ trạng thái trước mỗi bước | trạng thái nhỏ |

Ở đây trạng thái là **19 con số**. Một ảnh chụp là một object vài trăm byte; một trăm bước là vài chục kilobyte. Command pattern sẽ phải định nghĩa phép đảo cho từng loại thao tác (đặt giá trị, nạp preset, reset nhóm) để tiết kiệm một thứ không cần tiết kiệm.

```ts
past: readonly ParamValues[];
future: readonly ParamValues[];
```

Undo là: lấy phần tử cuối của `past` làm `values`, đẩy `values` cũ sang đầu `future`. Redo là chiều ngược lại. Không có gì hơn.

### 2. Gộp thao tác kéo (drag coalescing)

Đây là phần thật sự của bước này.

Một slider bắn `onValueChange` sáu mươi lần mỗi giây và `onValueCommitted` **một lần**, lúc nhả chuột. Nếu đẩy lịch sử ở mỗi lần đổi thì Ctrl+Z sẽ lùi từng frame một — đúng về mặt kỹ thuật, vô dụng về mặt thực tế.

Cách giải nằm ở một biến duy nhất:

```ts
let gestureStart: ParamValues | null = null;

set: (key, value) => {
  // …
  gestureStart ??= state.values;   // lần ghi đầu của thao tác nhớ điểm xuất phát
  set({ values: { ...state.values, [key]: next } });
},

commit: () => {
  const before = gestureStart;
  gestureStart = null;
  if (before && !sameValues(before, get().values)) pushHistory(before);
},
```

`??=` gán khi và chỉ khi đang là `null`. Lần ghi đầu tiên của một thao tác nhớ điểm xuất phát, mọi lần ghi sau miễn phí, và `commit` biến tất cả thành một entry.

Biến này cố tình **nằm ngoài state của store**: nó là sổ sách, không phải thứ ai đó nên đăng ký hay render từ đó.

### 3. Base UI cho sẵn ranh giới thao tác

```tsx
<Slider
  onValueChange={(next) => set(param.key, next)}   // sống, mỗi frame
  onValueCommitted={() => commit()}                // một lần, khi nhả
/>
```

`onValueCommitted` bắn khi nhả chuột **và** khi bấm phím mũi tên. Nghĩa là mỗi lần bấm mũi tên là một bước undo riêng — đúng như mong đợi, vì mỗi lần bấm là một hành động riêng.

Nếu component không cho sẵn ranh giới ấy thì phương án thay thế là debounce theo thời gian: "im lặng 400ms thì coi như xong". Nó hoạt động, và nó sai ở các trường hợp biên (kéo chậm thành nhiều bước). Có tín hiệu thật thì dùng tín hiệu thật.

### 4. Nhánh redo chết khi bạn rẽ hướng khác

```ts
const pushHistory = (before: ParamValues) =>
  set((state) => ({
    past: [...state.past, before].slice(-HISTORY_LIMIT),
    future: [],
  }));
```

Redo chỉ có nghĩa khi bạn vẫn đang đi lui trên **cùng một con đường**. Đổi thứ gì đó và con đường bạn vừa rời bỏ biến mất. Mọi trình soạn thảo đều theo quy tắc này, và người dùng đã quen tới mức nó chỉ gây chú ý khi bị làm khác đi.

### 5. Một thao tác đang dở phải bị bỏ, không được gộp vào

Trường hợp biên đáng viết test:

> Đang kéo slider Softness thì bấm Ctrl+Z.

Nếu `undo()` không xoá `gestureStart`, thì cú `commit` sau đó (khi nhả chuột) sẽ đẩy vào lịch sử một điểm xuất phát thuộc về một thực tại đã không còn tồn tại.

```ts
undo: () => {
  gestureStart = null;
  // …
},
```

Một dòng, và một test đảm bảo nó ở đó.

### 6. Ctrl+Z trong ô nhập liệu **không phải của bạn**

```ts
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}
```

Trong một ô văn bản, Ctrl+Z là undo của trình duyệt. Cướp nó để lùi một slider là một bất ngờ thật sự khó chịu. Bảo vệ này ba dòng và nó là khác biệt giữa "có phím tắt" và "có phím tắt dùng được".

Listener gắn vào `window` chứ không phải một div bọc ngoài: `onKeyDown` trên div chỉ bắn khi có thứ gì bên trong đang focus, mà thứ người xem hay focus nhất là canvas — vốn không focus được.

## Đi qua code

### `apps/point-cloud/src/store/params-store.ts`

Ngoài `set`/`commit`/`undo`/`redo`, để ý `reset` và `resetGroup` được viết **qua `setAll`**:

```ts
reset: () => get().setAll(defaultValues()),
```

Nghĩa là Reset cũng là một bước undo được, miễn phí. Nếu chúng tự gọi `set({ values })` thì sẽ là một thao tác vô hình với lịch sử — đúng loại chi tiết mà người dùng phát hiện bằng cách mất công việc của họ.

### `apps/point-cloud/src/store/params-store.test.ts` (mới)

Test tôi thích nhất mô phỏng đúng cú kéo:

```ts
it("turns a whole drag into one history entry", () => {
  for (const value of [0.02, 0.03, 0.04, 0.05]) store().set("size", value);
  store().commit();

  expect(store().past.length).toBe(1);
  expect(store().past[0]!.size).toBe(0.019);
  expect(store().values.size).toBe(0.05);
});
```

Bốn lần đổi, một entry, và entry đó trỏ về **trước** cú kéo.

### `apps/point-cloud/src/app/shell/toolbar.tsx`

```ts
const canUndo = useParamsStore((state) => state.past.length > 0);
```

Chọn một boolean, không phải mảng. Toolbar render lại khi undo **trở nên khả dụng**, không phải mỗi lần một bước được đẩy vào.

## Lỗi đã gặp

1. **Gần như quên `gestureStart = null` trong `undo`.** Phát hiện lúc đang viết test cho trường hợp biên — một trong số ít lần test được viết trước khi bug xảy ra thay vì sau.
2. **Đã định dùng debounce thay cho `onValueCommitted`**, trước khi kiểm tra API của Base UI. Kiểm tra mất một phút và bỏ được cả một lớp heuristic.
3. **`canUndo()`/`canRedo()` ban đầu là hàm trong store.** Gọi chúng trong selector sẽ không đăng ký đúng, vì selector so sánh giá trị trả về của chính hàm chứ không phải kết quả. Đã xoá khỏi API và dùng selector boolean.

## Tự thử

1. **Kéo rồi Ctrl+Z.** Nó lùi về trước cả cú kéo, hay lùi từng chút?
2. **Bỏ ranh giới thao tác.** Đổi `onValueChange` thành `(next) => { set(param.key, next); commit(); }` rồi kéo một giây. Bấm Ctrl+Z bao nhiêu lần mới về chỗ cũ?
3. **Kiểm nhánh redo.** Đổi A, đổi B, Ctrl+Z hai lần, rồi đổi C. Redo còn làm gì được không? Vì sao đó là hành vi đúng?
4. **Bấm Ctrl+Z trong ô "Save as…".** Nó undo văn bản hay undo tham số? Rồi bỏ `isTyping` và thử lại.
5. **Đo bộ nhớ lịch sử.** `JSON.stringify(useParamsStore.getState().past).length` sau 100 bước. Có đáng lo không, và `HISTORY_LIMIT` có cần tồn tại không?

## Đọc thêm

- [MDN — `KeyboardEvent.key`](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key)
- [MDN — Toán tử gán logic `??=`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing_assignment)
- [Wikipedia — Command pattern](https://en.wikipedia.org/wiki/Command_pattern) — cách còn lại, và khi nào nên chọn nó
- [P7.2 · Khai báo mỗi núm vặn đúng một lần](p7-2-param-schema.md) — lý do một ảnh chụp lại nhỏ đến vậy
