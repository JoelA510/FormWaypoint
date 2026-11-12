# Testing record

What no CI run can check: the real-shipment suite.

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
| 2026-07-28 | `1e181f5` | 209 passed | owner | Last recorded full run, from the commit message. 90 non-merge commits since have touched the parsers, reconciliation, the adapters or the draft without it (as of 2026-11-12: `git rev-list --count --no-merges 1e181f5..main -- src/domain/cipl src/domain/reconcile src/carriers src/domain/draft.ts`, on a full clone; a shallow clone undercounts, and the 44 this row gave on 2026-10-21 does not reproduce, the same command at that date returning 83). |

## What that record means

The two vendor layouts were proved against real shipments at `1e181f5`. Everything since is
proved against synthetic documents only, and the in-house form has never been run against a real
one. The suite needs a command line on the machine that holds the documents, which the owner
rarely has, so it should not be assumed to run before a change is relied on. A change that alters
how a document is parsed or which figure is filed therefore carries a risk no gate here catches,
and its pull request says so.
