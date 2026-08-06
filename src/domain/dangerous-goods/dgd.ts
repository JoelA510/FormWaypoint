/**
 * The Shipper's Declaration for Dangerous Goods, as data.
 *
 * One model, twenty-two boxes, built from the consignment and its assessment. It carries no
 * drawing and no PDF: the renderer in `src/carriers/dgd/` turns this into a page, and the
 * review screen shows the same object as text, so what is checked on screen and what is
 * printed cannot diverge.
 *
 * The box numbering is the training materials' own (Supplemental Appendix D, Student Guide
 * pp. 68–69), and the field names here follow it so that anyone holding the course notes can
 * read this file against them.
 *
 * Three things are computed rather than typed, because each is a place shipments go wrong:
 *
 *  - **Box 6, the aircraft limitation.** The box that does not apply is struck out, and
 *    which one that is follows from the goods. Standalone lithium and sodium batteries are
 *    cargo aircraft only, and no amount of wanting them on a passenger flight changes it.
 *  - **Box 15, the number and type of packaging with the net quantity.** Assembled from the
 *    package descriptions, including the overpack wording, which has three different forms
 *    depending on how many overpacks there are and whether their contents match.
 *  - **Box 3, page x of y.** Paginated here rather than at draw time, because a declaration
 *    that says "Page 1 of 1" on the first of two sheets is a defective document.
 */
import { packageCountInConsignment, classificationKey, type DgAssessment } from './assess'
import type { AirClassification } from './lithium'
import type { DgConsignment, Overpack } from './types'

/**
 * How wide the two wrapping columns are, in characters.
 *
 * The wrapping happens here, not in the renderer, so that the page breaks the model computes
 * and the lines the renderer draws are the same lines. A renderer free to re-wrap could
 * always need one row more than the model allowed for, and the row it lost would be the
 * bottom one.
 */
const PROPER_SHIPPING_NAME_WIDTH = 30
export const QUANTITY_WIDTH = 34

/** Rows of the dangerous goods table one page holds, counting wrapped and annotation rows. */
const ROWS_PER_PAGE = 14

/** One dangerous goods entry, as the columns of the declaration's table. */
export interface DgdLine {
  /** Box 10. */
  unNumber: string
  /** Box 11, pre-wrapped to the column width. */
  properShippingName: string[]
  /** Box 12. Always `9` for these entries. */
  classOrDivision: string
  /** Box 13. Never applies to lithium or sodium batteries. */
  subsidiaryRisk: string
  /** Box 14. Never applies to lithium or sodium batteries. */
  packingGroup: string
  /** Box 15, pre-wrapped: `2 Fibreboard box x 7 kg`. */
  quantityAndType: string[]
  /** Box 16: `965 IB`, `966`, `976`. */
  packingInstruction: string
  /** Box 17. Left for the shipper — a special provision number where one has been granted. */
  authorization: string
  /**
   * Wording printed under the entry: `Overpack used`, `Overpack used x 2`, the overpack
   * identification marks, `Total quantity per Overpack 20 kg`. Pre-wrapped to the quantity
   * column, one array element per printed row.
   */
  annotations: string[]
  /**
   * True when a previous line already described this physical package.
   *
   * The number and type of packaging is stated once per package; a second entry inside the
   * same box carries its net quantity alone. Recorded rather than inferred at draw time so
   * the review screen can show the same thing.
   */
  sharesPackagingWithPreviousLine: boolean
}

export interface DgdPage {
  /** Box 3, one-based. */
  pageNumber: number
  pageCount: number
  lines: DgdLine[]
}

export interface ShippersDeclaration {
  /** Box 1. */
  shipper: string[]
  /** Box 2. Empty where the forwarder completes it. */
  airWaybillNumber: string
  /** Box 4. */
  shippersReference: string
  /** Box 5. */
  consignee: string[]
  /** Box 6 — the limitation that applies; the other is struck out on the form. */
  aircraft: 'passenger-and-cargo' | 'cargo-aircraft-only'
  /** Box 7. Full airport or city name; codes are not accepted. */
  airportOfDeparture: string
  /** Box 8. */
  airportOfDestination: string
  /** Box 9 — `RADIOACTIVE` is struck out for every entry this workflow produces. */
  shipmentType: 'non-radioactive'
  /** Box 18, one line each. */
  additionalHandlingInformation: string[]
  /** Box 19. */
  signerName: string
  signerTitle: string
  /** Box 20. */
  signerPlace: string
  /** Box 20, `YYYY-MM-DD`; the renderer formats it. */
  signerDate: string
  pages: DgdPage[]
  /** Every line across every page, for the review screen. */
  lines: DgdLine[]
  /** Things the person signing needs to know that no box holds. */
  notes: string[]
}

