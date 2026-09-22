/**
 * Renderer của sản phẩm: sở hữu WebGL context và cả hai pass.
 *
 * Vì sao một renderer cho cả 2D lẫn 3D: **một canvas chỉ có được một loại
 * context**. Không thể vừa `getContext("2d")` cho preview depth vừa
 * `getContext("webgl")` cho particles trên cùng một canvas. Nên pass 2D cũng
 * chạy bằng WebGL — một fullscreen quad với shader lo split và colormap.
 *
 * Hoá ra lại tốt hơn: tra colormap trên GPU nghĩa là đổi bảng màu hay kéo thanh
 * split là tức thì, không phải duyệt hàng triệu pixel trên CPU rồi dựng
 * ImageBitmap như bản trước.
 *
 * Tài nguyên GPU sống ngoài React (module scope + khoá theo canvas). Tạo lại
 * texture mỗi lần component render là cách chắc chắn nhất để giết hiệu năng.
 */

import * as THREE from "three";

import { sampleColormap } from "@/depth/colormap";
import type { RawPixels } from "@/depth/protocol";
import { BREATHING, CURL, EDGE, FBM, SPREAD } from "@/shared/config";
import type { Colormap, DepthMap } from "@/shared/types";

import depthFragment from "./shaders/depth-preview.frag.glsl";
import particleFragment from "./shaders/particles.frag.glsl";
import particleVertex from "./shaders/particles.vert.glsl";
import quadVertex from "./shaders/quad.vert.glsl";

export type StageInput = {
  readonly pixels: RawPixels;
  readonly depth: DepthMap | null;
  readonly mode: "depth" | "particles";
  readonly colormap: Colormap;
  readonly split: number;
  readonly depthScale: number;
  readonly gridSize: number;
  readonly pointSize: number;
  readonly fbmAmp: number;
  readonly fbmFreq: number;
  readonly fbmSpeed: number;
  readonly curlStrength: number;
  readonly spread: number;
  readonly breathAmp: number;
  readonly breathSpeed: number;
  readonly dpr: number;
  readonly time: number;
  readonly viewport: {
    readonly scale: number;
    readonly x: number;
    readonly y: number;
  };
};

type Stage = {
  renderer: THREE.WebGLRenderer;

  quadScene: THREE.Scene;
  quadCamera: THREE.OrthographicCamera;
  quadMaterial: THREE.ShaderMaterial;

  pointScene: THREE.Scene;
  pointCamera: THREE.PerspectiveCamera;
  pointMaterial: THREE.ShaderMaterial;
  points: THREE.Points | null;
  gridSize: number;

  colorTexture: THREE.DataTexture | null;
  depthTexture: THREE.DataTexture | null;
  colormapTexture: THREE.DataTexture;
  colormapName: Colormap | null;

  sourceKey: string;
  depthKey: string;
};

let stage: Stage | null = null;
let stageCanvas: HTMLCanvasElement | null = null;

/* ── Texture ──────────────────────────────────────────────────────────── */

/**
 * Texture LUT 256×1 cho colormap. Tái dùng `sampleColormap` để bản GPU và bản
 * CPU (dùng khi export ở P3) không thể lệch nhau.
 */
