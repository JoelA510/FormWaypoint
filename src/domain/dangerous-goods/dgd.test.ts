import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { consignment, entry, overpack, pkg } from './test-support'
import { assess } from './assess'
import { buildDeclaration, QUANTITY_WIDTH, wrap } from './dgd'
import { COLUMNS, fitHeadingSize, QUANTITY_FONT_SIZE, renderDeclaration } from '../../carriers/dgd/render'


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
      'Overpack marks: #A001, #A002',
      'Total quantity per Overpack 500 kg',
    ])
  })

  it('writes the plain wording and the identifier for a single overpack', () => {
    // The identifier the assessment demands on the box has to appear on the paper too —
    // an identifier stated on one and not the other is the mismatch that gets corrected.
    const shipment = consignment(
      [pkg('p1', [entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 10 })], { count: 3, overpackId: 'o1' })],
      { overpacks: [overpack('o1')] },
    )
    const declaration = buildDeclaration(shipment, assess(shipment))
    expect(declaration.lines[0].quantityAndType.join(' ')).toBe('3 Fibreboard box x 10 kg')
    expect(declaration.lines[0].annotations).toEqual(['Overpack used', 'Overpack marks: #A001'])
    // No per-overpack total for a single overpack: it would restate the quantity column.
    expect(declaration.lines[0].annotations.join(' ')).not.toContain('Total quantity')
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
    expect(declaration.lines[1].annotations).toEqual(['Overpack used', 'Overpack marks: #A001'])
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

  it('reports overflowing handling information once, not once per sheet', async () => {
    // The box is drawn on every page and holds the same four lines on each, so the warning
    // came back twice for a two-page consignment — which reads as two things to shorten.
    const many = consignment(
      Array.from({ length: 20 }, (_, i) =>
        pkg(`p${i}`, [entry(`e${i}`, { wattHours: 95 }, { netWeightKgPerPackage: 1 + i })]),
      ),
      { additionalHandlingInformation: 'One\nTwo\nThree\nFour\nFive' },
    )
    const declaration = buildDeclaration(many, assess(many))
    expect(declaration.pages.length).toBeGreaterThan(1)
    const { warnings } = await renderDeclaration(declaration)
    expect(warnings.filter((w) => w.includes('additional handling information'))).toHaveLength(1)
  })

  it('reports a handling information line too wide for box 18, once', async () => {
    const wordy = consignment([pkg('p1', [entry('e1', { wattHours: 95 })])], {
      additionalHandlingInformation:
        'Consignment released under standing agreement number ' + 'X'.repeat(200),
    })
    const declaration = buildDeclaration(wordy, assess(wordy))
    const { warnings } = await renderDeclaration(declaration)
    const wide = warnings.filter((w) => w.includes('Additional handling information'))
    expect(wide).toHaveLength(1)
    // And it says what was actually printed, because the line really is cut to the box.
    expect(wide[0]).toMatch(/Printed as "[^"]*…"/)
  })

  it('reports an address line too wide for its box rather than clipping it silently', async () => {
    const wide = consignment([pkg('p1', [entry('e1', { wattHours: 95 })])], {
      consignee: {
        name: 'A consignee whose registered trading name runs well past the width of the box it is printed in',
        addressLines: ['15 Rockwell Lane'],
      },
    })
    const { warnings } = await renderDeclaration(buildDeclaration(wide, assess(wide)))
    const consignee = warnings.filter((w) => w.startsWith('Consignee:'))
    expect(consignee).toHaveLength(1)
    // Cut, not merely reported: the line used to be drawn in full over the air waybill
    // column beside it, under a warning saying it "may be clipped".
    expect(consignee[0]).toMatch(/Printed as "[^"]*…"/)
  })

  it('substitutes characters the form cannot print instead of failing to render at all', async () => {
    // pdf-lib's standard fonts are WinAnsi, and drawing outside it throws. Every value on
    // this form is typed by a person, so a consignee in Yokohama took the whole declaration
    // down with an opaque message about an encoding.
    const japanese = consignment([pkg('p1', [entry('e1', { wattHours: 95 })])], {
      consignee: { name: '株式会社オムロン', addressLines: ['Kyoto, Japan'] },
      signerName: 'Ю. Иванов',
    })
    const { bytes, warnings } = await renderDeclaration(buildDeclaration(japanese, assess(japanese)))
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(warnings.some((w) => w.startsWith('Consignee:') && w.includes('cannot print'))).toBe(true)
    expect(warnings.some((w) => w.startsWith('Name of signatory:') && w.includes('cannot print'))).toBe(true)
  })

  it('clips an entry taller than the table and says so, rather than drawing over the boxes beneath', async () => {
    // The paginator bounds entries per page but never one entry's own height, and two
    // free-text inputs feed it: the packaging type wrapped into the quantity column, and the
    // overpack marks list. Eighty identifiers wrap to more rows than the whole table holds.
    const marks = Array.from({ length: 80 }, (_, i) => `#A${String(i + 1).padStart(3, '0')}`).join(', ')
    const tall = consignment(
      [
        pkg('p1', [entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 10 })], {
          packagingType:
            'Fibreboard box with moulded pulp cradles, anti-static liner, corner blocks and double-wall sleeve ' +
            'per the tested design type drawing, tape-sealed on all seams',
          overpackId: 'o1',
        }),
      ],
      { overpacks: [overpack('o1', { marks, count: 2 })] },
    )
    const { warnings } = await renderDeclaration(buildDeclaration(tall, assess(tall)))
    expect(warnings.some((w) => w.includes('row(s) were not printed'))).toBe(true)
  })
})

