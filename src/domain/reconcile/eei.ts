/**
 * Whether the value under any one commodity number is over the figure at which the low-value
 * exemption from filing Electronic Export Information stops applying.
 *
 * Deliberately one-directional (docs/adr/0008). It can say "these totals are over the figure,
 * so the exemption in 15 CFR 30.37(a) does not cover them". It never says a shipment needs no
 * EEI: § 30.37 opens "Except as noted in § 30.2(a)(1)(iv)", which requires a filing whatever
 * the value for licensed shipments, certain destinations and other cases this tool has no way
 * to see. Saying "not required" would be inferring a compliance value (AGENTS.md project
 * rule 2).
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
  /** The last amendment the section cited when read. */
  lastAmended: '90 FR 39122, Aug. 14, 2025',
} as const

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

/** One advisory, of `info` severity: it reports a fact about the shipment and stops nothing. */
export function eeiThresholdCheck(sliLines: SLILine[]): CheckResult[] {
  if (!sliLines.length) return []
  const { thresholdUsd, citation, currentTo } = EEI_LOW_VALUE_EXEMPTION
  const over = eeiBuckets(sliLines)
    .filter((b) => b.valueUsd > thresholdUsd)
    .sort((a, b) => b.valueUsd - a.valueUsd)
  const basis = `${citation}, as the eCFR read on ${currentTo}`
  return [
    {
      id: 'eei-low-value-exemption',
      severity: 'info',
      title: `No commodity number totals over ${usd(thresholdUsd)}`,
      detail: over.length
        ? over
            .map((b) => `${b.scheduleB} ${b.domesticForeign}: ${usd(b.valueUsd)}${b.rows > 1 ? ` across ${b.rows} rows` : ''}`)
            .join(' · ') +
          `. Each is over ${usd(thresholdUsd)}, so the low-value exemption does not cover it and Electronic Export ` +
          `Information has to be filed for it (${basis}). Domestic and foreign goods under one number are counted ` +
          'apart, and rows that share a number and a letter are added together.'
        : `Every commodity number, with domestic and foreign counted apart, totals ${usd(thresholdUsd)} or less ` +
          `(${basis}). That is the low-value exemption only. It does not mean no filing is required: a licensed ` +
          'shipment, and the other cases in 15 CFR 30.2(a)(1)(iv), need one whatever the value.',
      passed: over.length === 0,
      actual: over.length ? `${over.length} over` : undefined,
    },
  ]
}