function createColormapTexture(): THREE.DataTexture {
  const data = new Uint8Array(256 * 4);
  const texture = new THREE.DataTexture(data, 256, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

function fillColormap(texture: THREE.DataTexture, map: Colormap): void {
  const data = texture.image.data as Uint8Array;
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = sampleColormap(map, i / 255);
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  texture.needsUpdate = true;
}

function createSourceTexture(pixels: RawPixels): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    new Uint8Array(pixels.data.buffer.slice(0)),
    pixels.width,
    pixels.height,
    THREE.RGBAFormat,
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  // Kẹp biên: central difference ở mép ảnh phải đọc ngoài biên, và wrap sẽ tạo
  // gradient giả nối mép trái với mép phải.
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createDepthTexture(depth: DepthMap): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    new Uint8Array(depth.data),
    depth.width,
    depth.height,
    THREE.RedFormat,
  );
  // NoColorSpace là bắt buộc: depth là DỮ LIỆU, không phải màu. sRGB decode sẽ
  // bóp phi tuyến và làm sai toàn bộ hình học.
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  // R8 với width không chia hết cho 4 sẽ lệch dần theo dòng nếu thiếu dòng này.
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

/* ── Geometry ─────────────────────────────────────────────────────────── */

/**
 * Lưới điểm. Attribute duy nhất là toạ độ ô — vị trí thật do vertex shader tra
 * từ texture depth, nên CPU không phải giữ 262k × 3 float.
 */
function createPoints(
  gridSize: number,
  material: THREE.ShaderMaterial,
): THREE.Points {
  const count = gridSize * gridSize;
  const uvs = new Float32Array(count * 2);
  const indices = new Float32Array(count);
  // position bắt buộc phải có với Three.js, nhưng không mang dữ liệu.
  const positions = new Float32Array(count * 3);

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const i = y * gridSize + x;
      // +0.5 = lấy tâm ô. Bỏ đi thì lệch nửa pixel và mất hàng/cột cuối.
      uvs[i * 2] = (x + 0.5) / gridSize;
      uvs[i * 2 + 1] = (y + 0.5) / gridSize;
      // CHUẨN HOÁ về 0..1, không phải chỉ số thô: shader cộng aIndex vào miền
      // noise, nên chỉ số 65535 sẽ dịch miền đi 65 đơn vị và mỗi hạt trong một
      // hàng lấy mẫu hoàn toàn khác nhau — ảnh bị kéo thành vệt ngang.
      indices[i] = i / count;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aGridUv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("aIndex", new THREE.BufferAttribute(indices, 1));
  // Frustum culling dựa vào bounding sphere của `position`, vốn toàn số 0 →
  // Three.js sẽ cull nhầm toàn bộ. Tắt đi.
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

/* ── Khởi tạo ─────────────────────────────────────────────────────────── */

function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: true,
  });
  renderer.setClearColor(0x000000, 0);

  const colormapTexture = createColormapTexture();

  const quadMaterial = new THREE.ShaderMaterial({
    vertexShader: quadVertex,
    fragmentShader: depthFragment,
    uniforms: {
      uColor: { value: null },
      uDepth: { value: null },
      uColormap: { value: colormapTexture },
      uSplit: { value: 0.5 },
      uHasDepth: { value: 0 },
      uLineWidth: { value: 0.002 },
    },
  });

  const quadScene = new THREE.Scene();
  quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), quadMaterial));
  const quadCamera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1);

  const pointMaterial = new THREE.ShaderMaterial({
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    transparent: true,
    // Hạt giờ là đĩa ĐỤC chứ không phải quầng sáng, nên bật depthWrite để hạt
    // gần che hạt xa. Không bật thì thứ tự vẽ (theo chỉ số trong buffer) quyết
    // định cái nào đè lên cái nào, và mặt sau của đám mây sẽ lòi ra trước mặt.
    //
    // Demo gốc để depthWrite: false vì point cloud của họ gần như một mặt phẳng
    // nhìn từ chính diện, ít tự che. Của ta quay tự do nên cần depth thật.
    depthWrite: true,
    blending: THREE.NormalBlending,
    uniforms: {
      uColor: { value: null },
      uDepth: { value: null },
      uDepthTexel: { value: new THREE.Vector2(1, 1) },
      uAspect: { value: 1 },
      uDepthScale: { value: 0.6 },
      uPointSize: { value: 2 },
      uTime: { value: 0 },
      uEdgeLo: { value: EDGE.lo },
      uEdgeHi: { value: EDGE.hi },
      uFbmAmp: { value: FBM.amplitudeDefault },
      uFbmFreq: { value: FBM.frequencyDefault },
      uFbmSpeed: { value: FBM.speedDefault },
      uCurlStrength: { value: CURL.strengthDefault },
      uSpread: { value: SPREAD.default },
      uBreathAmp: { value: BREATHING.amplitudeDefault },
      uBreathSpeed: { value: BREATHING.speedDefault },
      uEps: { value: FBM.epsilon },
      uDpr: { value: 1 },
      uRefDistance: { value: 3.2 },
    },
  });

  const pointScene = new THREE.Scene();
  const pointCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);

  return {
    renderer,
    quadScene,
    quadCamera,
    quadMaterial,
    pointScene,
    pointCamera,
    pointMaterial,
    points: null,
    gridSize: 0,
    colorTexture: null,
    depthTexture: null,
    colormapTexture,
    colormapName: null,
    sourceKey: "",
    depthKey: "",
  };
}

