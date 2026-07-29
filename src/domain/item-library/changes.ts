/**
 * What the manual entries would change in the item master, written out for a person to key in.
 *
 * The app cannot update JDE, and should not pretend to. What it can do is state exactly what
 * it now knows that the item master does not: a weight typed because the CIPL printed none, a
 * commodity number entered because the one on the document was wrong. Those figures are
 * currently held on one machine, and if they stay there the same part gets typed again on the
 * next shipment — which is the manual step this whole tool exists to remove.
 *
 * So the entries are diffed against the imported library and rendered as a worklist. Two
 * files, deliberately: a CSV to work through in a spreadsheet, and a markdown log that keeps
 * the reason and the name against each change so the edit can be justified months later.
 *
 * Nothing here writes to the library itself. The imported rows stay exactly as the item
 * master exported them, because the reconciliation compares the two and reports where they
 * disagree — overwriting the library with the entry would erase the very disagreement that
 * check exists to surface.
 */
import { formatScheduleB, normalizeScheduleB } from '../schedule-b'
import type { ItemLibraryEntry } from '.'

/** A field the item master holds and a person overrode. */
export type ChangedField = 'weight' | 'code'

export type ChangeAction = 'add' | 'update' | 'matches'

export interface LibraryChange {
  partNumber: string
  description: string
  field: ChangedField
  /** What the item master holds, or null when it holds nothing for this field. */
  libraryValue: string | null
  /** What was entered on this machine. */
  enteredValue: string
  /**
   * `add` — the part or the field is absent from the master.
   * `update` — the master holds a different value.
   * `matches` — the master already agrees; nothing to key.
   */
  action: ChangeAction
  /** Whether the part exists in the library at all, which changes how it is keyed. */
  partInLibrary: boolean
  reason: string
  enteredBy: string
  updatedAt: string
}

export interface LibraryChangeSet {
  /** Only what needs keying — `add` and `update`, weights and codes together. */
  actionable: LibraryChange[]
  /** Entries the master already agrees with. Counted, not listed. */
  matching: number
  /** True when no library was imported, so nothing could be compared. */
  libraryMissing: boolean
}

/** The per-part entries this diff needs, independent of how they are stored. */
export interface EnteredValues {
  partNumber: string
  description: string
  netWeightKg: number | null
  exportCode?: string
  reason?: string
  enteredBy?: string
  updatedAt: string
}

const key = (part: string) => part.trim().toUpperCase()

/**
 * Weights are compared at three decimals.
 *
 * The library's figure arrives converted from whatever unit the file declared — grams
 * divided by a thousand — so an exact comparison would report 0.056 against 0.056 as a
 * change on the strength of a floating-point tail, and put a row in the worklist that needs
 * no work.
 */
const sameWeight = (a: number, b: number) => Math.abs(a - b) < 0.0005

export function libraryChanges(entered: EnteredValues[], library: ItemLibraryEntry[]): LibraryChangeSet {
  const byPart = new Map(library.map((entry) => [key(entry.partNumber), entry]))
  const changes: LibraryChange[] = []

  for (const value of entered) {
    const entry = byPart.get(key(value.partNumber))
    const partInLibrary = Boolean(entry)
    const common = {
      partNumber: value.partNumber,
      // The library's description is the item master's own wording; prefer it, so the
      // worklist reads the way the record being edited does.
      description: entry?.description || value.description,
      partInLibrary,
      updatedAt: value.updatedAt,
    }

    if (value.netWeightKg != null) {
      const held = entry?.netWeightKg ?? null
      changes.push({
        ...common,
        field: 'weight',
        libraryValue: held == null ? null : held.toFixed(3),
        enteredValue: value.netWeightKg.toFixed(3),
        action: held == null ? 'add' : sameWeight(held, value.netWeightKg) ? 'matches' : 'update',
        // Deliberately blank. The record holds one reason and one name, both given when the
        // *code* was entered — a weight is a measurement and is not justified by a
        // classification argument. Repeating the code's reason against it would attribute a
        // figure to reasoning that was never about it, and possibly to the wrong person.
        reason: '',
        enteredBy: '',
      })
    }

    const code = value.exportCode?.trim()
    if (code) {
      const held = entry?.exportCode?.trim() || null
      changes.push({
        ...common,
        field: 'code',
        libraryValue: held,
        enteredValue: formatScheduleB(code),
        action:
          held == null
            ? 'add'
            : normalizeScheduleB(held) === normalizeScheduleB(code)
              ? 'matches'
              : 'update',
        reason: value.reason?.trim() ?? '',
        enteredBy: value.enteredBy?.trim() ?? '',
      })
    }
  }

  return {
    actionable: changes.filter((c) => c.action !== 'matches').sort(order),
    matching: changes.filter((c) => c.action === 'matches').length,
    libraryMissing: library.length === 0,
  }
}

/**
 * Codes before weights, then by part.
 *
 * A wrong commodity number is filed on every future shipment of that part until the master is
 * corrected; a missing weight only ever stops one. The rows that matter most are the ones to
 * read first.
 */
