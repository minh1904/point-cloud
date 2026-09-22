# point-cloud

Turn a photo into a living particle field in the browser — and export it as a lightweight bundle you can drop into a real project.

Inspired by the particle hero of [UntilLabs](https://www.untillabs.com/) ([Codrops write-up](https://tympanus.net/codrops/2025/12/10/simulating-life-in-the-browser-creating-a-living-particle-system-for-the-untillabs-website/)), rebuilt from first principles as a design-tool-style demo:

1. **Upload any photo** → depth estimation in the browser → an importance-sampled point cloud.
2. **Tweak it like a design tool** — inspector panel, presets, undo/redo, live preview.
3. **Export** metadata JSON + data textures and load them in another app with a small drop-in component.

> **Status:** early. The particle renderer is being built step by step — **P1 is complete** in the [roadmap](docs/roadmap.md): 60k GPU-drifting soft points in one draw call, live controls and an orbit camera. Photo upload, depth and export come in later phases.

## Stack

| Area | Choice |
|---|---|
| App | [Next.js 16](https://nextjs.org) (App Router, Turbopack), React 19.2, TypeScript |
| 3D | [three.js](https://threejs.org) + [React Three Fiber](https://r3f.docs.pmnd.rs) + drei, hand-written GLSL shaders |
| UI | **Atelier** — our own component kit on [Base UI](https://base-ui.com) + [Tailwind CSS v4](https://tailwindcss.com), documented in [Storybook](https://storybook.js.org) |
| State | Zustand (from P7) |
| Tooling | Bun workspaces, Vitest, ESLint, Prettier |

## Repository layout

```
apps/
  point-cloud/          Next.js app — the particle tool
    src/app/            page, layout, studio shell
    src/scene/          R3F scene: canvas, particle field, render stats
    src/shaders/        GLSL vertex/fragment shaders (imported as strings)
packages/
  tokens/               @atelier/tokens — design tokens (CSS variables + Tailwind @theme)
  ui/                   @atelier/ui — Button, Slider, Panel… with stories and tests
docs/
  roadmap.md            the plan, phase by phase, with "done when" checks
  research/             analysis of the UntilLabs technique (decoded shaders and data)
  learn/                step-by-step learning notes (Vietnamese)
```

## Getting started

Requirements: **Node.js ≥ 22** and **Bun 1.3.14+**.

```bash
bun install
bun run dev            # app on http://localhost:3000
bun run storybook      # Atelier components on http://localhost:6006
```

## Scripts

Run from the repository root.

| Command | What it does |
|---|---|
| `bun run dev` | Start the Next.js dev server |
| `bun run build` | Production build of every package that has one |
| `bun run start` | Serve the production build of the app |
| `bun run storybook` | Start Storybook for `@atelier/ui` |
| `bun run build-storybook` | Build the static Storybook |
| `bun run typecheck` | TypeScript across all packages |
| `bun run lint` | ESLint across all packages |
| `bun run test` / `bun run test:watch` | Vitest across all projects |
| `bun run format` / `bun run format:check` | Prettier |

## Documentation

- **[Status & handoff](docs/status.md)** — what is done, what is next, open decisions, setup and known gotchas. Start here.
- **[Roadmap](docs/roadmap.md)** — phases P0–P9, each split into small steps with what they teach and how to verify them.
- **[Research: the UntilLabs method](docs/research/01-untillabs-method.md)** — what the article says versus what the production shaders and data actually do. *(Vietnamese)*
- **[Learning notes](docs/learn/README.md)** — one note per roadmap step: concepts, a walk through the real code, mistakes made, exercises, further reading. *(Vietnamese)*

## Conventions

- Commits follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) — see [`CLAUDE.md`](CLAUDE.md) for types, scopes and rules.
- Every Atelier component ships with a story next to it; every roadmap step ships with a learning note.

## Notes

- **React is pinned to 19.2** because `@react-three/fiber` 9.7 does not support 19.3 yet.
- **three.js is pinned to 0.182** because r183 deprecated `THREE.Clock`, which fiber 9.7 still uses (a warning on every load otherwise).
- **Shaders** are plain `.glsl` files imported as strings through `raw-loader` (see `apps/point-cloud/next.config.ts`).
- A hydration warning mentioning `bis_skin_checked` in dev comes from a browser extension, not from the app.
