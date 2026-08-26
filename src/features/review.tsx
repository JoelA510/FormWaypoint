import { useEffect, useState } from 'react'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, ProvenanceRow, Select, type Tone } from '../components/ui'
import { resolveDestinationCountry } from '../domain/reconcile'
import { canonicalUnit, formatScheduleB, normalizeScheduleB } from '../domain/schedule-b'
import { canRestate, resolveReportingQuantity, type QuantitySource } from '../domain/units'
import { formatQuantity } from '../carriers/form-utils'
import { basisNote } from './quantity-basis'
import { partKey } from '../domain/part-key'
import type { OverrideRecord } from '../store/local-store'
import type { CheckResult, MergedLine, ParsedCipl, Reconciliation, SLILine } from '../domain/types'
import { FIGURE_ON_LINE, type RowFigures } from '../domain/reconcile'

const SEVERITY_TONE: Record<CheckResult['severity'], Tone> = {
  blocking: 'block',
  warning: 'warn',
  info: 'accent',
}

/** Header values, each labelled with where it came from. */
export function ShipmentSummary({ parsed, reconciliation }: { parsed: ParsedCipl; reconciliation: Reconciliation }) {
  const { header, selectedSet } = reconciliation
  const excluded = parsed.availableSets.filter((s) => s !== selectedSet)

  return (
    <Card>
      <CardHeader
        title="Shipment"
        description={`Read from ${parsed.fileName} (${parsed.pageCount} pages).`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="accent">{selectedSet} · {header.documentCurrency}</Badge>
            {excluded.map((set) => (
              <Badge key={set} tone="neutral">
                {set} excluded
              </Badge>
            ))}
          </div>
        }
      />
      <CardBody className="grid gap-x-10 gap-y-0 md:grid-cols-2">
        <div>
          <ProvenanceRow label="Invoice number" value={header.invoiceNumber} source="CIPL header" />
          <ProvenanceRow label="Date of exportation" value={header.invoiceDate} source="CIPL invoice date" />
          <ProvenanceRow
            label="Ship date on the CIPL"
            value={header.onOrAboutDate ?? '—'}
            source="not used for box 2"
            tone="neutral"
          />
          <ProvenanceRow label="Ultimate consignee" value={header.consignedTo.name} source="CONSIGNED TO" />
          <ProvenanceRow label="Sold to" value={header.soldTo.name} source="SOLD TO — not the consignee" tone="neutral" />
          <ProvenanceRow
            label="Destination country"
            value={resolveDestinationCountry(header) ?? '—'}
            source="discharge port"
          />
        </div>
        <div>
          <ProvenanceRow label="Forwarder named on the CIPL" value={header.vesselAgent ?? '—'} source="VESSEL AGENT" />
          <ProvenanceRow label="Incoterm" value={header.incoterm ?? '—'} source="TRADE TERMS" />
          <ProvenanceRow label="Freight" value={header.freightTerms ?? '—'} source="TRADE TERMS" />
          <ProvenanceRow label="Total quantity" value={`${header.totalQuantity} pcs`} source="CIPL total" />
          <ProvenanceRow
            label="Total value"
            value={`${header.totalValue.toFixed(2)} ${header.documentCurrency}`}
            source="CIPL total"
          />
          <ProvenanceRow
            label="Net / gross weight"
            value={`${header.totalNetWeightKg?.toFixed(3) ?? '—'} / ${header.totalGrossWeightKg?.toFixed(3) ?? '—'} kg`}
            source="packing list"
          />
        </div>

        {parsed.warnings.length ? (
          <div className="md:col-span-2 mt-4 rounded-md border border-[var(--color-warn)] bg-[var(--color-warn-soft)] px-3 py-2">
            <p className="text-xs font-semibold tracking-wide text-[var(--color-warn)] uppercase">While reading the document</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-[var(--color-ink)]">
              {parsed.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardBody>
    </Card>
  )
}

/** Reconciliation and compliance results, blocking failures first. */
export function ChecksPanel({
  checks,
  canGenerate,
  description = 'Totals are proved against the source document before anything is generated.',
}: {
  checks: CheckResult[]
  canGenerate: boolean
  /**
   * What these checks are proving. The default describes the CIPL reconciliation; the
   * dangerous goods workflow shares the panel but proves something else entirely, and a
   * heading that talks about a source document when there is no source document is worse
   * than no heading at all.
   */
  description?: string
}) {
  const failures = checks.filter((c) => !c.passed)
  const blocking = failures.filter((c) => c.severity === 'blocking')
  const advisory = failures.filter((c) => c.severity !== 'blocking')
  const passed = checks.filter((c) => c.passed)

  return (
    <Card>
      <CardHeader
        title="Checks"
        description={description}
        actions={
          canGenerate ? (
            <Badge tone="pass">{blocking.length === 0 ? 'Ready to generate' : ''}</Badge>
          ) : (
            <Badge tone="block">{blocking.length} blocking</Badge>
          )
        }
      />
      <CardBody className="space-y-2">
        {[...blocking, ...advisory].map((check) => (
          <CheckRow key={check.id} check={check} />
        ))}

        {passed.length ? (
          <details className="rounded-md border bg-[var(--color-sunken)] px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-[var(--color-ink-soft)]">
              {passed.length} check{passed.length === 1 ? '' : 's'} passed
            </summary>
            <div className="mt-2 space-y-2">
              {passed.map((check) => (
                <CheckRow key={check.id} check={check} />
              ))}
            </div>
          </details>
        ) : null}
      </CardBody>
    </Card>
  )
}

function CheckRow({ check }: { check: CheckResult }) {
  const tone: Tone = check.passed ? 'pass' : SEVERITY_TONE[check.severity]
  return (
    <div
      className={[
        'rounded-md border px-3 py-2',
        check.passed ? 'bg-[var(--color-surface)]' : 'bg-[var(--color-sunken)]',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-[var(--color-ink)]">{check.title}</p>
        <Badge tone={tone}>{check.passed ? 'pass' : check.severity}</Badge>
      </div>
      <p className="mt-0.5 text-sm text-[var(--color-ink-soft)]">{check.detail}</p>
      {check.expected !== undefined && !check.passed ? (
        <p className="tabular mt-1 text-xs text-[var(--color-ink-faint)]">
          expected {check.expected} · got {check.actual}
        </p>
      ) : null}
    </div>
  )
}

/** The commodity rows that will be written to the form, with full source lineage. */
export function CommodityTable({
  reconciliation,
  reportingUnits = {},
  onReportingUnitChange,
  rowFigures = {},
  onRowFigureChange,
}: {
  reconciliation: Reconciliation
  /** The unit chosen for each commodity number, keyed by normalised code. */
  reportingUnits?: Record<string, string>
  /** Omitted where the table is read-only. */
  onReportingUnitChange?: (code: string, unit: string) => void
  /** Figures entered against a row, keyed by `SLILine.rowKey`. */
  rowFigures?: Record<string, RowFigures>
  /** Omitted where the table is read-only. Passing `undefined` clears that field. */
  onRowFigureChange?: (rowKey: string, field: keyof RowFigures, value: number | undefined) => void
}) {
  const { sliLines, mergedLines, enteredFigures } = reconciliation
  const byId = new Map(mergedLines.map((l) => [l.id, l]))
  // What the documents said, for the boxes that are showing something else. The row itself
  // now carries the entered figure, so comparing a typed value against the row would call an
  // override equal to itself "the document's figure" and delete it on the next blur.
  const documentFigures = new Map(enteredFigures.map((e) => [`${e.rowKey}:${e.field}`, e.was]))

  /**
   * A figure cell: the row's own value, or a box to type one over it.
   *
   * `decimals` is a *floor*, not a format. An invoice can state a fractional count — a line
   * of `0.3 KG` is one of the shapes this app already handles — and rendering the quantity
   * column to zero places printed `0` beside a total that included it.
   */
  const figure = (line: SLILine, field: keyof RowFigures, decimals: number, label: string) => {
    // Displayed to at least `decimals` places; committed at the places the figure is actually
    // filed at, which is not the same number. The invoice-quantity column shows whole numbers,
    // and committing at *that* precision rounded a typed `0.3` to `0` — filing a quantity box
    // that declares the goods absent, on the one column whose figures are counts.
    const places = FIGURE_ON_LINE[field].decimals
    const entered = rowFigures[line.rowKey]?.[field]
    // The documents' own figure, which is the row's own until something is entered over it.
    const fromDocument = documentFigures.get(`${line.rowKey}:${field}`) ?? line[field]
    if (!onRowFigureChange) return <span className="tabular">{atLeast(line[field], decimals)}</span>
    return (
      <RowFigureInput
        value={entered}
        // Shown as the placeholder throughout, so the box always says what the row would file
        // if it were cleared — including while it is holding something else.
        documentValue={atLeast(fromDocument, decimals)}
        label={`${label} for ${line.scheduleB} ${line.domesticForeign}`}
        // Held at the precision the figure is filed at, so the box states the number on the
        // form. The reconciliation rounds an entered figure to its field's places before
        // sharing it out; keeping the raw text here left `999.999` on screen, in a box marked
        // as an override, beside a declaration filing 1000.
        decimals={places}
        // Typing the document's own figure back in is not an override, so it is not held as
        // one. The reconciliation already declines to report it; a box left marked amber for a
        // figure the checks say nobody entered is the two disagreeing about which numbers on
        // the form are the filer's. Compared against the *document's* figure — against the
        // row's, an override equal to itself would delete itself on the next blur.
        onCommit={(next) => onRowFigureChange(line.rowKey, field, next === fromDocument ? undefined : next)}
      />
    )
  }

  return (
    <Card>
      <CardHeader
        title="Commodity rows"
        description={`${mergedLines.length} invoice line${mergedLines.length === 1 ? '' : 's'} grouped into ${sliLines.length} row${sliLines.length === 1 ? '' : 's'} by classification and D/F.`}
      />
      <CardBody className="px-0 py-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-[var(--color-sunken)] text-left text-xs tracking-wide text-[var(--color-ink-faint)] uppercase">
                <th className="px-4 py-2.5 font-semibold">D/F</th>
                <th className="px-4 py-2.5 font-semibold">Schedule B</th>
                <th className="px-4 py-2.5 font-semibold">Description</th>
                <th className="px-4 py-2.5 text-right font-semibold">Invoice qty</th>
                <th className="px-4 py-2.5 font-semibold">Filed qty &amp; unit</th>
                <th className="px-4 py-2.5 text-right font-semibold">Net kg</th>
                <th className="px-4 py-2.5 text-right font-semibold">Value USD</th>
              </tr>
            </thead>
            <tbody>
              {sliLines.map((line) => (
                <tr key={line.rowKey} className="border-b align-top last:border-b-0">
                  <td className="tabular px-4 py-3">{line.domesticForeign}</td>
                  <td className="tabular px-4 py-3 whitespace-nowrap">
                    {line.scheduleB}
                    {line.scheduleBUnit ? (
                      <span className="ml-2 text-xs text-[var(--color-ink-faint)]">unit {line.scheduleBUnit}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[var(--color-ink)]">{line.description}</p>
                    <p className="mt-0.5 text-xs text-[var(--color-ink-faint)]">
                      {line.countriesOfOrigin.join(', ')} · from{' '}
                      {line.sourceLineIds
                        .map((id) => {
                          const source = byId.get(id)
                          return source ? `${source.orderNumber}/${source.sequence}` : id
                        })
                        .join(', ')}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {figure(line, 'quantity', 0, 'Invoice quantity')}
                      <span className="text-xs text-[var(--color-ink-faint)]">{line.sourceUom}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ReportingUnitPicker
                      line={line}
                      chosen={reportingUnits[normalizeScheduleB(line.scheduleB)] ?? ''}
                      onChange={
                        onReportingUnitChange
                          ? (unit) => onReportingUnitChange(normalizeScheduleB(line.scheduleB), unit)
                          : undefined
                      }
                    />
                  </td>
                  <td className="px-4 py-3 text-right">{figure(line, 'weightKg', 3, 'Net weight')}</td>
                  <td className="px-4 py-3 text-right">{figure(line, 'valueUsd', 2, 'Value')}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[var(--color-sunken)] font-medium">
                <td className="px-4 py-2.5" colSpan={3}>
                  Total
                </td>
                <td className="tabular px-4 py-2.5 text-right">{sum(sliLines.map((l) => l.quantity))}</td>
                {/* No total under the filed quantity: those figures can be in different units,
                    and a column of pieces added to a column of kilograms is not a number. */}
                <td className="px-4 py-2.5" />
                <td className="tabular px-4 py-2.5 text-right">{sum(sliLines.map((l) => l.weightKg)).toFixed(3)}</td>
                <td className="tabular px-4 py-2.5 text-right">{sum(sliLines.map((l) => l.valueUsd)).toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardBody>
    </Card>
  )
}

function sum(values: number[]): number {
  return Math.round(values.reduce((a, b) => a + b, 0) * 1000) / 1000
}

/**
 * A figure at no fewer than `decimals` places, and no fewer than it actually has.
 *
 * `toFixed` alone is a truncation: the invoice-quantity column asks for whole numbers and an
 * invoice that states `0.3 KG` would print `0` under a total that counts it.
 */
function atLeast(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return ''
  const own = (String(value).split('.')[1] ?? '').length
  return value.toFixed(Math.max(decimals, Math.min(own, 6)))
}

/**
 * The unit a commodity row is filed in, and the figure that goes with it.
 *
 * The choice is offered rather than merely reported because several Schedule B numbers are
 * reported in kilograms while the invoice counts pieces, and a code that accepts both
 * (`NO+KG`) has no answer this app can work out — only the filer knows how the goods are
 * actually measured. The default already follows Schedule B; this is for the rest.
 *
 * Options the shipment cannot state are listed and disabled rather than hidden. "There is no
 * net weight for these goods, so the kilogram figure this code needs cannot be produced" is
 * the answer somebody is looking for, and an absent option does not give it.
 */
function ReportingUnitPicker({
  line,
  chosen,
  onChange,
}: {
  line: SLILine
  chosen: string
  onChange?: (unit: string) => void
}) {
  const source: QuantitySource = { quantity: line.quantity, uom: line.sourceUom, weightKg: line.weightKg }
  // Deduped by canonical form, listed in the spelling that will be filed. The Census file
  // says `PCS` where an invoice says `PCS` and the alias table calls both `NO`; offering all
  // three would be three options for one unit.
  const offered = [...
    [...line.scheduleBUnits, line.sourceUom.trim().toUpperCase()]
      .filter(Boolean)
      .reduce((seen, unit) => {
        const key = canonicalUnit(unit) ?? unit
        if (!seen.has(key)) seen.set(key, unit)
        return seen
      }, new Map<string, string>())
      .values(),
  ]
  // Resolved without the current choice, so the option names what the default *is* rather
  // than echoing whatever is selected — "Schedule B default (NO)" beside a row that has been
  // switched off the Schedule B unit is the one label that must never appear here.
  const fallback = resolveReportingQuantity(source, line.scheduleBUnits).unit
  // Through the same formatter the form boxes use. Rendered raw, this screen showed
  // `4.263e-7` for a gram-to-tonne restatement and the word `NaN` for a figure the forms
  // guard against — on the one surface an operator checks before generating anything.
  const figure =
    line.reportingBasis === 'none' ? '—' : `${formatQuantity(line.reportingQuantity)} ${line.reportingUom}`.trim()

  return (
    <div className="space-y-1">
      {onChange && offered.length > 1 ? (
        <Select
          aria-label={`Unit of quantity for ${line.scheduleB}`}
          value={chosen}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">
            Schedule B default ({fallback || '—'})
          </option>
          {offered.map((unit) => (
            <option key={unit} value={unit} disabled={!canRestate(source, unit)}>
              {unit}
              {line.scheduleBUnits.includes(unit) ? '' : ' (as invoiced)'}
              {canRestate(source, unit) ? '' : ' — no figure available'}
            </option>
          ))}
        </Select>
      ) : null}
      <p className="tabular text-[var(--color-ink)]">{figure}</p>
      {/* Whether the choice was *honoured*, not merely made. One commodity number can carry
          more than one row — they are keyed on D/F and the export-control triplet too — so a
          unit chosen for the code can be reachable on one row and not on another, and the
          row that fell back must point at the missing figure rather than at a decision. */}
      <p className="text-xs text-[var(--color-ink-faint)]">
        {basisNote(line, Boolean(chosen) && canonicalUnit(chosen) === canonicalUnit(line.reportingUom))}
      </p>
    </div>
  )
}

/**
 * Approved classification changes.
 *
 * The tool will not adopt a code from a historical form, so a reclassification has to be
 * entered here with a reason and an approver. Both are recorded alongside the change: an
 * override that nobody can account for later is indistinguishable from a typo, which is
 * exactly how `8483.10.5000` came to sit on a cable assembly.
 */
export function OverridesPanel({
  reconciliation,
  overrides,
  onSave,
  onDelete,
}: {
  reconciliation: Reconciliation
  overrides: OverrideRecord[]
  onSave: (record: OverrideRecord) => void
  onDelete: (sourceCode: string) => void
}) {
  const sourceCodes = [...new Set(reconciliation.mergedLines.map((l) => l.classification))].filter(Boolean)
  const [sourceCode, setSourceCode] = useState(sourceCodes[0] ?? '')
  const [approvedCode, setApprovedCode] = useState('')
  const [reason, setReason] = useState('')
  const [approvedBy, setApprovedBy] = useState('')

  const normalisedApproved = normalizeScheduleB(approvedCode)
  const canSave = Boolean(sourceCode) && normalisedApproved.length === 10 && reason.trim() && approvedBy.trim()

  function save() {
    if (!canSave) return
    onSave({
      sourceCode: normalizeScheduleB(sourceCode),
      approvedCode: normalisedApproved,
      reason: reason.trim(),
      approvedBy: approvedBy.trim(),
      approvedAt: new Date().toISOString(),
    })
    setApprovedCode('')
    setReason('')
  }

  return (
    <Card>
      <CardHeader
        title="Classification overrides"
        description="Applied before grouping, so an override can merge rows. Kept on this machine and reused."
        actions={overrides.length ? <Badge tone="warn">{overrides.length} active</Badge> : undefined}
      />
      <CardBody className="space-y-4">
        {overrides.length ? (
          <ul className="space-y-2">
            {overrides.map((record) => (
              <li
                key={record.sourceCode}
                className="flex flex-wrap items-start justify-between gap-3 rounded-md border bg-[var(--color-sunken)] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="tabular text-sm text-[var(--color-ink)]">
                    {formatScheduleB(record.sourceCode)} → {formatScheduleB(record.approvedCode)}
                  </p>
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    {record.reason} — {record.approvedBy}, {record.approvedAt.slice(0, 10)}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => onDelete(record.sourceCode)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No overrides">
            Codes are filed exactly as the CIPL states them.
          </EmptyState>
        )}

        <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
          <Field label="Code on the CIPL">
            {(id) => (
              <Select id={id} value={sourceCode} onChange={(e) => setSourceCode(e.target.value)}>
                {sourceCodes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="File instead" hint="Ten digits.">
            {(id) => (
              <Input
                id={id}
                value={approvedCode}
                onChange={(e) => setApprovedCode(e.target.value)}
                placeholder="8544.42.0000"
              />
            )}
          </Field>
          <Field label="Reason" className="sm:col-span-2">
            {(id) => (
              <Input
                id={id}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why this classification is correct for these goods"
              />
            )}
          </Field>
          <Field label="Approved by">
            {(id) => <Input id={id} value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} />}
          </Field>
          <div className="flex items-end">
            <Button variant="primary" onClick={save} disabled={!canSave}>
              Record override
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

/**
 * The two things a person can state about a part that the documents cannot settle.
 *
 * **Net weight**, because the `vendor-b` layout prints none and box 26 has to come from
 * somewhere. Parts still missing a figure are listed first: each one blocks generation, since
 * a blank weight is never filed as zero.
 *
 * **Commodity number**, because the number on the CIPL is sometimes simply wrong, and until
 * the item master is corrected the only place to say so is here. This is narrower than the
 * override below it — that one redirects a code everywhere it appears, this one speaks for a
 * single part, which is what you want when one bad number was copied across an item master
 * and the parts carrying it belong in different headings.
 *
 * A weight commits on its own; a code will not commit without a reason, and the reconciliation
 * raises a warning naming every part whose code was changed. Substituting a classification is
 * the most consequential thing on this screen and it does not happen quietly.
 */
export function PartOverridesPanel({
  reconciliation,
  weights,
  codes,
  descriptions,
  weightsNeeded,
  enteredBy,
  onSaveWeight,
  onSaveCode,
  onSaveDescription,
  onClearCode,
}: {
  reconciliation: Reconciliation
  weights: Record<string, number>
  codes: Record<string, string>
  descriptions: Record<string, string>
  /** True when the document states no weights, so the weight column is in play. */
  weightsNeeded: boolean
  /** Who is entering these — the signer, so nobody types their own name twice. */
  enteredBy: string
  onSaveWeight: (partNumber: string, description: string, netWeightKg: number) => void
  onSaveCode: (partNumber: string, description: string, exportCode: string, reason: string) => void
  onSaveDescription: (partNumber: string, description: string, sliDescription: string) => void
  onClearCode: (partNumber: string) => void
}) {
  const parts = [...new Map(reconciliation.mergedLines.map((l) => [l.partNumber, l])).values()]
  const weightOf = (part: MergedLine) => weights[partKey(part.partNumber)]
  const missing = weightsNeeded ? parts.filter((p) => weightOf(p) == null) : []
  const ordered = weightsNeeded ? [...missing, ...parts.filter((p) => weightOf(p) != null)] : parts
  // Counted the same way `partCodeOverrideChecks` counts them: a saved code that matches what
  // this document prints substituted nothing, and badging it would contradict a checks panel
  // that deliberately says nothing about it.
  const overridden = parts.filter((p) => {
    const entered = codes[partKey(p.partNumber)]
    return entered && normalizeScheduleB(entered) !== normalizeScheduleB(p.classification)
  }).length

  return (
    <Card>
      <CardHeader
        title="Per-part values"
        description={
          weightsNeeded
            ? 'This document states no weights. Enter the net weight of one unit, and a commodity number where the printed one is wrong. Both are saved and reused.'
            : 'Enter a commodity number where the one printed on this document is wrong. Saved against the part and reused.'
        }
        actions={
          <div className="flex items-center gap-2">
            {overridden ? <Badge tone="warn">{overridden} code{overridden === 1 ? '' : 's'} overridden</Badge> : null}
            {weightsNeeded ? (
              missing.length ? (
                <Badge tone="block">{missing.length} weight{missing.length === 1 ? '' : 's'} missing</Badge>
              ) : (
                <Badge tone="pass">weights supplied</Badge>
              )
            ) : null}
          </div>
        }
      />
      <CardBody className="px-0 py-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-[var(--color-sunken)] text-left text-xs tracking-wide text-[var(--color-ink-faint)] uppercase">
                <th className="px-4 py-2.5 font-semibold">Part</th>
                <th className="px-4 py-2.5 font-semibold">Description</th>
                <th className="px-4 py-2.5 text-right font-semibold">Qty</th>
                {weightsNeeded ? <th className="px-4 py-2.5 font-semibold">Net kg each</th> : null}
                {weightsNeeded ? <th className="px-4 py-2.5 text-right font-semibold">Line kg</th> : null}
                <th className="px-4 py-2.5 font-semibold">Schedule B</th>
                <th className="px-4 py-2.5 font-semibold">Commodity wording</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((part) => {
                const unit = weightOf(part)
                return (
                  <tr key={part.partNumber} className="border-b align-top last:border-b-0">
                    <td className="tabular px-4 py-2.5 whitespace-nowrap">{part.partNumber}</td>
                    <td className="px-4 py-2.5 text-[var(--color-ink-soft)]">{part.description}</td>
                    <td className="tabular px-4 py-2.5 text-right">{part.quantity}</td>
                    {weightsNeeded ? (
                      <td className="px-4 py-2.5">
                        <UnitWeightInput
                          value={unit}
                          onCommit={(next) => onSaveWeight(part.partNumber, part.description, next)}
                        />
                      </td>
                    ) : null}
                    {weightsNeeded ? (
                      <td className="tabular px-4 py-2.5 text-right">
                        {unit == null ? (
                          <span className="text-[var(--color-block)]">needed</span>
                        ) : (
                          (unit * part.quantity).toFixed(3)
                        )}
                      </td>
                    ) : null}
                    <td className="px-4 py-2.5">
                      <PartCodeInput
                        documentCode={part.classification}
                        value={codes[partKey(part.partNumber)]}
                        enteredBy={enteredBy}
                        onCommit={(code, reason) => onSaveCode(part.partNumber, part.description, code, reason)}
                        onClear={() => onClearCode(part.partNumber)}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <CommodityWordingInput
                        documentWording={part.description || part.commodityGroup}
                        value={descriptions[partKey(part.partNumber)]}
                        onCommit={(text) => onSaveDescription(part.partNumber, part.description, text)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  )
}

/**
 * One figure on a commodity row, as the documents gave it or as somebody typed it.
 *
 * The document's own figure is the placeholder rather than the value, so an untouched row
 * shows what would be filed while an entered one shows, in a filled box, that this number is
 * not the invoice's. Emptying the box is how an override is taken back — there is no separate
 * control for it, because "delete what I typed" is what an empty box already means.
 *
 * Commits on blur, like the per-part weights: these are figures on a signed declaration and
 * committing them keystroke by keystroke would file `1` on the way to `12`.
 */
function RowFigureInput({
  value,
  documentValue,
  decimals,
  label,
  onCommit,
}: {
  value: number | undefined
  /** What the row files without an override; shown as the placeholder. Absent while overridden. */
  documentValue: string | undefined
  /** Places the figure is filed at. What is typed past them is not what the form would carry. */
  decimals: number
  label: string
  onCommit: (next: number | undefined) => void
}) {
  const committed = value === undefined ? '' : String(value)
  const [draft, setDraft] = useState(committed)

  // Saved figures arrive after the first render, and a re-parse can move a row out from under
  // one, so the box has to follow the incoming value or it shows a figure the form is not
  // filing.
  useEffect(() => {
    setDraft(value === undefined ? '' : String(value))
  }, [value])

  const parsed = Number(draft)
  const blank = draft.trim() === ''
  const valid = blank || (Number.isFinite(parsed) && parsed >= 0)

  return (
    <Input
      value={draft}
      inputMode="decimal"
      aria-label={label}
      placeholder={documentValue ?? ''}
      className={`tabular w-24 text-right ${valid ? '' : 'border-[var(--color-block)]'} ${
        value === undefined ? '' : 'border-[var(--color-warn)]'
      }`}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        // An entry that is not a number is put back to what the row is actually filing.
        // Leaving `12,5` on screen beside a form filing 12.5 is this panel showing a figure
        // that is not the one being signed, which is the one thing it must never do.
        if (!valid) {
          setDraft(committed)
          return
        }
        // Only where something moved. Tabbing across the table would otherwise re-reconcile
        // the whole shipment once per cell — and a box holding a re-typed document figure,
        // which commits as "no override", would keep that text on screen with nothing behind
        // it, because the value it follows never changed.
        // Rounded here, where it is entered, so what is held and shown is what gets filed.
        const next = blank ? undefined : Number(parsed.toFixed(decimals))
        if (next === value) {
          setDraft(committed)
          return
        }
        onCommit(next)
      }}
    />
  )
}

function UnitWeightInput({ value, onCommit }: { value: number | undefined; onCommit: (next: number) => void }) {
  const [draft, setDraft] = useState(value == null ? '' : String(value))

  // Saved weights arrive from IndexedDB after the first render, so the input has to follow
  // the incoming value; otherwise a part with a stored weight shows an empty box next to a
  // populated line total.
  useEffect(() => {
    setDraft(value == null ? '' : String(value))
  }, [value])
  const parsed = Number(draft)
  const valid = draft.trim() !== '' && Number.isFinite(parsed) && parsed > 0

  return (
    <Input
      value={draft}
      inputMode="decimal"
      aria-label="Net weight per unit in kilograms"
      placeholder="0.000"
      className={valid || draft === '' ? undefined : 'border-[var(--color-block)]'}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (valid) onCommit(parsed)
      }}
    />
  )
}

/**
 * A commodity number for one part, with the reason it is being changed.
 *
 * The document's own code is the placeholder, so the box reads as "what would be filed" and
 * typing over it is visibly a substitution rather than filling a blank. The reason field
 * appears only once a different code is entered — asking for one up front would be noise on
 * every row of a shipment where nothing needs changing — and nothing commits until both are
 * present, because a code with no stated reason is the exact shape of a typo.
 */
function PartCodeInput({
  documentCode,
  value,
  enteredBy,
  onCommit,
  onClear,
}: {
  documentCode: string
  value: string | undefined
  enteredBy: string
  onCommit: (code: string, reason: string) => void
  onClear: () => void
}) {
  const [draft, setDraft] = useState(value ? formatScheduleB(value) : '')
  const [reason, setReason] = useState('')

  useEffect(() => {
    setDraft(value ? formatScheduleB(value) : '')
  }, [value])

  const normalised = normalizeScheduleB(draft)
  const wellFormed = normalised.length === 10
  const differs = wellFormed && normalised !== normalizeScheduleB(documentCode)
  const saved = Boolean(value)
  const dirty = normalised !== normalizeScheduleB(value ?? '')

  return (
    <div className="space-y-1.5">
      <Input
        value={draft}
        aria-label="Schedule B number to file for this part"
        placeholder={formatScheduleB(documentCode) || '0000.00.0000'}
        className={draft.trim() === '' || wellFormed ? undefined : 'border-[var(--color-block)]'}
        onChange={(e) => setDraft(e.target.value)}
      />

      {/*
        Shown whenever an override is in force, not only while the box still matches it.
        Gating on `!dirty` meant deleting one character removed the only way to undo the
        override while it carried on substituting the code — and typing the document's own
        number, the obvious way to ask for it back, offered neither revert nor apply.
      */}
      {saved ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-warn)]">
            overriding {formatScheduleB(documentCode)}
            {dirty ? ` with ${formatScheduleB(value ?? '')} — not yet applied` : ''}
          </span>
          <button
            type="button"
            className="text-xs text-[var(--color-ink-faint)] underline"
            onClick={() => {
              setDraft('')
              setReason('')
              onClear()
            }}
          >
            revert
          </button>
        </div>
      ) : null}

      {differs && dirty ? (
        <>
          <Input
            value={reason}
            aria-label="Reason for this classification"
            placeholder="Why this code is correct for this part"
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={!reason.trim() || !enteredBy.trim()}
              onClick={() => {
                onCommit(normalised, reason.trim())
                setReason('')
              }}
            >
              Apply to this part
            </Button>
            <span className="text-xs text-[var(--color-ink-faint)]">
              {enteredBy.trim() ? `as ${enteredBy}` : 'set the signer name first'}
            </span>
          </div>
        </>
      ) : null}
    </div>
  )
}

/**
 * The wording to key into a carrier's commodity record, for one part.
 *
 * The document's own wording is the placeholder, so leaving this alone keeps what the CIPL
 * says. Typing over it is the operator writing a commodity description — which is why the
 * app will not write one itself, and why what is typed here carries across every future
 * shipment of the part rather than being asked for again.
 *
 * Commits on blur, like the weight: this is a description, not a classification, and
 * demanding a justification for wording would be friction with nothing behind it.
 */
function CommodityWordingInput({
  documentWording,
  value,
  onCommit,
}: {
  documentWording: string
  value: string | undefined
  onCommit: (text: string) => void
}) {
  const [draft, setDraft] = useState(value ?? '')

  useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  return (
    <div className="space-y-1">
      <Input
        value={draft}
        aria-label="Commodity description to key into the carrier's software"
        placeholder={documentWording || 'as printed'}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = draft.trim()
          if (next !== (value ?? '')) onCommit(next)
        }}
      />
      {value ? <span className="text-xs text-[var(--color-warn)]">yours, not the document's</span> : null}
    </div>
  )
}
