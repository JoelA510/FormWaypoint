// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MergedLine, Reconciliation } from '../domain/types'
import { PartOverridesPanel, type OriginEntry } from './review'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const line = (partNumber: string, countryOfOrigin: string, id = `${partNumber}:${countryOfOrigin}`): MergedLine => ({
  id,
  documentSet: 'FC',
  documentKind: 'INVOICE',
  page: 1,
  orderNumber: '00000001OP0010',
  sequence: '1',
  lineNumber: '1',
  itemId: '',
  partNumber,
  model: '',
  description: `Description of ${partNumber}`,
  commodityGroup: '',
  countryOfOrigin,
  classification: '8544.42.0000',
  quantity: 1,
  uom: 'PCS',
  extendedValue: 100,
  netWeightKg: 1,
})

let container: HTMLDivElement | null = null
let root: Root | null = null
afterEach(async () => {
  const r = root
  if (r) await act(async () => r.unmount())
  container?.remove()
  root = null
  container = null
})

const saved = vi.fn()
const cleared = vi.fn()
afterEach(() => {
  saved.mockClear()
  cleared.mockClear()
})

const mount = async (lines: MergedLine[], originEntries: Record<string, OriginEntry> = {}, enteredBy = 'Pat Example') => {
  container = document.createElement('div')
  document.body.append(container)
  const r = createRoot(container)
  root = r
  await act(async () =>
    r.render(
      <PartOverridesPanel
        reconciliation={{ mergedLines: lines } as unknown as Reconciliation}
        weights={{}}
        codes={{}}
        descriptions={{}}
        weightsNeeded={false}
        enteredBy={enteredBy}
        onSaveWeight={() => {}}
        onSaveCode={() => {}}
        onSaveDescription={() => {}}
        onClearCode={() => {}}
        originEntries={originEntries}
        onSaveOriginStatus={saved}
        onClearOriginStatus={cleared}
      />,
    ),
  )
}
const row = (part: string) =>
  [...container!.querySelectorAll('tbody tr')].find((tr) => tr.firstElementChild?.textContent === part) as HTMLElement
const select = (part: string) => row(part).querySelector<HTMLSelectElement>(`select[aria-label="D/F to file for part ${part}"]`)
const reasonBox = (part: string) =>
  row(part).querySelector<HTMLInputElement>(`input[aria-label="Reason for the D/F of part ${part}"]`)
const apply = (part: string) =>
  [...row(part).querySelectorAll('button')].find((b) => b.textContent === 'Apply to this part') as HTMLButtonElement
const setValue = async (el: HTMLInputElement | HTMLSelectElement, value: string) => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}

describe('the D/F of a part on the review screen', () => {
  it('shows the letter each stated origin gives, and says when none is stated', async () => {
    await mount([line('P-1', 'Japan'), line('P-2', 'United States'), line('P-3', '')])
    expect(row('P-1').textContent).toContain('F from Japan')
    expect(row('P-2').textContent).toContain('D from United States')
    expect(row('P-3').textContent).toContain('no origin stated')
  })

  it('shows both answers for a part the document ships from two countries', async () => {
    await mount([line('P-1', 'Japan'), line('P-1', 'United States')])
    expect(row('P-1').textContent).toContain('F from Japan; D from United States')
  })

  it('asks for a reason before an entry can be applied, and saves the part, letter and reason', async () => {
    await mount([line('P-1', 'Japan')])
    expect(reasonBox('P-1')).toBeNull()
    await setValue(select('P-1')!, 'D')
    expect(apply('P-1').disabled).toBe(true)
    await setValue(reasonBox('P-1')!, '  Assembled and tested in the United States ')
    expect(apply('P-1').disabled).toBe(false)
    await act(async () => apply('P-1').click())
    expect(saved).toHaveBeenCalledExactlyOnceWith('P-1', 'Description of P-1', 'D', 'Assembled and tested in the United States')
  })

  it('does not apply an entry nobody can be named for', async () => {
    await mount([line('P-1', 'Japan')], {}, '  ')
    await setValue(select('P-1')!, 'D')
    await setValue(reasonBox('P-1')!, 'Assembled in the United States')
    expect(apply('P-1').disabled).toBe(true)
    expect(row('P-1').textContent).toContain('set the signer name first')
  })

  it('shows an entry carried from an earlier shipment with its date, name and reason, and can revert it', async () => {
    await mount([line('P-1', 'Japan')], {
      'P-1': { status: 'D', reason: 'Assembled in the United States', enteredBy: 'Pat Example', updatedAt: '2026-09-03T10:00:00.000Z' },
    })
    const text = row('P-1').textContent ?? ''
    expect(text).toContain('document: F from Japan')
    expect(text).toContain('filing D, entered 2026-09-03 by Pat Example: Assembled in the United States')
    const revert = [...row('P-1').querySelectorAll('button')].find((b) => b.textContent === 'revert to the document')!
    await act(async () => revert.click())
    expect(cleared).toHaveBeenCalledExactlyOnceWith('P-1')
  })

  it('offers no entry on a line with no part number, because there is nothing to keep it against', async () => {
    await mount([line('', 'Japan')])
    expect(container!.querySelector('select[aria-label^="D/F to file"]')).toBeNull()
  })
})
