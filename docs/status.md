# Status & handoff

_Last updated: 2026-09-24 · last commit on `main`: `dad6de2`_

Read this first when picking the project up on a new machine or in a new session. Plan: [roadmap.md](roadmap.md) · conventions: [`CLAUDE.md`](../CLAUDE.md) · learning notes (Vietnamese): [learn/](learn/README.md).

## Where we are

**P0 through P9 are complete. The roadmap is finished.** A photo dropped into the app is decoded, given a depth map by Depth Anything V2 running in a worker, measured for detail, sampled into 65,536 blue-noise points, lifted into shallow relief and packed into the same three data textures the renderer has read since P3 — so it arrives with every P4 and P5 effect already on it. The post pipeline routes the scene through a HalfFloat FBO into a fullscreen quad with live controls for render scale (0.5–1×), vignette, chromatic aberration and animated film grain; point size stays invariant on screen across render scales, and the HUD reports two stable draw calls — three while the pointer simulation is live (9.1).

P3.1 replaced the CPU-generated sphere with a data-driven geometry: 256² = 65,536 particles whose `position` attribute is all zeros, each carrying `aParticleUv` (its texel centre) and `aIndex` instead. The vertex shader derives the position — currently a flat grid — and hashes its own per-point scale and randomness from the texel coordinate, so `aScale` / `aRandomness` are gone. `frustumCulled` is off, because a zeroed `position` gives three.js a bounding sphere of radius 0.

P3.2 gave that address something to point at, and 3.3-3.4 finished the job: the field renders entirely from a **bundle** under `public/particles/sample/` — `color.png`, `position_h.png`, `position_l.png` and `metadata.json`. Colour and position are both vertex texture fetches; positions are 16-bit values split across the two PNGs and mapped back onto the bundle's `bounds`. `ParticleField` takes a `bundleUrl` and nothing else about the data: hand it a different bundle and it renders that — and since 6.8 an in-memory bundle from a dropped photo takes precedence over the URL, through the same three textures.

3.5 added the CPU mirror of the shader decode (`src/bundle/position-codec.ts`) plus a dependency-free PNG reader/writer (`scripts/png.ts`) — together these are also the encoder half that P8.2 needs.

P5 dressed it as a photograph. A 16 degree telephoto (5.6) flattens perspective so a relief under 3% of the width reads as compressed rather than flat; fake DOF (5.3) shrinks and fades particles outside a depth slice instead of blurring the frame; edge bokeh (5.4) blows out and pushes apart the left and right margins; a baked 64³ LUT (5.2) carries the colour grade in a 512² PNG; and an intro (5.5) reveals 65,536 particles on their own timelines from a single `uProgress` float while the camera pushes in. 5.1 waited for P6.6 and is described with it below.

P4 replaced the placeholder `sin`/`cos` drift with curl noise built on value-noise fBM (`src/shaders/noise.glsl`, shared through a registered `ShaderChunk`). The offset is added in clip space and multiplied by `w`, so particles move the same distance on screen at any depth; a slow depth breathing and a near-camera wobble sit underneath it. All of it is stateless — the whole offset is recomputed from `uTime` every frame, which is why changing any parameter mid-flight needs no reset. Five knobs in a new **Motion** panel, plus a debug button that paints the fBM field onto the particles.

P6 is where the project stopped rebuilding the UntilLabs renderer and went past it. What 6.1-6.9 added, in the order the data flows:

`decode-image.ts` decodes a dropped file off the main thread and caps it at 1024px (6.1) · a **pipeline worker** runs Depth Anything V2 Small through transformers.js on WebGPU with a WASM fallback, reporting progress and cancellable by termination (6.2, 6.3) — with `heuristicDepth`, the painter's-cue estimator shared with `build-sample-bundle.ts`, running first so nothing waits on a 50 MB download · `importance.ts` measures detail three ways, luminance gradient, local contrast and depth gradient, each normalised alone and mixed on the main thread so four sliders stay live (6.4) · `sample-points.ts` places the points by Mitchell's best-candidate scored `d²·w`, which holds the density the map asked for instead of flattening it (6.5) · `density.ts` measures how crowded each point ended up, on an absolute log scale (6.6), and the shader grows the lonely ones — **that is 5.1, finally unblocked** · `lift.ts` gives them z from the depth map at 3% relief, bilinear for depth and nearest for colour (6.7) · `shuffle.ts` breaks the link between texel and place (6.9) · and `pack-bundle.ts` writes the three maps, with crowding riding in the colour map's alpha (6.8).

