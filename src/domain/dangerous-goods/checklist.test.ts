import { describe, expect, it } from 'vitest'
import { consignment, entry, pkg } from './test-support'
import { assess } from './assess'
import { buildChecklist } from './checklist'
import { retainUntil } from './dgd'
import { localDate } from '../../lib/report'


describe('the package checklist', () => {
  it('lists the marks a Section IB package carries, as things to tick off', () => {
    const shipment = consignment([pkg('p1', [entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 7 })])])
    const markdown = buildChecklist(shipment, assess(shipment), '2026-08-06')

    expect(markdown).toContain('- [ ] Class 9 lithium battery hazard label')
    expect(markdown).toContain('- [ ] Lithium battery mark bearing UN3480')
    expect(markdown).toContain('- [ ] Cargo Aircraft Only label, on the same surface as the Class 9 label')
    expect(markdown).toContain('UN3480, Lithium ion batteries')
    expect(markdown).toContain('PI 965 IB')
  })

  it('is the whole deliverable for a Section II consignment, and says so', () => {
    const shipment = consignment([
      pkg('p1', [
        entry('e1', { configuration: 'contained-in-equipment', wattHours: 76 }, {
          netWeightKgPerPackage: 1.5,
          countPerPackage: 3,
        }),
      ]),
    ])
    const markdown = buildChecklist(shipment, assess(shipment), '2026-08-06')

    expect(markdown).toContain('Not required — every package is Section II')
    expect(markdown).toContain('“Lithium ion batteries in compliance with Section II of PI967”')
    expect(markdown).toContain('adequate instruction')
    expect(markdown).not.toContain('Two signed copies')
  })

  it('records the exemption rather than silently dropping the mark', () => {
    const shipment = consignment([
      pkg(
        'p1',
        [
          entry('e1', { configuration: 'contained-in-equipment', wattHours: 86 }, {
            netWeightKgPerPackage: 1,
            countPerPackage: 2,
          }),
        ],
        { count: 2 },
      ),
    ])
    const markdown = buildChecklist(shipment, assess(shipment), '2026-08-06')
    expect(markdown).toContain('*Battery mark not required:*')
  })

  it('names the operating carrier in the variations reminder', () => {
    const shipment = consignment([pkg('p1', [entry('e1', { wattHours: 95 })])])
    expect(buildChecklist(shipment, assess(shipment), '2026-08-06')).toContain('Operator variations (IATA 2.8.3) read for UPS Airlines')
  })

  it('calls out UN specification packaging with its marking', () => {
    const shipment = consignment([
      pkg('p1', [entry('e1', { wattHours: 500 }, { netWeightKgPerPackage: 20 })], {
        unSpecificationMark: '4G/Y25/S/26/USA/+D02390',
      }),
    ])
    const markdown = buildChecklist(shipment, assess(shipment), '2026-08-06')
    expect(markdown).toContain('UN specification packaging `4G/Y25/S/26/USA/+D02390`')
    expect(markdown).toContain('Packing Group II')
  })

  it('carries the failing checks through, so a half-prepared consignment says what is missing', () => {
    const shipment = consignment([pkg('p1', [entry('e1', { wattHours: null })])])
    const markdown = buildChecklist(shipment, assess(shipment), '2026-08-06')
    expect(markdown).toContain('## Outstanding')
    expect(markdown).toContain('energy content stated')
  })

  it('escapes a pipe in a shipper-supplied value rather than splitting the table', () => {
    const shipment = consignment([pkg('p1', [entry('e1', { wattHours: 95 })])], {
      consignee: { name: 'Acme | Distribution', addressLines: ['1 Road'] },
    })
    const markdown = buildChecklist(shipment, assess(shipment), '2026-08-06')
    expect(markdown).toContain('| Consignee | Acme \\| Distribution |')
  })
})

describe('the retention date', () => {
  it('is two years on, in local time', () => {
    expect(retainUntil(new Date(2026, 7, 6))).toBe('2028-08-06')
    expect(retainUntil(new Date(2026, 0, 1))).toBe('2028-01-01')
  })

  it('does not slip a day for a shipment prepared in the afternoon west of Greenwich', () => {
    // 21:00 on the 6th in UTC-7 is the 7th in UTC; the date on the shelf label is the 6th.
    expect(retainUntil(new Date(2026, 7, 6, 21, 30))).toBe('2028-08-06')
  })
})

