import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DIR = path.join(HERE, 'fixtures')
const MANIFEST = path.join(DIR, 'manifest.json')

/**
 * Real, manually-processed shipments used as regression fixtures.
 *
 * **Neither the documents nor their identifiers are committed.** They are a customer's
 * commercial paperwork: part numbers, values, consignees, classifications, and the document
 * numbers themselves. None of it belongs in a repository, least of all a public one.
 * `src/test/fixtures/` is gitignored in full, and every suite that needs it skips when it
 * is absent.
 *
 * To run the full suite, create `src/test/fixtures/manifest.json` alongside the PDFs:
 *
 * ```json
 * {
 *   "vendorA1": { "file": "<name>.pdf", "invoiceNumber": "<number>" },
 *   "vendorA2": { "file": "<name>.pdf" },
 *   "vendorA3": { "file": "<name>.pdf" },
 *   "vendorA4": { "file": "<name>.pdf" },
 *   "vendorB1": { "file": "<name>.pdf", "invoiceNumber": "<number>" },
 *   "vendorB2": { "file": "<name>.pdf" }
 * }
 * ```
 *
 * `invoiceNumber` is only needed where a suite asserts the parsed header number; it is read
 * from the manifest rather than hard-coded so no document number appears in the tests.
 *
 * The fixture set covers, in order: three Vendor A shipments, a fourth Vendor A shipment
 * carrying three things no other fixture has (a line block split by a page break, a line
 * whose weights are printed divided, and a commodity heading stranded at the foot of a
 * page), and two Vendor B shipments, which state no weights and carry an ECCN column.
 */
export const FIXTURE_NAMES = [
  'vendorA1',
  'vendorA2',
  'vendorA3',
  'vendorA4',
  'vendorB1',
  'vendorB2',
] as const

export type FixtureName = (typeof FIXTURE_NAMES)[number]

type FixtureEntry = { file: string; invoiceNumber?: string }

let manifestCache: Partial<Record<FixtureName, FixtureEntry>> | null = null

function manifest(): Partial<Record<FixtureName, FixtureEntry>> {
  if (manifestCache) return manifestCache
  if (!fs.existsSync(MANIFEST)) {
    manifestCache = {}
    return manifestCache
  }
  manifestCache = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as Partial<
    Record<FixtureName, FixtureEntry>
  >
  return manifestCache
}

function entry(name: FixtureName): FixtureEntry | undefined {
  return manifest()[name]
}

export function hasFixture(name: FixtureName): boolean {
  const found = entry(name)
  return Boolean(found && fs.existsSync(path.join(DIR, found.file)))
}

/** True when every fixture is present, so a suite can skip as a whole. */
export function hasFixtures(...names: FixtureName[]): boolean {
  const wanted = names.length ? names : [...FIXTURE_NAMES]
  return wanted.every(hasFixture)
}

/** The source file name for a fixture, for tests that pass a name through the parser. */
export function fixtureFile(name: FixtureName): string {
  return entry(name)?.file ?? `${name}.pdf`
}

/**
 * The document number a fixture is expected to parse to. Only defined where the manifest
 * supplies one; suites that assert it are gated on the fixtures being present anyway.
 */
export function fixtureInvoiceNumber(name: FixtureName): string {
  const number = entry(name)?.invoiceNumber
  if (!number) {
    throw new Error(
      `Fixture ${name} has no invoiceNumber in src/test/fixtures/manifest.json; ` +
        `add one to run the suite that asserts it.`,
    )
  }
  return number
}

export function readFixture(name: FixtureName): Uint8Array {
  const found = entry(name)
  if (!found) {
    throw new Error(
      `Fixture ${name} is not listed in src/test/fixtures/manifest.json. Shipment documents ` +
        `and their identifiers are not committed; see the comment in this file.`,
    )
  }
  const file = path.join(DIR, found.file)
  if (!fs.existsSync(file)) {
    throw new Error(
      `Fixture ${name} is not present. Shipment documents are not committed; ` +
        `place it in src/test/fixtures/ to run this suite.`,
    )
  }
  return new Uint8Array(fs.readFileSync(file))
}
