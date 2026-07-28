import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ConcordanceError, parseConcordance } from './parse-concordance'
import type { RawPayload } from '.'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

/**
 * The published file and the dataset built from it are both checked in, so this pins the
 * parser against real bytes rather than a sample someone wrote by hand — and against the
 * output of `scripts/build-schedule-b.mjs`, so the two implementations cannot drift.
 */
describe('against the checked-in concordance', () => {
  const text = fs.readFileSync(path.join(ROOT, 'scripts/expaes.txt'), 'latin1')
  const committed = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'public/data/schedule-b.json'), 'utf8'),
  ) as RawPayload

  const { payload, skipped } = parseConcordance(text, { today: committed.generatedAt })

  it('reproduces the committed dataset exactly', () => {
    expect(payload.count).toBe(committed.count)
    expect(payload.codes).toEqual(committed.codes)
  })

  it('records the source and the day it was taken', () => {
    expect(payload.source).toBe(committed.source)
    expect(payload.generatedAt).toBe(committed.generatedAt)
  })

  it('skips only the non-data lines', () => {
    // 9,747 lines in, 9,746 codes out.
    expect(skipped).toBeLessThanOrEqual(2)
  })

  it('reads a code whose description contains commas without corrupting it', () => {
    // Whitespace-splitting the line instead of slicing columns would break this one.
    expect(payload.codes['8544420000']).toMatchObject({
      d: 'ELECTRICAL CONDUCTORS NOT EXCEEDING 1000 V FITTED WITH CONNECTORS',
    })
  })

  it('carries one or two units of quantity, never the description tail', () => {
    const units = new Set(Object.values(payload.codes).flatMap((entry) => entry.u))
    // 32 in the current file: NO, KG, DOZ, M2, PCS and the like.
    expect(units.size).toBeLessThan(60)
    for (const unit of units) expect(unit).toMatch(/^[A-Z0-9$]{1,6}$/)
    expect(Object.values(payload.codes).every((e) => e.u.length <= 2)).toBe(true)
  })
})

describe('guarding a bad download', () => {
  const line = (code: string, description: string, units: string) =>
    code.padEnd(10, ' ') + description.padEnd(160, ' ') + units

  it('refuses a body that parses to too few codes to be the concordance', () => {
    // An error page, a login redirect or a truncated response would otherwise replace 9,746
    // good codes with a handful, and every later shipment would fail validation.
    expect(() => parseConcordance('<html>Service unavailable</html>', { today: '2026-07-28' })).toThrow(
      ConcordanceError,
    )
    expect(() => parseConcordance(line('8544420000', 'CABLE', 'NO'), { today: '2026-07-28' })).toThrow(
      /far fewer than the concordance contains/,
    )
  })

  it('accepts a body once it holds a plausible number of codes', () => {
    const rows = Array.from({ length: 5000 }, (_, i) =>
      line(String(1000000000 + i), `COMMODITY ${i}`, 'NO'),
    ).join('\n')
    const { payload } = parseConcordance(rows, { today: '2026-07-28' })
    expect(payload.count).toBe(5000)
  })
})
