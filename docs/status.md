# Status & handoff

_Last updated: 2026-09-23 · last commit on `main`: `5f62871`_

Read this first when picking the project up on a new machine or in a new session. Plan: [roadmap.md](roadmap.md) · conventions: [`CLAUDE.md`](../CLAUDE.md) · learning notes (Vietnamese): [learn/](learn/README.md).

## Where we are

**P0 through P4 are complete; P5 is next.** The post pipeline routes the scene through a HalfFloat FBO into a fullscreen quad with live controls for render scale (0.5–1×), vignette, chromatic aberration and animated film grain; point size stays invariant on screen across render scales and the HUD reports two stable draw calls.

P3.1 replaced the CPU-generated sphere with a data-driven geometry: 256² = 65,536 particles whose `position` attribute is all zeros, each carrying `aParticleUv` (its texel centre) and `aIndex` instead. The vertex shader derives the position — currently a flat grid — and hashes its own per-point scale and randomness from the texel coordinate, so `aScale` / `aRandomness` are gone. `frustumCulled` is off, because a zeroed `position` gives three.js a bounding sphere of radius 0.

P3.2 gave that address something to point at, and 3.3-3.4 finished the job: the field renders entirely from a **bundle** under `public/particles/sample/` — `color.png`, `position_h.png`, `position_l.png` and `metadata.json`. Colour and position are both vertex texture fetches; positions are 16-bit values split across the two PNGs and mapped back onto the bundle's `bounds`. `ParticleField` now takes a `bundleUrl` and nothing else about the data: hand it a different bundle and it renders that, which is exactly the seam P6 writes into.

3.5 added the CPU mirror of the shader decode (`src/bundle/position-codec.ts`) plus a dependency-free PNG reader/writer (`scripts/png.ts`) — together these are also the encoder half that P8.2 needs. 43 tests.

P4 replaced the placeholder `sin`/`cos` drift with curl noise built on value-noise fBM (`src/shaders/noise.glsl`, shared through a registered `ShaderChunk`). The offset is added in clip space and multiplied by `w`, so particles move the same distance on screen at any depth; a slow depth breathing and a near-camera wobble sit underneath it. All of it is stateless — the whole offset is recomputed from `uTime` every frame, which is why changing any parameter mid-flight needs no reset. Five knobs in a new **Motion** panel, plus a debug button that paints the fBM field onto the particles.

| Phase | Status |
|---|---|
| P0 Scaffold (monorepo, Next.js, Atelier tokens + Button, Storybook) | ✅ done |
| P1 Particle field (1.1 → 1.6) | ✅ done |
| P-UI Atelier | Button, Slider, Panel done · Section, PropertyRow, NumberField pending (pulled in by P2) |
| P2 FBO + post-processing | ✅ done (2.1–2.5) |
| P3 Textures as data | ✅ done (3.1–3.5) |
| P4 Motion (curl noise) | ✅ done (4.1–4.5) |
| P5 The look | ⏭ **5.1 next** |
| P6–P9 | not started |

## Next step: P5.1

Density-driven point size: sparse areas get bigger points so the background never shows holes. Done when the background grass looks continuous.

**5.1 needs data the bundle does not carry yet.** The original ships a `density.png` (local point density, normalised against a `densityRange` in metadata — see [research §2.2](research/01-untillabs-method.md)), and ours has no density map because the particles sit on a regular grid where density is uniform by construction. Two ways round it: compute a density map in `scripts/build-sample-bundle.ts` and add it to the bundle, or skip 5.1 until P6.6 generates real density from an importance-sampled cloud. The second is more honest; the first is a good rehearsal for it.

5.2 needs a LUT PNG. 5.3, 5.4, 5.5 and 5.6 need nothing new and can be done in any order.

Per the project rules, every step also needs a Vietnamese learning note and an entry in `docs/learn/README.md`.

### Still outstanding from P3

**The sample bundle's depth is a placeholder, not a measurement.** `scripts/build-sample-bundle.ts` derives it from two painter's cues in the photo itself (atmospheric perspective + ground plane) because decision 6.2 — which depth model — is still open. The decode path, bounds, codec and tests are all real and verified; only the depth numbers are a stand-in. P6.3 replaces them by writing the same format, with no renderer change. Regenerate any time with `bun run build:sample` from `apps/point-cloud`.

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
bun run typecheck && bun run lint && bun run test   # all should pass (43 tests)
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
