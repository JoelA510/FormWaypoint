/**
 * Parsing the Census Bureau's AES commodity concordance into the dataset this app loads.
 *
 * This logic used to live only in `scripts/build-schedule-b.mjs`, which is fine while the
 * only way to refresh the dataset is a developer running a script. The desktop build
 * refreshes it in place, so the same parse has to exist somewhere the app can call. It lives
 * here, and `parse-concordance.test.ts` pins it against the checked-in raw file and the
 * committed dataset, so the two implementations cannot drift apart unnoticed.
 */
import type { RawPayload } from '.'

export const CONCORDANCE_URL =
  'https://www.census.gov/foreign-trade/aes/documentlibrary/concordance/expaes.txt'

/**
 * Column layout, measured against the published file (every row is exactly 181 characters):
 * the code occupies bytes 0-9, the description runs to byte 170, and the tail holds one or
 * two units of quantity. The longest description in the current file ends at column 165, so
 * slicing at 170 cannot clip one. Splitting the whole line on whitespace instead would
 * corrupt descriptions, which contain both spaces and commas.
 */
const CODE_END = 10
const DESC_END = 170

export interface ConcordanceParse {
  payload: RawPayload
  /** Lines that carried no ten-digit code — headings, footers, blank rows. */
  skipped: number
}

export class ConcordanceError extends Error {}

/**
 * Turns the published text file into a dataset payload.
 *
 * `generatedAt` is the day the parse ran, not a date read from the file: the concordance
 * carries no version stamp of its own, and inventing one from its contents would be worse
 * than recording when it was taken.
 */
export function parseConcordance(text: string, options: { today: string }): ConcordanceParse {
  const codes: RawPayload['codes'] = {}
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

  const count = Object.keys(codes).length
  // A download that returns an error page, a login redirect, or a truncated body would
  // otherwise parse to a handful of codes and quietly replace 9,746 good ones — every
  // subsequent shipment then failing validation for no visible reason.
  if (count < 5000) {
    throw new ConcordanceError(
      `Only ${count} commodity codes were found in the downloaded file, which is far fewer than the ` +
        'concordance contains. The download was probably incomplete or is not the expected file; the ' +
        'installed dataset has been left alone.',
    )
  }

  return {
    payload: { source: CONCORDANCE_URL, generatedAt: options.today, count, codes },
    skipped,
  }
}
