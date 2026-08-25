import type { CarrierAdapter, FillResult, SliDraft, TemplateVerification } from '../types'
import { NIPPON_ROW_ROOTS } from './fields'
import { paginateForm } from '../paginate'
import { rowsByPage } from '../../lib/pagination'
import {
  createContext,
  findMissingFields,
  formatDateMMDDYYYY,
  formatQuantity,
  joinLines,
  loadForm,
  selectRadio,
  setText,
} from '../form-utils'
import { isNamedPlace, parseIncoterm, RETIRED_INCOTERMS } from '../../domain/incoterms'
import {
  NIPPON_CONSIGNEE_TYPE,
  NIPPON_HEADER_FIELDS as F,
  NIPPON_INCOTERM_OPTIONS,
  NIPPON_MODE,
  NIPPON_RADIOS as R,
  NIPPON_REQUIRED_FIELDS,
  NIPPON_ROWS,
  NIPPON_TERM_OPTIONS,
} from './fields'

/**
 * Nippon Express USA Shipper's Letter of Instruction.
 *
 * Two formatting decisions here are taken from the completed examples rather than from the
 * form's own labels, and both are deliberate:
 *
 *  - **Box 26 is labelled "Gross Shipping Weight" but receives the net weight.** All three
 *    historical shipments do this. Whether that is house practice or a long-standing habit
 *    is a policy question, so it is exposed as `useGrossWeight` rather than hard-coded.
 *  - **Box 25 (DDTC quantity/UOM) receives the literal text `NO`.** Every historical line
 *    carries it, and it coincides with the Schedule B unit of quantity for those codes.
 */

export interface NipponOptions {
  /** Write gross rather than net weight into box 26. Historical practice is net. */
  useGrossWeight?: boolean
  /** Gross weights by SLI row index, required when `useGrossWeight` is set. */
  grossWeightByRow?: number[]
}

