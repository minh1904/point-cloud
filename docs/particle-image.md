# `<ParticleImage>` — putting a cloud in your own project

_Step 8.6. The package lives at `packages/particle-image/`._

The studio is a large piece of software: a depth model, a worker, an
importance sampler, a schema, an inspector. **Showing** a cloud that has
already been made needs none of it — a loader, a material, and one draw call.

That is this component.

```tsx
import { Canvas } from "@react-three/fiber";
import { ParticleImage } from "@atelier/particle-image";

export function Hero() {
  return (
    <Canvas camera={{ position: [0, 0, 8], fov: 16 }}>
      <ParticleImage src="/particles/my-cloud" />
    </Canvas>
  );
}
```

## Getting a cloud to point at

1. Drop a photo into the studio and let it build.
2. Open the **Export** panel and press **Download .zip**.
3. Unzip it into your project's static directory:

```
public/particles/my-cloud/
├── metadata.json
├── color.png
├── position_h.png
├── position_l.png
└── params.json
```

4. Point `src` at that directory, without a trailing slash.

That is the whole integration. There is no import step and no conversion,
because the zip contains the format the renderer already reads — see
[`bundle-format.md`](bundle-format.md).

## Installing

The package has three peer dependencies and no dependencies of its own:

```
react ^19 · three >=0.170 · @react-three/fiber ^9
```

Copy `packages/particle-image/src/` into your project, or add the workspace if
you are inside this repo. Both work; the file is meant to be copyable, which
is why the shaders are embedded rather than imported.

## Props

| Prop | Default | What it does |
|---|---|---|
| `src` | — | Directory holding the bundle. Required. |
| `lut` | none | URL of a 512² colour-grade PNG. Without it the grade is off. |
| `useBundleParams` | `true` | Apply the look stored in the bundle's `params.json`. |
| `introSeconds` | `2.6` | Length of the reveal. `0` shows the cloud at once. |
| `onLoad` / `onError` | — | Called once per `src`. Inline arrows are fine. |

Every parameter of the look is also a prop — `size`, `softness`,
`densityBoost`, `noiseAmplitude`, `noiseFrequency`, `noiseScatter`, `breathe`,
`speed`, `focalDepth`, `focalRange`, `edgeBokeh`, `gradeIntensity`.

Precedence runs **props → `params.json` → defaults**, so you can export a look
and still override one number at the call site:

```tsx
<ParticleImage src="/particles/my-cloud" speed={0.3} edgeBokeh={0} />
```

## Things worth knowing

**The camera matters more than you would expect.** The cloud is three world
units wide with relief of a few percent, and it is designed to be shot through
a long lens — `fov: 16` with the camera eight units back. At `fov: 50` the
same cloud looks flat, because perspective is doing the work a telephoto was
hiding. This is the P5.6 decision, and it travels with the data.

**Point size follows the field of view automatically.** The component reads
`camera.fov` every frame, so a world-sized point covers the right number of
pixels at any focal length and any device pixel ratio.

**The colour grade is not in the bundle.** A baked LUT is a 512² PNG — a large
fraction of the bundle's total size for something recoverable from a name. If
you want the grade, copy the LUT PNG across too and pass `lut`.

**There is no post-processing.** Vignette, chromatic aberration and film grain
are a fullscreen pass in the studio (P2), not part of the cloud. Add your own,
or leave them out; the cloud stands up without them.

**`frustumCulled` is off, and has to be.** The real positions only exist inside
the vertex shader, so the bounding sphere three.js computes from the zeroed
`position` attribute has radius 0 — with culling on, the entire draw call
disappears the moment the camera looks away from the origin, silently.

## Keeping the shaders in step

`src/shaders.gen.ts` is generated and committed:

```bash
cd apps/point-cloud && bun run build:particle-image
```

It copies `src/shaders/*.glsl` into template literals and resolves the
`#include <pc_noise>` directives in place — the substitution `THREE.ShaderChunk`
normally does at runtime, done ahead of time instead.

Both halves of that matter for a component meant to be dropped into a project
you do not control: a consumer's bundler will not be configured to import
`.glsl`, and `ShaderChunk` will not have been populated by a module side effect
that only runs inside the studio.

Re-run it after changing a shader. Nothing will remind you.
