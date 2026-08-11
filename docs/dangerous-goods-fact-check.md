# Fact check: the ORT lithium battery documents

Two documents were supplied to be folded into this project:

- `ORT_LiIon_Air_Export_Checklist.md` — the per-shipment operational procedure
- `DG_LITHIUM_BATTERY_REQUIREMENTS_v1.4.md` — the domain specification

Both mark their own claims `[V]` verified or `[C]` confirm-before-relying, and the
specification carries a Section 12 listing what it has and has not checked. This is the
result of working through those claims against sources, and of the changes that followed.

## What was checked against what

| Source | Used for |
| --- | --- |
| Labelmaster *Shipping Lithium Batteries* Student Guide, rev. 02/01/2026 | Air thresholds, sections, package limits, state of charge, marks and labels, the declaration box by box |
| The same course's Supplemental Appendix, rev. 01/01/2025 | The reproduced **PI 965 text itself** — Sections IA and IB, their additional requirements, and Tables 965-IA and 965-IB |
| The exercise workbook, rev. 02/01/2026 | Worked scenarios, which are now test fixtures |
| eCFR, title 49, retrieved 2026-08-06 | §172.201(e), §172.704(d), §173.185(e) and (f) |

Not available: the licensed IATA DGR 67th Edition, its addenda, State variations, and operator
variations. Where a claim can only be settled there, it is marked below and left alone.

One thing worth naming about the appendix. The requirements document says not to load it
because its filename says 2026 while its content says January 2025 — that is right, and worth
refining: the **Student Guide** is rev. 02/01/2026 with its Unit 5 pages footed 01/01/2026, so
it *is* current-edition-aligned, while the appendix is a year behind. Every figure this
project encodes comes from the Student Guide. The appendix was used for two things only: the
verbatim PI 965 text quoted below, and the declaration's box-by-box instructions, which the
Student Guide reproduces identically.

---

## Confirmed

**PI 965 has no Section II.** Section IB covers cells not over 20 Wh and batteries not over
100 Wh; anything above is Section IA. Confirmed in the packing instruction itself. This is
the checklist's B3 and the specification's §0.1, and it is the rule most easily missed:
a "small" standalone battery is still fully regulated, still cargo aircraft only, and still
needs a declaration.

**UN3480 is forbidden as cargo on passenger aircraft.** Table 965-IA and Table 965-IB both
read `Forbidden` in the passenger column.

**The PI 965 Section IA cargo aircraft limit is 35 kg.** This resolves checklist item B5 and
the specification's unverified item *"the current PI 965 Section IA net quantity limit per
package for cargo aircraft."* Table 965-IA states it directly, and Student Guide fig. 5-33
agrees. The caveat both documents attach — that the packaging authorization may impose a lower
figure — is also in the source, as *"Packaging may dictate lower limits."*

**The Section IB limits are 10 kg for lithium ion and 2.5 kg for lithium metal, cargo only.**
Table 965-IB and Student Guide fig. 5-29. This resolves the specification's unverified item on
*"the standalone Section IB limits which differ from the packed-with and contained-in figures."*

**The Section II limit is 5 kg per package on either aircraft type.** The Section II tables
(Student Guide figs. 5-26 and 5-27) state a single 5 kg maximum net quantity of cells or
batteries per package, with no cargo-aircraft relief; the 35 kg figure in column L of the List
of Dangerous Goods belongs to the Section I entries. An earlier revision of the classification
table transcribed 35 kg into Section II's cargo column — a package could pass at 2.4× the real
ceiling — and has been corrected, with the README's own table ("Section II — excepted, 5 kg")
as it always read. A shipper who needs more than 5 kg in one package prepares to Section I.

**Section IB is excepted from UN specification packaging and from nothing else.** Special
provision A802 says so expressly: *"This does not apply … for lithium batteries prepared in
accordance with Section IB of Packing Instructions 965 or 968."*

**The state of charge model in §4.2 is right, including the v1.1 correction.** Standalone
lithium ion: mandatory 30% of rated capacity. Packed with equipment above 2.7 Wh: mandatory
30% from 1 January 2026, with **no** indicated-capacity alternative. At or below 2.7 Wh:
recommended. Contained in equipment: recommended, 30% of rated capacity *or* 25% indicated
capacity. Confirmed against Student Guide p. 55 and figs. 5-26 and 5-27. The 25% alternative
appears only in the contained-in note, exactly as the correction says.

