// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { getAdapter } from '../carriers/registry'
import {
  carriedSettingSources,
  defaultSettingSources,
  defaultShipmentSettings,
  EMPTY_PROFILE,
  sourcesAfterEdit,
  type SettingSources,
  type ShipmentSettings,
} from '../domain/draft'
import { ManualFieldsPanel } from './manual-fields'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const adapter = getAdapter('nippon-express')

/** The panel with its settings and sources held the way `App` holds them. */
function Harness({ initial, sources }: { initial: ShipmentSettings; sources: SettingSources }) {
  const [settings, setSettings] = useState(initial)
  const [marks, setMarks] = useState(sources)
  return (
    <ManualFieldsPanel
      profile={EMPTY_PROFILE}
      settings={settings}
      adapter={adapter}
      onProfileChange={() => {}}
      onSettingsChange={(next) => {
        setMarks((current) => sourcesAfterEdit(current, settings, next))
        setSettings(next)
      }}
      settingSources={marks}
      onConfirmSettings={() => setMarks({})}
    />
  )
}

let container: HTMLDivElement | null = null
let root: Root | null = null
afterEach(async () => {
  const r = root
  if (r) await act(async () => r.unmount())
  container?.remove()
  root = null
  container = null
})
const mount = async (initial: ShipmentSettings, sources: SettingSources) => {
  container = document.createElement('div')
  document.body.append(container)
  const r = createRoot(container)
  root = r
  await act(async () => r.render(<Harness initial={initial} sources={sources} />))
}
const note = () => container!.querySelector('[role="note"]')

describe('declared values nobody chose for this shipment', () => {
  it('lists the starting values with what will be filed, until they are confirmed', async () => {
    await mount(defaultShipmentSettings(adapter), defaultSettingSources())
    expect(note()?.textContent).toContain('Consignee type "Reseller": the starting value, not chosen for this shipment')
    expect(note()?.querySelectorAll('li')).toHaveLength(4)

    const confirm = [...note()!.querySelectorAll('button')].find((b) => b.textContent === 'These are right for this shipment')!
    await act(async () => confirm.click())
    expect(note()).toBeNull()
  })

  it('shows a carried value with the date it was last used', async () => {
    const settings = { ...defaultShipmentSettings(adapter), consigneeId: 'NL000000000B01', destinationCountry: 'Netherlands' }
    await mount(settings, carriedSettingSources(settings, '2026-09-03T10:00:00.000Z'))
    expect(note()?.textContent).toContain('Consignee ID "NL000000000B01": carried from this consignee’s shipment of 2026-09-03'.replace('’', "'"))
    expect(note()?.textContent).toContain('Country of destination "Netherlands": carried from')
  })

  it('drops a value from the list once the person changes it, and keeps the rest', async () => {
    await mount(defaultShipmentSettings(adapter), defaultSettingSources())
    const select = [...container!.querySelectorAll('label')]
      .filter((l) => l.textContent === 'Ultimate consignee type')
      .map((l) => document.getElementById(l.htmlFor) as HTMLSelectElement)[0]
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, 'GOVERNMENT_ENTITY')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(note()?.textContent).not.toContain('Consignee type')
    expect(note()?.querySelectorAll('li')).toHaveLength(3)
  })

  it('shows nothing when there is nothing unconfirmed', async () => {
    await mount(defaultShipmentSettings(adapter), {})
    expect(note()).toBeNull()
  })
})