describe('an overpack holding more than one package description', () => {
  // Two descriptions in one pair of identical overpacks: 2 × 7 kg and 1 × 2 kg per overpack.
  const shipment = consignment(
    [
      pkg('p1', [entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 7 })], {
        count: 2,
        overpackId: 'o1',
      }),
      pkg('p2', [entry('e2', { chemistry: 'lithium-metal', lithiumContentG: 1 }, {
        netWeightKgPerPackage: 2,
        wattHourMarkedOnCase: false,
      })], { count: 1, overpackId: 'o1' }),
    ],
    { overpacks: [overpack('o1', { marks: '#A001, #A002', count: 2 })] },
  )
  const declaration = buildDeclaration(shipment, assess(shipment))

  it('states the overpack wording once, not once per package', () => {
    expect(declaration.lines[0].annotations).toEqual([])
    expect(declaration.lines[1].annotations).toEqual([
      'Overpack used x 2',
      'Overpack marks: #A001, #A002',
      'Total quantity per Overpack 16 kg',
    ])
  })

  it('totals the overpack across every package in it', () => {
    // 2 × 7 kg plus 1 × 2 kg. Not 14 and not 2, which is what a per-package total would give
    // — and it would give both, on the same declaration, for the same overpack.
    const totals = declaration.lines
      .flatMap((l) => l.annotations)
      .filter((a) => a.startsWith('Total quantity per Overpack'))
    expect(totals).toEqual(['Total quantity per Overpack 16 kg'])
  })

  it('still multiplies each package description out across the overpacks', () => {
    expect(declaration.lines[0].quantityAndType.join(' ')).toBe('4 Fibreboard box x 7 kg')
    expect(declaration.lines[1].quantityAndType.join(' ')).toBe('2 Fibreboard box x 2 kg')
  })
})

describe('two overpacks whose packages are entered interleaved', () => {
  // A → #A001, B → #A002, C → #A001. In entry order, #A001's wording would land after C
  // with #A002's between it and A, so A's entry carried no overpack identification at all
  // and #A002's mark sat among entries that are not in it.
  const shipment = consignment(
    [
      pkg('a', [entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 7 })], { count: 1, overpackId: 'o1' }),
      pkg('b', [entry('e2', { wattHours: 96 }, { netWeightKgPerPackage: 3 })], { count: 1, overpackId: 'o2' }),
      pkg('c', [entry('e3', { chemistry: 'lithium-metal', lithiumContentG: 1 }, {
        netWeightKgPerPackage: 2,
        wattHourMarkedOnCase: false,
      })], { count: 1, overpackId: 'o1' }),
    ],
    {
      overpacks: [
        overpack('o1', { marks: '#A001, #A003', count: 2 }),
        overpack('o2', { marks: '#A002, #A004', count: 2 }),
      ],
    },
  )
  const declaration = buildDeclaration(shipment, assess(shipment))

  it('emits each overpack’s packages together, so its wording follows its own entries', () => {
    // A, C, then B — the two #A001 packages contiguous, at the position of the first.
    expect(declaration.lines.map((l) => l.unNumber)).toEqual(['UN3480', 'UN3090', 'UN3480'])
    expect(declaration.lines[0].annotations).toEqual([])
    expect(declaration.lines[1].annotations).toContain('Overpack marks: #A001, #A003')
    expect(declaration.lines[2].annotations).toContain('Overpack marks: #A002, #A004')
  })

  it('totals each overpack over its own packages', () => {
    expect(declaration.lines[1].annotations).toContain('Total quantity per Overpack 9 kg')
    expect(declaration.lines[2].annotations).toContain('Total quantity per Overpack 3 kg')
  })
})

