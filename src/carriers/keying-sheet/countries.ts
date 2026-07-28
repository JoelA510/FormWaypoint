/**
 * Country name to ISO 3166-1 alpha-2, because that is what the shipping applications want.
 *
 * FedEx Ship Manager stores country of manufacture as `GB`, `MY`, `JP`, `US` — the CIPL
 * prints `United Kingdom`, `Malaysia`, `Japan`, `United States`. Typing the long name into
 * that column does not fail loudly; it just is not the code the commodity record needs.
 *
 * Deliberately not exhaustive, and deliberately not fuzzy. An unknown name is returned
 * unchanged and flagged for the operator rather than guessed at — a wrong country of
 * manufacture is a customs misdeclaration, and there is no version of guessing that is
 * safer than asking.
 */
const ISO_ALPHA2: Record<string, string> = {
  'united states': 'US',
  'united states of america': 'US',
  usa: 'US',
  'u.s.a.': 'US',
  'united kingdom': 'GB',
  'great britain': 'GB',
  uk: 'GB',
  england: 'GB',
  scotland: 'GB',
  japan: 'JP',
  malaysia: 'MY',
  singapore: 'SG',
  china: 'CN',
  "china, people's republic of": 'CN',
  taiwan: 'TW',
  'korea, republic of': 'KR',
  'south korea': 'KR',
  korea: 'KR',
  india: 'IN',
  indonesia: 'ID',
  thailand: 'TH',
  vietnam: 'VN',
  philippines: 'PH',
  germany: 'DE',
  france: 'FR',
  italy: 'IT',
  spain: 'ES',
  netherlands: 'NL',
  'the netherlands': 'NL',
  belgium: 'BE',
  switzerland: 'CH',
  austria: 'AT',
  sweden: 'SE',
  denmark: 'DK',
  norway: 'NO',
  finland: 'FI',
  ireland: 'IE',
  poland: 'PL',
  'czech republic': 'CZ',
  czechia: 'CZ',
  hungary: 'HU',
  romania: 'RO',
  portugal: 'PT',
  mexico: 'MX',
  canada: 'CA',
  brazil: 'BR',
  argentina: 'AR',
  chile: 'CL',
  australia: 'AU',
  'new zealand': 'NZ',
  israel: 'IL',
  turkey: 'TR',
  'south africa': 'ZA',
  'hong kong': 'HK',
  'united arab emirates': 'AE',
}

export interface CountryCode {
  /** The two-letter code, or the original text when it is not recognised. */
  code: string
  /** False when the name was not recognised and the operator must supply the code. */
  known: boolean
}

export function toIsoAlpha2(name: string | null | undefined): CountryCode {
  const text = (name ?? '').trim()
  if (!text) return { code: '', known: false }
  // Already a code, as an item master or a hand-typed value may well be.
  if (/^[A-Za-z]{2}$/.test(text)) return { code: text.toUpperCase(), known: true }
  const hit = ISO_ALPHA2[text.toLowerCase()]
  return hit ? { code: hit, known: true } : { code: text, known: false }
}

/** `Singapore` -> `SG - Singapore`, the form Ship Manager's country picker shows. */
export function toCountryPickerLabel(name: string | null | undefined): string {
  const text = (name ?? '').trim()
  if (!text) return ''
  const { code, known } = toIsoAlpha2(text)
  return known && code !== text ? `${code} - ${text}` : text
}
