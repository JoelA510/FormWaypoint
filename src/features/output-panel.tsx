import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Select } from '../components/ui'
import { deliver, open as openDelivery, type Delivery } from '../lib/deliver'
import {
  buildKeyingSheet,
  keyingSheetToXlsx,
  COMMODITY_COLUMNS,
  DEFAULT_KEYING_OPTIONS,
  DESCRIPTION_LABELS,
  GROUPING_LABELS,
  withDefaults,
  type CommodityColumnId,
  type DescriptionSource,
  type GroupingMode,
  type KeyingOptions,
  type KeyingTarget,
} from '../carriers/keying-sheet'
import type { DesktopBridge } from '../desktop'
import type { CarrierAdapter, SliDraft } from '../carriers/types'
import type { ScheduleBIndex } from '../domain/schedule-b'
import type { Reconciliation } from '../domain/types'
import { localStore, type ShipmentRecord } from '../store/local-store'

export function OutputPanel({
  adapter,
  reconciliation,
  draft,
  canGenerate,
  onGenerated,
  keyedCarrier = null,
  bridge,
  descriptionsByPart = {},
  sourceFile,
  excludedSets = [],
  scheduleB = null,
  codesByPart = {},
  classificationOverrides = {},
  eccn = null,
  license = null,
  sme = null,
}: {
  adapter: CarrierAdapter
  reconciliation: Reconciliation
  draft: SliDraft
  /** Absent in a browser, where a download is the only way out. */
  bridge: DesktopBridge | null
  /** Commodity wording saved against a part, for the keying sheet. */
  descriptionsByPart?: Record<string, string>
  /** The document these figures were read from, for the workbook's Notes sheet. */
  sourceFile?: string
  /** Document sets present but not used, for the same. */
  excludedSets?: string[]
  /** Supplies the official wording for the `schedule-b` description source. */
  scheduleB?: ScheduleBIndex | null
  /** The same code corrections `reconcile` was given, so the sheet prints what will be filed. */
  codesByPart?: Record<string, string>
  classificationOverrides?: Record<string, string>
  /** The controlled ECCN, so the `df-code` grouping partitions as the SLI's rows do. */
  eccn?: string | null
  /** The blanket licence and SME flag, for the same partitioning. */
  license?: string | null
  sme?: string | null
  /** Gated on the document checks *and* the draft checks — see App. */
  canGenerate: boolean
  onGenerated: () => void
  /**
   * Set when the shipment goes to a carrier that is keyed into its own software rather
   * than sent a form. The SLI download is withheld entirely in that case: the adapter in
   * play is only scaffolding for the draft, and offering its form would invite filling
   * the wrong forwarder's paperwork.
   */
  keyedCarrier?: 'fedex' | 'ups' | null
}) {
  const [busy, setBusy] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<Delivery | null>(null)
  const [target, setTarget] = useState<KeyingTarget>(
    keyedCarrier === 'ups' ? 'ups-worldship' : 'fedex-ship-manager',
  )
  const [options, setOptions] = useState<KeyingOptions>(DEFAULT_KEYING_OPTIONS)

  // Restored once, then written back on every change. A layout is a way of working, and
  // making somebody re-pick it on each shipment is the friction this panel exists to remove.
  //
  // The restore is abandoned if the operator got there first. An IndexedDB read is fast but
  // not instant, and applying a stored layout over a choice already made would undo it
  // silently — and, because only `changeOptions` writes, would not even be saved.
  const chosen = useRef(false)
  useEffect(() => {
    void (async () => {
      try {
        const saved = await localStore.getKeyingOptions()
        if (saved && !chosen.current) setOptions(withDefaults(saved))
      } catch {
        // The layout is a convenience, not shipment data: falling back to the default is a
        // complete answer, and a banner about column widths over a blocked database would
        // bury the one that matters.
      }
    })()
  }, [])

  // Computed here rather than inside the `setOptions` updater: React invokes an updater more
  // than once under StrictMode, and a write in there persists layouts from renders that were
  // thrown away. `options` is the committed value, so deriving from it is also the honest one.
  const changeOptions = (update: (current: KeyingOptions) => KeyingOptions) => {
    // Through `withDefaults`, exactly as the restore path and `buildKeyingSheet` do. It adds
    // the D/F column when the D/F grouping is chosen, and without it here the checkbox showed
    // unchecked while the download carried the column — the panel describing a sheet the
    // operator was not getting.
    // Marked before the no-op check, not after. Re-picking the grouping already selected, or
    // unticking a column `withDefaults` puts straight back, is still the operator saying they
    // have chosen — and leaving the flag unset let a stored layout land on top of it.
    chosen.current = true
    const next = withDefaults(update(options))
    if (JSON.stringify(next) === JSON.stringify(options)) return
    setOptions(next)
    // Same reasoning as the restore: the choice is applied to this session either way, and
    // the only loss is that it is not remembered next time.
    void localStore.saveKeyingOptions(next).catch(() => {})
  }

  /**
   * Column order follows the canonical list rather than the order they were ticked.
   *
   * A sheet whose columns move about between shipments is a sheet somebody keys wrongly
   * once. Toggling one column should not reorder the others.
   */
  const toggleColumn = (id: CommodityColumnId) =>
    changeOptions((current) => {
      const next = new Set(current.columns)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      const columns = COMMODITY_COLUMNS.map((c) => c.id).filter((c) => next.has(c))
      // The table has to carry something. Refusing the last removal is less surprising than
      // silently keeping a column the operator just switched off.
      return columns.length ? { ...current, columns } : current
    })

  const { header } = reconciliation

  async function generate() {
    setBusy(true)
    setError(null)
    setWarnings([])
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}${adapter.templateUrl}`)
      if (!response.ok) throw new Error(`Could not load the ${adapter.name} template (${response.status}).`)
      const templateBytes = new Uint8Array(await response.arrayBuffer())

      const verification = await adapter.verifyTemplate(templateBytes)
      if (!verification.ok) {
        throw new Error(
          `The ${adapter.name} template does not match this adapter (missing ${verification.missing.length} ` +
            `field${verification.missing.length === 1 ? '' : 's'}, first: ${verification.missing[0]}). ` +
            'The blank form was probably revised.',
        )
      }

      const filled = await adapter.fill(templateBytes, draft)
      setWarnings(filled.warnings)
      const delivery = await deliver(bridge, `${header.invoiceNumber || 'shipment'}_SLI_${adapter.id}.pdf`, filled.bytes)
      setSaved(delivery)
      // Opened straight away: the next thing anyone does with a filled SLI is read it and
      // sign it, and the boxes this tool deliberately leaves blank are only fillable there.
      await openDelivery(bridge, delivery)
      onGenerated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The form could not be generated.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Held to the same gate as the SLI.
   *
   * For a carrier that is keyed rather than sent a form, this sheet *is* the output — the
   * figures on it are typed straight into Ship Manager or WorldShip. Letting it download
   * while a blocking check is unresolved would put unreconciled numbers on a shipment by a
   * route the form can never take, which is the one thing the checks exist to prevent.
   */
  async function downloadKeyingSheet() {
    // Guarded like the SLI: each run appends a history record, so a double-click would put
    // two audit rows against one shipment.
    if (busy) return
    setBusy(true)
    setError(null)
    // Cleared like the SLI's. The warnings belong to the artifact that raised them, and a
    // form-fill warning left standing beside a keying sheet describes a box on a form this
    // download does not produce.
    setWarnings([])
    try {
      const sheet = buildKeyingSheet(target, reconciliation, draft, {
        descriptionsByPart,
        sourceFile,
        excludedSets,
        options,
        scheduleB,
        codesByPart,
        classificationOverrides,
        eccn,
        license,
        sme,
      })
      const delivery = await deliver(
        bridge,
        `${header.invoiceNumber || 'shipment'}_${target}.xlsx`,
        keyingSheetToXlsx(sheet),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      setSaved(delivery)
      await openDelivery(bridge, delivery)
      // Recorded like a generated form: for FedEx and UPS this is the only artifact, and a
      // shipment that left the tool with no history entry has no audit trail at all.
      onGenerated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The keying sheet could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Generate"
        description={
          keyedCarrier
            ? 'This carrier takes its shipment data through its own desktop application, not a form.'
            : `Fills the blank ${adapter.name} form (${adapter.templateVersion}) and downloads it.`
        }
        actions={canGenerate ? <Badge tone="pass">checks passed</Badge> : <Badge tone="block">blocked</Badge>}
      />
      <CardBody className="space-y-4">
        {!canGenerate ? (
          <p className="rounded-md border border-[var(--color-block)] bg-[var(--color-block-soft)] px-3 py-2 text-sm text-[var(--color-ink)]">
            A blocking check has not passed, so {keyedCarrier ? 'the keying sheet' : 'the form'} cannot be
            generated. Resolve it above — the totals must reconcile against the source document before
            anything is filed.
          </p>
        ) : null}

        {keyedCarrier ? null : (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={() => void generate()} disabled={!canGenerate || busy}>
              {busy ? 'Generating…' : `Download completed ${adapter.name} SLI`}
            </Button>
            <span className="text-xs text-[var(--color-ink-faint)]">
              Signature boxes are left blank for a person to sign.
            </span>
          </div>
        )}

        {error ? (
          <p className="rounded-md border border-[var(--color-block)] bg-[var(--color-block-soft)] px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}

        {saved ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--color-pass)] bg-[var(--color-pass-soft)] px-3 py-2 text-sm">
            {saved.path ? (
              <span className="min-w-0">
                Saved to <span className="tabular break-all">{saved.path}</span>
              </span>
            ) : (
              <span>
                <span className="tabular">{saved.fileName}</span> was downloaded — check your browser's downloads.
              </span>
            )}
            {saved.path ? (
              <Button size="sm" onClick={() => void openDelivery(bridge, saved)}>
                Open
              </Button>
            ) : null}
          </div>
        ) : null}

        {warnings.length ? (
          <div className="rounded-md border border-[var(--color-warn)] bg-[var(--color-warn-soft)] px-3 py-2">
            <p className="text-xs font-semibold tracking-wide text-[var(--color-warn)] uppercase">While filling the form</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className={keyedCarrier ? '' : 'border-t pt-4'}>
          <p className="text-sm font-medium text-[var(--color-ink)]">
            {keyedCarrier === 'fedex' ? 'FedEx Ship Manager' : keyedCarrier === 'ups' ? 'UPS WorldShip' : 'FedEx and UPS'}
          </p>
          <p className="mt-0.5 mb-2 text-sm text-[var(--color-ink-soft)]">
            {keyedCarrier
              ? 'This carrier is keyed into its own software rather than sent a form. A workbook: one row per ' +
                'commodity record with a total to check against, the shipment fields in the order the ' +
                'application asks for them, and a note of where every figure came from.'
              : 'A workbook laid out as the desktop application stores it — one row per commodity record, plus ' +
                'the shipment fields in the order it asks for them.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={target}
              onChange={(e) => setTarget(e.target.value as KeyingTarget)}
              className="w-auto"
              aria-label="Target application"
            >
              <option value="fedex-ship-manager">FedEx Ship Manager</option>
              <option value="ups-worldship">UPS WorldShip</option>
            </Select>
            <Button onClick={() => void downloadKeyingSheet()} disabled={!canGenerate || busy}>
              Download keying sheet
            </Button>
          </div>
          <KeyingSheetOptions options={options} setOptions={changeOptions} toggleColumn={toggleColumn} />
        </div>
      </CardBody>
    </Card>
  )
}

/**
 * How the commodity table is laid out, folded away until it is wanted.
 *
 * The defaults are what a Ship Manager commodity screen asks for, and most shipments never
 * need anything else — so this opens closed. It is not a preference screen: the choices
 * change what the next download contains, and the sheet's own Notes tab records which ones
 * were in force, so a workbook found months later still says how its rows were made.
 */
function KeyingSheetOptions({
  options,
  setOptions,
  toggleColumn,
}: {
  options: KeyingOptions
  setOptions: (update: (current: KeyingOptions) => KeyingOptions) => void
  toggleColumn: (id: CommodityColumnId) => void
}) {
  return (
    <details className="mt-3 rounded-md border border-[var(--color-line)]">
      <summary className="cursor-pointer px-3 py-2 text-sm text-[var(--color-ink-soft)] select-none">
        Layout — {options.columns.length} columns, {GROUPING_LABELS[options.grouping].toLowerCase()}
      </summary>
      <div className="space-y-3 border-t border-[var(--color-line)] px-3 py-3">
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-[var(--color-ink)]">Group rows by</span>
            <Select
              value={options.grouping}
              onChange={(e) => setOptions((c) => ({ ...c, grouping: e.target.value as GroupingMode }))}
              className="w-auto"
            >
              {Object.entries(GROUPING_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-[var(--color-ink)]">Descriptions</span>
            <Select
              value={options.descriptionSource}
              onChange={(e) =>
                setOptions((c) => ({ ...c, descriptionSource: e.target.value as DescriptionSource }))
              }
              className="w-auto"
            >
              {Object.entries(DESCRIPTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <p className="text-xs text-[var(--color-ink-soft)]">
          Every wording comes from the document or from the Census Schedule B file. The application never
          writes a commodity description — that is part of what is being declared.
        </p>
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-[var(--color-ink)]">Columns</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {COMMODITY_COLUMNS.map((column) => (
              <label key={column.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={options.columns.includes(column.id)}
                  onChange={() => toggleColumn(column.id)}
                />
                {column.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </details>
  )
}

export function HistoryPanel({
  shipments,
  onClear,
}: {
  shipments: ShipmentRecord[]
  onClear: () => void
}) {
  return (
    <Card>
      <CardHeader
        title="History"
        description="Processed shipments, kept on this machine for autofill and audit."
        actions={
          shipments.length ? (
            <Button size="sm" variant="danger" onClick={onClear}>
              Clear all local data
            </Button>
          ) : undefined
        }
      />
      <CardBody>
        {!shipments.length ? (
          <EmptyState title="Nothing processed yet">
            Shipments you generate a form for will be listed here.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs tracking-wide text-[var(--color-ink-faint)] uppercase">
                  <th className="py-2 pr-4 font-semibold">Invoice</th>
                  <th className="py-2 pr-4 font-semibold">Consignee</th>
                  <th className="py-2 pr-4 font-semibold">Destination</th>
                  <th className="py-2 pr-4 text-right font-semibold">Qty</th>
                  <th className="py-2 pr-4 text-right font-semibold">USD</th>
                  <th className="py-2 font-semibold">Processed</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((record) => (
                  <tr key={record.id} className="border-b last:border-b-0">
                    <td className="tabular py-2 pr-4">{record.invoiceNumber || '—'}</td>
                    <td className="py-2 pr-4">{record.consigneeName}</td>
                    <td className="py-2 pr-4">{record.destinationCountry}</td>
                    <td className="tabular py-2 pr-4 text-right">{record.totalQuantity}</td>
                    <td className="tabular py-2 pr-4 text-right">{record.totalValueUsd.toFixed(2)}</td>
                    <td className="py-2 text-[var(--color-ink-faint)]">{record.processedAt.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