describe('annotations that are wider than their column', () => {
  it('wraps the overpack identification marks rather than running them across the next column', () => {
    const shipment = consignment(
      [pkg('p1', [entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 5 })], { overpackId: 'o1' })],
      { overpacks: [overpack('o1', { marks: '#A001, #A002, #A003, #A004', count: 4 })] },
    )
    const declaration = buildDeclaration(shipment, assess(shipment))
    for (const annotation of declaration.lines[0].annotations) {
      expect(annotation.length).toBeLessThanOrEqual(QUANTITY_WIDTH)
    }
    expect(declaration.lines[0].annotations.join(' ')).toContain('#A004')
  })

  it('counts the wrapped rows towards the page budget', () => {
    const marks = Array.from({ length: 12 }, (_, i) => `#A${String(i).padStart(3, '0')}`).join(', ')
    const shipment = consignment(
      [
        ...Array.from({ length: 10 }, (_, i) =>
          pkg(`p${i}`, [entry(`e${i}`, { wattHours: 95 }, { netWeightKgPerPackage: 1 })]),
        ),
        pkg('pz', [entry('ez', { wattHours: 95 }, { netWeightKgPerPackage: 1 })], { overpackId: 'o1' }),
      ],
      { overpacks: [overpack('o1', { marks, count: 12 })] },
    )
    const declaration = buildDeclaration(shipment, assess(shipment))
    for (const page of declaration.pages) {
      const rows = page.lines.reduce(
        (sum, l) => sum + Math.max(l.properShippingName.length, l.quantityAndType.length) + l.annotations.length,
        0,
      )
      expect(rows).toBeLessThanOrEqual(14)
    }
  })
})