**A331 is the state-of-charge exceedance provision, and it takes two approvals.** PI 965
Section IB(c): *"Cells and/or batteries at a SoC of greater than 30% may only be shipped with
the approval of the State of Origin and the State of the Operator under the written conditions
established by those authorities."*

**A99 is the over-35 kg provision and A88 the prototype/low-production-run provision.**
Confirmed from the course's special provision summary.

**A test summary for the parts is not a test summary for the whole.** Student Guide p. 19:
*"Batteries … must be of a type proved to meet the testing requirements of the Manual of Tests
and Criteria, Part III, subsection 38.3, irrespective of whether the cells of which they are
composed are of a tested type."* The summary's required elements include a reference to the
assembled battery testing requirements at 38.3.3(f) and (g). Checklist A2 and specification
§3.2 are correct, and this was the largest gap in the existing implementation.

**Retention is two years, and the citation is right.** 49 CFR 172.201(e), retrieved from
eCFR: *"For a hazardous waste, the shipping paper copy must be retained for three years after
the material is accepted by the initial carrier. For all other hazardous materials, the
shipping paper must be retained for two years… Each shipping paper copy must include the date
of acceptance by the initial carrier, except that, for rail, vessel, or air shipments, the
date on the shipment waybill, airbill, or bill of lading may be used."* Checklist I1 and I2
and specification §6.2 are correct as written.

**Training records: §172.704(d) is a rolling window, not a fixed clock.** *"a record of current
training of each hazmat employee, inclusive of the preceding three years … for as long as that
employee is employed by that employer as a hazmat employee and for 90 days thereafter."*
Correct as stated, including the specification's note that modelling it as a fixed period
fails at both ends.

**49 CFR 173.185(e) works the way §4.4 describes.** Three categories — *low production runs
(annual production runs consisting of not more than 100 lithium cells or batteries), prototype
lithium cells or batteries transported for purposes of testing, and equipment containing such
cells or batteries* — with the 100-unit condition attaching to the first only. Confirmed. So
is (e)(7): *"not permitted for transportation by passenger-carrying aircraft, and may be
transported by cargo-only aircraft only if approved by the Associate Administrator prior to
transportation."* And (e)(4)'s rigid large packagings (50A, 50B, 50N, 50H, 50D), which the
specification correctly says are not available for air.

**Damaged and defective batteries have a ground path and no air path.** 49 CFR 173.185(f):
*"may be transported by highway, rail or vessel only."*

**UN 3171 was replaced by UN 3556, UN 3557 and UN 3558** in the IATA and IMDG 2025 editions,
with special provision A185 covering them.

---

## Corrections

**The co-packing prohibition list is wrong, in both directions.** Checklist C6 and
specification §12 give it as *"Class 1.4, 2.1, 3, 4.1, 4.2, 4.3, 5.1, 5.2, 8, or 2.2 with a
CAO label."* PI 965 Sections IA and IB say, verbatim and identically:

> cells and batteries must not be packed in the same outer packaging with dangerous goods
> classified in Class 1 (explosives) other than Division 1.4S, Division 2.1 (flammable gases),
> Class 3 (flammable liquids), Division 4.1 (flammable solids) or Division 5.1 (oxidizers)

and, for overpacks:

> packages containing cells or batteries must not be placed in an overpack with packages
> containing dangerous goods classified in Class 1 other than Division 1.4S, Division 2.1,
> Class 3, Division 4.1 or Division 5.1.

Two errors. Division **1.4S is expressly permitted**, where the documents list "Class 1.4" as
prohibited. And Divisions 4.2, 4.3 and 5.2, Class 8, and Division 2.2 with a CAO label **do not
appear in the packing instruction at all**. Being over-broad is the safe direction to be wrong
in, but it is still wrong, and in a specification whose own §2 forbids encoding a default it
matters. The implementation uses the five-item list and says which classes are not on it.

*Caveat:* my source is the appendix at rev. 01/01/2025. If the 67th Edition broadened this
list the documents may be right and I may be reading a superseded text — but a list that grew
by five entries in one revision would be unusual, and the specification's own §12 claims this
as verified without quoting it. Worth settling against the licensed text.

**"PI 965 Section I" does not exist.** Specification §12 refers to *"the completed package
under PI 965 Section I meeting Packing Group II performance requirements"*, and §0.1 correctly
says Section IA. PI 965 and PI 968 use Sections IA and IB; PI 966, 967, 969 and 970 use
Sections I and II. Cosmetic, but the two naming schemes are how people end up looking for a
Section II under PI 965.