P7 turned it into a tool. A parameter is now **one entry in `src/params/schema.ts`** — the inspector builds its panels from the groups, the shader writes uniforms by walking the same list, presets serialise by key, and P8's export will read it too (7.2). Those values live outside React and the frame loop reads them with `getState()`, so dragging a slider re-renders that slider and nothing else; `Stage` takes one prop, a ref, and is memoised (7.3). Around them sit a toolbar, a docked inspector, a status bar (7.1), undo/redo that folds a whole drag into one step via Base UI's `onValueCommitted` (7.4), four built-in looks plus user presets in localStorage (7.5), a full-viewport view of every pipeline stage including where the points landed (7.6), and keyboard shortcuts with a sheet that lists them (7.7).

P8 got the cloud out of the tool. A bundle is **a `.zip` of exactly the folder the renderer already reads** — `metadata.json`, `color.png` with crowding in its alpha, the two position maps, and an optional `params.json` carrying the look (8.1, spec in [bundle-format.md](bundle-format.md)). Writing it needed PNG in the browser, so the P3.5 codec was split: structure in `src/bundle/png-codec.ts`, compression supplied by `node:zlib` in the script and `CompressionStream` in the page (8.2). Zip is written by hand, stored entries, no timestamps — so exporting the same cloud twice gives byte-identical files. The Export panel measures the real size rather than guessing it (8.3, 679 KB for 65,536 points), `metadata.json` is validated with zod and versioned (8.4), and a bundle can be dropped back in: export → import → the points stage hashes the same both times (8.5). Finally `@atelier/particle-image` renders a bundle in somebody else's project with no dependency on the studio, its shaders generated into template literals because a stranger's bundler will not import `.glsl` (8.6, docs in [particle-image.md](particle-image.md)).

P9 was the optional phase and it is done. **Pointer interaction** (9.1) is the one thing the original does not have, and the one stateful thing in the renderer: two half-float render targets take turns holding a per-particle *displacement*, so the P3 decode path is untouched and switching it off is adding zero. **Quality tiers** (9.2) cap `devicePixelRatio` — the lever that dominates, because a sprite's cost is its area — and inject the fBM octave count as a shader define. The viewport can be **saved as a PNG or recorded to webm** (9.3), grabbed inside the frame so no frame pays for `preserveDrawingBuffer`. And the **deploy is prepared** (9.4): cache headers plus [deploy.md](deploy.md), with the run itself left to the owner.

The three breakpoints survived the move: under `sm` the inspector is a sheet over the bottom of the viewport, from `sm` it docks as a 224px column and the canvas gives up the width, from `lg` it is 256px. The toolbar and status bar shorten their labels as the screen narrows. `studio.tsx` is gone; `src/app/shell/` replaced it.

| Phase | Status |
|---|---|
| P0 Scaffold (monorepo, Next.js, Atelier tokens + Button, Storybook) | ✅ done |
| P1 Particle field (1.1 → 1.6) | ✅ done |
| P-UI Atelier | Button, Slider (with `onValueCommitted`), Panel (collapsible), FileDrop, Kbd done · Section, PropertyRow, NumberField still pending |
| P2 FBO + post-processing | ✅ done (2.1–2.5) |
| P3 Textures as data | ✅ done (3.1–3.5) |
| P4 Motion (curl noise) | ✅ done (4.1–4.5) |
| P5 The look | ✅ done (5.2–5.6, and 5.1 via 6.6) |
| P6 Photo → point cloud | ✅ done (6.1–6.9) |
| P7 Design-tool UX | ✅ done (7.1–7.7) |
| P8 Export & import | ✅ done (8.1–8.6) |
| P9 Polish | ✅ done (9.1–9.4) · the deploy itself is unrun |

## Next step: whatever you want it to be

The roadmap is finished. A photograph goes in, a cloud comes out, it can be
pushed around with a pointer, exported, reopened, and dropped into somebody
else's project.

Two things are genuinely outstanding rather than merely unstarted:

**Decision 0.4, the visual style.** `packages/tokens/src/theme.css` still holds
Toolcraft's values. P7 built a real inspector to hang them on, so this is the
moment they would pay off. Known issue to fix alongside it: Button's `link`
variant fails WCAG AA contrast in dark theme (4.06 : 1).

**The deploy has not been run.** Everything it needs is in
[deploy.md](deploy.md) — the Vercel settings a Bun monorepo does not imply,
the two cross-origin hosts the model comes from, and why COOP/COEP must stay
off. Running `vercel` needs the owner's account.

### What P9 left behind

**The pointer force is 2D.** It pushes in x and y; the z of the displacement
is never written. On a cloud with 3% relief that is very nearly the whole
story, and making it 3D would mean deciding what "toward the camera" means for
a force measured on a plane.

**Nothing reads the displacement back.** The simulation writes a texture the
vertex shader reads, and the CPU never sees it — which is why it is fast and
also why an export cannot capture "the cloud as it looks right now, pushed
aside". `gl.readRenderTargetPixels` would do it at the cost of a pipeline
stall.

