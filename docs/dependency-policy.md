# Dependency policy

How this project decides whether a known-vulnerable dependency can ship. The gates are
`npm audit --audit-level=high` for the npm dependencies and `cargo deny check advisories`
(`src-tauri/deny.toml`) for the Rust ones. Both run in CI on every pull request and on pushes to
`main` (`.github/workflows/ci.yml`), and weekly (`.github/workflows/audit.yml`).

## The bar

- **High and critical npm advisories block**, in runtime *and* development dependencies. Build and
  test tooling runs with CI credentials, on every contributor's machine, and builds the installer.
- **Moderate and low npm advisories are reported, not blocked**, and cleared in the regular
  dependency update.
- **Every Rust vulnerability blocks.** A crate marked unmaintained blocks when this repository
  depends on it directly; one that arrives through Tauri is Tauri's to replace (the reasons are in
  `src-tauri/deny.toml`).
- **The audit has to run.** No report (offline, registry outage) fails the gate. "Couldn't check"
  is not "clean".
- **It runs on a schedule, not just on pull requests**, because advisories are published against
  code that has already merged.

## Waivers

There is no waiver register: `npm audit` has none, and none has been needed. A cargo advisory is
waived only in `src-tauri/deny.toml`'s `ignore` list, with its RUSTSEC id, the reason it can't be
reached here, and a review date no more than 90 days out. An npm advisory with no fix is handled
by an `overrides` entry in `package.json` pinning a fixed version of the transitive package, or,
if none exists, by a decision recorded in an ADR with a review date. Never by loosening the bar.

## Install guards

When npm chooses a version, it takes only releases at least 7 days old, and it refuses a git or
tarball-URL dependency that a dependency brings in: `.npmrc` (`min-release-age=7`,
`allow-git=root`, `allow-remote=root`), honoured by npm 11.15 or later, which `package.json`'s
`packageManager` pins. Installing from the lockfile (`npm ci`) isn't affected. An urgent fix
younger than that is taken on purpose, with `npm install <pkg>@<version> --min-release-age=0`, and
the pull request says so.

Dependabot (`.github/dependabot.yml`) proposes version updates for npm, cargo and GitHub Actions
weekly, a week after release; security updates arrive as soon as GitHub publishes them.

## Fixing

1. The ecosystem's own fix command, within semver ranges (`npm audit fix`, `cargo update -p`).
   Review the lockfile diff and run the full gate.
2. A major bump of a direct dependency is a normal upgrade pull request, with an ADR if it's
   consequential.
3. No fix available: see Waivers. Never `--force`, never a hand-edited lockfile.
