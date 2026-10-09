# Security policy

## Reporting a vulnerability

Report it privately through GitHub: the repository's **Security** tab, then **Report a
vulnerability**. Please don't open a public issue for it.

Include what's affected, how to reproduce it, and what an attacker gains. FormWaypoint is
maintained by one person, so there is no guaranteed response time; reports are read and answered
as soon as they can be, and a fix is agreed with you before anything is published.

## What's in scope

- In scope: this repository's code and workflows; the Windows desktop app built from it,
  including its installer and its native commands (`src-tauri/`); the browser build.
- Out of scope: the carriers' own forms and systems, the Census Bureau's data service, and findings
  that need an already-compromised machine.

FormWaypoint has no server and sends no shipment data anywhere, so a report that a document left
the machine is in scope and urgent.

## Supported versions

The latest release of the desktop app and `main`. Older builds are not patched; the fix ships in
a new release.
