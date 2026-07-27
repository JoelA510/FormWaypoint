---
trigger: always_on
---

# Operating Principles (FormWaypoint)

FormWaypoint turns a combined commercial invoice & packing list into a completed carrier
Shipper's Letter of Instruction. It is a **single client-side app** — no backend, no
database, no accounts. Documents are parsed and forms are filled in the browser.

1. **Nothing leaves the machine.** There is no server to send shipment data to, and adding
   one is a product decision rather than an implementation detail.
2. **Never infer a compliance value.** An absent ECCN does not make a commodity EAR99, and
   EAR99 does not make a shipment NLR. Country of origin, hazardous-material status,
   routed-export status and consignee type come from the document or from a person.
3. **Prove it against the source.** Generated rows must sum back to the totals printed on
   the CIPL. A check that cannot run must fail loudly, never disappear.
4. **Carrier logic lives in an adapter.** `src/domain` knows nothing about any forwarder.
5. **Type Safety**: no `any`. Strict TS is the law.
