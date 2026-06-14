# Contributing to @meld-ts/core

Thank you for your interest in contributing!

## Prerequisites

- [Bun](https://bun.sh/) >= 1.x
- TypeScript 6.x (via `@typescript/native-preview`)

## Setup

```bash
git clone https://github.com/meld-ts/core.git
cd core
bun install
```

## Development

```bash
bun run fmt        # format with Biome
bun run lint       # lint (warnings treated as errors)
bun run ts-check   # type-check with tsgo
bun run test       # run tests + coverage
bun run build      # build dist/ and browser/
```

## Submitting Changes

1. Fork the repository and create a branch from `main`
2. Make your changes, ensuring all checks pass:
   - `bun run lint` — no errors
   - `bun run ts-check` — no type errors
   - `bun run test` — all tests pass
3. Open a Pull Request with a clear description of what and why

## Code Style

- **Formatter**: Biome 2.x — 2-space indent, single quotes, 80-char line width, LF
- **Comments**: write *why*, not *what*; use JSDoc with `@example`
- **Types**: strict mode, no implicit `any`
- **No runtime dependencies** — this library has zero deps by design

## Adding Guards

Each guard type lives in its own file under `src/guards/` with a matching test file. Naming conventions:

- `isXxx` — type guard
- `notEmptyXxx` — non-empty guard
- `toXxx` — conversion

## Questions

Open a [Discussion](../../discussions) for questions, or an [Issue](../../issues) for bugs and feature requests.
