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
 *    (the filed K78027EC shows 667.90 written as `668`, i.e. rounded, not truncated);
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

      // A single licence applies to the whole shipment on this form; ECCN stays blank
      // unless a row actually carries one, since the box is "when required".
      setText(ctx, F.license, firstDistinct(rows.map((l) => l.license)))
      const eccns = rows.map((l) => l.eccn).filter((e): e is string => Boolean(e) && e !== 'EAR99')
      if (eccns.length) setText(ctx, F.eccn, firstDistinct(eccns))

      // --- Signature block -------------------------------------------------
      setText(ctx, F.dulyAuthorized, draft.signerName)
      setText(ctx, F.signerTitle, draft.signerTitle)
      // Box 33 is initialled, not signed; boxes 29/30 are left for a pen.
      if (!draft.hazardous) setText(ctx, F.noDangerousGoods, draft.signerInitials)

      const bytes = await doc.save({ updateFieldAppearances: true })
      return { bytes, written: ctx.written, warnings: ctx.warnings }
    },
  }
}

function formatQuantity(quantity: number): string {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(3)
}

function firstDistinct(values: (string | null)[]): string {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].join(' / ')
}
