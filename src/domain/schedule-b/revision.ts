/**
 * Diffing one Schedule B dataset against another, and reporting what it means.
 *
 * The desktop build refreshes the Census concordance in place. A silent replacement would
 * be the wrong behaviour: the whole point of the dataset is answering "is this code still
 * current", so when that answer changes for a code someone is actually filing against, a
 * person needs to see it and act — correct the item master, re-check a classification.
 *
 * This module is the part of that feature with no filesystem and no network in it, so it
 * can be built and proved before the Tauri shell exists. The shell only has to fetch the
 * file, call `diffScheduleB`, and write what `renderChangeLog` returns.
 *
 * Nothing here edits anything. It reports what Census changed and which parts that touches;
 * every correction stays a human action, exactly as with the rest of the tool.
 */
import { formatScheduleB, normalizeScheduleB, type RawPayload } from '.'
import type { ItemLibraryEntry } from '../item-library'

export type ChangeKind = 'added' | 'retired' | 'changed'

export interface CodeChange {
  /** Ten digits, unpunctuated. */
  code: string
  kind: ChangeKind
  /** Description after the revision; for a retired code, the one it last carried. */
  description: string
  previousDescription?: string
  /** Units after the revision; for a retired code, the ones it last required. */
  units: string[]
  previousUnits?: string[]
  descriptionChanged?: boolean
  unitsChanged?: boolean
}

export interface ScheduleBRevision {
  /** `generatedAt` of the installed dataset. */
  from: string
  /** `generatedAt` of the downloaded one. */
  to: string
  added: CodeChange[]
  retired: CodeChange[]
  changed: CodeChange[]
  unchanged: number
  /** True when nothing moved at all — the caller should not write a log. */
  empty: boolean
}

/**
 * How much a change matters to a part already classified under the code.
 *
 * `retired` is a filing AES rejects outright. `unit` is worse in a quieter way: the code
 * still validates, so nothing looks wrong, while the quantity is now reported in a unit
 * the schedule no longer asks for. `description` is informational — a prompt to confirm
 * the classification still fits, not evidence that it does not.
 */
export type AffectedSeverity = 'retired' | 'unit' | 'description'

export interface AffectedPart {
  partNumber: string
  itemDescription: string
  /** The code as the item master writes it. */
  code: string
  severity: AffectedSeverity
  change: CodeChange
}

const sortByCode = (a: CodeChange, b: CodeChange) => a.code.localeCompare(b.code)

function sameUnits(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((unit, i) => unit === b[i])
}

/**
 * Re-keys a dataset on the bare ten digits.
 *
 * The current build script already writes unpunctuated keys, so on today's files this
 * changes nothing. It is here because the alternative failure is severe and silent: diffing
 * a dataset keyed `8544.42.0000` against one keyed `8544420000` would report every code as
 * both retired and added, and a change log claiming 9,746 retirements would be acted on.
 */
function byDigits(codes: RawPayload['codes']): Map<string, { d: string; u: string[] }> {
  const out = new Map<string, { d: string; u: string[] }>()
  for (const [code, entry] of Object.entries(codes)) {
    const digits = normalizeScheduleB(code)
    if (digits) out.set(digits, entry)
  }
  return out
}

/**
 * Compares two datasets.
 *
 * Codes are compared on their ten digits, so a difference in how either file punctuates
 * them cannot register as a revision.
 */
export function diffScheduleB(previous: RawPayload, next: RawPayload): ScheduleBRevision {
  const added: CodeChange[] = []
  const retired: CodeChange[] = []
  const changed: CodeChange[] = []
  let unchanged = 0

  const before_ = byDigits(previous.codes)
  const after = byDigits(next.codes)

  for (const [code, entry] of after) {
    const before = before_.get(code)
    if (!before) {
      added.push({ code, kind: 'added', description: entry.d, units: entry.u })
      continue
    }
    const descriptionChanged = before.d !== entry.d
    const unitsChanged = !sameUnits(before.u, entry.u)
    if (!descriptionChanged && !unitsChanged) {
      unchanged++
      continue
    }
    changed.push({
      code,
      kind: 'changed',
      description: entry.d,
      previousDescription: before.d,
      units: entry.u,
      previousUnits: before.u,
      descriptionChanged,
      unitsChanged,
    })
  }

  for (const [code, entry] of before_) {
    if (after.has(code)) continue
    retired.push({ code, kind: 'retired', description: entry.d, units: entry.u })
  }

  added.sort(sortByCode)
  retired.sort(sortByCode)
  changed.sort(sortByCode)

  return {
    from: previous.generatedAt,
    to: next.generatedAt,
    added,
    retired,
    changed,
    unchanged,
    empty: !added.length && !retired.length && !changed.length,
  }
}

/**
 * The parts in an item master that this revision touches.
 *
 * Added codes are deliberately not consulted: nothing can already be classified under a
 * code that did not exist. What matters is a part whose code was retired or redefined.
 */
