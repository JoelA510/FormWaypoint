---
trigger: always_on
---

# Engineering Standards (FormWaypoint)

## Tooling
- **Package manager**: npm. A single root `package-lock.json` is the only lockfile.
- **Gate**: `npm run check` — typecheck, lint, tests, production build. CI runs exactly this.
- **Strictness**: no `any`, no `// @ts-ignore` without rigorous justification.

## Application
- **Framework**: React 19 + Vite, TypeScript throughout.
- **Styling**: Tailwind v4, configured CSS-first via `@theme` in `src/styles/globals.css`.
  Style through tokens so light and dark are handled in one place.
- **Components**: native semantic elements where they suffice; keyboard and screen-reader
  behaviour is a bar, not a nicety.
- **PDF**: `pdfjs-dist` to read, `pdf-lib` to fill. No OCR — the source documents have a
  real text layer.
- **State**: plain React state. There is no server state to cache.

## Testing
- **Runner**: Vitest, in `node` environment (the domain layer has no DOM dependency).
- **Regression fixtures**: real shipments in `src/test/fixtures`, with expectations taken
  from the SLIs that were actually filed for them. If a change breaks one, the change is
  wrong until proven otherwise.
- **Cover the silent failures.** A wrong form that looks complete is the worst outcome this
  tool can produce, so guard tests exist for blank profiles, unreadable totals,
  double-claimed lines and impossible dates.

## Git & workflow
- **Commits**: Conventional Commits (feat, fix, chore).
- **Branching**: feature branches off main.
