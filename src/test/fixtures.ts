import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/**
 * Real, manually-processed shipments used as regression fixtures.
 *
 * Only the CIPLs (the pipeline's *input*) are committed. The completed SLIs they were
 * checked against are deliberately not, because they carry handwritten signatures; the
 * values read off them live in `expected/` as plain data instead.
 */
export const FIXTURES = {
  G78495IQ: 'G78495IQ_CIPL.pdf',
  K78464FJ: 'K78464FJ_CIPL.pdf',
  K78027EC: 'K78027EC_CIPL.pdf',
  // "OMRON SHIPMENT#" format — no weights, carries an ECCN column.
  '278515': '278515_CIPL.pdf',
  '278514': '278514_CIPL.pdf',
} as const

export type FixtureName = keyof typeof FIXTURES

export function readFixture(name: FixtureName): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(HERE, 'fixtures', FIXTURES[name])))
}