**"State variations checked for origin, destination and the operator's State" is narrower than
it should be.** Checklist A8 lists three; specification pipeline step 13 adds transit and
overflight States *"only where a provision, variation, or approval makes them relevant"*, which
is the more careful formulation. The checklist should match the specification, which the two
documents' own header requires of them.

---

## Cannot be settled from available sources

**The declaration carries PI 910 for A88 and PI 974 for A99.** Specification §4.4a and §12
list this as verified; the course materials do not mention either packing instruction number
anywhere. This is a substantive claim — it changes what is written in box 16 of a declaration —
and nothing available here confirms or contradicts it. It is not implemented, and the
over-limit path says so rather than emitting a number it cannot support.

**The favourable vehicle-entry treatment in §0.3** — no battery weight ceiling, no
passenger/CAO distinction, whole-vehicle declared quantity. The author already flags this as
drawn from guidance written against UN 3171 and unconfirmed for UN 3556. Nothing here reaches
it. Two things can be added, though:

- The entry change is confirmed, and so is A185 covering the new entries by air.
- **The United States has not adopted them.** Student Guide p. 19: *"These changes have not yet
  been adopted in the U.S. (49CFR)"*, and 49 CFR special provision 360 still reads *"Vehicles
  powered only by lithium batteries must be described using 'UN3171, Battery-powered
  vehicle.'"* So the same machine is UN3556 by air and UN3171 by US ground. That is a concrete
  instance of the specification's own §1.5 — mode partitioning — and it belongs in the vehicle
  determination when it is commissioned.

**The exact air waybill statement wording** was listed as an open item. It resolves into an
answer of a different shape: there is no single wording. The course uses two, and both are
standard — *"Dangerous goods as per associated Shipper's Declaration"* (figs. 5-29, 5-33, 5-34)
and *"Dangerous Goods as per associated DGD"* (p. 71), each taking *"Cargo Aircraft Only"* or
*"CAO"*. The implementation offers all accepted forms rather than choosing one, and says that
an operator requiring its own wording governs over any of them.

**State and operator variations**, the third `[C]`. No dataset ships with this application and
none is inferable. The workflow names the ones the course cites, names your operating carrier,
and refuses to generate until someone confirms they have read the applicable ones.

---

## What changed in this project as a result

| Finding | Change |
| --- | --- |
| Test summary must cover the assembled article | The tested-article scope and the article in the box are two fields, and a mismatch blocks. A module summary against a pack fails with both levels named. |
| Three weights, never derived | Package gross, equipment net and battery net are entered separately. Contents heavier than the package block. The checklist prints all three and says they will not match. |
| State of charge is measured evidence | Value, basis, device or method, date, and who measured. An indicated-capacity reading blocks where the 25% alternative does not apply — the specification's test case 8. |
| The forwarder is not the airline | Separate fields, with the source the carrier was read from. An unresolved operating carrier blocks. |
| Overpacks | Every overpack needs an identifier, not only multiples. OVERPACK at 12 mm and the reproduce-marks-unless-visible rule are on the package requirements. |
| The co-packing list | The five-item list from PI 965, applied to the package and the overpack, with the classes that are *not* on it named. |
| Packaging authorization | An optional per-package ceiling that binds below the packing instruction figure. |
| The vehicle question | Asked for any battery with equipment; `not determined` blocks. Names UN3556/3557/3558 by air and UN3171 by US ground. |
| A99 is not a paperwork step | The over-limit path states the two approvals, that the shipper can obtain only one, and that operator variations refuse A88/A99 shipments — check acceptance before commissioning approval work. |
| 49 CFR 173.185(e) shipping paper notation | Quoted verbatim in the prototype path: *"Transport in accordance with § 173.185(e)."* The specification left it unpopulated pending verification; it is now verified. |

## What was deliberately not built

The specification describes a platform considerably larger than this workflow: a versioned
ruleset maintained as data by a compliance user, a governed battery master keyed on
manufacturer and revision, annual production run evidence, scoped approval objects, personnel
qualification gating, forwarder approval and HAWB reconciliation states, and an immutable
determination record carrying the full input tuple.

None of that is here, and half-building it would be worse than not starting. What is here is
the classification engine, the consignment assessment, and the two documents that come out of
them, for batteries shipped alone and with equipment by air. Three of the specification's
invariants it does satisfy already, and they were free: classification is computed from the
full input every time and never cached against a part number, no code path returns
"not regulated" on a miss, and every determination is recorded with its inputs and its checks.