function getStage(canvas: HTMLCanvasElement): Stage {
  if (stage && stageCanvas === canvas) return stage;
  disposeStage();
  stageCanvas = canvas;
  stage = createStage(canvas);
  return stage;
}

/* ── Ngân sách fill rate ──────────────────────────────────────────────── */

/**
 * Số pixel tối đa được phép tô mỗi khung hình.
 *
 * Với particle system, chi phí thật là `số hạt × cỡ hạt²`, không phải số hạt.
 * Đo thực tế: 262k hạt ở cỡ 11px (≈31M pixel) chạy 32 fps — đó là trần dùng
 * được. Vượt xa hơn thì GPU **treo hẳn**, không chỉ chậm: 37k hạt ở cỡ 64 là
 * 151M pixel và làm đứng cả tab. Đã gặp thật khi thử tổ hợp tham số cực đại.
 *
 * 25M là mức giữ được khoảng 40 fps ở trường hợp xấu nhất.
 */
const FILL_BUDGET = 25_000_000;

/**
 * Giới hạn cỡ hạt theo số hạt đang vẽ.
 *
 * Chặn cứng một con số (kiểu `min(size, 64)`) không đủ, vì cùng một cỡ hạt an
 * toàn với lưới 128 lại làm treo với lưới 512. Ngân sách phải chia cho số hạt.
 */
export function clampPointSize(
  requested: number,
  gridSize: number,
  dpr: number,
): number {
  const count = gridSize * gridSize;
  // Chia cho dpr vì shader còn nhân dpr vào, và nhân 1.725 là tích của hai hệ
  // số phóng lớn nhất trong shader (densityScale 1.5 × sizeVariation 1.15).
  const maxSize = Math.sqrt(FILL_BUDGET / count) / (dpr * 1.725);
  return Math.min(requested, Math.max(1, maxSize));
}

/* ── Vẽ ───────────────────────────────────────────────────────────────── */