function order(a: LibraryChange, b: LibraryChange): number {
  if (a.field !== b.field) return a.field === 'code' ? -1 : 1
  return a.partNumber.localeCompare(b.partNumber)
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const FIELD_LABELS: Record<ChangedField, string> = {
  weight: 'Net weight per unit (kg)',
  code: 'Schedule B',
}

const ACTION_NOTES: Record<ChangeAction, string> = {
  add: 'Not held in the item master — add it.',
  update: 'The item master holds a different value — update it.',
  matches: 'The item master already agrees.',
}

/** Safe inside a markdown table cell — descriptions come from an ERP, not from this code. */
const cell = (text: string) => text.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()

const shown = (value: string | null) => value ?? '—'

export function renderLibraryChangeLog(
  set: LibraryChangeSet,
  options: { today: string; librarySource: string | null },
): string {
  const lines: string[] = [
    `# Item master updates — ${options.today}`,
    '',
    'Values entered by hand while processing shipments, which the item master does not yet',
    'hold. Each row is an edit to make in JDE; nothing here has been applied automatically.',
    '',
  ]

  lines.push(
    options.librarySource
      ? `Compared against: ${options.librarySource}`
      : 'No item library was imported, so every entry below is reported as an addition — ' +
          'import the master and re-export if you need this compared against it.',
    '',
  )

  if (!set.actionable.length) {
    lines.push(
      set.matching
        ? `Nothing to do. All ${set.matching} entered value(s) already match the item master.`
        : 'Nothing to do. No values have been entered by hand.',
      '',
    )
    return lines.join('\n')
  }

  const codes = set.actionable.filter((c) => c.field === 'code')
  const weights = set.actionable.filter((c) => c.field === 'weight')

  lines.push(
    `${set.actionable.length} edit(s): ${codes.length} commodity number(s), ${weights.length} weight(s).` +
      (set.matching ? ` A further ${set.matching} entered value(s) already match and are not listed.` : ''),
    '',
  )

  if (codes.length) {
    lines.push(
      `## Commodity numbers (${codes.length})`,
      '',
      'These are classification decisions. The reason and the name are recorded because an',
      'override nobody can account for later is indistinguishable from a typo.',
      '',
      '| Part | Item description | In the master | File instead | Reason | Entered by | Date |',
      '| --- | --- | --- | --- | --- | --- | --- |',
    )
    for (const c of codes) {
      lines.push(
        `| ${cell(c.partNumber)} | ${cell(c.description)} | ${shown(c.libraryValue)} | ${c.enteredValue} | ` +
          `${cell(c.reason) || '—'} | ${cell(c.enteredBy) || '—'} | ${c.updatedAt.slice(0, 10)} |`,
      )
    }
    lines.push('')
  }

  if (weights.length) {
    lines.push(
      `## Net weights (${weights.length})`,
      '',
      'Entered because the document printed none. Per unit, in kilograms.',
      '',
      '| Part | Item description | In the master | Entered | Date |',
      '| --- | --- | --- | --- | --- |',
    )
    for (const c of weights) {
      lines.push(
        `| ${cell(c.partNumber)} | ${cell(c.description)} | ${shown(c.libraryValue)} | ${c.enteredValue} | ` +
          `${c.updatedAt.slice(0, 10)} |`,
      )
    }
    lines.push('')
  }

  const newParts = [...new Set(set.actionable.filter((c) => !c.partInLibrary).map((c) => c.partNumber))]
  if (newParts.length) {
    lines.push(
      `## Parts not in the imported master (${newParts.length})`,
      '',
      'These were on a shipment but are absent from the item master extract. Confirm whether',
      'the extract is stale or the part is genuinely new before adding it.',
      '',
      ...newParts.map((part) => `- ${cell(part)}`),
      '',
    )
  }

  return lines.join('\n')
}

/** The same worklist as CSV, for sorting and filtering in a spreadsheet. */
export function renderLibraryChangesCsv(set: LibraryChangeSet): string {
  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  const rows = [
    [
      'Part Number',
      'Item Description',
      'Field',
      'In The Master',
      'New Value',
      'Action',
      'Part In Master',
      'Reason',
      'Entered By',
      'Date',
    ].join(','),
  ]
  for (const c of set.actionable) {
    rows.push(
      [
        c.partNumber,
        c.description,
        FIELD_LABELS[c.field],
        c.libraryValue ?? '',
        c.enteredValue,
        ACTION_NOTES[c.action],
        c.partInLibrary ? 'yes' : 'no',
        c.reason,
        c.enteredBy,
        c.updatedAt.slice(0, 10),
      ]
        .map(escape)
        .join(','),
    )
  }
  return rows.join('\n')
}

/** `item-master-updates-2026-07-29.csv` — dated, so successive exports never overwrite. */
export function libraryChangesFileName(today: string, extension = 'md'): string {
  return `item-master-updates-${today}.${extension}`
}
