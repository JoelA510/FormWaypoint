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
| 2026-07-28 | `1e181f5` | 209 passed | owner | Last recorded full run, from the commit message. 44 non-merge commits since have touched the parsers, reconciliation, the adapters or the draft without it (as of 2026-10-21: `git rev-list --count --no-merges 1e181f5..main -- src/domain/cipl src/domain/reconcile src/carriers src/domain/draft.ts`). |
