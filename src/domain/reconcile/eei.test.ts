/**
 * The low-value exemption advisory: which totals it counts, and what it refuses to conclude.
 *
 * Rows are built directly. What is under test is the arithmetic of 15 CFR 30.37(a), and no
 * document shape influences that.
 */
import { describe, expect, it } from 'vitest'
import {
  EEI_BY_DESTINATION,
  EEI_LOW_VALUE_EXEMPTION,
  EEI_REGARDLESS_OF_VALUE,
  eeiBuckets,
  eeiDestinationCheck,
  eeiThresholdCheck,
} from './eei'
import { checkDraft } from '../draft'
import { getAdapter } from '../../carriers/registry'
import type { SliDraft } from '../../carriers/types'
import { reconcile } from '.'
import { createScheduleBIndex } from '../schedule-b'
import { buildSyntheticCipl, simpleShipment } from '../../test/synthetic/cipl'
import { parseCipl } from '../cipl'
import type { SLILine } from '../types'

const row = (scheduleB: string, domesticForeign: 'D' | 'F', valueUsd: number, over: Partial<SLILine> = {}): SLILine =>
  ({
    rowKey: `${scheduleB}:${domesticForeign}:${valueUsd}:${over.eccn ?? ''}`,
    sourceLineIds: ['a'],
    domesticForeign,
    scheduleB,
    description: 'Parts',
    quantity: 1,
    scheduleBUnit: 'NO',
    scheduleBUnits: ['NO'],
    sourceUom: 'PCS',
    reportingUom: 'NO',
    reportingQuantity: 1,
    reportingBasis: 'count',
    weightKg: 1,
    valueUsd,
    eccn: 'EAR99',
    sme: 'N',
    license: 'NLR',
    countriesOfOrigin: ['Japan'],
    ...over,
  }) as SLILine

const only = (rows: SLILine[], currency = 'USD') => {
  const checks = eeiThresholdCheck(rows, currency)
  expect(checks).toHaveLength(1)
  return checks[0]
}

