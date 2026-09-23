# Bundle format v1

_Decision 8.1. Written 2026-09-24._

A **bundle** is everything needed to render one point cloud: where the points are, what colour they are, how crowded, and — optionally — the look that was applied to them.

## The decision

**A `.zip` holding exactly the folder the renderer already reads.**

```
my-cloud.zip
├── metadata.json     what the numbers mean
├── color.png         RGB colour per point · A carries crowding
├── position_h.png    high byte of each 16-bit coordinate
├── position_l.png    low byte
└── params.json       the look (optional)
```

### Why a zip, and not a single JSON with base64 PNGs

The alternative was one `.json` file with the PNGs base64-encoded inside it — smaller to implement, paste-able into a chat window, no archive format to write.

The zip won on one argument that outweighs the rest:

> **Unzip it into `public/particles/my-cloud/` and the existing loader reads it with no code at all.**

`useParticleBundle(baseUrl)` has fetched exactly these four names from exactly this layout since P3.4. An exported bundle is not a new format that needs an importer — it is *the* format, in a wrapper. That is what makes step 8.6's drop-in component a twenty-line file instead of a parser.

The supporting arguments:

| | zip of files | single JSON |
|---|---|---|
| Size | PNG bytes as-is | **+33%** from base64 |
| Usable without our code | yes, it is four ordinary files | no |
| Inspectable | open the PNGs in any viewer | no |
| Paste-able as text | no | yes |

Base64's 33% penalty is not academic here: a 65,536-point bundle is around 400 KB, so the JSON version would be over half a megabyte to carry the same data.

### Why the zip entries are *stored*, not deflated

Zip supports compression method `0` (stored) and `8` (deflate). Bundles are written with **stored**.

PNG already deflates its own pixel data. Deflating an already-deflated stream saves essentially nothing and costs the time twice. `metadata.json` and `params.json` are under a kilobyte together.

Reading accepts both, because a bundle that has been through a normal zip tool will come back deflated.

## The files

### `metadata.json`

```jsonc
{
  "version": 1,
  "width": 256,           // data texture side, in texels
  "height": 256,          // always equal to width; one particle per texel
  "particleCount": 65536, // must equal width * height
  "precision": 16,        // bits per coordinate, split across the two PNGs
  "bounds": {
    "min": [-1.494, -0.996, -0.045],
    "max": [1.494, 0.996, 0.045]
  },
  "depth": { "kind": "depth-anything-v2-small", "relief": 0.09 },
  "source": { "image": "upload", "aspect": 1.5 }
}
```

`bounds` is what turns the PNGs' 0…1 values back into world coordinates, and keeping it out here rather than baked into the pixels is what makes the format compact *and* precise: all 65,536 levels are spent on the range this particular cloud occupies. See [P3.4](learn/p3-4-bounds-va-metadata.md).

`version` is the promise that old exports keep loading. The importer validates against a schema and reports which field was wrong, rather than rendering a cloud of NaNs.

### `color.png` — RGBA, 8 bits per channel

RGB is the colour sampled from the photograph, sRGB-encoded.

**Alpha is the crowding** from P6.6 — 0 for the loneliest point, 255 for the most tightly packed. It rides there because alpha is the one channel the sRGB transfer function leaves alone, and because a colour map *without* alpha reads back as 1.0 everywhere, which means "densest", which leaves point size untouched. Every bundle written before crowding existed keeps rendering identically.

The roadmap's original sketch had a separate `density.png`. It is not needed.

### `position_h.png` / `position_l.png` — RGBA, 8 bits per channel

One coordinate split across two bytes: `value = (high * 256 + low) / 65535`, then mapped onto `bounds`. Channel 0 is x, 1 is y, 2 is z. Alpha is written as 255 and never read.

The divisor is **65535, not 65536** — two bytes span 0…65535 inclusive, so 65535 is the value that must land on 1.0. See [P3.3](learn/p3-3-16-bit-positions.md).

### `params.json` — the look, optional

A flat map of the P7 parameter keys to their values:

```jsonc
{ "size": 0.019, "softness": 0.5, "fov": 16, "grade": "warm", … }
```

Unknown keys are dropped and missing ones filled from the schema's defaults, so a `params.json` written today keeps loading after the schema grows. A bundle without this file renders at the current settings.

## Rules that are not negotiable

1. **Data PNGs must never go through a canvas.** A canvas premultiplies alpha and colour-manages what it draws, which is invisible on a photograph and fatal on a buffer of coordinates. The bytes are assembled directly, in `src/bundle/png-codec.ts`.
2. **Alpha in the position maps is 255.** Not because anything reads it, but because a zero alpha invites a well-meaning tool to "optimise" the RGB underneath it.
3. **The texture must be square and completely filled.** The renderer draws one vertex per texel; a short cloud leaves texels holding whatever the buffer was initialised with — points at the origin, in black, with no warning.

## Future versions

The version number exists so this section can stay short. When it changes:

- The importer keeps accepting v1 and converts.
- `docs/bundle-format.md` grows a section, it does not get rewritten.
- The exporter only ever writes the newest version.