/**
 * The date a copy of this declaration may stop being kept, as `YYYY-MM-DD`.
 *
 * Two years, which the materials state twice — once as "a minimum period of 2 years" and once
 * as "kept on file for 24 months". Computed in local time for the same reason the report file
 * names are: a UTC date names the wrong day for most of the working afternoon in the United
 * States, and this one is read off a shelf label.
 */
export function retainUntil(preparedAt: Date): string {
  const due = new Date(preparedAt.getFullYear() + 2, preparedAt.getMonth(), preparedAt.getDate())
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`
}

/** `7`, `1.5`, `10.25` — a weight without a trailing zero it did not earn. */
export function formatKg(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}

/** Greedy word wrap. Long single words are hard-split so nothing is silently dropped. */
export function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return ['']
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (!current) {
      current = word
    } else if (current.length + 1 + word.length <= width) {
      current = `${current} ${word}`
    } else {
      lines.push(current)
      current = word
    }
    while (current.length > width) {
      lines.push(current.slice(0, width))
      current = current.slice(width)
    }
  }
  if (current) lines.push(current)
  return lines
}

/**
 * The overpack wording for a group of packages, in the form the case calls for.
 *
 * One overpack: the words `Overpack used`, immediately after the entries for the packages
 * inside it. Several with identical contents: `Overpack used x N`, each overpack's
 * identification mark, and the total quantity per overpack. Several with different contents
 * are listed separately, which in this model means separate overpack records, each producing
 * its own wording after its own entries.
 */
function overpackAnnotations(overpack: Overpack, totalPerOverpackKg: number): string[] {
  const lines = overpack.count <= 1 ? ['Overpack used'] : [`Overpack used x ${overpack.count}`]
  if (overpack.count > 1) {
    // The marks are what must be listed; "identification marks" as a label is mine, not the
    // regulation's, and it costs a wrapped row every time.
    if (overpack.marks.trim()) lines.push(`Overpack marks: ${overpack.marks.trim()}`)
    lines.push(`Total quantity per Overpack ${formatKg(totalPerOverpackKg)} kg`)
  }
  // Wrapped to the same column the quantity is wrapped to, because that is the column they
  // are drawn in. A list of overpack identifiers is easily longer than the column is wide,
  // and an unwrapped one runs across the packing instruction beside it.
  return lines.flatMap((line) => wrap(line, QUANTITY_WIDTH))
}

/**
 * Builds the declaration from a consignment and its assessment.
 *
 * Assumes nothing about whether the assessment passed. A declaration built from a failing
 * consignment is still useful on screen — it is how a reviewer sees what a fix would produce
 * — and the gate on actually generating the PDF lives in the UI, next to the checks, where a
 * person can read why.
 */
export function buildDeclaration(consignment: DgConsignment, assessment: DgAssessment): ShippersDeclaration {
  const lines: DgdLine[] = []

  /**
   * Where each overpack's wording goes, and what it says.
   *
   * An overpack is not a property of a package — several package descriptions can sit inside
   * one — so its wording is accumulated across every package that references it and written
   * once, after the last entry belonging to it. Writing it per package instead repeats
   * "Overpack used x 2" for each and states a *different* total quantity per overpack each
   * time, none of them the real one. Overpack entries that disagree with each other, or with
   * the mark on the box, is the single most frequent cause of a resubmission on these
   * consignments.
   */
  const overpackTotals = new Map<string, { lastLineIndex: number; totalPerOverpackKg: number }>()

  // Entries are emitted package by package so that the overpack wording lands immediately
  // after the entries it belongs to, which is where the regulation puts it.
  for (const packageAssessment of assessment.packages) {
    const { pkg } = packageAssessment
    const totalPackages = packageCountInConsignment(pkg, consignment)

    // One line per regulatory entry in the package, in the order the entries were added.
    const groups = new Map<string, { classification: AirClassification; weightKg: number }>()
    for (const { entry, classification } of packageAssessment.entries) {
      const key = classificationKey(classification)
      const held = groups.get(key)
      const weight = entry.netWeightKgPerPackage ?? 0
      if (held) held.weightKg += weight
      else groups.set(key, { classification, weightKg: weight })
    }

    const overpack = pkg.overpackId ? consignment.overpacks.find((o) => o.id === pkg.overpackId) : null
    const groupList = [...groups.values()]

    groupList.forEach(({ classification, weightKg }, index) => {
      const shares = index > 0
      const quantity = shares
        ? `${formatKg(weightKg)} kg`
        : `${totalPackages} ${pkg.packagingType || 'package'} x ${formatKg(weightKg)} kg`

      lines.push({
        unNumber: classification.unNumber,
        properShippingName: wrap(classification.properShippingName, PROPER_SHIPPING_NAME_WIDTH),
        classOrDivision: classification.hazardClass,
        subsidiaryRisk: '',
        packingGroup: '',
        quantityAndType: wrap(quantity, QUANTITY_WIDTH),
        packingInstruction: classification.packingInstructionLabel,
        authorization: '',
        annotations: [],
        sharesPackagingWithPreviousLine: shares,
      })

      if (overpack && index === groupList.length - 1) {
        const held = overpackTotals.get(overpack.id)
        // Per overpack, so the package's own count — which is per overpack — not the
        // consignment total across every overpack.
        const contribution = packageAssessment.netWeightKg * Math.max(0, pkg.count)
        overpackTotals.set(overpack.id, {
          lastLineIndex: lines.length - 1,
          totalPerOverpackKg: (held?.totalPerOverpackKg ?? 0) + contribution,
        })
      }
    })
  }

  for (const [overpackId, { lastLineIndex, totalPerOverpackKg }] of overpackTotals) {
    const overpack = consignment.overpacks.find((o) => o.id === overpackId)
    if (overpack) lines[lastLineIndex].annotations = overpackAnnotations(overpack, totalPerOverpackKg)
  }

  return {
    shipper: partyLines(consignment.shipper.name, consignment.shipper.addressLines),
    airWaybillNumber: consignment.airWaybillNumber.trim(),
    shippersReference: consignment.shippersReference.trim(),
    consignee: partyLines(consignment.consignee.name, consignment.consignee.addressLines),
    aircraft: consignment.aircraft,
    airportOfDeparture: consignment.airportOfDeparture.trim(),
    airportOfDestination: consignment.airportOfDestination.trim(),
    shipmentType: 'non-radioactive',
    additionalHandlingInformation: handlingInformation(consignment),
    signerName: consignment.signerName.trim(),
    signerTitle: consignment.signerTitle.trim(),
    signerPlace: consignment.signerPlace.trim(),
    signerDate: consignment.signerDate.trim(),
    pages: paginate(lines),
    lines,
    notes: declarationNotes(consignment, assessment),
  }
}

/** Box 18. The emergency contact first, because that is what it is read for. */
function handlingInformation(consignment: DgConsignment): string[] {
  const lines: string[] = []
  const name = consignment.emergencyContactName.trim()
  const phone = consignment.emergencyContactPhone.trim()
  if (name) lines.push(`Emergency Contact Name: ${name}`)
  if (phone) lines.push(`24 hr. Emergency Contact Tel. No.: ${phone}`)
  const extra = consignment.additionalHandlingInformation.trim()
  if (extra) lines.push(...extra.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))
  return lines
}

/**
 * Splits the entries across sheets.
 *
 * An entry is never broken across a page: its wrapped name, its quantity and its overpack
 * wording travel together, because an "Overpack used" stranded at the top of sheet two
 * belongs, as far as a reader can tell, to whatever entry precedes it there.
 */
function paginate(lines: DgdLine[]): DgdPage[] {
  if (!lines.length) return [{ pageNumber: 1, pageCount: 1, lines: [] }]

  const pages: DgdLine[][] = []
  let current: DgdLine[] = []
  let used = 0

  for (const line of lines) {
    const height = Math.max(line.properShippingName.length, line.quantityAndType.length) + line.annotations.length
    if (used && used + height > ROWS_PER_PAGE) {
      pages.push(current)
      current = []
      used = 0
    }
    current.push(line)
    used += height
  }
  if (current.length) pages.push(current)

  return pages.map((pageLines, index) => ({
    pageNumber: index + 1,
    pageCount: pages.length,
    lines: pageLines,
  }))
}

function partyLines(name: string, addressLines: string[]): string[] {
  return [name.trim(), ...addressLines.map((l) => l.trim())].filter(Boolean)
}

/**
 * What the person signing needs to know that no box on the form holds.
 *
 * Printed with the declaration on screen rather than on it: the form is a regulated layout
 * and nothing goes on it that the regulations do not put there.
 */
function declarationNotes(consignment: DgConsignment, assessment: DgAssessment): string[] {
  const notes = [
    'Two completed and signed copies are handed to the operator; four to five is the recommended practice.',
    'Sign by hand — a typewritten signature is not acceptable.',
    'Print in colour: the diagonal hatchings in the left and right margins must appear in red.',
    'Attach one copy of the emergency response information for each declaration.',
    'Keep a copy for at least two years, accessible at the shipment location on request.',
  ]
  if (assessment.airWaybillStatements.length) {
    notes.push(
      `Air waybill handling information: ${assessment.airWaybillStatements.map((s) => `“${s}”`).join('; ')}.`,
    )
  }
  if (!consignment.airWaybillNumber.trim()) {
    notes.push('The air waybill number is left blank for the forwarder; some carriers require the shipper to enter it.')
  }
  return notes
}
