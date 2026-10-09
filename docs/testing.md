# Testing record

Two things here that no CI run can check: the real-shipment suite, and the public pull-request
refs that once carried shipment documents.

## Real-shipment suite runs

The suites keyed to real shipments skip wherever the documents are absent, which is every CI
run. Run them where the documents are (see `src/test/fixtures.ts` for the layout) with:

```bash
npm run test:real
```

It fails, rather than skipping, when any of the six documents is missing. Record each run below,
newest last. Any failure is a defect until shown otherwise.

| Date | Commit | Result (passed / failed / skipped) | Run by | Notes |
| --- | --- | --- | --- | --- |
| 2026-07-28 | `1e181f5` | 209 passed | owner | Last recorded full run, from the commit message. 28 commits since have touched the parsers, reconciliation, the adapters or the draft without it. |

## Shipment documents in public pull-request refs

Five CIPLs committed under `src/test/fixtures/` in July 2026 left `main` through squash merges,
but GitHub keeps every pull request's head ref, and refs 26 to 32 still carried them on
2026-10-08 (audit finding 8.1). Only GitHub Support can remove pull-request refs. To check
whether they are gone, from an empty directory (file names only; nothing is opened):

```bash
git clone --bare --filter=blob:none https://github.com/JoelA510/FormWaypoint scan && cd scan
git fetch --filter=blob:none origin '+refs/pull/*/head:refs/pr/*'
git log --all --diff-filter=A --name-only --format= -- 'src/test/fixtures/*.pdf' | sort -u
```

Nothing printed means no ref still holds them.

| Date | Result |
| --- | --- |
| 2026-10-08 | Five files listed, reachable through refs 26 to 32. |
