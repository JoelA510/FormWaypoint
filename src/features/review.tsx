import { useEffect, useState } from 'react'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, ProvenanceRow, Select, type Tone } from '../components/ui'
import { resolveDestinationCountry } from '../domain/reconcile'
import { formatScheduleB, normalizeScheduleB } from '../domain/schedule-b'
import { partKey } from '../domain/part-key'
import type { OverrideRecord } from '../store/local-store'
import type { CheckResult, MergedLine, ParsedCipl, Reconciliation } from '../domain/types'

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
export function CommodityTable({ reconciliation }: { reconciliation: Reconciliation }) {
  const { sliLines, mergedLines } = reconciliation
  const byId = new Map(mergedLines.map((l) => [l.id, l]))

  return (
    <Card>
      <CardHeader
        title="Commodity rows"
        description={`${mergedLines.length} invoice line${mergedLines.length === 1 ? '' : 's'} grouped into ${sliLines.length} row${sliLines.length === 1 ? '' : 's'} by classification and D/F.`}
      />
      <CardBody className="px-0 py-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-[var(--color-sunken)] text-left text-xs tracking-wide text-[var(--color-ink-faint)] uppercase">
                <th className="px-4 py-2.5 font-semibold">D/F</th>
                <th className="px-4 py-2.5 font-semibold">Schedule B</th>
                <th className="px-4 py-2.5 font-semibold">Description</th>
                <th className="px-4 py-2.5 text-right font-semibold">Qty</th>
                <th className="px-4 py-2.5 text-right font-semibold">Net kg</th>
                <th className="px-4 py-2.5 text-right font-semibold">Value USD</th>
              </tr>
            </thead>
            <tbody>
              {sliLines.map((line, i) => (
                <tr key={`${line.scheduleB}-${i}`} className="border-b align-top last:border-b-0">
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
                  <td className="tabular px-4 py-3 text-right">
                    {line.quantity} {line.sourceUom}
                  </td>
                  <td className="tabular px-4 py-3 text-right">{line.weightKg.toFixed(3)}</td>
                  <td className="tabular px-4 py-3 text-right">{line.valueUsd.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[var(--color-sunken)] font-medium">
                <td className="px-4 py-2.5" colSpan={3}>
                  Total
                </td>
                <td className="tabular px-4 py-2.5 text-right">{sum(sliLines.map((l) => l.quantity))}</td>
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