describe('the figure and where it was read', () => {
  it('is held as dated data with its citation and source', () => {
    expect(EEI_LOW_VALUE_EXEMPTION.thresholdUsd).toBe(2500)
    expect(EEI_LOW_VALUE_EXEMPTION.citation).toBe('15 CFR 30.37(a)')
    expect(EEI_LOW_VALUE_EXEMPTION.source).toMatch(/^https:\/\/www\.ecfr\.gov\//)
    expect(EEI_LOW_VALUE_EXEMPTION.currentTo).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(EEI_LOW_VALUE_EXEMPTION.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('which totals are over the figure', () => {
  it('treats exactly $2,500 as exempt and a cent more as not', () => {
    // "$2,500 or less" is the exemption's wording.
    expect(only([row('8544.42.0000', 'F', 2500)]).passed).toBe(true)
    const over = only([row('8544.42.0000', 'F', 2500.01)])
    expect(over.passed).toBe(false)
    expect(over.detail).toContain('8544.42.0000 F: $2,500.01')
  })

  it('adds rows that share a number and a letter, however else they differ', () => {
    // Two commodity rows, because the ECCN differs. One total for the exemption.
    const rows = [row('8544.42.0000', 'F', 1500), row('8544.42.0000', 'F', 1500, { eccn: '5A992.c' })]
    const check = only(rows)
    expect(check.passed).toBe(false)
    expect(check.detail).toContain('8544.42.0000 F: $3,000.00 across 2 rows')
    expect(check.actual).toBe('1 over')
  })

  it('counts domestic and foreign goods under one number apart', () => {
    // $1,500 D and $1,500 F under one number: neither is over, though together they are.
    expect(only([row('8544.42.0000', 'D', 1500), row('8544.42.0000', 'F', 1500)]).passed).toBe(true)
    // And when only one of them is over, only that one is named.
    const check = only([row('8544.42.0000', 'D', 2600), row('8544.42.0000', 'F', 100)])
    expect(check.detail).toContain('8544.42.0000 D: $2,600.00')
    expect(check.detail).not.toContain('8544.42.0000 F')
  })

  it('does not add different commodity numbers together', () => {
    expect(only([row('8544.42.0000', 'F', 2000), row('9031.49.8000', 'F', 2000)]).passed).toBe(true)
  })

  it('treats one number written two ways as one number', () => {
    const buckets = eeiBuckets([row('8544.42.0000', 'F', 1500), row('8544420000', 'F', 1500)])
    expect(buckets).toEqual([{ scheduleB: '8544.42.0000', domesticForeign: 'F', valueUsd: 3000, rows: 2 }])
  })

  it('names every total over the figure, largest first, and none under it', () => {
    const check = only([row('9031.49.8000', 'D', 2600), row('8544.42.0000', 'F', 9000), row('8536.50.9065', 'F', 40)])
    expect(check.detail.indexOf('8544.42.0000 F: $9,000.00')).toBeLessThan(check.detail.indexOf('9031.49.8000 D: $2,600.00'))
    expect(check.detail).not.toContain('8536.50.9065')
    expect(check.actual).toBe('2 over')
  })

  it('sums in whole cents, so many small rows cannot drift a total across the line', () => {
    // 25,000 rows of $0.10 are $2,500.00 exactly, and exempt. In floating point they are not.
    const rows = Array.from({ length: 25000 }, (_, i) => row('8544.42.0000', 'F', 0.1, { rowKey: String(i) }))
    expect(rows.reduce((sum, r) => sum + r.valueUsd, 0)).not.toBe(2500)
    expect(eeiBuckets(rows)[0].valueUsd).toBe(2500)
    expect(only(rows).passed).toBe(true)
  })
})

describe('what the check says, and how loudly', () => {
  it('warns that a filing is required when a total is over the figure, and never blocks', () => {
    const check = only([row('8544.42.0000', 'F', 100000)])
    expect(check).toMatchObject({ severity: 'warning', passed: false })
    expect(check.detail).toContain('has to be filed before the goods are exported')
    expect(check.detail).toContain("through AES or a carrier's or agent's filing service")
  })

  it('says no filing is needed on value, as information, and lists every case that would change that', () => {
    const check = only([row('8544.42.0000', 'F', 100)])
    expect(check).toMatchObject({ severity: 'info', passed: true })
    expect(check.title).toBe('No EEI filing needed on value: no commodity number totals over $2,500.00')
    expect(check.detail).toContain('the low-value exemption covers this shipment')
    for (const exception of EEI_REGARDLESS_OF_VALUE.cases) expect(check.detail).toContain(exception)
    expect(check.detail).toContain('15 CFR 30.2(a)(1)(iv), as the eCFR read on 2026-11-10')
  })

  it('cites the section and the date the text was current to', () => {
    for (const value of [100, 100000]) {
      expect(only([row('8544.42.0000', 'F', value)]).detail).toContain('15 CFR 30.37(a), as the eCFR read on 2026-11-09')
    }
  })

  it('says nothing about a shipment with no rows', () => {
    expect(eeiThresholdCheck([], 'USD')).toEqual([])
  })

  it('heads the row with what it found, never with a statement the detail contradicts', () => {
    expect(only([row('8544.42.0000', 'F', 9000)]).title).toBe('EEI filing required: a commodity number totals over $2,500.00')
    const two = only([row('8544.42.0000', 'F', 9000), row('9031.49.8000', 'D', 2600)])
    expect(two.title).toBe('EEI filing required: 2 commodity numbers total over $2,500.00')
    expect(two.title).not.toMatch(/^No /)
  })
})

describe('the cases that need EEI whatever the value', () => {
  it('holds them as dated data with their citation and source', () => {
    expect(EEI_REGARDLESS_OF_VALUE.citation).toBe('15 CFR 30.2(a)(1)(iv)')
    expect(EEI_REGARDLESS_OF_VALUE.source).toMatch(/^https:\/\/www\.ecfr\.gov\//)
    expect(EEI_REGARDLESS_OF_VALUE.currentTo).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(EEI_REGARDLESS_OF_VALUE.cases).toHaveLength(8)
  })

  it('warns, under the figure, when a row is filed under a licence that is not NLR', () => {
    const check = only([row('8544.42.0000', 'F', 100, { license: 'D123456' })])
    expect(check).toMatchObject({ severity: 'warning', passed: false, title: 'EEI filing may be required whatever the value' })
    expect(check.detail).toContain('"D123456", not NLR')
  })

  it('reads NLR however it is punctuated, and a blank licence as neither', () => {
    for (const license of ['NLR', 'nlr', ' N.L.R. ', 'N L R', '', null]) {
      const check = only([row('8544.42.0000', 'F', 100, { license } as Partial<SLILine>)])
      expect(check.severity, String(license)).toBe('info')
    }
  })

  it('warns, under the figure, about rough diamonds', () => {
    const check = only([row('7102.31.0000', 'F', 100)])
    expect(check).toMatchObject({ severity: 'warning', passed: false })
    expect(check.detail).toContain('7102.31.0000 is rough diamonds')
    // A heading outside the three is not caught.
    expect(only([row('7102.39.0010', 'F', 100)]).severity).toBe('info')
  })

  it('adds what it found to the filing-required warning when a total is also over the figure', () => {
    const check = only([row('8544.42.0000', 'F', 9000, { license: 'D123456' })])
    expect(check.title).toMatch(/^EEI filing required/)
    expect(check.detail).toContain('Also: rows are filed under "D123456"')
  })
})

describe('rows that are not priced in US dollars', () => {
  it('still looks for the cases that do not depend on value', () => {
    const check = only([row('7102.10.0000', 'F', 20000)], 'JPY')
    expect(check).toMatchObject({ severity: 'warning', title: 'EEI filing may be required whatever the value' })
    expect(check.detail).toContain('priced in JPY')
    expect(check.detail).not.toContain('$20,000')
  })

  it('compares nothing, names the currency, and gives no filing advice', () => {
    // 20,000 yen is not $20,000.
    const check = only([row('8544.42.0000', 'F', 20000), row('9031.49.8000', 'F', 10000)], 'JPY')
    expect(check).toMatchObject({ severity: 'info', passed: false })
    expect(check.title).toBe('Commodity totals not compared with the $2,500.00 EEI figure')
    expect(check.detail).toContain('priced in JPY')
    expect(check.detail).not.toContain('$20,000')
    expect(check.detail).not.toContain('has to be filed')
  })

  it('treats a currency that could not be read the same way, and never as dollars', () => {
    for (const unreadable of ['', '  ']) {
      const check = only([row('8544.42.0000', 'F', 20000)], unreadable)
      expect(check.passed).toBe(false)
      expect(check.detail).toContain('a currency that could not be read')
    }
  })

  it('reads USD however it is cased or padded', () => {
    expect(only([row('8544.42.0000', 'F', 100)], ' usd ').passed).toBe(true)
  })

  it('is given the controlling currency by the reconciliation', async () => {
    const parsed = await parseCipl('synthetic.pdf', await buildSyntheticCipl(simpleShipment()))
    const yen = {
      ...parsed,
      headers: Object.fromEntries(
        Object.entries(parsed.headers).map(([set, header]) => [set, { ...header, documentCurrency: 'JPY' }]),
      ),
    } as typeof parsed
    const result = reconcile(yen, null, { eccn: 'EAR99', sme: 'N', license: 'NLR' })
    const check = result.checks.find((c) => c.id === 'eei-low-value-exemption')
    expect(check?.title).toBe('Commodity totals not compared with the $2,500.00 EEI figure')
    expect(check?.detail).toContain('priced in JPY')
  })
})

describe('through the reconciliation', () => {
  it('is among the checks for a real parse, and does not change whether the shipment can be generated', async () => {
    const parsed = await parseCipl('synthetic.pdf', await buildSyntheticCipl(simpleShipment()))
    const scheduleB = createScheduleBIndex({
      source: 'test',
      generatedAt: '2026-07-27',
      count: 1,
      codes: { '8544420000': { d: 'INSULATED ELECTRIC CONDUCTORS', u: ['NO'] } },
    })
    const result = reconcile(parsed, scheduleB, { eccn: 'EAR99', sme: 'N', license: 'NLR' })
    const check = result.checks.find((c) => c.id === 'eei-low-value-exemption')
    expect(check?.severity).toBe('info')
    // It agrees with the rows the same reconciliation produced.
    const over = eeiBuckets(result.sliLines).filter((b) => b.valueUsd > 2500)
    expect(check?.passed).toBe(over.length === 0)
    for (const b of over) expect(check?.detail).toContain(`${b.scheduleB} ${b.domesticForeign}`)
  })
})

describe('the cases the destination decides (15 CFR 758.1(b))', () => {
  const lines = (...eccns: (string | null)[]) => eccns.map((eccn, i) => ({ scheduleB: `8544.42.000${i}`, eccn }))

  it('holds both lists as dated data with their source', () => {
    expect(EEI_BY_DESTINATION.countryGroupE).toEqual({ 'E:1': ['IR', 'KP', 'SY'], 'E:2': ['CU'] })
    expect(EEI_BY_DESTINATION.cclDestinations).toEqual(['CN', 'HK', 'RU', 'VE'])
    expect(EEI_BY_DESTINATION.currentTo).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('warns that EEI is required for a Country Group E destination, whatever the items', () => {
    for (const destination of ['Cuba', 'Iran', 'North Korea', 'Syrian Arab Republic', 'IR']) {
      const [check] = eeiDestinationCheck(destination, lines('EAR99'))
      expect(check, destination).toMatchObject({ id: 'eei-destination', severity: 'warning', passed: false })
      expect(check.detail).toContain('Country Group E:')
    }
  })

  it('warns that EEI is required for controlled items to China, Hong Kong, Russia or Venezuela, naming them', () => {
    for (const destination of ['China', "China, People's Republic of", 'Hong Kong', 'Russia', 'Venezuela']) {
      const [check] = eeiDestinationCheck(destination, lines('EAR99', '5A992.c'))
      expect(check, destination).toMatchObject({ severity: 'warning', passed: false })
      expect(check.title).toBe('EEI filing required whatever the value: controlled items to this destination')
      expect(check.detail).toContain('Items classified 5A992.c')
      expect(check.detail).toContain('License Exception GOV')
    }
    expect(eeiDestinationCheck('Hong Kong', lines('5A992.c'))[0].detail).toContain('Hong Kong counts as China')
  })

  it('says nothing for EAR99 items to those destinations, and nothing for an ordinary destination', () => {
    expect(eeiDestinationCheck('China', lines('EAR99', ' ear99 '))).toEqual([])
    expect(eeiDestinationCheck('Singapore', lines('5A992.c'))).toEqual([])
    expect(eeiDestinationCheck('', lines('5A992.c'))).toEqual([])
    expect(eeiDestinationCheck('Ruritania', lines('5A992.c'))).toEqual([])
  })

  it('says it cannot tell when rows going to those destinations have no ECCN', () => {
    const [check] = eeiDestinationCheck('Russia', lines('EAR99', null, ''))
    expect(check.title).toBe('EEI filing may be required whatever the value: ECCN not entered')
    expect(check.detail).toContain('2 row(s) have no ECCN entered')
  })

  it('is part of the draft checks, read from the destination the draft will file', () => {
    const draft = { destinationCountry: 'China', lines: [row('8544.42.0000', 'F', 100, { eccn: '5A992.c' })] }
    const checks = checkDraft(
      { ...draft, usppiName: '', usppiEin: '', usppiZip: '', pointOfOrigin: '', signerName: '', signerTitle: '', dateOfExportation: '', mode: 'AIR', shipmentReference: '' } as unknown as SliDraft,
      getAdapter('nippon-express'),
    )
    expect(checks.find((c) => c.id === 'eei-destination')?.severity).toBe('warning')
  })
})

describe('600-series and 9x515 items', () => {
  it('warns that EEI is required whatever the value, under the figure', () => {
    for (const eccn of ['9A610.x', '0A606.a', '9A515.e']) {
      const check = only([row('8544.42.0000', 'F', 100, { eccn })])
      expect(check.severity, eccn).toBe('warning')
      expect(check.detail).toContain('600 series or 9x515')
    }
  })

  it('does not take an ordinary ECCN for one', () => {
    for (const eccn of ['5A992.c', '3A001.a', '9A991.d', 'EAR99']) {
      expect(only([row('8544.42.0000', 'F', 100, { eccn })]).severity, eccn).toBe('info')
    }
  })
})
