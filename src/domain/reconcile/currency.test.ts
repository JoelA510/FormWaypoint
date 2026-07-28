/**
 * The controlling set has to be priced in US dollars, and nothing here converts one.
 *
 * Runs on a drawn document rather than a borrowed one, so it covers the case in CI. The
 * currency is swapped on the parsed header instead of in the generator because that is the
 * only thing under test — the shipment itself is the ordinary one.
 */
import { describe, expect, it } from 'vitest'
import { reconcile } from '.'
import { parseCipl } from '../cipl'
import { buildSyntheticCipl, simpleShipment } from '../../test/synthetic/cipl'
import type { ParsedCipl } from '../types'

const CONTROLLED = { eccn: 'EAR99', sme: 'N', license: 'NLR' }

const pricedIn = async (currency: string): Promise<ParsedCipl> => {
  const parsed = await parseCipl('synthetic.pdf', await buildSyntheticCipl(simpleShipment()))
  return { ...parsed, headers: { ...parsed.headers, FC: { ...parsed.headers.FC!, documentCurrency: currency } } }
}

const currencyCheck = (parsed: ParsedCipl) => reconcile(parsed, null, CONTROLLED).checks.find((c) => c.id === 'usd-values')

describe('the currency the values are stated in', () => {
  it('says nothing when the set is priced in USD', async () => {
    const result = reconcile(await pricedIn('USD'), null, CONTROLLED)
    expect(currencyCheck(await pricedIn('USD'))).toBeUndefined()
    expect(result.checks.find((c) => c.id === 'set-selection')?.detail).toMatch(/priced in USD/)
  })

  it('blocks a set priced in a foreign currency', async () => {
    // Box 31 is "value at the port of export in US dollars". A €40,000 shipment filed at
    // face value reads as $40,000, and no check downstream would notice.
    const parsed = await pricedIn('EUR')
    expect(currencyCheck(parsed)).toMatchObject({ severity: 'blocking', passed: false, actual: 'EUR' })
    expect(reconcile(parsed, null, CONTROLLED).canGenerate).toBe(false)
  })

  it('warns, but does not block, when no currency could be read', async () => {
    // An unread currency is a fact about the parse, not about the shipment. The figures may
    // be perfectly correct, so this is raised rather than used to stop the filing.
    const parsed = await pricedIn('')
    expect(currencyCheck(parsed)).toMatchObject({ severity: 'warning', passed: false, actual: 'not stated' })
    expect(reconcile(parsed, null, CONTROLLED).canGenerate).toBe(true)
  })

  it('is judged on the set actually used, not on the ones excluded', async () => {
    // FC in USD alongside TP1 in the destination currency is the normal shape of these
    // documents; the excluded set must not raise anything.
    const parsed = await parseCipl('synthetic.pdf', await buildSyntheticCipl(simpleShipment({ includeTp1: true })))
    expect(parsed.availableSets).toEqual(['FC', 'TP1'])
    expect(currencyCheck(parsed)).toBeUndefined()
  })
})
