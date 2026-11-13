/**
 * Whether Electronic Export Information has to be filed for this shipment (docs/adr/0009).
 *
 * Two parts of 15 CFR Part 30 decide it as far as the documents can show. § 30.37(a) exempts
 * any commodity number whose value, with domestic and foreign goods counted apart, is $2,500 or
 * less. § 30.2(a)(1)(iv) overrides that for some shipments whatever their value: a licence from
 * BIS, State, DEA, the NRC or any other agency, anything subject to the ITAR, rough diamonds,
 * used self-propelled vehicles, and destinations in Country Group E:1 or E:2.
 *
 * So the check says one of three things, always as a warning or information and never as a
 * block: a filing is required because a total is over the figure; a filing may be required
 * whatever the value because something on the document points at one of the exceptions; or no
 * filing is needed on value, with the exceptions listed so the person can rule them out. What
 * it cannot see (an ITAR item, a used vehicle, the destination's country group) is named, never
 * concluded.
 */
import type { CheckResult, SLILine } from '../types'
import { formatScheduleB, normalizeScheduleB } from '../schedule-b'

/**
 * The figure, held as dated data with its source. Read from the regulation, never from memory:
 * when it is rechecked, every field here is rewritten together.
 */
export const EEI_LOW_VALUE_EXEMPTION = {
  /** "$2,500 or less" is exempt, so a total has to be over this to fall outside it. */
  thresholdUsd: 2500,
  citation: '15 CFR 30.37(a)',
  source: 'https://www.ecfr.gov/current/title-15/subtitle-B/chapter-I/part-30/subpart-D/section-30.37',
  /** The date the eCFR said title 15 was current to when this was read. */
  currentTo: '2026-11-09',
  retrieved: '2026-11-12',
  /** The day the owner confirmed the figure against the regulation. */
  confirmed: '2026-11-12',
  /** The last amendment the section cited when read. */
  lastAmended: '90 FR 39122, Aug. 14, 2025',
} as const

/**
 * The cases that need EEI whatever the value, held as dated data with their source, like the
 * figure above. `roughDiamondHeadings` are the six-digit HS subheadings § 30.2(a)(1)(iv)(G)
 * names, normalised to digits.
 */
export const EEI_REGARDLESS_OF_VALUE = {
  citation: '15 CFR 30.2(a)(1)(iv)',
  source: 'https://www.ecfr.gov/current/title-15/subtitle-A/part-30/subpart-A/section-30.2',
  currentTo: '2026-11-10',
  retrieved: '2026-11-13',
  lastAmended: '91 FR 35384, June 11, 2026',
  roughDiamondHeadings: ['710210', '710221', '710231'],
  /** The cases in the order the paragraph lists them, in the words the warning uses. */
  cases: [
    'a licence from the Bureau of Industry and Security, or reporting the EAR requires (15 CFR 758.1(b))',
    'a State Department (ITAR) licence, or an item subject to the ITAR though exempt from licensing',
    'a DEA export permit or declaration',
    'a Nuclear Regulatory Commission export licence',
    'an export licence from any other federal agency',
    'rough diamonds (HS 7102.10, 7102.21, 7102.31)',
    'used self-propelled vehicles',
    'a destination in Country Group E:1 or E:2 (15 CFR 758.1(b)(1))',
  ],
} as const

/** A licence column that says no licence is needed: `NLR`, however it is punctuated. */
const NO_LICENCE = /^N\.?\s*L\.?\s*R\.?$/i

export interface EeiBucket {
  scheduleB: string
  domesticForeign: SLILine['domesticForeign']
  valueUsd: number
  rows: number
}

/**
 * Value per commodity number and D/F.
 *
 * Summed, not read off the rows. The exemption is tested per Schedule B number with domestic
 * and foreign goods counted apart, and a commodity row is finer than that: `aggregateLines`
 * also splits on ECCN, licence, SME and unit. Two rows of $1,500 under one number and one
 * letter, differing only in ECCN, are $3,000 for this purpose.
 */
export function eeiBuckets(sliLines: SLILine[]): EeiBucket[] {
  const cents = new Map<string, { bucket: EeiBucket; cents: number }>()
  for (const line of sliLines) {
    const code = normalizeScheduleB(line.scheduleB)
    const key = `${code}|${line.domesticForeign}`
    // Whole cents, so thirty rows of a figure that is not exact in binary cannot drift a total
    // across the line.
    const value = Math.round((Number.isFinite(line.valueUsd) ? line.valueUsd : 0) * 100)
    const held = cents.get(key)
    if (held) {
      held.cents += value
      held.bucket.rows += 1
    } else {
      cents.set(key, {
        bucket: { scheduleB: formatScheduleB(code), domesticForeign: line.domesticForeign, valueUsd: 0, rows: 1 },
        cents: value,
      })
    }
  }
  return [...cents.values()].map(({ bucket, cents: total }) => ({ ...bucket, valueUsd: total / 100 }))
}

