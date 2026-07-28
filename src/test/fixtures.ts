import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DIR = path.join(HERE, 'fixtures')

/**
 * Real, manually-processed shipments used as regression fixtures.
 *
 * **These files are never committed.** They are a customer's commercial documents — part
 * numbers, values, consignees, classifications — and they do not belong in a repository,
 * least of all a public one. `src/test/fixtures/*.pdf` is gitignored, and the suites that
 * need them skip when they are absent.
 *
 * To run the full suite, drop the CIPL PDFs into `src/test/fixtures/` under the names
 * below. The expected values are checked in as plain data, so a fixture only ever supplies
 * the input side; nothing about what the tests assert depends on having the file.
 */
export const FIXTURES = {
  vendorA1: 'vendorA1_CIPL.pdf',
  vendorA2: 'vendorA2_CIPL.pdf',
  vendorA3: 'vendorA3_CIPL.pdf',
  // FC/TP1 again, but with three things no other fixture has: a line block split by a
  // page break, a line whose weights are printed divided (`(@ / 6)`), and a commodity
  // heading stranded at the foot of a page.
  vendorA4: 'vendorA4_CIPL.pdf',
  // "SHIPMENT#" format — no weights, carries an ECCN column.
  'vendorB1': 'vendorB1_CIPL.pdf',
  'vendorB2': 'vendorB2_CIPL.pdf',
} as const

export type FixtureName = keyof typeof FIXTURES

export function hasFixture(name: FixtureName): boolean {
  return fs.existsSync(path.join(DIR, FIXTURES[name]))
}

/** True when every fixture is present, so a suite can skip as a whole. */
export function hasFixtures(...names: FixtureName[]): boolean {
  const wanted = names.length ? names : (Object.keys(FIXTURES) as FixtureName[])
  return wanted.every(hasFixture)
}

export function readFixture(name: FixtureName): Uint8Array {
  const file = path.join(DIR, FIXTURES[name])
  if (!fs.existsSync(file)) {
    throw new Error(
      `Fixture ${FIXTURES[name]} is not present. Shipment documents are not committed — ` +
        `place it in src/test/fixtures/ to run this suite.`,
    )
  }
  return new Uint8Array(fs.readFileSync(file))
}
