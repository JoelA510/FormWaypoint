# 0008. The EEI low-value exemption is reported as information, in one direction only

- **Status:** Accepted
- **Date:** 2026-11-12
- **Deciders:** the owner (Joel Abraham), who delegated the open choices to the implementing
  session's recommendation on 2026-11-12. He confirmed the $2,500 figure on 2026-11-12.
- **Applies to:** `src/domain/reconcile/eei.ts`, and the check list `reconcile()` returns

## Context

No check said anything about whether Electronic Export Information has to be filed
(`docs/audits/2026-11-external-review/verification.md`, item 5). The tool already holds what the
commonest test turns on: the value under each Schedule B number, with domestic and foreign goods
apart.

15 CFR 30.37(a) (eCFR, title 15 current to 2026-11-09, retrieved 2026-11-12; section last amended
at 90 FR 39122, Aug. 14, 2025) exempts "commodities where the value of the commodities shipped
from one USPPI to one ultimate consignee on a single exporting conveyance classified under an
individual Schedule B number or HTSUSA commodity classification code is $2,500 or less", and
continues: "If the filer reports multiple items of the same Schedule B number or HTSUSA commodity
classification code, this exemption only applies if the total value of exports for the Schedule B
number or HTSUSA commodity classification code is $2,500 or less. Items of domestic and foreign
origin under the same commodity classification number must be reported separately and EEI filing
is required when either is over $2,500."

The section opens "Except as noted in § 30.2(a)(1)(iv)", which requires a filing whatever the
value in cases the tool cannot see: a licence, certain destinations, and others.

## Decision

One check, `eei-low-value-exemption`, of severity `info`. It sums the commodity rows by
normalised Schedule B number and D/F and:

- where any total is over the figure, names each with its value and says the exemption does not
  cover it, so EEI has to be filed for it;
- where none is, says so, and says in the same breath that this is the low-value exemption only
  and does not mean no filing is required;
- where the rows are not priced in US dollars, or the currency could not be read, compares
  nothing and says so. Nothing is converted.

The heading states what was found in each case. It is shown beside an `info` badge with no
"failed" label, so a heading that restated the passing condition would read as the opposite of
the detail under it.

The figure, its citation, the source, the date the text was current to, the retrieval date and
the last amendment are held together as one dated record, `EEI_LOW_VALUE_EXEMPTION`.

It never blocks and never warns. It does not record an ITN, and nothing about a filing is kept.

## Alternatives considered

### Alternative: compare each commodity row with the figure

What the verification report first described, and wrong: rows are also split by ECCN, licence, SME
and unit, so two rows of $1,500 under one number and one letter would each pass while their
$3,000 total does not. Caught in review of the report. The check sums first.

### Alternative: a warning, or a block until an ITN is entered

A shipment over the figure is the ordinary case, not a fault, and the owner prefers warnings to
blocks and information to both where nothing is wrong. An ITN field would also make the tool a
record of filings, which `docs/product.md` does not describe; that is items 5(b) to 5(d) of the
report and is not decided here.

### Alternative: say "no EEI required" when nothing is over the figure

The useful-sounding half, and the one the tool must not say. It would be a compliance conclusion
inferred from value alone (AGENTS.md project rule 2), and it would be wrong for every licensed
shipment under $2,500.

## Consequences

- The reviewer sees, on the screen where the form is checked, which commodity totals bring the
  shipment inside the filing requirement on value.
- The figure is a number this repository asserts. It has to be re-read when the Foreign Trade
  Regulations are amended; the record's dates say when it last was.
- The check depends on D/F being right (ADR 0006): an entry that moves a part between letters
  moves its value between totals.
- The value is the one on the commodity rows, including any figure entered by hand over a row.
  The comparison is made only when the controlling document set is priced in US dollars.

## Verification

`src/domain/reconcile/eei.test.ts` fails if exactly $2,500 is counted as over, if rows are not
summed, if D and F are summed together, if one number written two ways is counted twice, if the
sum is taken in floating point, if the check warns or blocks, if the caveat is dropped, if rows in
another currency are compared as dollars, if the heading contradicts the detail, or if the check
is missing from `reconcile()` or not given the controlling currency. Fifteen planted defects were
run on 2026-11-12; each failed at least one test.
