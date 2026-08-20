import type { SLILine } from '../../domain/types'
import type { CarrierAdapter, FillResult, SliDraft, TemplateVerification } from '../types'
import {
  createContext,
  findMissingFields,
  formatDateMMDDYYYY,
  formatQuantity,
  joinLines,
  loadForm,
  setCheckBox,
  setText,
} from '../form-utils'
import { isNamedPlace, parseIncoterm, RETIRED_INCOTERMS } from '../../domain/incoterms'
import { canonicalUnit } from '../../domain/schedule-b'
import { CEVA_CHECKBOXES, CEVA_CONSIGNEE_TYPE, CEVA_FIELDS as F, CEVA_INCOTERMS, CEVA_MAX_ROWS, CEVA_REQUIRED_FIELDS } from './fields'

/**
 * CEVA Logistics Shipper's Letter of Instructions.
 *
 * Differs from Nippon Express in three ways that the adapter absorbs:
 *
 *  - the commodity table is five multiline fields rather than a grid, so rows are joined
 *    with newlines and every column must receive the same row count to stay aligned;
 *  - box 22 is captioned "U.S. dollar, omit cents", so values are rounded to whole dollars
 *    (the filed vendorA3 shows 667.90 written as `668`, i.e. rounded, not truncated);
 *  - the ECCN box is captioned "when required" and is left blank, with `NLR` in the licence
 *    box — the opposite of Nippon, which carries `EAR99` on every row.
 */