export function createNipponExpressAdapter(options: NipponOptions = {}): CarrierAdapter {
  return {
    id: 'nippon-express',
    name: 'Nippon Express USA, Inc.',
    templateVersion: '01/04/2022',
    templateUrl: 'templates/nippon-express-sli.pdf',
    maxCommodityRows: NIPPON_ROWS.length,
    maxInlineReferences: 3,
    supportedModes: ['AIR', 'OCEAN', 'TRUCK', 'RAIL'],

    defaults: {
      forwardingAgent: 'Nippon Express USA, Inc.',
      mode: 'AIR',
      term: 'DD',
      freight: 'COLLECT',
      insured: false,
      jetpak: false,
      routedExport: false,
      hazardous: false,
      containerized: false,
      consigneeType: 'RESELLER',
      partiesRelated: true,
      pointOfOrigin: 'California',
    },

    async verifyTemplate(templateBytes: Uint8Array): Promise<TemplateVerification> {
      const { form } = await loadForm(templateBytes)
      const missing = findMissingFields(form, NIPPON_REQUIRED_FIELDS)
      return { ok: missing.length === 0, missing, found: form.getFields().length }
    },

    async fill(templateBytes: Uint8Array, draft: SliDraft): Promise<FillResult> {
      // One sheet per eight commodity rows. Every box but the commodity table is a single
      // field with a widget on each sheet, so what follows writes the shipment once and the
      // rows page by page — see `paginateForm`.
      const pages = rowsByPage(draft.lines, NIPPON_ROWS.length)
      const { doc, form, fieldName } = await paginateForm(templateBytes, pages.length, NIPPON_ROW_ROOTS)
      const ctx = createContext(form)

      // --- Parties ---------------------------------------------------------
      setText(
        ctx,
        F.usppi,
        joinLines([
          draft.usppiName,
          ...draft.usppiAddressLines,
          [draft.usppiContactName, draft.usppiContactPhone].filter(Boolean).join(' / '),
        ]),
      )
      setText(ctx, F.usppiZip, draft.usppiZip)
      setText(ctx, F.usppiEin, draft.usppiEin)
      selectRadio(
        ctx,
        draft.partiesRelated ? R.partiesRelated.field : R.partiesNonRelated.field,
        draft.partiesRelated ? R.partiesRelated.option : R.partiesNonRelated.option,
      )

      setText(ctx, F.ultimateConsignee, joinLines([draft.ultimateConsignee.name, ...draft.ultimateConsignee.addressLines]))
      setText(ctx, F.consigneeId, draft.ultimateConsignee.consigneeId)
      if (draft.intermediateConsignee) {
        setText(
          ctx,
          F.intermediateConsignee,
          joinLines([draft.intermediateConsignee.name, ...draft.intermediateConsignee.addressLines]),
        )
      }
      const consigneeType = NIPPON_CONSIGNEE_TYPE[draft.consigneeType]
      selectRadio(ctx, consigneeType.field, consigneeType.option)

      // --- Shipment --------------------------------------------------------
      setText(ctx, F.dateOfExportation, formatDateMMDDYYYY(draft.dateOfExportation))
      setText(ctx, F.transportationReference, draft.transportationReference)
      setText(ctx, F.forwardingAgent, draft.forwardingAgent)
      setText(ctx, F.pointOfOrigin, draft.pointOfOrigin)
      setText(ctx, F.destinationCountry, draft.destinationCountry)
      setText(ctx, F.shipmentReference, draft.shipmentReference)

      // Read as a *rule* rather than matched literally: what reaches here is `DAP Singapore`
      // or `FOB Origin - Collect` as often as it is a bare code, and neither of those is an
      // option on this form's list. Parsed once, for the named place here and the rule below.
      const stated = parseIncoterm(draft.incoterm)
      // The place that qualifies the Incoterm. Taken from the term itself when the operator
      // left the box alone: an `omron-ci` invoice reading `DAP Singapore` names its place in
      // the same string as the rule, and dropping it files a delivery term that does not say
      // where delivery happens.
      //
      // Only where what follows the rule is a place and nothing else. A trade-terms line is a
      // composite, and `FOB Origin - Collect` carries the freight term in the same string —
      // writing that into a box captioned "NAMED PLACE/PORT" would state who pays as where
      // delivery happens. Where it cannot be told apart, the box is left for the operator and
      // they are told why, rather than the app guessing which words are the port.
      const statedPlace = stated?.namedPlace ?? ''
      const usablePlace = isNamedPlace(statedPlace) ? statedPlace : ''
      setText(ctx, F.namedPlace, draft.namedPlace || usablePlace)
      if (!draft.namedPlace && statedPlace && !usablePlace) {
        ctx.warnings.push(
          `The Incoterm reads "${draft.incoterm.trim()}", whose "${statedPlace}" mixes the named place with ` +
            'freight wording. Box 15 is left blank rather than filled with a guess — enter the place by hand.',
        )
      }

      const mode = NIPPON_MODE[draft.mode]
      selectRadio(ctx, mode.field, mode.option)

      selectRadio(ctx, R.insurance.field, draft.insured ? R.insurance.yes : R.insurance.no)
      selectRadio(ctx, R.freight.field, draft.freight === 'PREPAID' ? R.freight.prepaid : R.freight.collect)
      selectRadio(ctx, R.jetpak.field, draft.jetpak ? R.jetpak.yes : R.jetpak.no)

      if ((NIPPON_TERM_OPTIONS as readonly string[]).includes(draft.term)) {
        selectRadio(ctx, R.term.field, draft.term)
      } else if (draft.term) {
        ctx.warnings.push(`Service term "${draft.term}" is not on this form; left blank.`)
      }

      const option = stated ? formOption(stated.code) : null
      if (option) selectRadio(ctx, R.incoterm.field, option)
      else if (draft.incoterm?.trim()) {
        ctx.warnings.push(
          stated?.retired
            ? `Incoterm "${draft.incoterm.trim()}" is ${stated.code}, which Incoterms 2020 no longer has and this ` +
                `form does not list. The current rule is ${RETIRED_INCOTERMS[stated.code]}; left blank.`
            : `Incoterm "${draft.incoterm.trim()}" is not one of the form's options; left blank.`,
        )
      }

      selectRadio(
        ctx,
        draft.hazardous ? R.hazmatYes.field : R.hazmatNo.field,
        draft.hazardous ? R.hazmatYes.option : R.hazmatNo.option,
      )
      selectRadio(
        ctx,
        draft.containerized ? R.containerYes.field : R.containerNo.field,
        draft.containerized ? R.containerYes.option : R.containerNo.option,
      )
      selectRadio(
        ctx,
        draft.routedExport ? R.routedYes.field : R.routedNo.field,
        draft.routedExport ? R.routedYes.option : R.routedNo.option,
      )

      // --- Commodity rows --------------------------------------------------
      pages.forEach((rows, pageIndex) => {
        const on = (field: string) => fieldName(field, pageIndex)
        rows.forEach((line, i) => {
          const row = NIPPON_ROWS[i]
          // The row's position in the shipment, not on its sheet: a per-row policy figure is
          // indexed by the commodity it belongs to, and row 1 of page 2 is the ninth.
          const shipmentRow = pageIndex * NIPPON_ROWS.length + i
          const weight = options.useGrossWeight
            ? (options.grossWeightByRow?.[shipmentRow] ?? line.weightKg)
            : line.weightKg
          setText(ctx, on(row.df), line.domesticForeign)
          setText(ctx, on(row.scheduleB), line.scheduleB)
          // The quantity in the unit the commodity number is reported in, which is not always
          // the invoice's piece count — several codes are reported by weight — and box 25
          // beside it names that unit, so the two have to be resolved together or the form
          // states a count under a kilogram heading.
          setText(ctx, on(row.quantity), line.reportingBasis === 'none' ? '' : formatQuantity(line.reportingQuantity))
          // Box 25. See the note at the top of this file.
          setText(ctx, on(row.ddtcUom), line.reportingUom || line.scheduleBUnit || 'NO')
          setText(ctx, on(row.weight), weight.toFixed(3))
          // The form applies its own currency formatting, so a plain number is written here.
          setText(ctx, on(row.value), line.valueUsd.toFixed(2))
          setText(ctx, on(row.eccn), line.eccn)
          setText(ctx, on(row.sme), line.sme)
          setText(ctx, on(row.license), line.license)
        })
      })

      // --- Signature block -------------------------------------------------
      // Boxes 33 and 34 are signature fields and are deliberately left for a human.
      setText(ctx, F.signerTitle, draft.signerTitle)
      setText(ctx, F.signerEmail, draft.signerEmail)
      setText(ctx, F.signerPhone, draft.signerPhone)
      setText(ctx, F.signatureDate, formatDateMMDDYYYY(draft.dateOfExportation))

      const bytes = await doc.save({ updateFieldAppearances: true })
      return { bytes, written: ctx.written, warnings: ctx.warnings }
    },
  }
}

/** Maps a standard Incoterm onto the form's option name, including its `FAS`/`FCA` typos. */
function formOption(code: string): string | null {
  const aliases: Record<string, string> = { FAS: 'FSA', FCA: 'FCP' }
  const mapped = aliases[code] ?? code
  return (NIPPON_INCOTERM_OPTIONS as readonly string[]).includes(mapped) ? mapped : null
}
