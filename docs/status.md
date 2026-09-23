# Status & handoff

_Last updated: 2026-09-23 · last commit on `main`: `a81f303`_

Read this first when picking the project up on a new machine or in a new session. Plan: [roadmap.md](roadmap.md) · conventions: [`CLAUDE.md`](../CLAUDE.md) · learning notes (Vietnamese): [learn/](learn/README.md).

## Where we are

**P0, P1 and P2 are complete; P3 is under way (3.1 done, 3.2 next).** The post pipeline routes the scene through a HalfFloat FBO into a fullscreen quad with live controls for render scale (0.5–1×), vignette, chromatic aberration and animated film grain; point size stays invariant on screen across render scales and the HUD reports two stable draw calls.

P3.1 replaced the CPU-generated sphere with a data-driven geometry: 256² = 65,536 particles whose `position` attribute is all zeros, each carrying `aParticleUv` (its texel centre) and `aIndex` instead. The vertex shader derives the position — currently a flat grid — and hashes its own per-point scale and randomness from the texel coordinate, so `aScale` / `aRandomness` are gone. `frustumCulled` is off, because a zeroed `position` gives three.js a bounding sphere of radius 0.

| Phase | Status |
|---|---|
| P0 Scaffold (monorepo, Next.js, Atelier tokens + Button, Storybook) | ✅ done |
| P1 Particle field (1.1 → 1.6) | ✅ done |
| P-UI Atelier | Button, Slider, Panel done · Section, PropertyRow, NumberField pending (pulled in by P2) |
| P2 FBO + post-processing | ✅ done (2.1–2.5) |
| P3 Textures as data | 3.1 ✅ · ⏭ **3.2 next** |
| P4–P9 | not started |

## Next step: P3.2

Load `color.png` and sample it at `aParticleUv` in the vertex shader, so each point's colour comes from its own texel instead of the single `uColor` uniform. The lesson is texture setup for *data* rather than imagery: `NearestFilter`, no mipmaps, `flipY = false`, `NoColorSpace`. Done when colours appear across the flat grid P3.1 laid out.

Positions stay on the grid until 3.3 — 3.2 adds a colour fetch beside the existing `home` line in `apps/point-cloud/src/shaders/points.vert.glsl` and a `vColor` varying through to the fragment shader.

Per the project rules, every step also needs a Vietnamese learning note and an entry in `docs/learn/README.md`.

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
bun run typecheck && bun run lint && bun run test   # all should pass (24 tests)
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