export function createCevaAdapter(): CarrierAdapter {
  return {
    id: 'ceva',
    name: 'CEVA Logistics',
    templateVersion: '11201-C3 rev. 8/2023',
    templateUrl: 'templates/ceva-sli.pdf',
    maxCommodityRows: CEVA_MAX_ROWS,
    maxInlineReferences: 1,
    supportedModes: ['AIR', 'OCEAN'],

    defaults: {
      forwardingAgent: 'CEVA Logistics',
      mode: 'AIR',
      freight: 'COLLECT',
      insured: false,
      routedExport: false,
      hazardous: false,
      consigneeType: 'RESELLER',
      partiesRelated: true,
      pointOfOrigin: 'California',
    },

    async verifyTemplate(templateBytes: Uint8Array): Promise<TemplateVerification> {
      const { form } = await loadForm(templateBytes)
      const missing = findMissingFields(form, CEVA_REQUIRED_FIELDS)
      return { ok: missing.length === 0, missing, found: form.getFields().length }
    },

    async fill(templateBytes: Uint8Array, draft: SliDraft): Promise<FillResult> {
      const { doc, form } = await loadForm(templateBytes)
      const ctx = createContext(form)

      // --- Parties ---------------------------------------------------------
      setText(ctx, F.usppi, joinLines([draft.usppiName, ...draft.usppiAddressLines]))
      setText(ctx, F.usppiZip, draft.usppiZip)
      setText(ctx, F.usppiEin, draft.usppiEin)
      setCheckBox(ctx, draft.partiesRelated ? CEVA_CHECKBOXES.related : CEVA_CHECKBOXES.nonRelated, true)
      setCheckBox(ctx, CEVA_CONSIGNEE_TYPE[draft.consigneeType], true)

      setText(ctx, F.ultimateConsignee, joinLines([draft.ultimateConsignee.name, ...draft.ultimateConsignee.addressLines]))
      if (draft.intermediateConsignee) {
        setText(
          ctx,
          F.intermediateConsignee,
          joinLines([draft.intermediateConsignee.name, ...draft.intermediateConsignee.addressLines]),
        )
      }

      // --- Shipment --------------------------------------------------------
      setText(ctx, F.shipperRef, draft.shipmentReference)
      setText(ctx, F.consigneePo, draft.consigneePo)
      setText(ctx, F.pointOfOrigin, draft.pointOfOrigin)
      setText(ctx, F.destinationCountry, draft.destinationCountry)
      setText(ctx, F.signatureDate, formatDateMMDDYYYY(draft.dateOfExportation, '/'))
      setText(ctx, F.certificationDate, formatDateMMDDYYYY(draft.dateOfExportation, '/'))

      // Air / ocean is marked in a per-column text box rather than a checkbox.
      setText(ctx, draft.mode === 'OCEAN' ? F.ocean : F.air, 'X')

      // --- Incoterm --------------------------------------------------------
      //
      // The box is ticked from the *rule*, not from the raw string. What arrives here is
      // rarely the bare code: the `omron-ci` INCOTERMS box says `DAP Singapore` and the
      // Vendor A trade terms say `FOB Origin - Collect`, and an exact-match test against the
      // box names left both of those unticked — a form filed with no delivery term on it at
      // all, which is what this section exists to prevent.
      const stated = (draft.incoterm ?? '').trim()
      const incoterm = parseIncoterm(stated)
      const ticked = Boolean(incoterm && (CEVA_INCOTERMS as readonly string[]).includes(incoterm.code))
      if (incoterm && ticked) {
        setCheckBox(ctx, incoterm.code, true)
      } else if (incoterm) {
        // Every current rule has a box on rev. 8/2023, so in practice this is a rule that was
        // withdrawn. The other half of the message is kept for the revision that drops one:
        // `CEVA_INCOTERMS` tracks the printed form, and it has lost a box before.
        ctx.warnings.push(
          incoterm.retired
            ? `Incoterm "${stated}" is ${incoterm.code}, which Incoterms 2020 no longer has and this revision of ` +
                `the form has no box for. It is written into the special instructions; the current rule is ` +
                `${RETIRED_INCOTERMS[incoterm.code]} — reclassify the term and tick the box by hand if that is ` +
                'what the sale actually is.'
            : `Incoterm "${incoterm.code}" has no box on this revision of the form; it is written into the ` +
                'special instructions instead of being lost, but no box was ticked.',
        )
      } else if (stated) {
        ctx.warnings.push(
          `"${stated}" was not recognised as an Incoterm, so no box was ticked. It is written into the special ` +
            'instructions; correct it before signing.',
        )
      }

      setCheckBox(ctx, draft.routedExport ? CEVA_CHECKBOXES.routedExportYes : CEVA_CHECKBOXES.routedExportNo, true)
      setCheckBox(ctx, CEVA_CHECKBOXES.commercialInvoiceAttached, true)

      // The EU/China consignee registration number has no dedicated box here, so it goes in
      // special instructions — which is where the filed example puts it.
      //
      // The Incoterm joins it in two cases, both of them "the ticked box does not say the
      // whole term": a named place, which this form has nowhere to record and without which
      // `FOB` does not say which port, and a term no box covers. A bare rule that was ticked
      // is already stated, and repeating it would only add noise to a box people read.
      //
      // The place comes from the operator where they gave one, and from the term itself
      // otherwise — this form has no named-place box, so that field is only ever going to
      // reach the paper through here. Typing one is a deliberate act and the document is a
      // default, which is the same precedence the Nippon form's box 15 uses; the two forms
      // disagreeing about whose place wins is how one shipment gets filed two ways.
      const operatorPlace = (draft.namedPlace ?? '').trim()
      // Only the part of the stated term that is a place — `FOB Origin - Collect` carries the
      // freight term in the same string, and it is already written into the freight-payment
      // box. Comparing against the whole remainder raised a conflict against a payment term.
      const statedPlace = isNamedPlace(incoterm?.namedPlace ?? '') ? (incoterm?.namedPlace ?? '') : ''
      const namedPlace = operatorPlace || statedPlace
      // The document's own words, with anything the operator added beside them — never a
      // rebuild from the parsed parts.
      //
      // Rebuilding dropped whatever the parse did not keep. `CIF Rotterdam Prepaid` came out
      // as `CIF Rotterdam`, and box 20 is filled from `draft.freight`, which falls back to
      // this adapter's `COLLECT` default whenever the document states no freight terms of its
      // own — so the one form said COLLECT while the invoice said Prepaid, with nothing
      // anywhere to show the disagreement.
      // Where the document named no place of its own, the operator's simply completes the
      // term. Where it named a different one, both are written: the operator's choice governs
      // the shipment, and erasing what the document said would leave the disagreement the
      // warning below describes invisible on the paper itself.
      const fullTerm = !operatorPlace
        ? stated
        : !statedPlace
          ? `${stated} ${operatorPlace}`
          : operatorPlace.toLowerCase() === statedPlace.toLowerCase()
            ? stated
            : `${stated} — named place: ${operatorPlace}`
      // Written whenever the ticked box does not say the whole term: a place it has no room
      // for, a rule it has no box for, or any other wording the document put in the term —
      // `FOB Collect` says something about who pays that a tick on `FOB` does not.
      //
      // Measured by what follows the rule, not by whether the text equals the code. The
      // `omron-ci` box is hand-typed and `Ex Works` is the same bare rule as `EXW`; comparing
      // strings wrote a special instruction repeating a term the tick already stated.
      // Anything the document put after the rule. The tick states the rule and nothing else,
      // so a place, a payment instruction or any other qualifier has to be written out.
      const saysMoreThanTheRule = Boolean(incoterm?.namedPlace)
      const incotermNote =
        stated && (!ticked || namedPlace || saysMoreThanTheRule) ? `Incoterm: ${fullTerm}` : ''
      // The term can carry its own payment wording, and box 20 is filled from a different
      // field entirely — `header.freightTerms`, or this adapter's default where the document
      // states none. Either way the two can end up saying opposite things, and a form saying
      // COLLECT over an invoice saying Prepaid is a contradiction nobody reading one of them
      // would spot.
      //
      // Which of the two the box is carrying is not knowable here: `draft.freight` has
      // already collapsed "the document said so" and "nothing said so, use the default" into
      // one value. So the warning states the disagreement and leaves the diagnosis open,
      // rather than asserting a cause it cannot check.
      const saysPrepaid = /\bPRE-?PAID\b|\bPPD\b/i.test(stated)
      const saysCollect = /\bCOLLECT\b/i.test(stated)
      const boxSaysPrepaid = draft.freight === 'PREPAID'
      if ((saysPrepaid && !boxSaysPrepaid) || (saysCollect && boxSaysPrepaid)) {
        ctx.warnings.push(
          `The Incoterm reads "${stated}", but the freight payment box says ` +
            `${boxSaysPrepaid ? 'PREPAID' : 'COLLECT'}. Those disagree; the box is filled from the document's own ` +
            'freight terms where it states any, and from a default where it does not. Check which is right ' +
            'before signing.',
        )
      }

      // Overriding a place the document states is a decision, not a typo, so it is made
      // visible rather than applied quietly.
      if (operatorPlace && statedPlace && operatorPlace.toLowerCase() !== statedPlace.toLowerCase()) {
        ctx.warnings.push(
          `The document states the Incoterm as "${stated}", but the named place entered for this shipment is ` +
            `"${operatorPlace}". The form carries "${fullTerm}"; check which is right before signing.`,
        )
      }
      const instructions = [
        draft.specialInstructions,
        incotermNote,
        draft.ultimateConsignee.consigneeId ? `EORI # ${draft.ultimateConsignee.consigneeId}` : '',
      ]
        .filter(Boolean)
        .join('\r')
      setText(ctx, F.specialInstructions, instructions)
      setText(ctx, F.piecesAndDimensions, draft.piecesAndDimensions)
      setText(ctx, F.freightPaymentLocation, draft.freight === 'PREPAID' ? 'PREPAID' : 'COLLECT')
      // The form's own caption: "If no value is indicated, the shipment will not be insured."
      if (draft.insured) setText(ctx, F.insurance, 'YES')

      // --- Commodity table -------------------------------------------------
      const rows = draft.lines.slice(0, CEVA_MAX_ROWS)
      if (draft.lines.length > CEVA_MAX_ROWS) {
        ctx.warnings.push(
          `This shipment has ${draft.lines.length} commodity rows but the table holds ${CEVA_MAX_ROWS}. ` +
            `Rows ${CEVA_MAX_ROWS + 1}+ were not written and need a continuation sheet.`,
        )
      }

      // A quantity that is not a number is a fault upstream, and the box it would have filled
      // is one somebody signs. Said out loud rather than left as an empty cell.
      const unwritable = rows.filter((l) => l.reportingBasis !== 'none' && !Number.isFinite(l.reportingQuantity))
      if (unwritable.length) {
        ctx.warnings.push(
          `${unwritable.length} commodity row(s) have no usable quantity (${unwritable
            .map((l) => l.scheduleB)
            .join(', ')}), so box 24 carries the unit alone. Correct the figures before signing.`,
        )
      }

      // Every column gets the same number of lines so the rows stay visually aligned.
      setText(ctx, F.df, rows.map((l) => l.domesticForeign).join('\r'))
      setText(ctx, F.scheduleB, rows.map((l) => `${l.scheduleB} (${l.description})`).join('\r'))
      // Box 24 is captioned "Quantity — Schedule B Unit", so the figure is the one the
      // commodity number is reported in rather than the invoice's piece count. The unit is
      // spelled out beside anything that is not a count, because `4.263` against a cable
      // reads as four cables to everyone who has ever filled this form in.
      setText(ctx, F.quantity, rows.map(formatReportedQuantity).join('\r'))
      setText(ctx, F.weight, rows.map((l) => l.weightKg.toFixed(3)).join('\r'))
      // "U.S. dollar, omit cents" — rounded to the nearest dollar.
      setText(ctx, F.value, rows.map((l) => String(Math.round(l.valueUsd))).join('\r'))

      // The form has one licence box for the whole shipment. Rows can now carry their own
      // licences (the `omron-ci` form states one per line), so a mixed shipment gets the
      // same treatment as a mixed ECCN below: every distinct value is written and the
      // signer is warned, because a single value alone would misstate the other rows.
      const licenses = distinct(rows.map((l) => l.license))
      setText(ctx, F.license, licenses.join(' / '))
      if (licenses.length > 1) {
        ctx.warnings.push(
          `Rows on this shipment carry different licence values (${licenses.join(', ')}), but the form has one ` +
            'box for all of them. All were written; split the shipment or annotate the licence box before signing.',
        )
      }

      // This form has one ECCN box for the whole shipment, so a mixed shipment cannot be
      // stated accurately in it. Every distinct value goes in — including EAR99 — because
      // writing only the controlled one reads as though it covers every row. Shipment
      // vendorB1 is exactly that shape: a 5A992.C pendant kit alongside EAR99 lines, and a
      // box reading `5A992.C` alone would over-declare the rest.
      const eccns = distinct(rows.map((l) => l.eccn))
      if (eccns.length > 1) {
        setText(ctx, F.eccn, eccns.join(' / '))
        ctx.warnings.push(
          `Rows on this shipment carry different ECCNs (${eccns.join(', ')}), but the form has one box for all ` +
            'of them. Both were written; split the shipment or annotate box 24 before signing.',
        )
        // Compared the way `distinct` compares, which is case-insensitively: a hand-typed
        // `ear99` is the same classification as `EAR99` and belongs in the same blank box.
      } else if (eccns.length === 1 && eccns[0].trim().toUpperCase() !== 'EAR99') {
        setText(ctx, F.eccn, eccns[0])
      }

      // --- Signature block -------------------------------------------------
      setText(ctx, F.dulyAuthorized, draft.signerName)
      setText(ctx, F.signerTitle, draft.signerTitle)
      // Box 33 is initialled, not signed; boxes 29/30 are left for a pen. Exactly one of
      // the two declarations is always completed — leaving both blank would produce a form
      // that silently declares nothing about dangerous goods.
      setText(ctx, draft.hazardous ? F.hasDangerousGoods : F.noDangerousGoods, draft.signerInitials)
      if (draft.hazardous) {
        ctx.warnings.push(
          'Marked as containing dangerous goods. Box 33 requires an attached shipper’s declaration — ' +
            'for lithium and sodium batteries by air, prepare it in the Dangerous goods tab; it is a ' +
            'separate assessment, not an attachment generated from this SLI.',
        )
      }

      const bytes = await doc.save({ updateFieldAppearances: true })
      return { bytes, written: ctx.written, warnings: ctx.warnings }
    },
  }
}