**Quality tiers are a guess made once.** They do not adapt, on purpose (a
picture that changes under you is worse than one that is slightly too
expensive), but that means a device that thermally throttles after two minutes
gets no help.

### What P8 left behind

**`shaders.gen.ts` goes stale silently.** It is generated and committed so the
package can be copied out of the repo and just work; the cost is that changing
a shader without running `bun run build:particle-image` leaves the drop-in
component rendering the old one. Nothing will warn you.

**The component duplicates a little of the app** — `createGrid`, the parameter
defaults. Deliberate: a file meant to be copied into a stranger's project
should not import from a studio they do not have. It does mean two places to
update if the grid addressing ever changes.

**Shuffling costs compression.** `position_h.png` should compress far better
than `position_l.png` and does not — 209 KB against 214 KB — because 6.9
shuffles point order, so texel neighbours are unrelated points and PNG's
scanline filters have nothing to work with. The trade is worth it (the intro
would otherwise arrive in bands) but it is a real cost nobody priced at 6.9.

**No LUT travels with a bundle.** `params.json` names the grade; the PNG is a
separate ~500 KB. `<ParticleImage>` takes a `lut` prop for it.

### What P7 left behind

**`@atelier/params` and `@atelier/shell` do not exist.** The schema, the stores and the shell were built in the app (`src/params/`, `src/app/shell/`) under P-UI's own rule — built in the app first, extracted when a second consumer appears. P8.6's drop-in `<ParticleImage>` component may be that consumer.

**The help sheet's shortcut list is written by hand**, separately from the handler in `use-shortcuts.ts`. Deliberate — encoding modifiers, `preventDefault` and the typing guard as data would cost more than it saves at two consumers — but it is a duplication, and adding a shortcut means touching both.

**`Section`, `PropertyRow` and `NumberField` are still pending** from P1-P2. The inspector wants a numeric entry field more now that it is schema-driven: a slider cannot express "exactly 0.019".

### What P6 left behind

**The sample bundle's depth is still a heuristic** — `scripts/build-sample-bundle.ts` has no browser, so it calls the same `heuristicDepth` the app uses while the model loads. That is now a documented fallback rather than a placeholder: drop `color.png` into the running app and it gets Depth Anything V2. Regenerate any time with `bun run build:sample` from `apps/point-cloud`.

**Points at the frame border read as sparser than they are.** They have neighbours on one side only, so their k-th nearest distance is larger and 6.6 calls them lonely — which the exponential in the shader then amplifies. Correcting it properly means weighting by the fraction of the radius-d disc that falls inside the image. Small, visible only at the extreme edges, and untouched.

**`aIndex` is half-unblocked.** Shuffling (6.9) removed the first objection — the ordinal is no longer spatially meaningful, which is what a seed needs. The second stands: hashing a five-digit integer exhausts float precision, so the shader still hashes texel coordinates. It remains 256 KB of unread buffer, and is still worth removing unless something finds a use for it.

**The model needs the network on first use.** transformers.js points onnxruntime's wasm at the jsdelivr CDN by default, and the weights come from Hugging Face. Offline, the model path fails and the app falls back to painter's cues with the reason shown in the Depth panel — which is the designed behaviour, not a bug, but worth knowing before debugging it.

## Open decisions

| Decision | Blocks | Notes |
|---|---|---|
| Visual style (token values) | nothing | Tokens currently hold Toolcraft's values; the owner will customise them in `packages/tokens/src/theme.css`. Known issue to fix then: Button `link` variant fails WCAG AA contrast in dark theme (4.06 : 1). |
| ~~Depth model (6.2)~~ | — | **Decided**: Depth Anything V2 Small via transformers.js, WebGPU/fp16 (49.6 MB) falling back to WASM/q8 (27.3 MB), with `heuristicDepth` underneath it. Reasoning in `src/photo/depth/model-depth.ts`. |
| ~~Export bundle format (8.1)~~ | — | **Decided**: a `.zip` of the folder the renderer already reads. Spec in [bundle-format.md](bundle-format.md). |

## Setting up a new machine

