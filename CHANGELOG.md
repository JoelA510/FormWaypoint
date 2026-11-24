# Changelog

What changed for the person using FormWaypoint, in plain words. Every successful desktop build
from `main` is published as a release, so every pull request that changes what the build ships
adds one line here, and CI refuses the pull request if it does not
([ADR 0011](docs/adr/0011-every-shipped-change-has-a-changelog-line.md)).

How to write an entry:

- One line under "Changes", newest first: `- YYYY-MM-DD: what changed.`
- Say what the shipper will see or what is now checked, not which file moved. A change with no
  visible effect says so ("Internal: no change to what the app does").
- Never a real shipment's numbers, names or values.

Each [release](https://github.com/JoelA510/FormWaypoint/releases) also lists the pull requests
it contains. A dependency update is named there and needs no line here.

## Changes

- 2026-11-24: This changelog starts. Releases 1.0.1 and 1.0.2 (2026-11-20) came before it; what
  they contain is in the pull requests merged up to that date.
