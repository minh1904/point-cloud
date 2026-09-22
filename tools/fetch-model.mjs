/**
 * Tải model depth default về public/models/ để self-host.
 *
 * Vì sao self-host model default: lần chạy đầu luôn hoạt động, không phụ thuộc
 * HF CDN còn sống, và không phải xử lý CORS + COEP cùng lúc. Các model khác
 * (experimental, quality, metric) lazy-fetch từ HF CDN — 4 model là 700 MB+,
 * không self-host hết được.
 *
 * Vì sao script này ở tools/ mà không phải scripts/: scripts/ thuộc vùng
 * integrity của Toolcraft. Và vì sao không có predev/prebuild hook: Toolcraft
 * từ chối mọi `pre*`/`post*` thêm vào script được bảo vệ ("Added pre* or post*
 * lifecycle hooks for a protected script are rejected"). Nên đây là lệnh chạy
 * tay: `npm run models:fetch`.
 *
 * Chạy lại là no-op nếu file đã đủ.
 */

import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const MODEL_ID = "onnx-community/depth-anything-v2-small";
const REVISION = "main";
const TARGET_DIR = join(process.cwd(), "public", "models", MODEL_ID);

/**
 * File cần cho transformers.js: config + preprocessor + weight ONNX.
 * dtype fp16 khớp registry.ts (DEPTH_MODELS[0].dtype).
 */
const FILES = [
  "config.json",
  "preprocessor_config.json",
  "onnx/model_fp16.onnx",
];

const BASE = `https://huggingface.co/${MODEL_ID}/resolve/${REVISION}`;

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function alreadyPresent(path) {
  try {
    const info = await stat(path);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

async function fetchFile(relativePath) {
  const target = join(TARGET_DIR, relativePath);

  if (await alreadyPresent(target)) {
    console.log(`  bỏ qua  ${relativePath} (đã có)`);
    return 0;
  }

  const url = `${BASE}/${relativePath}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} — ${url}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  console.log(`  tải     ${relativePath} — ${formatBytes(bytes.length)}`);
  return bytes.length;
}

async function main() {
  console.log(`Tải model self-host: ${MODEL_ID}`);
  console.log(`  → ${TARGET_DIR}\n`);

  let total = 0;
  for (const file of FILES) {
    total += await fetchFile(file);
  }

  console.log(
    total > 0
      ? `\nXong — ${formatBytes(total)} tải mới.`
      : "\nXong — mọi file đã có sẵn.",
  );
}

main().catch((error) => {
  console.error(`\nThất bại: ${error.message}`);
  console.error(
    "Model default sẽ không self-host được. App vẫn chạy (tải từ HF CDN)\n" +
      "nhưng lần đầu sẽ phụ thuộc mạng và cần COEP credentialless.",
  );
  process.exitCode = 1;
});