/**
 * The quantity as box 24 carries it: the figure, and the unit whenever it is not a plain
 * count.
 *
 * A count is written bare, which is what the filed vendorA3 SLI does and what anyone reading
 * this column expects. A kilogram figure is not: `4.263` beside a Schedule B number, in a
 * column that has held piece counts on every form before it, is a number nobody can place.
 * The eight codes that require no quantity at all get the unit alone.
 */
function formatReportedQuantity(line: SLILine): string {
  if (line.reportingBasis === 'none') return line.reportingUom
  const quantity = formatQuantity(line.reportingQuantity)
  // No figure at all. The unit alone is what the box can honestly carry, and the adapter
  // warns — `${''} ${unit}` would print a leading space and read as an oversight.
  if (!quantity) return line.reportingUom
  if (!line.reportingUom) return quantity

  // A count under a code that is reported by the count is written bare, which is what the
  // filed vendorA3 SLI does. Compared canonically: `PCS`, `EA` and `NO` are one unit written
  // three ways — the Census file itself reports 51 commodity numbers in `PCS` — and
  // appending any of those spellings to a plain piece count is noise.
  const filed = canonicalUnit(line.reportingUom)
  // Unless the row is not in a unit this code accepts at all, in which case the unit is the
  // only thing on the paper that says so. The box is captioned "Quantity — Schedule B Unit",
  // and a bare count in it asserts that is what the figure is.
  const offRequiredUnit =
    line.scheduleBUnits.length > 0 && !line.scheduleBUnits.some((unit) => canonicalUnit(unit) === filed)
  return filed !== 'NO' || offRequiredUnit ? `${quantity} ${line.reportingUom}` : quantity
}

/**
 * Distinct values, compared without regard to case or surrounding space; the first
 * spelling seen is kept, trimmed.
 *
 * Both of these are hand-typed fields, and ` EAR99 ` beside `EAR99` is one classification
 * written twice — counted as two, it fills a box meant to stay blank and warns about a
 * mixed shipment that is not mixed.
 */
function distinct(values: (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>()
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed && !seen.has(trimmed.toUpperCase())) seen.set(trimmed.toUpperCase(), trimmed)
  }
  return [...seen.values()]
}
