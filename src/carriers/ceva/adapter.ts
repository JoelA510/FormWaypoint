import type { CarrierAdapter, FillResult, SliDraft, TemplateVerification } from '../types'
import { createContext, findMissingFields, formatDateMMDDYYYY, joinLines, loadForm, setCheckBox, setText } from '../form-utils'
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

      const incoterm = (draft.incoterm ?? '').trim().toUpperCase()
      if ((CEVA_INCOTERMS as readonly string[]).includes(incoterm)) {
        setCheckBox(ctx, incoterm, true)
      } else if (incoterm) {
        ctx.warnings.push(`Incoterm "${incoterm}" has no box on this revision of the form; left unticked.`)
      }

      setCheckBox(ctx, draft.routedExport ? CEVA_CHECKBOXES.routedExportYes : CEVA_CHECKBOXES.routedExportNo, true)
      setCheckBox(ctx, CEVA_CHECKBOXES.commercialInvoiceAttached, true)

      // The EU/China consignee registration number has no dedicated box here, so it goes in
      // special instructions — which is where the filed example puts it.
      const instructions = [
        draft.specialInstructions,
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

      // Every column gets the same number of lines so the rows stay visually aligned.
      setText(ctx, F.df, rows.map((l) => l.domesticForeign).join('\r'))
      setText(ctx, F.scheduleB, rows.map((l) => `${l.scheduleB} (${l.description})`).join('\r'))
      setText(ctx, F.quantity, rows.map((l) => formatQuantity(l.quantity)).join('\r'))
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

function formatQuantity(quantity: number): string {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(3)
}

/** Distinct values, compared case-insensitively; the first spelling seen is kept. */
function distinct(values: (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>()
  for (const value of values) {
    if (value && !seen.has(value.toUpperCase())) seen.set(value.toUpperCase(), value)
  }
  return [...seen.values()]
}
