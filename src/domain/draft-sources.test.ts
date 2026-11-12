/**
 * Declared values nobody chose for the shipment in hand: the form's starting values, and the
 * ones carried from a consignee's last shipment (docs/adr/0007).
 */
import { describe, expect, it } from 'vitest'
import { getAdapter } from '../carriers/registry'
import {
  carriedSettingSources,
  defaultSettingSources,
  defaultShipmentSettings,
  shippingWeightBasisCheck,
  sourcesAfterEdit,
  unconfirmedSettingChecks,
  type ShipmentSettings,
} from './draft'

const fresh = (): ShipmentSettings => defaultShipmentSettings(getAdapter('nippon-express'))
const check = (checks: ReturnType<typeof unconfirmedSettingChecks>, id: string) => checks.find((c) => c.id === id)

describe('a shipment nobody has answered for yet', () => {
  it('warns that the consignee type, related parties, hazardous and routed-export values are starting values', () => {
    const settings = fresh()
    const [confirmed, ...rest] = unconfirmedSettingChecks(settings, defaultSettingSources(), 'Singapore')
    expect(rest).toEqual([])
    expect(confirmed).toMatchObject({ id: 'settings-confirmed', severity: 'warning', passed: false, actual: '4 not confirmed' })
    // Named with the value that will be filed, so the warning can be read without the form.
    expect(confirmed.detail).toContain('Consignee type "Reseller": the starting value, not chosen for this shipment')
    expect(confirmed.detail).toContain(`Related parties "${settings.partiesRelated ? 'Yes' : 'No'}": the starting value`)
    expect(confirmed.detail).toContain('Hazardous materials "No": the starting value')
    expect(confirmed.detail).toContain('Routed export "No": the starting value')
  })

  it('never blocks: the owner prefers a warning where a manual correction exists', () => {
    for (const c of unconfirmedSettingChecks(fresh(), carriedSettingSources({ consigneeId: 'X1', destinationCountry: 'Japan' }, '2026-09-03'), 'Singapore')) {
      expect(c.severity).toBe('warning')
    }
  })

  it('passes once everything is confirmed', () => {
    const [confirmed, ...rest] = unconfirmedSettingChecks(fresh(), {}, 'Singapore')
    expect(confirmed.passed).toBe(true)
    expect(rest).toEqual([])
  })
})

describe('values carried from the consignee’s last shipment', () => {
  const carried = (): ShipmentSettings => ({
    ...fresh(),
    consigneeId: 'NL000000000B01',
    consigneeType: 'DIRECT_CONSUMER',
    partiesRelated: false,
    destinationCountry: 'Netherlands',
  })
  const sources = () =>
    carriedSettingSources({ consigneeId: 'NL000000000B01', destinationCountry: 'Netherlands' }, '2026-09-03T10:00:00.000Z')

  it('says each was carried, and from which date', () => {
    const [confirmed] = unconfirmedSettingChecks(carried(), sources(), 'Netherlands')
    expect(confirmed.passed).toBe(false)
    const from = "carried from this consignee's shipment of 2026-09-03"
    expect(confirmed.detail).toContain(`Consignee ID "NL000000000B01": ${from}`)
    expect(confirmed.detail).toContain(`Consignee type "Direct consumer": ${from}`)
    expect(confirmed.detail).toContain(`Related parties "No": ${from}`)
    expect(confirmed.detail).toContain(`Country of destination "Netherlands": ${from}`)
    // The two nothing was carried for are still the starting values.
    expect(confirmed.detail).toContain('Hazardous materials "No": the starting value')
  })

  it('does not mark a blank consignee id or destination as carried', () => {
    const marks = carriedSettingSources({ consigneeId: '  ', destinationCountry: '' }, '2026-09-03')
    expect(marks.consigneeId).toBeUndefined()
    expect(marks.destinationCountry).toBeUndefined()
    expect(marks.consigneeType).toEqual({ kind: 'carried', lastUsed: '2026-09-03' })
  })

  it('says so when the carried destination is not the one this document gives', () => {
    const differs = check(unconfirmedSettingChecks(carried(), sources(), 'Belgium'), 'destination-carried-differs')
    expect(differs).toMatchObject({ severity: 'warning', passed: false, expected: 'Belgium', actual: 'Netherlands' })
    expect(differs?.detail).toContain('Filing "Netherlands"')
    expect(differs?.detail).toContain('this document gives "Belgium"')
  })

  it('says nothing more when they agree, however they are cased, or when the document gives none', () => {
    expect(check(unconfirmedSettingChecks(carried(), sources(), 'NETHERLANDS '), 'destination-carried-differs')).toBeUndefined()
    expect(check(unconfirmedSettingChecks(carried(), sources(), null), 'destination-carried-differs')).toBeUndefined()
  })

  it('does not call a destination the person typed for this shipment a carried one', () => {
    const typed = { ...carried(), destinationCountry: 'Belgium' }
    const marks = sourcesAfterEdit(sources(), carried(), typed)
    expect(check(unconfirmedSettingChecks(typed, marks, 'Netherlands'), 'destination-carried-differs')).toBeUndefined()
  })
})

describe('what a person’s own change does', () => {
  it('stops reporting the value they changed, and only that one', () => {
    const before = fresh()
    const after = { ...before, consigneeType: 'GOVERNMENT_ENTITY' as const }
    const marks = sourcesAfterEdit(defaultSettingSources(), before, after)
    expect(Object.keys(marks).sort()).toEqual(['hazardous', 'partiesRelated', 'routedExport'])
  })

  it('leaves every mark standing when an unrelated field is edited', () => {
    const before = fresh()
    const marks = sourcesAfterEdit(defaultSettingSources(), before, { ...before, shipmentReference: 'SO-1' })
    expect(marks).toEqual(defaultSettingSources())
  })
})

describe('the note that row weights are net', () => {
  it('names the box on each form as its caption prints it, and cites the decision and the definition', () => {
    const nippon = shippingWeightBasisCheck(getAdapter('nippon-express'))
    expect(nippon).toMatchObject({ id: 'shipping-weight-is-net', severity: 'info', passed: true })
    expect(nippon.detail).toContain('box 26, "Gross Shipping Weight"')
    expect(nippon.detail).toContain('ADR 0001')
    expect(nippon.detail).toContain('15 CFR 30.6(a)(16)')
    expect(nippon.detail).toContain('Nippon Express')

    const ceva = shippingWeightBasisCheck(getAdapter('ceva'))
    expect(ceva.detail).toContain('the "Shipping Weight" column')
    expect(ceva.detail).toContain('CEVA')
  })

  it('never fails, warns or blocks: it records a standing decision, not a fault', () => {
    for (const id of ['nippon-express', 'ceva'] as const) {
      const check = shippingWeightBasisCheck(getAdapter(id))
      expect(check.passed).toBe(true)
      expect(check.severity).toBe('info')
    }
  })
})
