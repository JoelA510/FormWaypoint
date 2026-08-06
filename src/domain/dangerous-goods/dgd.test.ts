import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { consignment, entry, overpack, pkg } from './test-support'
import { assess } from './assess'
import { buildDeclaration, wrap } from './dgd'
import { renderDeclaration } from '../../carriers/dgd/render'


/** The workbook's Section IB exercise, which prints the expected declaration alongside it. */
const workbook = consignment([
  pkg('p1', [entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 7 })]),
  pkg('p2', [
    entry('e2', { chemistry: 'lithium-metal', lithiumContentG: 1.5 }, {
      netWeightKgPerPackage: 1.5,
      wattHourMarkedOnCase: false,
    }),
  ]),
])

describe('the workbook declaration', () => {
  const declaration = buildDeclaration(workbook, assess(workbook))

  it('reproduces the two entries the exercise asks for', () => {
    expect(declaration.lines).toHaveLength(2)
    expect(declaration.lines[0]).toMatchObject({
      unNumber: 'UN3480',
      properShippingName: ['Lithium ion batteries'],
      classOrDivision: '9',
      subsidiaryRisk: '',
      packingGroup: '',
      quantityAndType: ['1 Fibreboard box x 7 kg'],
      packingInstruction: '965 IB',
    })
    expect(declaration.lines[1]).toMatchObject({
      unNumber: 'UN3090',
      properShippingName: ['Lithium metal batteries'],
      quantityAndType: ['1 Fibreboard box x 1.5 kg'],
      packingInstruction: '968 IB',
    })
  })

  it('strikes out passenger aircraft, because the goods are cargo aircraft only', () => {
    expect(declaration.aircraft).toBe('cargo-aircraft-only')
    expect(declaration.shipmentType).toBe('non-radioactive')
  })

  it('puts the emergency contact in the handling information box', () => {
    expect(declaration.additionalHandlingInformation).toEqual([
      'Emergency Contact Name: CHEMTREC',
      '24 hr. Emergency Contact Tel. No.: 1-800-424-9300 / +1-703-527-3887',
    ])
  })

  it('fits on one page and says so', () => {
    expect(declaration.pages).toHaveLength(1)
    expect(declaration.pages[0]).toMatchObject({ pageNumber: 1, pageCount: 1 })
  })

  it('leaves the air waybill number blank and says why', () => {
    expect(declaration.airWaybillNumber).toBe('')
    expect(declaration.notes.some((n) => n.includes('air waybill number is left blank'))).toBe(true)
  })

  it('carries the wording no box on the form holds', () => {
    expect(declaration.notes).toContain('Sign by hand — a typewritten signature is not acceptable.')
    expect(declaration.notes.some((n) => n.includes('red'))).toBe(true)
    expect(declaration.notes.some((n) => n.includes('two years'))).toBe(true)
  })
})

describe('packaging descriptions', () => {
  it('multiplies the package count out across identical overpacks', () => {
    const shipment = consignment(
      [pkg('p1', [entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 10 })], { count: 50, overpackId: 'o1' })],
      { overpacks: [overpack('o1', { marks: '#A001, #A002', count: 2 })] },
    )
    const declaration = buildDeclaration(shipment, assess(shipment))
    expect(declaration.lines[0].quantityAndType.join(' ')).toBe('100 Fibreboard box x 10 kg')
    expect(declaration.lines[0].annotations).toEqual([
      'Overpack used x 2',
      'Overpack identification marks: #A001, #A002',
      'Total quantity per Overpack 500 kg',
    ])
  })

  it('writes the plain wording for a single overpack', () => {
    const shipment = consignment(
      [pkg('p1', [entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 10 })], { count: 3, overpackId: 'o1' })],
      { overpacks: [overpack('o1')] },
    )
    const declaration = buildDeclaration(shipment, assess(shipment))
    expect(declaration.lines[0].quantityAndType.join(' ')).toBe('3 Fibreboard box x 10 kg')
    expect(declaration.lines[0].annotations).toEqual(['Overpack used'])
  })

  it('states the packaging once for a package holding two entries', () => {
    const shipment = consignment([
      pkg('p1', [
        entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 7 }),
        entry('e2', { chemistry: 'lithium-metal', lithiumContentG: 1 }, {
          netWeightKgPerPackage: 1.5,
          wattHourMarkedOnCase: false,
        }),
      ]),
    ])
    const declaration = buildDeclaration(shipment, assess(shipment))
    expect(declaration.lines[0].quantityAndType).toEqual(['1 Fibreboard box x 7 kg'])
    expect(declaration.lines[0].sharesPackagingWithPreviousLine).toBe(false)
    expect(declaration.lines[1].quantityAndType).toEqual(['1.5 kg'])
    expect(declaration.lines[1].sharesPackagingWithPreviousLine).toBe(true)
  })

  it('puts the overpack wording after the last entry of the package, not each one', () => {
    const shipment = consignment(
      [
        pkg(
          'p1',
          [
            entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 7 }),
            entry('e2', { chemistry: 'lithium-metal', lithiumContentG: 1 }, {
              netWeightKgPerPackage: 1.5,
              wattHourMarkedOnCase: false,
            }),
          ],
          { overpackId: 'o1' },
        ),
      ],
      { overpacks: [overpack('o1')] },
    )
    const declaration = buildDeclaration(shipment, assess(shipment))
    expect(declaration.lines[0].annotations).toEqual([])
    expect(declaration.lines[1].annotations).toEqual(['Overpack used'])
  })
})