```bash
git clone git@github.com:minh1904/point-cloud.git
cd point-cloud
bun install
bun run dev          # http://localhost:3000
bun run storybook    # http://localhost:6006
bun run typecheck && bun run lint && bun run test   # all should pass (201 tests)
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
- **R3F does not mount its scene while the tab is hidden.** `ResizeObserver` callbacks are not delivered in a hidden document, so the canvas stays at its default 300×150 and R3F never creates the root — meaning nothing inside `<Canvas>` mounts, no bundle loads, and the viewport is black. This is broader than the fps note below: while a tab is hidden, *nothing in the scene can be verified at all*.
- **A `React.lazy` boundary inside `<Canvas>` suspends the whole subtree.** `next/dynamic` is built on it, so loading anything with `dynamic()` from inside the R3F tree stops everything under it from mounting. Put the lazy boundary outside the canvas, as `app-shell.tsx` does.
- **An API that takes a callback must tolerate an inline arrow.** Listing `onLoad` in an effect's dependency array turned `<ParticleImage>` into a fetch loop — 36 requests for 4 files. Hold callbacks in a ref.
- **Re-run `bun run build:particle-image` after changing a shader**, or the drop-in component keeps rendering the previous one.
- **R3F's `state.pointer` is (0, 0) unless something in the scene registers a pointer handler.** R3F skips raycasting when nothing is interactive, and skipping the raycast means never updating the pointer — so it silently reads as the centre of the screen. Anything that needs the cursor in this scene must measure it from `getBoundingClientRect()` itself.
- **A flag set by a one-shot event is a trap.** The pointer simulation tracked "is the cursor over the canvas" with `pointerenter`, and `pointerup` cleared it — so one camera drag killed the effect until the cursor left the canvas and came back. Anything that can be cleared needs a source of truth that re-asserts itself, which for a pointer is `pointermove`.
- **An effect keyed on the data falls out of step when the thing that *receives* the data is replaced.** Changing a shader define recreates the material; an effect keyed on `bundle` did not re-run, so the new material kept bounds of (0,0,0) and all 65,536 particles decoded to one point. Bundle uniforms are written in the frame loop for that reason.
- **A `sampler2D` left at `null` reads as WHITE, not as zero.** three.js substitutes a default texture. Anything that samples an optional texture needs a 1×1 zero texture as its initial value, or the first frame is wrong in a spectacular way.
- **`toBlob()` on a WebGL canvas returns a blank image** unless it is called inside the frame that drew it, because `preserveDrawingBuffer` is off. Capture at a `useFrame` priority after the screen render.
- **COOP/COEP would break the depth model.** `require-corp` rejects cross-origin resources without CORP, and both the weights and the wasm are cross-origin. See `docs/deploy.md`.
- **Parameters do not go through React.** `readParams()` in a `useFrame` reads the store without subscribing; a slider re-renders itself and nothing else. Adding `useParamsStore((s) => s.values)` anywhere in the shell would quietly undo P7.3 — if the canvas starts re-rendering, look there first.
- **`min-h-0` is what makes the shell scroll.** A flex item defaults to `min-height: auto` and refuses to shrink below its content, so without it the inspector's content pushes the status bar off screen and `overflow-y-auto` never engages.
- **`react-hooks/immutability` rejects writing uniforms through an extracted local** but allows the same write through `material.current.uniforms` directly. Known since P4; the better escape is usually to move the write into the frame loop rather than to work around the rule.
- **Anything in `localStorage` was written by an older build**, so it is parsed defensively and run through `sanitiseValues`. Reading it during render would break hydration — the server has none — so it happens in an effect after the first paint.
- **Restoring saved values must not be an undoable step.** It writes with `setState` rather than `setAll`, or Ctrl+Z right after opening the app jumps to defaults.
- **Transferring an `ArrayBuffer` to a worker detaches it on the sender.** The photo buffer is sent by structured clone on purpose, because the preview still draws it; only results coming *back* are transferred. Getting this backwards gives you an empty array on the second read and no error at all.
- **Inference cannot be interrupted, so Cancel terminates the worker.** A `postMessage` would queue behind the very computation you are trying to escape. The next run rebuilds the pipeline from the browser cache in a second or two.
- **`Uint8ClampedArray` is not `Uint8ClampedArray<ArrayBuffer>`** to TypeScript 5.7+. `new ImageData(...)` and the transfer list both want the narrow one; `RgbaBytes` in `decode-image.ts` is the alias.
- **Alpha does not go through the sRGB transfer curve**, which is why per-point crowding rides there (6.6). It also means a bundle whose colour map has no alpha reads 1.0 and is left alone — the backward-compatibility that makes the sample bundle still render identically.
- **A `DataTexture` is not flipped on upload; an image is.** The file path sets `flipY = false` to *undo* three.js's flip, and the data path must leave it alone. Setting it on a DataTexture turns the cloud upside down.
- **The app's tests need `apps/point-cloud/vitest.config.mts`** to resolve the `@/` alias — and `.mts`, not `.ts`, because the app's `package.json` has no `"type": "module"` and vite warns.
- **Never validate an image filter on a 256px test image.** Texture terms and shuffle artefacts both vanish when there are as many points as pixels. `scripts/` has no upscaler; make one in a scratchpad when checking these.
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
