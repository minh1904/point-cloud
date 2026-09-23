# Roadmap

Goal: a **demo tool** in the spirit of [creative-art-points](https://creative-art-points.vercel.app/) and the UntilLabs hero (see [research/01-untillabs-method.md](research/01-untillabs-method.md)), but going one step further:

1. **Upload any photo** → depth estimation in the browser → importance-sampled point cloud.
2. **Tweak it like a design tool** — inspector panel, presets, undo/redo, live preview.
3. **Export the lightweight bundle** (metadata JSON + data PNGs, as in the article) and **import it into a real project** with a small drop-in component.

Stack (decided): Bun monorepo · Next.js 16 (App Router, Turbopack) · React 19.2 · TypeScript · React Three Fiber · drei · Zustand · Vitest · Base UI + Tailwind v4 for our own component kit (**Atelier**, `@atelier/*`).
Open decisions are marked **🔶 DECISION** — each one blocks only the steps after it.

**Priority:** the point-cloud app comes first. Atelier grows *out of* it — a component is only built when a point-cloud step needs it, then extracted into the kit (see P-UI).

---

## How to read this

Every phase is split into small steps. Each step has:

- **Build** — the smallest thing that can be seen or tested.
- **Behind the scenes** — the concept the step exists to teach.
- **Done when** — an observable check. No step is done on "it compiles".

One step ≈ one or a few commits (`feat(particles): …`, see `CLAUDE.md`), plus a Vietnamese learning note in [`docs/learn/`](learn/README.md). Phases 1–5 deliberately rebuild the UntilLabs renderer from zero so each mechanism is understood before the image pipeline (Phase 6) feeds it real data.

```
P0 Scaffold ─▶ P1 Points ─▶ P2 FBO/Post ─▶ P3 Textures-as-data ─▶ P4 Motion ─▶ P5 Look
                                                  ▲                                  │
                                                  │                                  ▼
                              P6 Photo → points ──┘              P7 Tool UX ─▶ P8 Export/Import ─▶ P9 Polish
```

P6 writes into the same texture format that P3 reads, so the renderer never knows whether data came from a file or from an uploaded photo.

---

## P0 — Scaffold

| # | Build | Behind the scenes | Done when |
|---|---|---|---|
| ✅ 0.1 | Bun workspace: `apps/point-cloud` (Next.js via `create-next-app`) + `packages/*`, shared strict tsconfig, ESLint, Prettier, Vitest | Monorepo wiring: workspace protocol, shared config, one command runs everything | `bun run dev`, `bun run lint`, `bun run test`, `bun run typecheck` pass from the root |
| ✅ 0.2 | App folder layout (below), path alias `@/`; empty `@atelier/tokens` + `@atelier/ui` consumed by the app | Separating renderer, pipeline, UI, export so each can be tested alone | App imports a component from `@atelier/ui` |
| ✅ 0.3 | Full-screen `<Canvas>` with a spinning cube, `dpr={[1,2]}` | R3F's render loop, `useFrame`, `useThree` | Cube spins at 60 fps; resizing keeps aspect |
| 0.4 | 🔶 **DECISION: visual style** (you are researching this) — only changes token *values*, never blocks component work | Theming through CSS variables | Style chosen, tokens filled in `@atelier/tokens` |

```
apps/point-cloud/src/
  app/          App composition
  scene/        R3F: Canvas, camera, particles, post
  shaders/      .glsl files (raw import via a Turbopack loader rule)
  pipeline/     photo → depth → sampling → textures (pure TS + worker)
  bundle/       encode / decode / zip the export format
  store/        Zustand: params, history, pipeline state
packages/
  tokens/       @atelier/tokens — CSS variables + Tailwind v4 @theme
  ui/           @atelier/ui — primitives and controls on Base UI
  params/       @atelier/params — schema → controls + store (from P7)
  shell/        @atelier/shell — app layout (from P7)
```

---

## P-UI — Atelier, grown alongside

Toolcraft's good ideas (schema-declared controls, undo/redo, presets, persistence, a ready app shell) without its lock-in: every layer is usable on its own, nothing is signed, nothing forbids hand-written UI.

```
tokens  →  ui (primitives + controls)  →  params (schema binding)  →  shell (layout)
            each layer optional; an app can stop at any level
```

Rule: **no component without a consumer.** Each entry below is pulled in by the phase that needs it, built in the app first if unsure, then moved to the package.

Every component ships with a story (`*.stories.tsx` next to it) showing all variants in both themes — `bun run storybook` from the root. The a11y addon flags contrast and labelling issues as components are built.

| Needed by | Components | Behind the scenes |
|---|---|---|
| ✅ P0 | Tokens skeleton, `Button` | CSS variables + Tailwind v4 `@theme`; a package consumed via `workspace:*` |
| P1–P2 | ✅ `Panel`, ✅ `Slider` (inline value) · `Section`, `PropertyRow`, `NumberField` (scrub) | Base UI composition, pointer capture for scrubbing, controlled vs uncontrolled |
| P4–P5 | `Toggle`, `Select`, `SegmentedControl`, `Tooltip` | Keyboard and focus handling that Base UI gives for free |
| P6 | `FileDrop`, `Progress`, stage `Tabs` | File input a11y, drag-and-drop events |
| P7 | `@atelier/params` (`useParams(schema)`, history, presets, persistence), `@atelier/shell` (viewport + inspector + toolbar + status bar), `Toolbar`, `Kbd` | One schema driving UI, uniforms, presets and export; transient updates at 60 fps |
| Later | Registry (shadcn-style copy-the-source) for other demos | Distribution without lock-in |

---

## P1 — A simple particle field

| # | Build | Behind the scenes | Done when |
|---|---|---|---|
| ✅ 1.1 | 60k points uniformly inside a sphere, `THREE.Points` + `PointsMaterial` | `GL_POINTS`: one draw call for all particles; why `cbrt(random)` gives uniform volume | Sphere visible, 1 draw call in `renderer.info` |
| ✅ 1.2 | Swap to a custom `ShaderMaterial` | Vertex vs fragment shader, attributes vs uniforms, `gl_PointSize` | Same picture, own shader |
| ✅ 1.3 | Round soft sprite in fragment (`gl_PointCoord`, `discard`) | Point sprites are squares; shape comes from the fragment | Round dots with soft edge |
| ✅ 1.4 | Per-point `aScale`, sub-pixel dimming, clamp to `ALIASED_POINT_SIZE_RANGE` (attenuation + DPR already correct since 1.2) | Device vs CSS pixels, why sub-pixel points look too bright, varyings | Dots keep apparent size on resize / retina |
| ✅ 1.5 | `uTime` + per-particle `aRandomness` wobble (sin/cos) | GPU-side animation with zero CPU cost per particle | Field drifts; CPU idle in profiler |
| ✅ 1.6 | Orbit/pan/zoom camera (drei `OrbitControls`, zoom to centre) | Camera vs object transforms | Navigation feels stable |

---

## P2 — Render pipeline: FBO + fullscreen quad

| # | Build | Behind the scenes | Done when |
|---|---|---|---|
| ✅ 2.1 | `createPortal` content scene rendered into `useFBO` (HalfFloat) | Render targets: drawing into a texture instead of the screen | Scene still visible, now via texture |
| ✅ 2.2 | Fullscreen quad shader that samples the FBO | Post-processing = a 2D shader over the frame | Can invert colours as a sanity test |
| ✅ 2.3 | `useFrame` priorities (-1 render, 1 quad) | Ordering passes in R3F; `gl.autoClear` pitfalls | No flicker, no double render |
| ✅ 2.4 | Vignette + chromatic aberration + grain | Per-pixel effects and why they're cheap | Controls change them live |
| ✅ 2.5 | Render scale (FBO at 0.5–1× resolution) | Fill-rate vs quality trade-off | FPS rises when scale drops |

---

## P3 — Textures as data

Learn the format **before** generating it. Use the decoded UntilLabs sample locally for study only (not committed, not shipped).

| # | Build | Behind the scenes | Done when |
|---|---|---|---|
| ✅ 3.1 | Geometry with no real positions: `aParticleUv` (texel centre) + `aIndex`, `frustumCulled=false` | Vertex shader fetches its own data; why culling must be off | 65 536 vertices, positions all zero on CPU |
| ✅ 3.2 | Load `color.png`, sample it in the vertex shader | Texture setup for data: `NearestFilter`, no mipmaps, `flipY=false`, `NoColorSpace` | Colours appear in a flat grid |
| ✅ 3.3 | Decode 16-bit position from `position_h` + `position_l` | Splitting a 16-bit value into two 8-bit channels; the 256² quirk in the original and the correct general formula `(hi*256+lo)/65535` | Photo relief appears, matches the decoded preview |
| ✅ 3.4 | `remapPosition` with bounds from `metadata.json`, rotate to face camera | Normalised storage + bounds = compact and precise | Correct scale and orientation |
| ✅ 3.5 | Unit tests for the decoder (TS mirror of the GLSL) | Keeping shader maths testable on the CPU | Vitest round-trip passes |

---

## P4 — Motion that feels alive

| # | Build | Behind the scenes | Done when |
|---|---|---|---|
| 4.1 | Value noise + fBM in GLSL (rotated octaves) | Layered noise; why octave rotation removes axis bias | Debug view shows fBM field |
| 4.2 | 2D curl noise from fBM gradient, seeded by `uv + index` | Curl = divergence-free flow: particles swirl without clumping | Particles drift organically |
| 4.3 | Apply offset in clip space, scaled by perspective | Screen-space jitter is depth-independent | Near/far particles move equally on screen |
| 4.4 | Breathing (slow Z sine) and near-camera Z wobble | Stacking cheap motions | Subtle depth motion |
| 4.5 | Expose amplitude / frequency / speed / curl / breathe as params | Uniforms as the tool's "knobs" | Params change motion live |

Stateless by design (no simulation). A GPGPU layer for pointer interaction is optional, see P9.

---

## P5 — The look

| # | Build | Behind the scenes | Done when |
|---|---|---|---|
| 5.1 | Density-driven point size | Sparse areas get bigger points so the background never shows holes | Background grass looks continuous |
| 5.2 | 3D LUT (512², 8×8 tiles) in the particle shader, with intensity | How a 64³ colour cube is packed into 2D and sampled | Swapping LUT PNG changes grade |
| 5.3 | Fake DOF: focal distance/range → smaller + more transparent points | Cheap DOF inside the point shader instead of post blur | Focus pulls with a slider |
| 5.4 | Edge bokeh (bigger, dimmer, pushed outward at X edges) | Framing the subject like a lens | Edges soften |
| 5.5 | Intro: staggered reveal (`random` + `fbm` delay) + expanding organic focal ring + camera dolly | Per-particle timelines from one global progress uniform | Replayable intro |
| 5.6 | Narrow FOV (≈16°) camera preset | Telephoto flattens perspective so shallow relief looks photographic | Side-by-side vs 50° shows the difference |

---

## P6 — Photo → point cloud (the part UntilLabs did offline)

| # | Build | Behind the scenes | Done when |
|---|---|---|---|
| 6.1 | Upload / drop image, downscale to working size (e.g. 1024 px long side), show 2D preview | `createImageBitmap`, `OffscreenCanvas`, colour space of `getImageData` | Image preview + pixel buffer in store |
| 6.2 | 🔶 **DECISION: depth model** — Depth Anything V2 Small via transformers.js (WebGPU → WASM fallback) is the default candidate | Monocular relative depth, model size vs quality, first-load cost | Choice noted with size/latency numbers |
| 6.3 | Depth in a Web Worker, progress events, cancel | Keeping the main thread at 60 fps during inference | Depth map preview; UI never freezes |
| 6.4 | Importance map = weighted mix of luminance gradient, local contrast, depth edges (+ optional subject mask) | What "detail" means numerically; each term is a slider | Heat-map preview matches intuition |
| 6.5 | Sample N points from the importance map with blue-noise / weighted Poisson disk | Why plain weighted random clumps; blue noise gives even spacing at varying density | Points dense on subject, even on background |
| 6.6 | Per-point density (k-NN or grid count) → normalised 0–1 | This is what drives 5.1 | Density preview resembles UntilLabs map |
| 6.7 | Lift to 2.5D: `z = depth * relief` (relief ≈ 1–5 % of width), colour from image | Shallow relief hides monocular depth error | Tilting the camera shows believable volume |
| 6.8 | Pack into `DataTexture`s (Float, no hi/lo needed in-app) → feed P3 renderer | Same renderer for uploaded and imported data | Uploaded photo renders with all P4/P5 effects |
| 6.9 | Shuffle point order before packing | Texture neighbours must not be spatial neighbours (random seeds, even reveal) | Reveal looks uniform, no scan-line artefacts |

---

## P7 — Design-tool UX

Built from Atelier components (P-UI); look follows decision 0.4.

| # | Build | Behind the scenes | Done when |
|---|---|---|---|
| 7.1 | Layout: viewport + inspector + toolbar + status bar | Keeping R3F canvas isolated from React re-renders | Tweaking a slider never re-mounts the canvas |
| 7.2 | Param schema (single source of truth: label, range, default, group, uniform key) | One schema drives UI, uniforms, presets and export | Adding a param = one schema entry |
| 7.3 | Store → uniforms without React renders (Zustand `subscribe` in `useFrame`) | Transient updates for 60 fps sliders | Slider drag keeps 60 fps |
| 7.4 | Undo/redo (history of param snapshots, drag coalescing) | Command history in a design tool | Ctrl+Z / Ctrl+Shift+Z work, one step per drag |
| 7.5 | Presets: save / load / reset, built-ins | Serialising params | Presets survive reload |
| 7.6 | Pipeline stages view: original / depth / importance / points | Making the invisible steps visible | Toggle between stage previews |
| 7.7 | Keyboard shortcuts, perf HUD (fps, points, draw calls) | Tool ergonomics | Shortcuts listed in a help overlay |

---

## P8 — Export & import into a real project

| # | Build | Behind the scenes | Done when |
|---|---|---|---|
| 8.1 | 🔶 **DECISION: bundle format** — default: `.zip` with `metadata.json` + `position_h.png` + `position_l.png` + `color.png` + `density.png` (+ `lut.png`, `params.json`). Alternative: a single `.json` with base64 PNGs for copy-paste import | Size vs convenience | Format spec written in `docs/bundle-format.md` |
| 8.2 | Encoder: quantise positions to 16-bit, split hi/lo, write PNG bytes **directly** (UPNG/fflate), never via canvas | Canvas premultiplies alpha and colour-manages → corrupts data. Alpha must be 255 | Byte-exact round trip test |
| 8.3 | Texture size choice (128² / 256² / 512²) = particle budget, show bundle size before export | Budget ~600 KB for 65k points in the original | UI shows KB estimate |
| 8.4 | `metadata.json` v1: `version`, `width`, `height`, `particleCount`, `bounds`, `precision`, `densityRange`, `params` | Versioned format so old exports keep loading | Schema validated (zod) on import |
| 8.5 | Import a bundle back into the tool | Proves the format is self-sufficient | Export → import → identical render |
| 8.6 | Drop-in `<ParticleImage src="/particles/foo" />` R3F component (copyable file or small package) + usage docs | What the "real project" needs: loader + material + params, nothing else | Works in a fresh Vite/Next app |

---

## P9 — Polish (optional / later)

- 9.1 GPGPU ping-pong layer for pointer interaction (push / attract / scatter) — the one thing the original doesn't have.
- 9.2 Mobile: quality tiers (HalfFloat FBO, fewer octaves, lower render scale, fewer points).
- 9.3 Screenshot / video capture of the viewport.
- 9.4 Deploy demo to Vercel.

---

## Decisions log

| Decision | Status |
|---|---|
| Framework: React Three Fiber | ✅ decided |
| Photo source: user upload | ✅ decided |
| Interaction: design-tool style parameter editing (no GPGPU for now) | ✅ decided |
| Scope: demo tool + exportable bundle for real projects | ✅ decided |
| UI: own component kit **Atelier** (`@atelier/*`), Toolcraft-like but open, built on Base UI + Tailwind v4 | ✅ decided |
| Repo: Bun monorepo, point-cloud app first, kit grows from it | ✅ decided |
| 0.4 Visual style (token values) | 🔶 user researching |
| 6.2 Depth model | 🔶 before P6 |
| 8.1 Bundle format | 🔶 before P8 |
