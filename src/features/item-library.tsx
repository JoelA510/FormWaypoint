/**
 * Import and review the item master.
 *
 * Two decisions are put to the user rather than guessed:
 *
 *   - **The weight unit**, whenever the file's own header does not state one. Reading grams
 *     as kilograms overstates a shipment a thousandfold, and nothing in the numbers reliably
 *     tells them apart, so the choice is explicit and previewed against real rows first.
 *   - **What to do about bad commodity numbers.** They are listed, never corrected.
 */
import { useMemo, useRef, useState } from 'react'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Select } from '../components/ui'
import {
  WEIGHT_UNIT_LABELS,
  flagEntries,
  importItems,
  inspectWorkbook,
  libraryChangesFileName,
  readWorkbook,
  renderLibraryChangeLog,
  renderLibraryChangesCsv,
  type FlaggedItem,
  type ImportSummary,
  type ItemLibraryEntry,
  type LibraryChangeSet,
  type WeightUnit,
  type WorkbookInspection,
} from '../domain/item-library'
import type { DesktopBridge } from '../desktop'
import { downloadText } from '../lib/utils'
import type { ScheduleBIndex } from '../domain/schedule-b'

const ROLE_LABELS: Record<string, string> = {
  partNumber: 'Part number',
  description: 'Description',
  exportCode: 'Export code',
  importCode: 'Import HTS',
  weight: 'Weight',
}

interface Staged {
  fileName: string
  rows: string[][]
  inspection: WorkbookInspection
}

export type ImportMode = 'replace' | 'merge'

export function ItemLibraryPanel({
  entries,
  scheduleB,
  onImport,
  onClear,
}: {
  entries: ItemLibraryEntry[]
  scheduleB: ScheduleBIndex | null
  /**
   * Resolves `false` where the write failed.
   *
   * The panel reports "N added" and discards the staged file on the strength of this, so a
   * failed write reported as a successful import left nothing on disk, an unchanged count on
   * screen, and no file to try again with.
   */
  onImport: (entries: ItemLibraryEntry[], mode: ImportMode) => Promise<boolean>
  onClear: () => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [staged, setStaged] = useState<Staged | null>(null)
  const [unit, setUnit] = useState<WeightUnit>('g')
  const [mode, setMode] = useState<ImportMode>('replace')
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [added, setAdded] = useState<{ added: number; updated: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Always computed from what is actually loaded, never from the last import: a library
  // imported in an earlier session must still report its bad numbers, and after a merge the
  // incoming file's own flags would understate the library as a whole.
  const flagged = useMemo(() => flagEntries(entries, scheduleB), [entries, scheduleB])
  const withWeights = useMemo(() => entries.filter((e) => e.netWeightKg != null).length, [entries])

  // A merged library came from more than one file; naming only the first would misreport
  // where the weights on a form came from.
  const provenance = useMemo(() => {
    const sources = [...new Set(entries.map((e) => e.source).filter(Boolean))]
    const latest = entries.reduce((max, e) => (e.importedAt > max ? e.importedAt : max), '')
    return { sources, latest }
  }, [entries])

  async function stage(file: File) {
    setError(null)
    setSummary(null)
    try {
      const rows = await readWorkbook(file.name, new Uint8Array(await file.arrayBuffer()))
      const inspection = inspectWorkbook(rows)
      setStaged({ fileName: file.name, rows, inspection })
      setUnit(inspection.declaredWeightUnit ?? 'g')
    } catch (e: unknown) {
      setStaged(null)
      setError(e instanceof Error ? e.message : 'That file could not be read.')
    }
  }

  async function commit() {
    if (!staged) return
    try {
      const result = importItems(staged.rows, { fileName: staged.fileName, weightUnit: unit, index: scheduleB })
      const effective = entries.length ? mode : 'replace'
      const held = new Set(entries.map((e) => e.partNumber))
      const updated = result.entries.filter((e) => held.has(e.partNumber)).length
      // Nothing is reported and nothing is discarded until the write has actually landed.
      // The caller says where it failed; keeping the staged file means the operator can try
      // again without going back to the spreadsheet.
      if (!(await onImport(result.entries, effective))) return
      setSummary(result)
      // Only meaningful for a merge — after a replace nothing was "already held".
      setAdded(effective === 'merge' ? { added: result.entries.length - updated, updated } : null)
      setStaged(null)
      if (fileInput.current) fileInput.current.value = ''
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'That file could not be imported.')
    }
  }

  return (
    <Card>
      <CardHeader
        title="Item library"
        description="Part weights and commodity numbers from your item master, for CIPL formats that print no weights. Stays on this machine."
        actions={
          entries.length ? (
            <div className="flex items-center gap-2">
              <Badge tone="pass">{entries.length.toLocaleString()} parts</Badge>
              {flagged.length ? <Badge tone="warn">{flagged.length.toLocaleString()} to fix</Badge> : null}
            </div>
          ) : undefined
        }
      />
      <CardBody className="space-y-4">
        {error ? (
          <p className="rounded-md border border-[var(--color-block)] bg-[var(--color-block-soft)] px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}

        {entries.length && !staged ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-[var(--color-sunken)] px-3 py-2 text-sm">
            <span>
              <strong className="tabular">{withWeights.toLocaleString()}</strong> of{' '}
              <span className="tabular">{entries.length.toLocaleString()}</span> parts carry a weight, from{' '}
              <span className="font-medium">{provenance.sources.join(' + ')}</span>, last updated{' '}
              {provenance.latest.slice(0, 10)}.
            </span>
            <Button size="sm" variant="ghost" onClick={onClear}>
              Remove library
            </Button>
          </div>
        ) : null}

        {!staged ? (
          <Field
            label="Import an item master"
            hint="Excel (.xlsx) or delimited text (.csv, .tsv). Columns are matched by heading, so the layout does not have to match. Importing replaces the whole library."
          >
            {(id) => (
              <input
                id={id}
                ref={fileInput}
                type="file"
                accept=".xlsx,.csv,.tsv,.txt"
                className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-[var(--color-surface)] file:px-3 file:py-1.5 file:text-sm"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void stage(file)
                }}
              />
            )}
          </Field>
        ) : (
          <StagedImport
            staged={staged}
            unit={unit}
            onUnitChange={setUnit}
            mode={mode}
            onModeChange={setMode}
            heldCount={entries.length}
            onCancel={() => {
              setStaged(null)
              if (fileInput.current) fileInput.current.value = ''
            }}
            onCommit={() => void commit()}
          />
        )}

        {summary ? <ImportReport summary={summary} counts={added} /> : null}
        {flagged.length ? <FlaggedList flagged={flagged} /> : null}

        {!entries.length && !staged && !error ? (
          <EmptyState title="No item library">
            Without one, a CIPL that prints no weights needs every part typed in by hand before a form can be
            generated.
          </EmptyState>
        ) : null}
      </CardBody>
    </Card>
  )
}

