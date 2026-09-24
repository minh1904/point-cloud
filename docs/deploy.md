# Deploying the demo

_Step 9.4. The deploy itself is the owner's to run — this is everything that has to be true first._

## Running it

```bash
vercel                 # from the repo root, first time; it will ask questions
vercel --prod          # once the preview looks right
```

Or connect the GitHub repo in the Vercel dashboard and let it build on push.

Either way, **the answers Vercel needs** — it will not guess these correctly from a Bun monorepo:

| Setting | Value |
|---|---|
| Framework preset | Next.js |
| Root directory | `apps/point-cloud` |
| Install command | `bun install` (run from the repo root, so the workspace resolves) |
| Build command | `bun run build` |
| Node version | 22 or later |

The root directory is the part that bites. Set it to the repo root and Next is
not found; set it to the app without a workspace-aware install and
`@atelier/ui`, `@atelier/particle-image` and `@atelier/tokens` are all missing.

## What the browser fetches from somewhere else

This is the unusual part of deploying this app, and worth knowing before a
report arrives saying "it works locally".

| What | From | When |
|---|---|---|
| Model weights, ~28–50 MB | `huggingface.co` | the first time a photo is dropped |
| onnxruntime wasm | `cdn.jsdelivr.net` | same |
| Everything else | your own origin | always |

Two consequences:

- **A visitor who never drops a photo downloads none of it.** The library is
  imported dynamically inside the worker and the weights are fetched on
  demand, so the landing experience is the sample cloud and a few hundred
  kilobytes. That was a design decision at [P6.2](learn/p6-2-chon-model-depth.md),
  and it is what makes a public demo reasonable at all.
- **If you ever add a Content-Security-Policy, it has to allow both hosts.**
  There is none today, which is why this works untouched. A `connect-src`
  that forgets `huggingface.co` fails in exactly one place — depth estimation —
  and falls back silently to painter's cues, which looks like a model bug.

## COOP/COEP: the tempting header pair

`onnxruntime-web` runs multi-threaded WASM when `SharedArrayBuffer` is
available, which needs:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

It would make the WASM fallback path several times faster. It is **not** set
here, and the reason is worth stating: `require-corp` rejects every
cross-origin resource that does not send `Cross-Origin-Resource-Policy`, and
the two origins above are exactly that. Turning it on to speed up the fallback
would break the primary path.

WebGPU, which is the primary path, is unaffected either way.

## Caching

`next.config.ts` marks `/particles/*` and `/luts/*` as immutable for a year.
Safe because the filename is the version: a different cloud lives at a
different path. Replacing a bundle in place would be the mistake, not the
caching.

Everything else is Next's default, which on Vercel means the static shell is
on the CDN and there is no server work to speak of — the app has no API routes
and no server components that read anything.

## Before pushing the button

```bash
bun run typecheck && bun run lint && bun run test && bun run build
```

Then, on the preview URL:

1. The sample cloud renders, and the status bar reports a frame rate.
2. Drop a photo — the Depth panel shows progress and then `Depth Anything V2`.
   If it says `Painter's cues` instead, the model could not be reached.
3. Export a bundle and open it again.
4. `/embed` renders the sample through the drop-in component.
5. Open it on a phone: the inspector should be a bottom sheet, and the status
   bar should say `auto: low` or `auto: medium`.

Point 5 is the one that cannot be checked from a desktop browser window, and
it is the one most likely to be wrong.
