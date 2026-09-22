# Ghi nhận nguồn

## Toolcraft — hệ thống thị giác

Design token và hình thức của các control trong `src/index.css` và
`src/ui/primitives.tsx` được lấy từ [Toolcraft](https://github.com/pixel-point/toolcraft).

Dự án này từng được dựng trên Toolcraft rồi bỏ (lý do ở
[docs/learn/03-why-these-choices.md](docs/learn/03-why-these-choices.md#q11--bỏ-toolcraft)),
nhưng hệ thống thị giác thì giữ nguyên vì nó tốt hơn thứ tự nghĩ ra. Cụ thể được
dùng lại: bảng màu, thang chữ (`--text-2xs`, `--text-xs-plus`), thang bo góc,
kích thước control (button `h-7`/`px-2`/`text-13`), khoảng cách 14px giữa các
control, và hình thức slider (track 1px, thumb 9px vuông bo 2px).

```
MIT License

Copyright (c) 2026 Pixel Point

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Codrops — kỹ thuật particle

fBM và curl noise (`src/scene/shaders/`, P2) dựa trên
[Simulating Life in the Browser](https://tympanus.net/codrops/2025/12/10/simulating-life-in-the-browser-creating-a-living-particle-system-for-the-untillabs-website/)
của Bautista Berto (basement.studio).

## Model AI

Model depth tải lúc chạy từ Hugging Face, giữ license riêng của từng model —
xem [`src/depth/registry.ts`](src/depth/registry.ts) để biết repo cụ thể.
