import type { CheckResult, Reconciliation } from '../domain/types'
import { missingProfileFields } from '../domain/draft'
import type { SliDraft } from '../carriers/types'
import { partKey } from '../domain/part-key'

export interface LinkTarget { id: string; label: string }

export function correctionTargets(check: CheckResult, review: Reconciliation, draft: SliDraft, providesWeights: boolean): LinkTarget[] {
  const { id, refs = [] } = check
  const target = (id: string, label: string) => ({ id, label })
  const field = (key: string, label: string) => [target('shipment-' + key, label)]
  if (id === 'profile-complete') return missingProfileFields(draft).map(([key, label]) => target('profile-' + key, label))
  if (id === 'destination-country' || id === 'destination-carried-differs') return field('destination', 'Country of destination')
  if (id === 'mode-supported') return field('mode', 'Mode of transport')
  if (id === 'shipment-reference') return field('reference', 'Shipment reference')
  if (id === 'settings-confirmed') return field('confirm', 'Review shipment settings')
  if (id === 'export-control') return [
    ...field('eccn', 'ECCN'), ...field('license', 'Licence'), ...field('sme', 'SME'),
  ]
  const referenced = new Set(refs)
  const sources = new Set(refs)
  const rows = review.sliLines.map((row, i) => ({ row, number: i + 1 })).filter(({ row, number }) => {
    if (referenced.has('row-' + number)) {
      for (const source of row.sourceLineIds) sources.add(source)
      return true
    }
    return row.sourceLineIds.some(source => referenced.has(source))
  })
  const parts = new Set(review.mergedLines.filter(line => sources.has(line.id)).map(line => partKey(line.partNumber)).filter(Boolean))
  const partFields = (key: string, label: string) =>
    [...parts].map(part => target('part-' + key + '-' + part, label + ' · ' + part))

  if (/^sb-(format|active|applicability):/.test(id) || ['part-codes', 'part-code-overrides', 'item-library-conflict'].includes(id)) {
    return partFields('code', 'Schedule B')
  }
  if (id === 'origin-stated' || id === 'origin-status-entered') return partFields('origin', 'D/F')
  if (id === 'weights-present' && !providesWeights) return partFields('weight', 'Unit weight')
  if (id === 'export-control-overrides' || id.endsWith('-from-document')) return partFields('export', 'Review export controls')

  if (id === 'entered-figures') {
    return review.enteredFigures.map(entry => {
      const index = review.sliLines.findIndex(row => row.rowKey === entry.rowKey)
      return target(rowFieldId(entry.rowKey, entry.field), fieldLabels[entry.field] + ' · row ' + (index + 1))
    })
  }
  const fieldName = id.startsWith('sb-uom:') ? 'unit' : figureChecks[id]
  if (!fieldName) return []
  const affected = refs.length ? rows : review.sliLines.map((row, i) => ({ row, number: i + 1 }))
  return affected.map(({ row, number }) => target(rowFieldId(row.rowKey, fieldName), fieldLabels[fieldName] + ' · row ' + number))
}

const fieldLabels = { unit: 'Filed quantity', quantity: 'Invoice quantity', weightKg: 'Net weight', valueUsd: 'Value' }
const figureChecks: Record<string, keyof typeof fieldLabels | undefined> = {
  'total-weight': 'weightKg', 'weights-present': 'weightKg',
  'total-value': 'valueUsd', 'values-present': 'valueUsd',
  'total-quantity': 'quantity', 'line-quantities': 'quantity',
  'quantities-usable': 'unit', 'quantities-overstated': 'unit',
}

export const rowFieldId = (key: string, field: string) => 'commodity-' + field + '-' + key
