# Status & handoff

_Last updated: 2026-09-23 · last commit on `main`: `eaa6d35`_

Read this first when picking the project up on a new machine or in a new session. Plan: [roadmap.md](roadmap.md) · conventions: [`CLAUDE.md`](../CLAUDE.md) · learning notes (Vietnamese): [learn/](learn/README.md).

## Where we are

**P0 through P4 are complete; P5 is done except 5.1, which is blocked on density data. P6 is next.** The post pipeline routes the scene through a HalfFloat FBO into a fullscreen quad with live controls for render scale (0.5–1×), vignette, chromatic aberration and animated film grain; point size stays invariant on screen across render scales and the HUD reports two stable draw calls.

P3.1 replaced the CPU-generated sphere with a data-driven geometry: 256² = 65,536 particles whose `position` attribute is all zeros, each carrying `aParticleUv` (its texel centre) and `aIndex` instead. The vertex shader derives the position — currently a flat grid — and hashes its own per-point scale and randomness from the texel coordinate, so `aScale` / `aRandomness` are gone. `frustumCulled` is off, because a zeroed `position` gives three.js a bounding sphere of radius 0.

P3.2 gave that address something to point at, and 3.3-3.4 finished the job: the field renders entirely from a **bundle** under `public/particles/sample/` — `color.png`, `position_h.png`, `position_l.png` and `metadata.json`. Colour and position are both vertex texture fetches; positions are 16-bit values split across the two PNGs and mapped back onto the bundle's `bounds`. `ParticleField` now takes a `bundleUrl` and nothing else about the data: hand it a different bundle and it renders that, which is exactly the seam P6 writes into.

3.5 added the CPU mirror of the shader decode (`src/bundle/position-codec.ts`) plus a dependency-free PNG reader/writer (`scripts/png.ts`) — together these are also the encoder half that P8.2 needs.

P5 dressed it as a photograph. A 16 degree telephoto (5.6) flattens perspective so a relief under 3% of the width reads as compressed rather than flat; fake DOF (5.3) shrinks and fades particles outside a depth slice instead of blurring the frame; edge bokeh (5.4) blows out and pushes apart the left and right margins; a baked 64³ LUT (5.2) carries the colour grade in a 512² PNG; and an intro (5.5) reveals 65,536 particles on their own timelines from a single `uProgress` float while the camera pushes in. **5.1 is not done** — see below.

P4 replaced the placeholder `sin`/`cos` drift with curl noise built on value-noise fBM (`src/shaders/noise.glsl`, shared through a registered `ShaderChunk`). The offset is added in clip space and multiplied by `w`, so particles move the same distance on screen at any depth; a slow depth breathing and a near-camera wobble sit underneath it. All of it is stateless — the whole offset is recomputed from `uTime` every frame, which is why changing any parameter mid-flight needs no reset. Five knobs in a new **Motion** panel, plus a debug button that paints the fBM field onto the particles.

The studio shell around all of it is now responsive. Three layouts share one markup: under `sm` the controls are a bottom sheet capped at 52dvh, from `sm` a 224px rail down the right edge, from `lg` the original 256px column — and the toolbar shortens its labels and gives up the draw-call readout as the screen narrows. `Panel` grew a collapse toggle; it stores nothing itself, so `Studio` owns the flags and a single **Collapse all** button folds the stack. **Hide** dismisses the rail entirely to a **Controls** pill, which is the only way to see the whole frame on a phone.

| Phase | Status |
|---|---|
| P0 Scaffold (monorepo, Next.js, Atelier tokens + Button, Storybook) | ✅ done |
| P1 Particle field (1.1 → 1.6) | ✅ done |
| P-UI Atelier | Button, Slider, Panel (collapsible) done · Section, PropertyRow, NumberField pending (pulled in by P2) |
| P2 FBO + post-processing | ✅ done (2.1–2.5) |
| P3 Textures as data | ✅ done (3.1–3.5) |
| P4 Motion (curl noise) | ✅ done (4.1–4.5) |
| P5 The look | 5.2–5.6 ✅ · 5.1 blocked on density |
| P6 Photo → point cloud | ⏭ **6.1 next** |
| P7–P9 | not started |

