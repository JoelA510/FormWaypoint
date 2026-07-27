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
  vendorA1: 'vendorA1_CIPL.pdf',
  vendorA2: 'vendorA2_CIPL.pdf',
  vendorA3: 'vendorA3_CIPL.pdf',
} as const

export type FixtureName = keyof typeof FIXTURES

export function readFixture(name: FixtureName): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(HERE, 'fixtures', FIXTURES[name])))
}