describe('the drawn table, measured in points rather than characters', () => {
  it('keeps every quantity and overpack row inside the column it is drawn in', async () => {
    const shipment = consignment(
      [
        // 150 Wh: Section I, fully regulated — a Section II battery would (correctly) not
        // appear on the declaration at all.
        pkg('p1', [entry('e1', { configuration: 'packed-with-equipment', wattHours: 150 }, {
          netWeightKgPerPackage: 4.5,
        })], { count: 120, overpackId: 'o1' }),
      ],
      { overpacks: [overpack('o1', { marks: '#A001, #A002, #A003', count: 3 })] },
    )
    const declaration = buildDeclaration(shipment, assess(shipment))

    // The character-count wrap in the model is a proxy for what the renderer can fit. This
    // measures the real thing: Helvetica at the size the renderer uses, against the real
    // column. An unwrapped overpack line ran across the packing instruction beside it.
    const probe = await PDFDocument.create()
    const helvetica = await probe.embedFont(StandardFonts.Helvetica)
    const columnWidth = COLUMNS.packingInstruction - COLUMNS.quantity - 8

    for (const line of declaration.lines) {
      for (const row of [...line.quantityAndType, ...line.annotations]) {
        expect(helvetica.widthOfTextAtSize(row, QUANTITY_FONT_SIZE)).toBeLessThanOrEqual(columnWidth)
      }
    }
    // And the prescribed phrases are not broken across rows.
    expect(line0Annotations(declaration)).toContain('Total quantity per Overpack 540 kg')
  })

  it('cuts a wide row to the column and says so, since the model counts characters', () => {
    // 34 characters of capitals is far wider than 34 of the fixture's lowercase, so the
    // model's wrap can hand the renderer a row the column cannot hold. It used to be drawn
    // in full, across the Packing Inst. box, in silence.
    const shouty = consignment(
      [
        pkg('p1', [entry('e1', { configuration: 'packed-with-equipment', wattHours: 150 }, {
          netWeightKgPerPackage: 4.5,
        })], { count: 200, packagingType: 'WOODEN CRATE WITH FOAM LINER', overpackId: 'o1' }),
      ],
      { overpacks: [overpack('o1', { marks: 'WWWWW MMMMM OOOOO', count: 3 })] },
    )
    return renderDeclaration(buildDeclaration(shouty, assess(shouty))).then(({ warnings }) => {
      const clipped = warnings.filter((w) => w.includes('wider than its box'))
      expect(clipped.length).toBeGreaterThan(0)
      expect(clipped.every((w) => /Printed as "[^"]*…"/.test(w))).toBe(true)
    })
  })
})

function line0Annotations(declaration: ReturnType<typeof buildDeclaration>): string[] {
  return declaration.lines.flatMap((l) => l.annotations)
}

describe('the table headings', () => {
  it('fit the columns they name, including "(Subsidiary Risk)"', async () => {
    const probe = await PDFDocument.create()
    const bold = await probe.embedFont(StandardFonts.HelveticaBold)
    const measure = (part: string, size: number) => bold.widthOfTextAtSize(part, size)

    const headings: [string[], number, number][] = [
      [['UN', 'or', 'ID No.'], COLUMNS.unNumber, COLUMNS.properShippingName],
      [['Proper Shipping Name'], COLUMNS.properShippingName, COLUMNS.classOrDivision],
      [['Class', 'or Division', '(Subsidiary Risk)'], COLUMNS.classOrDivision, COLUMNS.packingGroup],
      [['Packing', 'Group'], COLUMNS.packingGroup, COLUMNS.quantity],
      [['Quantity and', 'Type of packing'], COLUMNS.quantity, COLUMNS.packingInstruction],
      [['Packing', 'Inst.'], COLUMNS.packingInstruction, COLUMNS.authorization],
      [['Authorization'], COLUMNS.authorization, COLUMNS.end],
    ]

    for (const [label, left, right] of headings) {
      const available = right - left - 4
      const size = fitHeadingSize(label, available, measure)
      for (const part of label) expect(measure(part, size)).toBeLessThanOrEqual(available)
      // And it never shrinks so far that the heading stops being readable.
      expect(size).toBeGreaterThanOrEqual(4.6)
    }
  })
})

describe('a consignment mixing fully regulated and Section II packages', () => {
  // A Section IB box that forces the declaration, beside a Section II box that is excepted.
  const mixed = consignment([
    pkg('p1', [entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 2 })]),
    pkg('p2', [
      entry('e2', { configuration: 'contained-in-equipment', wattHours: 76 }, {
        netWeightKgPerPackage: 1.5,
        countPerPackage: 3,
        stateOfChargePercent: 20,
      }),
    ]),
  ])

  it('lists only the fully regulated entries — Section II is excepted and is not declared', () => {
    const declaration = buildDeclaration(mixed, assess(mixed))
    expect(declaration.lines.map((l) => l.packingInstruction)).toEqual(['965 IB'])
  })

  it('tells the signer the Section II packages travel beside the declaration, unlisted', () => {
    const declaration = buildDeclaration(mixed, assess(mixed))
    expect(declaration.notes.join(' ')).toContain('not listed on the declaration')
  })

  it('sums an overpack total from the declared entries only', () => {
    const shared = consignment(
      [
        pkg('p1', [entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 2 })], { overpackId: 'o1' }),
        pkg('p2', [
          entry('e2', { configuration: 'contained-in-equipment', wattHours: 76 }, {
            netWeightKgPerPackage: 1.5,
            countPerPackage: 3,
            stateOfChargePercent: 20,
          }),
        ], { overpackId: 'o1' }),
      ],
      { overpacks: [overpack('o1', { marks: '#A001, #A002', count: 2 })] },
    )
    const declaration = buildDeclaration(shared, assess(shared))
    const annotations = declaration.lines.flatMap((l) => l.annotations).join(' ')
    // 2 kg declared; the 1.5 kg of Section II batteries sharing the overpack is not a
    // declared quantity and must not inflate the total the declaration states.
    expect(annotations).toContain('Total quantity per Overpack 2 kg')
  })
})

