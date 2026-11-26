# 0011. Keep the delivered output with its shipment history entry

- **Status:** Accepted
- **Date:** 2026-11-25
- **Decider:** Repository owner
- **Applies to:** Standard shipment History in the Windows app and browser

## Context

A shipment can produce an SLI and several keying sheets. Saving the same export twice can
give the second file a numbered suffix. The source document's name and the recorded carrier
alone cannot identify which file a person saved.

## Decision

Store the delivered output on each new shipment history record. Keep its kind (SLI, FedEx
Ship Manager workbook or UPS WorldShip workbook) and filename. On Windows, use the final
filename and path returned by the native save. For browser downloads, keep the suggested
filename with a null path because the browser chooses the destination.

## Alternatives considered

Keeping the association in memory allowed Open after Start over. Closing the window lost it.

## Consequences

The local history can reopen each Windows export after a restart. Moving or renaming a file
breaks its association. Older entries still display their shipment details and indicate that
the output location is unavailable. Clearing shipment history also clears these local paths.

## Verification

Run `npm test` for the application restart and stored-record decoding cases. In the packaged
Windows app, save the same workbook twice, restart the app, and use History to open each copy.