## Next step: P6.1

Upload or drop an image, downscale it to a working size (about 1024px on the long side), and show a 2D preview. The concepts are `createImageBitmap`, `OffscreenCanvas`, and the colour space of `getImageData`. Done when the image preview and its pixel buffer are in the store.

P6 is where this project stops rebuilding the UntilLabs renderer and goes past it: everything from 6.2 onward automates what they did by hand in Houdini. It also closes two things P3 and P5 left open — real depth, and the density map 5.1 needs.

**Decision 6.2 has to be made now rather than deferred**: which depth model. Default candidate is Depth Anything V2 Small through transformers.js (WebGPU with a WASM fallback). Note size and first-load latency when choosing.

Per the project rules, every step also needs a Vietnamese learning note and an entry in `docs/learn/README.md`.

### What P5 could not finish

**5.1 (density-driven point size) is blocked and deliberately skipped.** Sparse regions should get larger points so the background never shows holes — but the sample cloud sits on a regular grid, where density is uniform by construction and there is nothing to measure. It only becomes meaningful after **P6.5** places particles by importance sampling and **P6.6** computes per-point density. Do it there, not before.

### Still outstanding from P3

**The sample bundle's depth is a placeholder, not a measurement.** `scripts/build-sample-bundle.ts` derives it from two painter's cues in the photo itself (atmospheric perspective + ground plane) because decision 6.2 is still open. The decode path, bounds, codec and tests are all real and verified; only the depth numbers are a stand-in. Regenerate any time with `bun run build:sample` from `apps/point-cloud`.

### The attribute still waiting for a job

`aIndex` has been uploaded since P3.1 and the vertex shader has never read it. P4.2 and P5.5 both wanted a per-particle seed and both used the texel hash instead, because hashing a five-digit integer exhausts float precision. Its real use needs **P6.9**: once particle order is shuffled before packing, the ordinal stops being spatially meaningful and becomes usable as a seed. Until then it is 256 KB of unread buffer — worth removing if P6.9 slips.

## Open decisions

| Decision | Blocks | Notes |
|---|---|---|
| Visual style (token values) | nothing | Tokens currently hold Toolcraft's values; the owner will customise them in `packages/tokens/src/theme.css`. Known issue to fix then: Button `link` variant fails WCAG AA contrast in dark theme (4.06 : 1). |
| Depth model (6.2) | P6 | Default candidate: Depth Anything V2 Small via transformers.js (WebGPU → WASM). |
| Export bundle format (8.1) | P8 | Default: zip of `metadata.json` + data PNGs; alternative single JSON with base64 PNGs. |

## Setting up a new machine

```bash
git clone git@github.com:minh1904/point-cloud.git
cd point-cloud
bun install
bun run dev          # http://localhost:3000
bun run storybook    # http://localhost:6006
bun run typecheck && bun run lint && bun run test   # all should pass (47 tests)
```

Requirements: Node.js ≥ 22 and Bun 1.3.14+. The repo pins `packageManager: bun@1.3.14` and uses Bun workspaces plus the text `bun.lock` lockfile.

## Things that will bite