function StagedImport({
  staged,
  unit,
  onUnitChange,
  mode,
  onModeChange,
  heldCount,
  onCancel,
  onCommit,
}: {
  staged: Staged
  unit: WeightUnit
  onUnitChange: (unit: WeightUnit) => void
  mode: ImportMode
  onModeChange: (mode: ImportMode) => void
  heldCount: number
  onCancel: () => void
  onCommit: () => void
}) {
  const { inspection } = staged
  const declared = inspection.declaredWeightUnit
  const weightColumn = inspection.columns.weight

  return (
    <div className="space-y-3 rounded-md border bg-[var(--color-sunken)] px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{staged.fileName}</p>
        <p className="text-xs text-[var(--color-ink-soft)]">
          {inspection.dataRowCount.toLocaleString()} rows, header on line {inspection.headerRow + 1}
        </p>
      </div>

      <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        {Object.entries(inspection.columns).map(([role, column]) => (
          <div key={role} className="flex justify-between gap-2">
            <dt className="text-[var(--color-ink-soft)]">{ROLE_LABELS[role] ?? role}</dt>
            <dd className="truncate font-medium">{inspection.headers[column as number] || `column ${column}`}</dd>
          </div>
        ))}
      </dl>

      {weightColumn != null ? (
        <div className="grid gap-3 border-t pt-3 sm:grid-cols-[auto_1fr] sm:items-start">
          <Field
            label="Weight unit"
            hint={
              declared
                ? `Taken from the heading "${inspection.headers[weightColumn]}".`
                : 'This file does not say. Check the preview before importing.'
            }
          >
            {(id) => (
              <Select
                id={id}
                className="w-auto"
                value={declared ?? unit}
                disabled={Boolean(declared)}
                onChange={(e) => onUnitChange(e.target.value as WeightUnit)}
              >
                {(Object.keys(WEIGHT_UNIT_LABELS) as WeightUnit[]).map((value) => (
                  <option key={value} value={value}>
                    {WEIGHT_UNIT_LABELS[value]}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <div className="text-xs">
            <p className="mb-1 font-medium tracking-wide text-[var(--color-ink-soft)] uppercase">Preview</p>
            <ul className="space-y-0.5">
              {inspection.preview.slice(0, 4).map((row, i) => (
                <li key={i} className="tabular flex justify-between gap-3">
                  <span className="truncate">{row[inspection.columns.partNumber as number] || '—'}</span>
                  <span>
                    {row[weightColumn] || '—'} → <strong>{previewKg(row[weightColumn], declared ?? unit)}</strong>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="border-t pt-3 text-xs text-[var(--color-ink-soft)]">
          This file has no weight column, so it will supply commodity numbers only.
        </p>
      )}

      {heldCount ? (
        <div className="border-t pt-3">
          <Field
            label="Existing library"
            hint={
              mode === 'replace'
                ? `The ${heldCount.toLocaleString()} parts currently held will be discarded.`
                : 'Parts in both files take their values from this one; everything else is kept.'
            }
          >
            {(id) => (
              <Select
                id={id}
                className="w-auto"
                value={mode}
                onChange={(e) => onModeChange(e.target.value as ImportMode)}
              >
                <option value="replace">Replace it</option>
                <option value="merge">Add to it</option>
              </Select>
            )}
          </Field>
        </div>
      ) : null}

      <div className="flex gap-2 border-t pt-3">
        <Button variant="primary" size="sm" onClick={onCommit}>
          {heldCount && mode === 'merge' ? 'Merge' : 'Import'} {inspection.dataRowCount.toLocaleString()} parts
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function previewKg(raw: string | undefined, unit: WeightUnit): string {
  const value = Number((raw ?? '').replace(/,/g, ''))
  if (!Number.isFinite(value) || value <= 0) return '—'
  const kg = value * (unit === 'g' ? 0.001 : unit === 'lb' ? 0.45359237 : 1)
  return `${kg.toFixed(3)} kg`
}

function ImportReport({ summary, counts }: { summary: ImportSummary; counts: { added: number; updated: number } | null }) {
  const notes = [
    `${summary.entries.length.toLocaleString()} parts imported in ${WEIGHT_UNIT_LABELS[summary.weightUnit]}`,
    counts?.updated ? `${counts.added.toLocaleString()} new, ${counts.updated.toLocaleString()} already held` : '',
    summary.withoutWeight ? `${summary.withoutWeight.toLocaleString()} with no weight` : '',
    summary.duplicates.length ? `${summary.duplicates.length} duplicate part number(s); the last row won` : '',
    summary.skipped ? `${summary.skipped} row(s) skipped with no part number` : '',
  ].filter(Boolean)

  return (
    <p className="rounded-md border border-[var(--color-pass)] bg-[var(--color-pass-soft)] px-3 py-2 text-sm">
      {notes.join(' · ')}.
    </p>
  )
}

/**
 * The parts whose commodity number needs fixing at source.
 *
 * Capped for display, with the true total stated — a list that silently showed the first
 * hundred of fifteen hundred would read as "nearly clean".
 */
function FlaggedList({ flagged }: { flagged: FlaggedItem[] }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? flagged.slice(0, 500) : flagged.slice(0, 8)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {flagged.length.toLocaleString()} part(s) carry a commodity number that needs fixing
        </p>
        {flagged.length > shown.length || expanded ? (
          <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Show fewer' : `Show all${flagged.length > 500 ? ' (first 500)' : ''}`}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-[var(--color-ink-soft)]">
        Either not written as ####.##.#### or not present in the Census Bureau commodity file. Nothing here is
        changed automatically — a shipment still files the number printed on its CIPL.
      </p>
      <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border bg-[var(--color-sunken)] p-2">
        {shown.map((item) => (
          <li key={`${item.partNumber}:${item.code}`} className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <span className="min-w-0">
              <span className="tabular font-medium">{item.partNumber}</span>
              {item.description ? <span className="text-[var(--color-ink-faint)]"> — {item.description}</span> : null}
            </span>
            <span className="flex items-center gap-2">
              <span className="tabular">{item.code || '(blank)'}</span>
              <Badge tone={item.status === 'unknown' ? 'warn' : 'neutral'}>{item.status}</Badge>
            </span>
          </li>
        ))}
      </ul>
      {!expanded && flagged.length > shown.length ? (
        <p className="text-xs text-[var(--color-ink-faint)]">
          Showing {shown.length} of {flagged.length.toLocaleString()}.
        </p>
      ) : null}
    </div>
  )
}

/**
 * Writes out what has been entered by hand that the item master does not hold.
 *
 * The point of the panel is that these figures should not stay on one machine. A weight typed
 * because a CIPL printed none, or a code entered because the printed one was wrong, is
 * knowledge the item master is missing — and until it gets there, the next shipment of the
 * same part needs the same typing, which is the manual step this tool exists to remove.
 *
 * Two files, because they are read differently: a CSV to sort and work through against JDE,
 * and a markdown log that keeps the reason and the name against every code change so the edit
 * can still be justified months later. On the desktop build they land beside the Schedule B
 * change logs; in a browser they download, since there is nowhere else to put them.
 */
export function ItemMasterUpdatesPanel({
  changes,
  librarySource,
  today,
  bridge,
}: {
  changes: LibraryChangeSet
  librarySource: string | null
  today: string
  bridge: DesktopBridge | null
}) {
  const [written, setWritten] = useState<{ names: string[]; directory: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const codes = changes.actionable.filter((c) => c.field === 'code')
  const weights = changes.actionable.filter((c) => c.field === 'weight')

  async function write() {
    setBusy(true)
    setError(null)
    setWritten(null)
    try {
      const log = renderLibraryChangeLog(changes, { today, librarySource })
      const csv = renderLibraryChangesCsv(changes)
      const logName = libraryChangesFileName(today)
      const csvName = libraryChangesFileName(today, 'csv')

      if (bridge) {
        await bridge.writeDataFile(logName, log)
        await bridge.writeDataFile(csvName, csv)
        setWritten({ names: [logName, csvName], directory: await bridge.dataDir() })
      } else {
        downloadText(log, logName)
        downloadText(csv, csvName)
        setWritten({ names: [logName, csvName], directory: null })
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'The updates could not be written.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Item master updates"
        description="Values entered by hand that your item master does not hold yet. Export them, then make the edits in JDE."
        actions={
          changes.actionable.length ? (
            <Badge tone="warn">{changes.actionable.length} to key</Badge>
          ) : (
            <Badge tone="pass">nothing outstanding</Badge>
          )
        }
      />
      <CardBody className="space-y-3">
        {error ? (
          <p className="rounded-md border border-[var(--color-block)] bg-[var(--color-block-soft)] px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}

        {!changes.actionable.length ? (
          <EmptyState title="Nothing to carry over">
            {changes.matching
              ? `All ${changes.matching} value(s) entered by hand already match the item master.`
              : 'Weights and commodity numbers you enter on the review screen will be listed here.'}
          </EmptyState>
        ) : (
          <>
            <p className="text-sm text-[var(--color-ink-soft)]">
              <strong className="tabular">{codes.length}</strong> commodity number
              {codes.length === 1 ? '' : 's'} and <strong className="tabular">{weights.length}</strong> weight
              {weights.length === 1 ? '' : 's'} differ from the master
              {changes.matching ? `, with a further ${changes.matching} already matching` : ''}.
              {changes.libraryMissing
                ? ' No library is imported, so every value is reported as an addition.'
                : ''}
            </p>

            <ul className="space-y-1.5">
              {changes.actionable.slice(0, 8).map((change) => (
                <li
                  key={`${change.partNumber}:${change.field}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border bg-[var(--color-sunken)] px-3 py-2 text-xs"
                >
                  <span className="min-w-0">
                    <span className="tabular font-medium">{change.partNumber}</span>
                    <span className="text-[var(--color-ink-faint)]">
                      {' '}
                      — {change.field === 'code' ? 'Schedule B' : 'net kg'}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular text-[var(--color-ink-faint)]">{change.libraryValue ?? 'not held'}</span>
                    <span aria-hidden>→</span>
                    <span className="tabular">{change.enteredValue}</span>
                    <Badge tone={change.action === 'add' ? 'neutral' : 'warn'}>{change.action}</Badge>
                  </span>
                </li>
              ))}
            </ul>
            {changes.actionable.length > 8 ? (
              <p className="text-xs text-[var(--color-ink-faint)]">
                Showing 8 of {changes.actionable.length}; the export has all of them.
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" onClick={() => void write()} disabled={busy}>
                {busy ? 'Writing…' : 'Export item master updates'}
              </Button>
              <span className="text-xs text-[var(--color-ink-faint)]">
                Nothing is applied automatically — this is a worklist.
              </span>
            </div>
          </>
        )}

        {written ? (
          <div className="rounded-md border border-[var(--color-pass)] bg-[var(--color-pass-soft)] px-3 py-2 text-xs">
            <p>{written.directory ? `Written to ${written.directory}:` : 'Downloaded:'}</p>
            <ul className="mt-0.5 space-y-0.5">
              {written.names.map((name) => (
                <li key={name} className="tabular">
                  {name}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardBody>
    </Card>
  )
}