const usd = (value: number) =>
  `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * The EEI filing check: a warning where a filing is or may be required, information where none
 * is needed on value. Never blocking (AGENTS.md project rule 6).
 *
 * `currency` is the currency the rows are priced in. The figure is in US dollars and nothing
 * here converts, so rows in any other currency, or in one that could not be read, are not
 * compared: 20,000 yen is not $20,000. The exceptions are still looked for, because they do
 * not depend on value.
 *
 * The heading states the finding in each case and is not the passing condition restated.
 */
export function eeiThresholdCheck(sliLines: SLILine[], currency: string): CheckResult[] {
  if (!sliLines.length) return []
  const { thresholdUsd, citation, currentTo } = EEI_LOW_VALUE_EXEMPTION
  const exceptions = EEI_REGARDLESS_OF_VALUE
  const basis = `${citation}, as the eCFR read on ${currentTo}`
  const regardless = `${exceptions.citation}, as the eCFR read on ${exceptions.currentTo}`

  // What on the document points at a case that needs EEI whatever the value. Only what can be
  // read off a row: a licence that is not NLR, and a rough-diamond heading. A blank licence is
  // not read as either; the export-control check already asks for one.
  const pointers: string[] = []
  const licensed = [
    ...new Set(
      sliLines
        .map((l) => (l.license ?? '').trim())
        .filter((licence) => licence && !NO_LICENCE.test(licence)),
    ),
  ]
  if (licensed.length) {
    pointers.push(
      `rows are filed under ${licensed.map((l) => `"${l}"`).join(', ')}, not NLR: if that is a licence from BIS or ` +
        'any other agency, EEI must be filed whatever the value',
    )
  }
  const diamonds = [
    ...new Set(
      sliLines
        .map((l) => normalizeScheduleB(l.scheduleB))
        .filter((code) => exceptions.roughDiamondHeadings.some((heading) => code.startsWith(heading)))
        .map(formatScheduleB),
    ),
  ]
  if (diamonds.length) {
    pointers.push(`${diamonds.join(', ')} ${diamonds.length === 1 ? 'is' : 'are'} rough diamonds, which need EEI whatever the value`)
  }
  const pointerText = pointers.length ? ` Also: ${pointers.join('; ')} (${regardless}).` : ''
  const caseList = `${exceptions.cases.slice(0, -1).join('; ')}; or ${exceptions.cases.at(-1)}`

  if (currency.trim().toUpperCase() !== 'USD') {
    return [
      {
        id: 'eei-low-value-exemption',
        severity: pointers.length ? 'warning' : 'info',
        title: pointers.length
          ? 'EEI filing may be required whatever the value'
          : `Commodity totals not compared with the ${usd(thresholdUsd)} EEI figure`,
        detail:
          `The rows are priced in ${currency.trim() || 'a currency that could not be read'}, and the low-value ` +
          `exemption (${citation}) is stated in US dollars. Nothing is converted here, so whether any commodity ` +
          `number is over the figure has to be worked out from the US dollar values.${pointerText}`,
        passed: false,
      },
    ]
  }

  const over = eeiBuckets(sliLines)
    .filter((b) => b.valueUsd > thresholdUsd)
    .sort((a, b) => b.valueUsd - a.valueUsd)

  if (over.length) {
    return [
      {
        id: 'eei-low-value-exemption',
        severity: 'warning',
        title: `EEI filing required: ${over.length === 1 ? 'a commodity number totals' : `${over.length} commodity numbers total`} over ${usd(thresholdUsd)}`,
        detail:
          over
            .map((b) => `${b.scheduleB} ${b.domesticForeign}: ${usd(b.valueUsd)}${b.rows > 1 ? ` across ${b.rows} rows` : ''}`)
            .join(' · ') +
          `. Each is over ${usd(thresholdUsd)}, so the low-value exemption does not cover it and Electronic Export ` +
          `Information has to be filed before the goods are exported, through AES or a carrier's or agent's filing ` +
          `service (${basis}; 15 CFR 30.2(b)(1)). Domestic and foreign goods under one number are counted apart, ` +
          `and rows that share a number and a letter are added together.${pointerText}`,
        passed: false,
        actual: `${over.length} over`,
      },
    ]
  }

  if (pointers.length) {
    return [
      {
        id: 'eei-low-value-exemption',
        severity: 'warning',
        title: 'EEI filing may be required whatever the value',
        detail:
          `Every commodity number totals ${usd(thresholdUsd)} or less, so the low-value exemption (${basis}) would ` +
          `cover it, but it does not apply here if: ${pointers.join('; ')} (${regardless}). Check before export.`,
        passed: false,
      },
    ]
  }

  return [
    {
      id: 'eei-low-value-exemption',
      severity: 'info',
      title: `No EEI filing needed on value: no commodity number totals over ${usd(thresholdUsd)}`,
      detail:
        `Every commodity number, with domestic and foreign counted apart, totals ${usd(thresholdUsd)} or less, so ` +
        `the low-value exemption covers this shipment (${basis}). It does not apply, and EEI must be filed ` +
        `whatever the value, if the shipment involves ${caseList} (${regardless}). Nothing on the document ` +
        'points at any of these, but most of them can only be confirmed by you.',
      passed: true,
    },
  ]
}