export function renderStage(
  canvas: HTMLCanvasElement,
  input: StageInput,
): void {
  const s = getStage(canvas);
  const { pixels, depth, viewport, dpr } = input;

  s.renderer.setSize(canvas.width, canvas.height, false);

  // Texture nguồn chỉ dựng lại khi ảnh thật sự đổi.
  const sourceKey = `${pixels.width}x${pixels.height}:${pixels.data.length}`;
  if (sourceKey !== s.sourceKey) {
    s.colorTexture?.dispose();
    s.colorTexture = createSourceTexture(pixels);
    s.sourceKey = sourceKey;
  }

  const depthKey = depth
    ? `${depth.modelId}:${depth.width}x${depth.height}`
    : "";
  if (depthKey !== s.depthKey) {
    s.depthTexture?.dispose();
    s.depthTexture = depth ? createDepthTexture(depth) : null;
    s.depthKey = depthKey;
  }

  if (input.colormap !== s.colormapName) {
    fillColormap(s.colormapTexture, input.colormap);
    s.colormapName = input.colormap;
  }

  const aspect = pixels.width / pixels.height;

  if (input.mode === "depth") {
    const u = s.quadMaterial.uniforms;
    u.uColor.value = s.colorTexture;
    u.uDepth.value = s.depthTexture ?? s.colorTexture;
    u.uSplit.value = input.split;
    u.uHasDepth.value = s.depthTexture ? 1 : 0;
    u.uLineWidth.value = 1.5 / canvas.width;

    // Fit ảnh vào khung (contain) rồi áp pan/zoom. `contain` chứ không `cover`:
    // đây là công cụ kiểm tra depth, cắt mép ảnh là mất thông tin.
    const viewAspect = canvas.width / canvas.height;
    const fit = aspect > viewAspect ? 1 / aspect : 1 / viewAspect;
    const scale = fit * viewport.scale;

    s.quadCamera.left = -0.5;
    s.quadCamera.right = 0.5;
    s.quadCamera.top = 0.5;
    s.quadCamera.bottom = -0.5;
    s.quadCamera.updateProjectionMatrix();

    const mesh = s.quadScene.children[0] as THREE.Mesh;
    mesh.scale.set(aspect * scale * viewAspect, scale * viewAspect, 1);
    mesh.position.set(
      (viewport.x * dpr) / canvas.height,
      (-viewport.y * dpr) / canvas.height,
      0,
    );

    s.renderer.render(s.quadScene, s.quadCamera);
    return;
  }

  // ── particles ──
  if (s.gridSize !== input.gridSize) {
    if (s.points) {
      s.pointScene.remove(s.points);
      s.points.geometry.dispose();
    }
    s.points = createPoints(input.gridSize, s.pointMaterial);
    s.pointScene.add(s.points);
    s.gridSize = input.gridSize;
  }

  const u = s.pointMaterial.uniforms;
  u.uColor.value = s.colorTexture;
  u.uPointSize.value = clampPointSize(input.pointSize, input.gridSize, dpr);
  u.uDepth.value = s.depthTexture ?? s.colorTexture;
  u.uDepthTexel.value.set(
    1 / (depth?.width ?? pixels.width),
    1 / (depth?.height ?? pixels.height),
  );
  u.uAspect.value = aspect;
  u.uDepthScale.value = input.depthScale;
  u.uTime.value = input.time;
  u.uDpr.value = dpr;
  u.uFbmAmp.value = input.fbmAmp;
  u.uFbmFreq.value = input.fbmFreq;
  u.uFbmSpeed.value = input.fbmSpeed;
  u.uCurlStrength.value = input.curlStrength;
  u.uSpread.value = input.spread;
  u.uBreathAmp.value = input.breathAmp;
  u.uBreathSpeed.value = input.breathSpeed;

  // Dùng lại đúng cử chỉ pan/zoom của CanvasStage nhưng diễn giải thành orbit:
  // kéo ngang → phương vị, kéo dọc → độ cao, cuộn → khoảng cách. Không cần thêm
  // OrbitControls, và người dùng không phải học cử chỉ mới khi đổi chế độ.
  const azimuth = viewport.x * 0.005;
  const elevation = Math.max(
    -1.4,
    Math.min(1.4, -viewport.y * 0.005),
  );
  const distance = 3.2 / Math.max(0.2, viewport.scale);
  u.uRefDistance.value = distance;

  s.pointCamera.position.set(
    distance * Math.cos(elevation) * Math.sin(azimuth),
    distance * Math.sin(elevation),
    distance * Math.cos(elevation) * Math.cos(azimuth),
  );
  s.pointCamera.lookAt(0, 0, 0);
  s.pointCamera.aspect = canvas.width / canvas.height;
  s.pointCamera.updateProjectionMatrix();

  s.renderer.render(s.pointScene, s.pointCamera);
}

/** Giải phóng mọi tài nguyên GPU. Gọi khi unmount hoặc đổi canvas. */
export function disposeStage(): void {
  if (!stage) return;
  stage.colorTexture?.dispose();
  stage.depthTexture?.dispose();
  stage.colormapTexture.dispose();
  stage.quadMaterial.dispose();
  stage.pointMaterial.dispose();
  stage.points?.geometry.dispose();
  (stage.quadScene.children[0] as THREE.Mesh).geometry.dispose();
  stage.renderer.dispose();
  stage = null;
  stageCanvas = null;
}
