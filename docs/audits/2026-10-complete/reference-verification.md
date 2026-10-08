# Reference verification

**References verified as of 2026-10-08.**

Staleness rule: a reference is STALE if its last commit is more than 9 months old, **or** it
targets a framework one major behind current at time of execution. Stale references may still
supply architectural ideas (boundaries, naming, test strategy) but never dependency versions,
config files, or API usage verbatim.

No reference repository from `prompts/existing-project.md` fits this stack, so none was
consulted and none has a row. FormWaypoint is a Vite + React single-page app with no backend,
wrapped in a Tauri 2 shell for Windows. The listed references are Next.js, React Native, Python,
.NET and NestJS starters, and borrowing structure from them would be the unfit reference the
prompt warns against.

## Yardsticks when no reference fits

Each was read on 2026-10-08 through a web page summary (executed, not fully validated).

- **Tauri v2 updater plugin** (v2.tauri.app/plugin/updater, page updated 2025-11-28). Update
  signing is mandatory and can't be disabled; "if you lose this key you will NOT be able to
  publish new updates to the users that have the app already installed"; the key is supplied
  at build time through `TAURI_SIGNING_PRIVATE_KEY` (and `_PASSWORD`), never a `.env` file;
  endpoints must be HTTPS; a static `latest.json` (for example on GitHub Releases) is supported;
  the plugin needs Rust 1.90 or later (this repo's `Cargo.toml` declares `rust-version = "1.77"`).
- **Tauri v2 Windows code signing** (v2.tauri.app/distribute/sign/windows, updated
  2026-09-11). OV certificates, Azure Key Vault, Azure Artifact Signing (formerly Trusted
  Signing), or any tool through `bundle > windows > signCommand`. Since 2024 an EV certificate
  no longer buys immediate SmartScreen reputation; reputation builds per certificate either way.
- **Azure Artifact Signing eligibility and cost** (Microsoft Learn "code signing options", via
  web search). Individuals in the USA and Canada only; about $9.99 a month. The pricing page's
  amounts didn't render, so the cost is unverified.
- **SignPath Foundation** (signpath.org/terms, via web search). Free signing for open-source
  projects: an OSI license (this repo is MIT and public), a fully automated build from the
  repository with origin verification, a code signing policy on the project's page, and the
  certificate issued to SignPath Foundation as publisher. Terms are marked as changing; check
  signpath.org/apply before relying on it.
- **ESLint version support** (eslint.org/version-support). "ESLint v9.x reached end-of-life on
  2026-08-06"; v10 is current. This repo locks eslint 9.39.5.
- **pdf.js security advisories** (github.com/mozilla/pdf.js/security/advisories).
  GHSA-hq66-cqwq-w95j (CVE-2026-16633, 2026-07-28) affects `pdfjs-dist` >= 5.6.83 and is fixed
  in 6.2.108; GHSA-wgrm-67xf-hhpq (CVE-2024-4367) was fixed in 4.2.67. The locked 4.10.38 is in
  neither range. It is two majors behind the current 6.4.299 (npm registry, executed).
- **Current majors from the npm registry** (executed): vite 8.3.4, react 19.3.0, @tauri-apps/cli
  2.12.1, typescript 7.0.2, eslint 10.12.0, pdfjs-dist 6.4.299. Locked here: vite 8.1.5, react
  19.2.8, @tauri-apps/cli 2.11.4, typescript 5.9.3, eslint 9.39.5, pdfjs-dist 4.10.38; Rust
  `tauri` 2.11.5 (Cargo.lock).
- **The repository's own stated rules**: `.agent/rules/*` and the conventions in `README.md`,
  `roadmap.md` and the CI workflow comments. There is no AGENTS.md, CLAUDE.md, CONTRIBUTING.md
  or ADR directory.

## Skipped

- t3-oss/create-t3-app, vercel/next-forge, ixartz/Next-js-Boilerplate, epicweb-dev/epic-stack:
  Next.js or Remix full-stack apps with servers, auth and databases; this app has none.
- obytes/react-native-template-obytes, infinitered/ignite: no mobile surface.
- fastapi/full-stack-fastapi-template, vintasoftware/nextjs-fastapi-template: no Python API.
- ardalis/CleanArchitecture, jasontaylordev/CleanArchitecture: no .NET.
- awesome-nestjs: no NestJS.
- vercel/turborepo examples: not a monorepo.
- gothinkster/realworld: idiom comparison only, and no comparable app.

## Provisional patterns

- Azure Artifact Signing cost (about $9.99 a month) and SignPath Foundation's terms came from
  search summaries, not the providers' own pricing or application pages; revisit when the
  signing item in the remediation plan is scheduled.
