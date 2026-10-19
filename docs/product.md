# FormWaypoint: product

Last changed: 2026-10-19 (first draft, from README.md, AGENTS.md and the ADRs; awaiting the owner's
confirmation)

## Mission

Let a shipper prepare correct export paperwork on their own Windows machine. That means a
carrier's Shipper's Letter of Instruction filled from the CIPL with every figure proved against
the document, and, for lithium and sodium batteries by air, a Shipper's Declaration built from the
person's own answers. Wherever a figure can't be proved, a person supplies it.

## Users

| User | Comes to | Can't be assumed to |
| --- | --- | --- |
| Shipper preparing export paperwork | Turn a vendor's CIPL into the forwarder's SLI or a FedEx/UPS keying sheet without retyping it | Have a network connection the tool may use for shipment data; know which CIPL layout they hold |
| Shipper with a lithium or sodium battery consignment by air | Classify it and produce the Shipper's Declaration and package checklist | Be DG-certified; know the DGR edition the rules came from (ADR 0003 says they are unverified) |

Not a user: the forwarder or carrier, who receive the forms but never run the tool.

## Non-goals

- A backend, an account, or any upload of shipment data. The documents are confidential, and the
  one network call is the Schedule B refresh (AGENTS.md project rule 3).
- Inferring a compliance value (ECCN, licence, hazardous status, battery chemistry) from a
  description. These are answered by the document or a person (project rule 2).
- DG by ground or vessel. The classification is air-only by design (`roadmap.md`).
- Being the authority for a signed declaration. The tool prepares one, and a qualified person
  checks and signs it (ADR 0003).

## Constraints

- Runs on Windows as a per-user Tauri installer, or in the browser. Data lives in IndexedDB under
  bundle identifier `com.formwaypoint.app`, which must not change (AGENTS.md).
- DG consignment records are kept at least two years from preparation (the retention obligation
  in `src/store/local-store.ts`).
- DG figures come from the Labelmaster course materials, not the licensed IATA DGR (ADR 0003,
  `docs/dangerous-goods-fact-check.md`).

## Glossary

| Term | Means |
| --- | --- |
| CIPL | Combined commercial invoice and packing list, the vendor's shipment document |
| SLI | Shipper's Letter of Instruction, the forwarder's booking form |
| DGD | Shipper's Declaration for Dangerous Goods |
| Document set | One currency copy of a dual-currency CIPL (FC or TP1) |

## History

| Date | Change | Why |
| --- | --- | --- |
| 2026-10-19 | First version | Drafted for the CIPL-to-DG prefill plan; `prompts/plan-change.md` plans against it |