describe('pagination', () => {
  it('numbers every sheet out of the real total', () => {
    const many = consignment(
      Array.from({ length: 20 }, (_, i) =>
        pkg(`p${i}`, [entry(`e${i}`, { wattHours: 95 }, { netWeightKgPerPackage: 1 + i })]),
      ),
    )
    const declaration = buildDeclaration(many, assess(many))
    expect(declaration.pages.length).toBeGreaterThan(1)
    expect(declaration.pages.map((p) => p.pageNumber)).toEqual(
      declaration.pages.map((_, i) => i + 1),
    )
    expect(new Set(declaration.pages.map((p) => p.pageCount))).toEqual(new Set([declaration.pages.length]))
    expect(declaration.pages.flatMap((p) => p.lines)).toHaveLength(20)
  })

  it('always produces a sheet, even with nothing on it', () => {
    const empty = buildDeclaration(consignment([]), assess(consignment([])))
    expect(empty.pages).toEqual([{ pageNumber: 1, pageCount: 1, lines: [] }])
  })
})

describe('wrapping', () => {
  it('breaks on words and hard-splits anything longer than the column', () => {
    expect(wrap('Lithium ion batteries packed with equipment', 20)).toEqual([
      'Lithium ion',
      'batteries packed',
      'with equipment',
    ])
    expect(wrap('AAAAAAAAAA', 4)).toEqual(['AAAA', 'AAAA', 'AA'])
    expect(wrap('', 10)).toEqual([''])
  })
})

describe('rendering', () => {
  it('produces a PDF with one page per sheet', async () => {
    const declaration = buildDeclaration(workbook, assess(workbook))
    const { bytes, warnings } = await renderDeclaration(declaration)
    expect(warnings).toEqual([])
    // A PDF, and not an empty one.
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(bytes.byteLength).toBeGreaterThan(2000)
  })

  it('renders every sheet of a multi-page declaration', async () => {
    const many = consignment(
      Array.from({ length: 20 }, (_, i) =>
        pkg(`p${i}`, [entry(`e${i}`, { wattHours: 95 }, { netWeightKgPerPackage: 1 + i })]),
      ),
    )
    const declaration = buildDeclaration(many, assess(many))
    const { bytes } = await renderDeclaration(declaration)
    const reopened = await PDFDocument.load(bytes)
    expect(reopened.getPageCount()).toBe(declaration.pages.length)
    // The boxes the forwarder completes are fields, one set per sheet, not printed blanks.
    expect(reopened.getForm().getFields().length).toBeGreaterThanOrEqual(declaration.pages.length * 3)
  })

  it('reports an address line too wide for its box rather than clipping it silently', async () => {
    const wide = consignment([pkg('p1', [entry('e1', { wattHours: 95 })])], {
      consignee: {
        name: 'A consignee whose registered trading name runs well past the width of the box it is printed in',
        addressLines: ['15 Rockwell Lane'],
      },
    })
    const { warnings } = await renderDeclaration(buildDeclaration(wide, assess(wide)))
    expect(warnings.some((w) => w.startsWith('Consignee:'))).toBe(true)
  })
})
