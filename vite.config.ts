import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import glsl from "vite-plugin-glsl";

/**
 * Header cross-origin isolation.
 *
 * Nhánh fallback WASM đa luồng của ONNX Runtime cần SharedArrayBuffer, mà
 * SharedArrayBuffer cần hai header này. Thiếu chúng, ORT âm thầm rơi về
 * single-thread và chậm 3-4 lần MÀ KHÔNG BÁO LỖI GÌ.
 *
 * Dùng credentialless, KHÔNG dùng require-corp: require-corp chặn mọi asset
 * cross-origin, bao gồm việc tải model từ CDN Hugging Face.
 *
 * Bản prod nằm ở public/_headers (Cloudflare Pages). Hai chỗ phải khớp nhau,
 * nếu không dev và prod sẽ hành xử khác nhau — đúng loại bug khó tìm nhất.
 *
 * Kiểm tra: `crossOriginIsolated === true` trong console.
 */
const crossOriginIsolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Cho phép #include trong .glsl — để fBM/curl noise dùng chung được giữa
    // các shader thay vì dán chuỗi.
    glsl({ include: ["**/*.glsl", "**/*.vert", "**/*.frag"] }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: { headers: crossOriginIsolation },
  preview: { headers: crossOriginIsolation },
  worker: {
    // Worker dạng ES module: cần cho import tĩnh của @huggingface/transformers
    // bên trong depth-worker.ts.
    format: "es",
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