describe('pagination keeps a package together', () => {
  it('never strands a shared-packaging continuation line at the top of a sheet', () => {
    // Five packages of three entries each: the third line of a package carries only its net
    // quantity, and separated from the line stating "1 Fibreboard box x ..." it describes a
    // package count the reader cannot see.
    const many = consignment(
      Array.from({ length: 5 }, (_, p) =>
        pkg(`p${p}`, [
          entry(`p${p}a`, { wattHours: 95 }, { netWeightKgPerPackage: 1 }),
          entry(`p${p}b`, { chemistry: 'lithium-metal', lithiumContentG: 1 }, {
            netWeightKgPerPackage: 1,
            wattHourMarkedOnCase: false,
          }),
          entry(`p${p}c`, { chemistry: 'sodium-ion', wattHours: 50 }, { netWeightKgPerPackage: 1 }),
        ]),
      ),
    )
    const declaration = buildDeclaration(many, assess(many))
    expect(declaration.pages.length).toBeGreaterThan(1)
    for (const page of declaration.pages) {
      expect(page.lines[0].sharesPackagingWithPreviousLine).toBe(false)
    }
    // And nothing was dropped or duplicated in the regrouping.
    expect(declaration.pages.flatMap((p) => p.lines)).toEqual(declaration.lines)
  })
})

describe('a package too tall for one sheet', () => {
  it('breaks it across sheets rather than letting the renderer clip the overflow', () => {
    // Eight entries in one package, plus overpack annotation rows: taller than the 14 rows
    // a sheet holds, so keeping the package together would push its last rows off the page.
    const tall = consignment(
      [
        pkg(
          'p1',
          Array.from({ length: 8 }, (_, i) =>
            entry(`e${i}`, i % 2 ? { wattHours: 95 } : { chemistry: 'sodium-ion', wattHours: 95 }, {
              netWeightKgPerPackage: 1 + i,
            }),
          ),
          { overpackId: 'o1' },
        ),
      ],
      { overpacks: [overpack('o1', { marks: '#A001, #A002, #A003, #A004, #A005', count: 5 })] },
    )
    const declaration = buildDeclaration(tall, assess(tall))
    for (const page of declaration.pages) {
      const rows = page.lines.reduce(
        (sum, l) => sum + Math.max(l.properShippingName.length, l.quantityAndType.length) + l.annotations.length,
        0,
      )
      expect(rows).toBeLessThanOrEqual(14)
    }
    // And nothing was dropped in the process.
    expect(declaration.pages.flatMap((p) => p.lines)).toEqual(declaration.lines)
  })
})

describe('an address longer than its box', () => {
  it('leaves the overflow off the form and says so, rather than drawing over the next caption', async () => {
    const long = consignment([pkg('p1', [entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 2 })])], {
      consignee: {
        name: 'Very Long Consignee Name Ltd.',
        addressLines: ['Unit 4', 'Riverside Industrial Estate', 'Eastway', 'Some Town', 'Some County', 'ZZ1 2YY', 'United Kingdom'],
      },
    })
    const declaration = buildDeclaration(long, assess(long))
    const { warnings } = await renderDeclaration(declaration)
    // Eight lines, which is past what even the condensed tier holds.
    expect(warnings.some((w) => w.includes('Consignee') && w.includes('even condensed'))).toBe(true)
    expect(warnings.some((w) => w.includes('United Kingdom'))).toBe(true)
  })

  it('condenses a block that would not fit at full size rather than dropping its country line', async () => {
    const seven = consignment([pkg('p1', [entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 2 })])], {
      consignee: {
        name: 'Consignee GmbH',
        addressLines: ['Unit 4', 'Riverside Estate', 'Eastway', 'Some Town', 'ZZ1 2YY', 'Germany'],
      },
    })
    const { warnings } = await renderDeclaration(buildDeclaration(seven, assess(seven)))
    // Seven lines: past the five that fit at full size, inside what condensing holds. The
    // country line is required to be on the form, so it goes on the form.
    expect(warnings.filter((w) => w.includes('even condensed'))).toEqual([])
  })

  it('says nothing when the block fits', async () => {
    const declaration = buildDeclaration(workbook, assess(workbook))
    const { warnings } = await renderDeclaration(declaration)
    expect(warnings.filter((w) => w.includes('even condensed'))).toEqual([])
  })
})

