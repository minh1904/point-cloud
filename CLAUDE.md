# point-cloud

## Commits

Follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) with the type set from `@commitlint/config-conventional`. Write commit messages in English.

```
<type>(<scope>)!: <description>

[body — why the change was made, not what changed]

[footer(s)]
```

**Types** (lowercase):

| type | Use for |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `perf` | A performance improvement with no behaviour change |
| `refactor` | Restructuring that neither adds a feature nor fixes a bug |
| `style` | Formatting, whitespace, semicolons (not visual/CSS changes — those are `feat`/`fix`) |
| `test` | Adding or correcting tests |
| `docs` | Documentation only |
| `build` | Build system or dependencies (vite, npm) |
| `ci` | CI configuration |
| `chore` | Other changes that don't touch `src` or tests |
| `revert` | Reverting a previous commit |

**Scope** (optional, a noun naming part of the codebase): `depth`, `particles`, `render`, `post`, `ui`, `data`, `shader`, `research`. Add new scopes as modules appear.

**Description:**
- Imperative mood ("add", "fix", "remove" — not "added"/"adds"), lowercase first letter, no trailing period.
- Header (the whole first line) at most 72 characters. commitlint allows 100; 72 reads better on GitHub and in terminals.
- Body and footer lines at most 100 characters, each separated from the previous section by a blank line.

**Breaking changes:** add `!` before the `:`, and/or a footer `BREAKING CHANGE: <description>` (uppercase).

**Rules:**
- One logical change per commit. If a change fits two types, split it into two commits.
- Never add `Co-Authored-By: Claude` or "Generated with Claude Code".

Examples:

```
feat(particles): decode 16-bit positions from hi/lo textures
fix(render): keep point size stable when dpr changes
perf(shader): drop curl-noise fbm from 5 to 4 octaves
docs(research): analyse the UntilLabs particle method
refactor(depth)!: return Float32Array instead of ImageData

BREAKING CHANGE: depth-client no longer returns ImageData.
```
