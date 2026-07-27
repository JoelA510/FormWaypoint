/**
 * Builds `public/data/schedule-b.json` from the Census Bureau's AES commodity concordance.
 *
 * Source: https://www.census.gov/foreign-trade/aes/documentlibrary/concordance/expaes.txt
 *
 * The file is fixed-width: a 10-digit code, a description, then one or two units of
 * quantity. It is the authoritative list of *currently valid* Schedule B numbers — a code
 * that is absent has either never existed or has been retired, and either way must not be
 * filed. Re-run this script periodically (the file is reissued when Schedule B changes,
 * typically each January and July) and commit the regenerated JSON.
 *
 *   node scripts/build-schedule-b.mjs            # uses the checked-in scripts/expaes.txt
 *   node scripts/build-schedule-b.mjs --fetch    # re-downloads first
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const SOURCE_URL = 'https://www.census.gov/foreign-trade/aes/documentlibrary/concordance/expaes.txt'
const RAW = path.join(HERE, 'expaes.txt')
const OUT = path.join(ROOT, 'public/data/schedule-b.json')

if (process.argv.includes('--fetch')) {
  process.stdout.write(`Fetching ${SOURCE_URL}\n`)
  const res = await fetch(SOURCE_URL)
  if (!res.ok) throw new Error(`Census download failed: ${res.status} ${res.statusText}`)
  await fs.writeFile(RAW, Buffer.from(await res.arrayBuffer()))
}

const text = await fs.readFile(RAW, 'latin1')

/**
 * Column layout, measured against the published file (every row is exactly 181 chars):
 * the code occupies bytes 0-9, the description runs to byte 170, and the tail holds one or
 * two units of quantity. The longest description in the current file ends at column 165, so
 * slicing at 170 cannot clip one. Splitting the whole line on whitespace instead would
 * corrupt descriptions, which contain both spaces and commas.
 */
const CODE_END = 10
const DESC_END = 170

const codes = {}
let skipped = 0

for (const rawLine of text.split(/\r?\n/)) {
  if (!rawLine.trim()) continue
  const code = rawLine.slice(0, CODE_END).trim()
  if (!/^\d{10}$/.test(code)) {
    skipped++
    continue
  }
  const description = rawLine.slice(CODE_END, DESC_END).replace(/\s+/g, ' ').trim()
  // The tail is past every description, so whitespace-splitting it is safe here.
  const units = rawLine.slice(DESC_END).trim().split(/\s+/).filter(Boolean)
  codes[code] = { d: description, u: units }
}

const payload = {
  source: SOURCE_URL,
  generatedAt: new Date().toISOString().slice(0, 10),
  count: Object.keys(codes).length,
  codes,
}

await fs.mkdir(path.dirname(OUT), { recursive: true })
await fs.writeFile(OUT, JSON.stringify(payload))

const bytes = (await fs.stat(OUT)).size
process.stdout.write(
  `Wrote ${OUT}\n  ${payload.count} codes, ${(bytes / 1024 / 1024).toFixed(2)} MB` +
    (skipped ? `, ${skipped} non-data lines skipped\n` : '\n'),
)