describe('warnings across a multi-sheet declaration', () => {
  it('reports an over-long address once, not once per sheet', async () => {
    const many = consignment(
      Array.from({ length: 20 }, (_, i) =>
        pkg(`p${i}`, [entry(`e${i}`, { wattHours: 95 }, { netWeightKgPerPackage: 1 + i })]),
      ),
      {
        consignee: {
          name: 'Very Long Consignee Name Ltd.',
          addressLines: ['Unit 4', 'Riverside Estate', 'Eastway', 'Some Town', 'Some County', 'ZZ1 2YY', 'United Kingdom'],
        },
      },
    )
    const declaration = buildDeclaration(many, assess(many))
    expect(declaration.pages.length).toBeGreaterThan(1)
    const { warnings } = await renderDeclaration(declaration)
    const overflow = warnings.filter((w) => w.includes('even condensed'))
    expect(overflow).toHaveLength(1)
    // And the list is a set, so it can be keyed by its text.
    expect(new Set(warnings).size).toBe(warnings.length)
  })
})

describe('special provision A181 on the declaration', () => {
  it('describes a package holding both configurations as packed with equipment, on one line', () => {
    // Both fully regulated, so both would otherwise print — one of them naming the
    // description A181 says does not apply to this package.
    const shipment = consignment([
      pkg('p1', [
        entry('e1', { configuration: 'packed-with-equipment', wattHours: 300 }, { netWeightKgPerPackage: 2 }),
        entry('e2', { configuration: 'contained-in-equipment', wattHours: 300 }, {
          netWeightKgPerPackage: 1,
          countPerPackage: 1,
        }),
      ]),
    ])
    const declaration = buildDeclaration(shipment, assess(shipment))
    expect(declaration.lines).toHaveLength(1)
    expect(declaration.lines[0]).toMatchObject({
      unNumber: 'UN3481',
      properShippingName: ['Lithium ion batteries packed', 'with equipment'],
      packingInstruction: '966 I',
    })
    // The mass is the same mass: A181 puts the package total on that line.
    expect(declaration.lines[0].quantityAndType.join(' ')).toBe('1 Fibreboard box x 3 kg')
  })

  it('leaves a package with only one configuration alone', () => {
    const shipment = consignment([
      pkg('p1', [entry('e1', { configuration: 'contained-in-equipment', wattHours: 300 }, {
        netWeightKgPerPackage: 2,
        countPerPackage: 1,
      })]),
    ])
    const declaration = buildDeclaration(shipment, assess(shipment))
    expect(declaration.lines[0]).toMatchObject({
      properShippingName: ['Lithium ion batteries', 'contained in equipment'],
      packingInstruction: '967 I',
    })
  })
})

describe('A181 across two chemistries in one package', () => {
  it('relabels each UN number against its own packed-with entry', () => {
    const shipment = consignment([
      pkg('p1', [
        entry('e1', { configuration: 'packed-with-equipment', wattHours: 300 }, { netWeightKgPerPackage: 1 }),
        entry('e2', { chemistry: 'lithium-metal', configuration: 'packed-with-equipment', lithiumContentG: 5 }, {
          netWeightKgPerPackage: 1,
          wattHourMarkedOnCase: false,
        }),
        entry('e3', { chemistry: 'lithium-metal', configuration: 'contained-in-equipment', lithiumContentG: 5 }, {
          netWeightKgPerPackage: 1,
          countPerPackage: 1,
          wattHourMarkedOnCase: false,
        }),
      ]),
    ])
    const declaration = buildDeclaration(shipment, assess(shipment))
    // Resolving one target for the package left the lithium metal line describing itself
    // as contained in equipment, which A181 says it is not.
    expect(declaration.lines.map((l) => l.properShippingName.join(' '))).toEqual([
      'Lithium ion batteries packed with equipment',
      'Lithium metal batteries packed with equipment',
    ])
  })
})