describe('combined Section II wording', () => {
  it('offers the one statement that replaces two', () => {
    const shipment = consignment([
      pkg('p1', [
        entry('e1', { configuration: 'packed-with-equipment', wattHours: 90 }, { netWeightKgPerPackage: 1 }),
      ]),
      pkg('p2', [
        entry('e2', { configuration: 'contained-in-equipment', wattHours: 90 }, {
          netWeightKgPerPackage: 1,
          countPerPackage: 1,
        }),
      ]),
    ])
    const markdown = buildChecklist(shipment, assess(shipment), '2026-08-06')
    expect(markdown).toContain(
      'Lithium ion batteries in compliance with Section II of PI966. ' +
        'Lithium ion batteries in compliance with Section II of PI967',
    )
  })

  it('does not offer a "combined" statement when there is only one', () => {
    const shipment = consignment([
      pkg('p1', [
        entry('e1', { configuration: 'packed-with-equipment', wattHours: 90 }, { netWeightKgPerPackage: 1 }),
      ]),
    ])
    expect(buildChecklist(shipment, assess(shipment), '2026-08-06')).not.toContain('may be combined into one')
  })
})

describe('a package holding loose cells beside equipment', () => {
  it('prints both the inner-packaging line and the equipment-securing line', () => {
    const mixed = consignment([
      pkg('p1', [
        entry('e1', { configuration: 'packed-with-equipment', wattHours: 90 }, { netWeightKgPerPackage: 1 }),
        entry('e2', { configuration: 'contained-in-equipment', wattHours: 90 }, {
          netWeightKgPerPackage: 1,
          countPerPackage: 1,
        }),
      ]),
    ])
    const markdown = buildChecklist(mixed, assess(mixed), '2026-08-06')
    // Both are true of the same box; an if/else dropped the second.
    expect(markdown).toContain('- [ ] Inner packaging that completely encloses each cell or battery')
    expect(markdown).toContain('- [ ] Equipment secured against movement')
  })
})

describe('the checklist states each entry against its own allowance', () => {
  it('does not hold a 10 kg UN3480 line to the 2.5 kg its UN3090 neighbour is allowed', () => {
    const shipment = consignment([
      pkg('p1', [
        entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 8 }),
        entry('e2', { chemistry: 'lithium-metal', lithiumContentG: 1 }, {
          netWeightKgPerPackage: 2,
          wattHourMarkedOnCase: false,
        }),
      ]),
    ])
    const markdown = buildChecklist(shipment, assess(shipment), '2026-08-06')
    expect(markdown).toContain('UN3480: 8 kg in this package, at or below the 10 kg')
    expect(markdown).toContain('UN3090: 2 kg in this package, at or below the 2.5 kg')
  })

  it('states one allowance for a package A181 makes one entry of', () => {
    // Prepared to Section I, so both are declared. A181 makes them one entry: the bench
    // checklist listed two, each against its own configuration's allowance, while the
    // declaration in the same envelope printed one merged line.
    const shipment = consignment([
      pkg('p1', [
        entry('e1', { configuration: 'packed-with-equipment', wattHours: 90 }, {
          netWeightKgPerPackage: 2,
          prepareToSectionI: true,
        }),
        entry('e2', { configuration: 'contained-in-equipment', wattHours: 90 }, {
          netWeightKgPerPackage: 2,
          countPerPackage: 1,
          prepareToSectionI: true,
        }),
      ]),
    ])
    const markdown = buildChecklist(shipment, assess(shipment), '2026-08-06')
    const allowances = markdown.split('\n').filter((l) => l.includes('in this package, at or below'))
    expect(allowances).toHaveLength(1)
    expect(allowances[0]).toContain('UN3481: 4 kg in this package')
  })
})

describe('the prepared date shown beside the retention date', () => {
  it('is the same calendar basis, so the pair is exactly two years apart', () => {
    // What the record stores, and what the history table renders from it.
    const now = new Date(2026, 7, 11, 18, 0) // 6pm local — the next day in UTC west of Greenwich
    const preparedAt = now.toISOString()
    const shown = localDate(new Date(preparedAt))
    const keepUntil = retainUntil(now)

    // Taking the date off the ISO string instead would show a UTC day, and the pair would
    // read a day short of the two years the table exists to evidence.
    expect(keepUntil).toBe(`${Number(shown.slice(0, 4)) + 2}${shown.slice(4)}`)
  })
})