- **Pinned versions** — React 19.2 (fiber 9.7 needs < 19.3), three 0.182 (r183 deprecates `THREE.Clock`, which fiber still uses), TypeScript 6.0 (typescript-eslint needs < 6.1). Don't bump these blindly.
- **Shaders** are `.glsl` files loaded through `raw-loader` (`apps/point-cloud/next.config.ts`). Turbopack's built-in `type: "raw"` has no default export and silently yields `undefined`.
- **Positions that only exist in the shader** need `frustumCulled={false}`. three.js derives the bounding sphere from the `position` attribute; with zeros that sphere has radius 0 and the whole draw call vanishes the moment the camera looks away from the origin — silently, no warning.
- **GLSL hash inputs must be middling in magnitude** (roughly 10–1000). Feed a hash a large integer such as `aIndex` and `fract()` runs out of float resolution; feed it a uv below 1 and the first `fract()` never wraps, so the "noise" degrades into a gradient. Hash texel coordinates (`aParticleUv * uTextureSize`).
- **R3F + React lint** — don't mutate values returned by `useMemo`/hooks; update uniforms through a material `ref` (see `scene/particle-field.tsx`).
- **First load in dev is slow** (Turbopack compiling drei/three); a black canvas for a few seconds is normal.
- **Hydration warning `bis_skin_checked`** in dev comes from a browser extension, not the app.
- **Windows:** stop the Next.js dev server before reinstalling dependencies; native `.node` files can remain locked while it is running.
- **ESLint/Prettier for `packages/*`** are not configured yet (only the Next app lints). A local Claude Code hook (`config-protection`) blocked creating those config files on the original machine.
- **`useTexture` (drei) returns a globally cached texture** — reconfiguring it trips `react-hooks/immutability` and would leak settings across views. Load data textures with `TextureLoader` and own them (see `scene/particle-field.tsx`).
- **FPS readings from a backgrounded tab are meaningless** — Chrome throttles `requestAnimationFrame` for hidden tabs to roughly zero. Check `document.visibilityState` before believing a low number.
- **Never write data PNGs through a canvas** — it premultiplies alpha and colour-manages, which silently corrupts coordinates. `scripts/png.ts` assembles the bytes directly. PNG *scanline filters* are a different thing and are lossless; without them the position maps are 7× larger.
- **Every data texture needs its colour space chosen deliberately** — `SRGBColorSpace` for `color.png`, `NoColorSpace` for the position maps. Decoding coordinates as colour bends them along a gamma curve and reports no error, which is why `configureDataTexture()` takes it as a required argument.
- **`THREE.ShaderChunk` is the only way to share GLSL between shaders** — GLSL has no imports and raw-loader yields a plain string. Register under a prefixed name (`pc_noise`); the registry is one global namespace shared with three's own 130-odd chunks, and TypeScript needs a cast to accept a new key.
- **Distance constants in shaders are tied to the scene's scale** — the near-camera wobble uses `smoothstep(3.2, 1.2, …)` because this cloud is 3 units wide. The UntilLabs equivalents (50, 20) are for a scene 244 units wide. Copying shader code between projects means converting them.
- **`react-hooks/immutability` decides where state lives, twice now.** A ref may only be mutated by the component that created it, so passing one down and writing to it in a child is an error. It also rejects mutating uniforms through an extracted local (`const u = material.current.uniforms`) while allowing the same write through `material.current.uniforms` directly.
- **Navigating to the same URL is not a reload.** Next.js serves a soft navigation and React keeps the existing canvas, so anything applied once at creation — camera position, `fov` — silently keeps its old value. Use `location.reload()` when testing initialisation.
- **The three studio breakpoints are `base` / `sm` / `lg`**, and the toolbar's `max-w` is hand-tuned against the rail's width (`calc(100% - 15.5rem)` at `sm`, `17.5rem` at `lg`). Changing `sm:w-56` or `lg:w-64` on the rail means changing those two numbers too, or the toolbar slides under the panels.
- **Windows display scaling lies about viewport width** — at 125% a 980px browser window is a 724px CSS viewport, so resizing to "768" to test the `md` breakpoint actually tests `sm`. Read the real width off the screenshot, not the window size.
- **Testing Base UI in jsdom** — query Slider inputs by label, not by role (Base UI hides the thumb until it measures layout, which jsdom never does).

## Local-only material (not in the repo)

For P3 (textures as data) the plan is to study the real UntilLabs data locally, **not** commit it. On the original machine it lived in a session scratchpad. To re-fetch on a new machine:

```
https://www.untillabs.com/particles-data/main-scene/metadata2.json
https://www.untillabs.com/particles-data/main-scene/position_h.png
https://www.untillabs.com/particles-data/main-scene/position_l.png
https://www.untillabs.com/particles-data/main-scene/color2.png
https://www.untillabs.com/particles-data/main-scene/density.png
https://www.untillabs.com/textures/LUT.png
```

The decoding formula and findings are in [research/01-untillabs-method.md](research/01-untillabs-method.md).
