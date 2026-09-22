# Status & handoff

_Last updated: 2026-09-22 · last commit on `main`: `d4b77fe`_

Read this first when picking the project up on a new machine or in a new session. Plan: [roadmap.md](roadmap.md) · conventions: [`CLAUDE.md`](../CLAUDE.md) · learning notes (Vietnamese): [learn/](learn/README.md).

## Where we are

**P0 and P1 are complete; P2 is in progress.** The app renders 60,000 soft round points uniformly inside a sphere, drifting on the GPU, with a Panel of Sliders (size, softness, drift, speed), Play/Pause and an orbit camera with Reset view. P2.1 now renders that scene into a HalfFloat FBO, then copies the texture to the screen unchanged in a second draw call.

| Phase | Status |
|---|---|
| P0 Scaffold (monorepo, Next.js, Atelier tokens + Button, Storybook) | ✅ done |
| P1 Particle field (1.1 → 1.6) | ✅ done |
| P-UI Atelier | Button, Slider, Panel done · Section, PropertyRow, NumberField pending (pulled in by P2) |
| P2 FBO + post-processing | 2.1 done · ⏭ **2.2 next** |
| P3–P9 | not started |

## Next step: P2.2

Move the inline copy shader into dedicated fullscreen vertex/fragment shader files, then add a temporary colour-invert path as the sanity check that every pixel is passing through the post stage. Return the default output to an unchanged copy before finishing the step.

Per the project rules, P2.2 also needs a Vietnamese learning note and an entry in `docs/learn/README.md`.

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
bun run typecheck && bun run lint && bun run test   # all should pass (15 tests)
```

Requirements: Node.js ≥ 22 and Bun 1.3.14+. The repo pins `packageManager: bun@1.3.14` and uses Bun workspaces plus the text `bun.lock` lockfile.

## Things that will bite

- **Pinned versions** — React 19.2 (fiber 9.7 needs < 19.3), three 0.182 (r183 deprecates `THREE.Clock`, which fiber still uses), TypeScript 6.0 (typescript-eslint needs < 6.1). Don't bump these blindly.
- **Shaders** are `.glsl` files loaded through `raw-loader` (`apps/point-cloud/next.config.ts`). Turbopack's built-in `type: "raw"` has no default export and silently yields `undefined`.
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