export function affectedParts(revision: ScheduleBRevision, entries: ItemLibraryEntry[]): AffectedPart[] {
  const relevant = new Map<string, CodeChange>()
  for (const change of revision.retired) relevant.set(change.code, change)
  for (const change of revision.changed) relevant.set(change.code, change)
  if (!relevant.size) return []

  const affected: AffectedPart[] = []
  for (const entry of entries) {
    if (!entry.exportCode) continue
    const change = relevant.get(normalizeScheduleB(entry.exportCode))
    if (!change) continue
    affected.push({
      partNumber: entry.displayPartNumber,
      itemDescription: entry.description,
      code: entry.exportCode,
      severity: change.kind === 'retired' ? 'retired' : change.unitsChanged ? 'unit' : 'description',
      change,
    })
  }

  // Most consequential first, then by part so the order is stable between runs.
  const rank: Record<AffectedSeverity, number> = { retired: 0, unit: 1, description: 2 }
  return affected.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || a.partNumber.localeCompare(b.partNumber),
  )
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const describeUnits = (units: string[]) => (units.length ? units.join(' / ') : '—')

/**
 * Makes text safe to put in a markdown table cell.
 *
 * Item descriptions come from someone's ERP, not from this codebase — an unescaped `|` or a
 * newline inside one silently breaks the table for every row after it, in the one file
 * whose entire purpose is being read by a person.
 */
const cell = (text: string) => text.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()

function renderCodeTable(changes: CodeChange[]): string[] {
  const lines = ['| Code | Description | Units |', '| --- | --- | --- |']
  for (const change of changes) {
    lines.push(`| ${formatScheduleB(change.code)} | ${cell(change.description)} | ${describeUnits(change.units)} |`)
  }
  return lines
}

function renderChangedTable(changes: CodeChange[]): string[] {
  const lines = ['| Code | What changed | Was | Now |', '| --- | --- | --- | --- |']
  for (const change of changes) {
    if (change.unitsChanged) {
      lines.push(
        `| ${formatScheduleB(change.code)} | Unit of quantity | ${describeUnits(change.previousUnits ?? [])} | ${describeUnits(change.units)} |`,
      )
    }
    if (change.descriptionChanged) {
      lines.push(
        `| ${formatScheduleB(change.code)} | Description | ${cell(change.previousDescription ?? '')} | ${cell(change.description)} |`,
      )
    }
  }
  return lines
}

const SEVERITY_NOTE: Record<AffectedSeverity, string> = {
  retired: 'Code retired — AES will reject a filing against it. Needs reclassifying.',
  unit: 'Unit of quantity changed — the code still validates, but the quantity is now reported in the wrong unit.',
  description: 'Description changed — confirm the classification still fits these goods.',
}

/**
 * The change log written beside a refreshed dataset.
 *
 * Two scopes, kept apart on purpose. The revision itself is the record to review and to
 * carry into a later classification session; the affected-parts section is the worklist for
 * correcting the item master by hand. A nationwide revision moves codes by the hundred and
 * only the few held against real parts drive an edit, so merging the two would bury the
 * actionable rows in the informational ones.
 */
export function renderChangeLog(
  revision: ScheduleBRevision,
  affected: AffectedPart[],
  options: { source: string; libraryLoaded: boolean },
): string {
  const lines: string[] = [
    `# Schedule B revision ${revision.from} → ${revision.to}`,
    '',
    `Source: ${options.source}`,
    '',
    `${revision.added.length} added · ${revision.retired.length} retired · ` +
      `${revision.changed.length} redefined · ${revision.unchanged} unchanged`,
    '',
    '## Parts in your item master affected by this revision',
    '',
  ]

  if (!options.libraryLoaded) {
    lines.push('No item library was loaded when this refresh ran, so no parts could be checked against it.', '')
  } else if (!affected.length) {
    lines.push('None. No part in the item master is classified under a code this revision changed.', '')
  } else {
    lines.push(
      `${affected.length} part(s) need review. This is the list to work through in JDE.`,
      '',
      '| Part | Item description | Code | What happened |',
      '| --- | --- | --- | --- |',
    )
    for (const part of affected) {
      lines.push(
        `| ${cell(part.partNumber)} | ${cell(part.itemDescription)} | ${cell(part.code)} | ${SEVERITY_NOTE[part.severity]} |`,
      )
    }
    lines.push('')
  }

  lines.push('## The revision in full', '')

  if (revision.retired.length) {
    lines.push(`### Retired (${revision.retired.length})`, '', ...renderCodeTable(revision.retired), '')
  }
  if (revision.changed.length) {
    lines.push(`### Redefined (${revision.changed.length})`, '', ...renderChangedTable(revision.changed), '')
  }
  if (revision.added.length) {
    lines.push(`### Added (${revision.added.length})`, '', ...renderCodeTable(revision.added), '')
  }

  return lines.join('\n')
}

/** The affected-parts worklist as CSV, for working through in a spreadsheet. */
export function renderAffectedCsv(affected: AffectedPart[]): string {
  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  const rows = [['Part Number', 'Item Description', 'Code', 'Change', 'Was', 'Now', 'Action'].join(',')]
  for (const part of affected) {
    const { change } = part
    const was = change.kind === 'retired' ? describeUnits(change.units) : describeUnits(change.previousUnits ?? [])
    const now = change.kind === 'retired' ? '(retired)' : describeUnits(change.units)
    rows.push(
      [part.partNumber, part.itemDescription, part.code, part.severity, was, now, SEVERITY_NOTE[part.severity]]
        .map(escape)
        .join(','),
    )
  }
  return rows.join('\n')
}

/** `schedule-b-changes-2026-07-28.md` — dated, so successive refreshes never overwrite. */
export function changeLogFileName(revision: ScheduleBRevision, extension = 'md'): string {
  return `schedule-b-changes-${revision.to}.${extension}`
}
