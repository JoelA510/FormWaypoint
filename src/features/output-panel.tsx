import { useState } from 'react'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Select } from '../components/ui'
import { downloadBytes, downloadText } from '../lib/utils'
import { buildKeyingSheet, keyingSheetToText, type KeyingTarget } from '../carriers/keying-sheet'
import type { CarrierAdapter, SliDraft } from '../carriers/types'
import type { Reconciliation } from '../domain/types'
import type { ShipmentRecord } from '../store/local-store'

export function OutputPanel({
  adapter,
  reconciliation,
  draft,
  onGenerated,
}: {
  adapter: CarrierAdapter
  reconciliation: Reconciliation
  draft: SliDraft
  onGenerated: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [target, setTarget] = useState<KeyingTarget>('fedex-ship-manager')

  const { canGenerate, header } = reconciliation

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
      downloadBytes(filled.bytes, `${header.invoiceNumber || 'shipment'}_SLI_${adapter.id}.pdf`)
      onGenerated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The form could not be generated.')
    } finally {
      setBusy(false)
    }
  }

  function downloadKeyingSheet() {
    const sheet = buildKeyingSheet(target, reconciliation, draft)
    downloadText(keyingSheetToText(sheet), `${header.invoiceNumber || 'shipment'}_${target}.txt`)
  }

  return (
    <Card>
      <CardHeader
        title="Generate"
        description={`Fills the blank ${adapter.name} form (${adapter.templateVersion}) and downloads it.`}
        actions={canGenerate ? <Badge tone="pass">checks passed</Badge> : <Badge tone="block">blocked</Badge>}
      />
      <CardBody className="space-y-4">
        {!canGenerate ? (
          <p className="rounded-md border border-[var(--color-block)] bg-[var(--color-block-soft)] px-3 py-2 text-sm text-[var(--color-ink)]">
            A blocking check has not passed, so the form cannot be generated. Resolve it above — the totals must
            reconcile against the source document before anything is filed.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => void generate()} disabled={!canGenerate || busy}>
            {busy ? 'Generating…' : `Download completed ${adapter.name} SLI`}
          </Button>
          <span className="text-xs text-[var(--color-ink-faint)]">
            Signature boxes are left blank for a person to sign.
          </span>
        </div>

        {error ? (
          <p className="rounded-md border border-[var(--color-block)] bg-[var(--color-block-soft)] px-3 py-2 text-sm">
            {error}
          </p>
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

        <div className="border-t pt-4">
          <p className="text-sm font-medium text-[var(--color-ink)]">FedEx and UPS</p>
          <p className="mt-0.5 mb-2 text-sm text-[var(--color-ink-soft)]">
            A keying sheet laid out in the order the desktop application asks for each field, for manual entry.
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
            <Button onClick={downloadKeyingSheet}>Download keying sheet</Button>
          </div>
        </div>
      </CardBody>
    </Card>
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
                  <tr key={record.invoiceNumber} className="border-b last:border-b-0">
                    <td className="tabular py-2 pr-4">{record.invoiceNumber}</td>
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
