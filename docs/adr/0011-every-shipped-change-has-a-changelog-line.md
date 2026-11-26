# 0011. Every shipped change has a changelog line, and CI refuses one without it

- **Status:** Proposed
- **Date:** 2026-11-24
- **Deciders:** the owner (Joel Abraham), who asked whether release notes could be "structurally
  protected as a part of every update"; Accepted when he merges this
- **Applies to:** `CHANGELOG.md`, `scripts/check-changelog.mjs`, the `check` job in
  `.github/workflows/ci.yml`, the release step in `.github/workflows/publish-windows.yml`

## Context

Since #100 and #102 (2026-11-20) every successful desktop build from `main` is versioned
automatically and published to GitHub Releases, and a public download page points at the latest
one. Releases 1.0.1 and 1.0.2 went out that day. The publish step writes the same fixed sentence
as every release's notes, and the repository had no changelog, so nothing told a shipper what a
new build changed.
On a tool whose first rule is "never file a wrong figure", a changed rounding rule or a new
blocking check is something the person using it has to be able to find.

A release is published by a push to `main` that touches one of the paths in
`.github/workflows/desktop.yml`, with no person in between. A rule that relies on someone
remembering would be skipped by exactly the changes made in a hurry.

## Decision

We will keep `CHANGELOG.md` at the repository root, one dated line per change, newest first, and
make it a condition of merging. On a pull request, the required `check` job runs
`scripts/check-changelog.mjs`, which reads the push paths from `desktop.yml` itself and fails
when the pull request changes a shipped file and leaves no more dated entries under "Changes" in
`CHANGELOG.md` than it found, so rewording a line does not pass for adding one. The
publish step also asks GitHub to generate each release's notes (the pull requests since the last
release) and links the changelog at the released commit.

## Alternatives considered

### Alternative: generated release notes only

`gh release create --generate-notes` alone needs no file and no check. It lost because it lists
pull-request titles, which are written for the reviewer ("fix(review): total repeated parts"),
and nothing would make anyone write the sentence for the shipper.

### Alternative: a rule in AGENTS.md with no check

Costs nothing to add. It lost because operating rule 9 applies to process as much as to code: a
rule nothing can fail is a preference, and the builds publish unattended.

### Alternative: a changelog with a heading per version

The usual shape. It lost because the version is assigned by the build's run number after the
merge, so a version heading would need a commit written back to `main` by CI on every release:
a second writer on the branch that publishes, for a label the Releases page already shows.

### Alternative: a separate CI job for the check

Keeps the `check` job's checkout shallow. It lost because `check` is the status the ruleset
requires (remediation plan, PR 1B); a new job would guard nothing until someone changed a
repository setting.

## Consequences

- Every pull request that touches `src/`, `src-tauri/`, `public/`, `index.html`,
  `vite.config.ts` or the version stamp script needs one more line, including a refactor or a
  test-only change, because those publish a build too. Such an entry says there is no visible
  change.
- Dependency manifests and lockfiles, and `desktop.yml` itself, are exempt, so a Dependabot pull
  request is not blocked; the generated release notes name it. A dependency change that alters
  behaviour is the reviewer's to catch.
- The list of exempt files lives in the script. The list of shipped paths does not: it is read
  from `desktop.yml`, and the check fails if it cannot find it.
- The check proves an entry was added, not that it is true or well written. That stays with the
  review.
- The `check` job fetches two commits instead of one.
- If GitHub's notes generation fails, `gh release create` fails and that build is not
  published. The binaries stay on the build run; publish them with the `Publish Windows release`
  workflow's manual `build_run` input once the cause is fixed, or revert the flag.
- Revisit if releases stop being one per merge (a manual release step, or batching): a heading
  per version then becomes the simpler shape.

## Verification

- `src/test/changelog-gate.test.ts` runs the script in a scratch repository against this
  repository's real `desktop.yml`: a shipped change without an entry fails; so does one that
  only edits the changelog's prose, rewords an instruction bullet, rewords an existing entry, or
  adds an undated bullet; one with a dated entry passes; a docs-only change and a dependency
  bump pass; and a workflow with no path list fails.
- `node scripts/check-changelog.mjs origin/main` on any branch says what the check would decide.
- The publish step's change cannot be run without publishing a release: it is read against the
  GitHub CLI manual for `gh release create`, where `--notes` text is prepended to generated
  notes. The first release after this merges is its test: its notes should list pull requests
  under the fixed sentence.
