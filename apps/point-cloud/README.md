# point-cloud (app)

The Next.js app of the [point-cloud](../../README.md) monorepo: the particle tool itself.

```bash
# from the repository root
bun run dev          # http://localhost:3000
```

| Path | Contents |
|---|---|
| `src/app/` | Root layout (Inter font, tokens), page, `Studio` shell with the controls panel |
| `src/scene/` | R3F scene: `Stage` (canvas), `ParticleField`, off-screen `ScenePass`, point generators, render stats |
| `src/shaders/` | GLSL shaders, imported as strings via the `*.glsl` rule in `next.config.ts` |

The canvas is loaded client-only (`next/dynamic` with `ssr: false`) because WebGL has nothing to render on the server.

See the [roadmap](../../docs/roadmap.md) for what is built so far and what comes next.
