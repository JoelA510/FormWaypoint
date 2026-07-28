import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, CardBody, CardHeader, Select } from './components/ui'
import { UploadPanel } from './features/upload-panel'
import { ChecksPanel, CommodityTable, OverridesPanel, PartWeightsPanel, ShipmentSummary } from './features/review'
import { ManualFieldsPanel } from './features/manual-fields'
import { ItemLibraryPanel, type ImportMode } from './features/item-library'
import { HistoryPanel, OutputPanel } from './features/output-panel'
import { reconcile, resolveDestinationCountry } from './domain/reconcile'
import { indexByPart, libraryWeights, type ItemLibraryEntry } from './domain/item-library'
import {
  createScheduleBIndex,
  loadBundledPayload,
  scheduleBIsStale,
  type RawPayload,
  type ScheduleBIndex,
} from './domain/schedule-b'
import { loadInstalledDataset } from './domain/schedule-b/refresh'
import { desktopBridge } from './desktop'
import { ScheduleBRefreshPanel } from './features/schedule-b-refresh'
import {
  applyCarrierDefaults,
  buildDraft,
  checkDraft,
  defaultShipmentSettings,
  EMPTY_PROFILE,
  type CompanyProfile,
  type ShipmentSettings,
} from './domain/draft'
import { detectCarrier, getAdapter, type CarrierId } from './carriers/registry'
import {
  localStore,
  overridesToMap,
  partWeightsToMap,
  type OverrideRecord,
  type PartWeightRecord,
  type ShipmentRecord,
} from './store/local-store'
import type { ParsedCipl } from './domain/types'

const CARRIER_LABELS: Record<CarrierId, string> = {
  'nippon-express': 'Nippon Express USA',
  ceva: 'CEVA Logistics',
}

export function App() {
  const [parsed, setParsed] = useState<ParsedCipl | null>(null)
  const [carrierId, setCarrierId] = useState<CarrierId>('nippon-express')
  const [profile, setProfile] = useState<CompanyProfile>(EMPTY_PROFILE)
  const [settings, setSettings] = useState<ShipmentSettings>(() => defaultShipmentSettings(getAdapter('nippon-express')))
  const [overrides, setOverrides] = useState<OverrideRecord[]>([])
  const [partWeights, setPartWeights] = useState<PartWeightRecord[]>([])
  const [items, setItems] = useState<ItemLibraryEntry[]>([])
  const [shipments, setShipments] = useState<ShipmentRecord[]>([])
  const [scheduleB, setScheduleB] = useState<ScheduleBIndex | null>(null)
  const [scheduleBPayload, setScheduleBPayload] = useState<RawPayload | null>(null)
  const [scheduleBError, setScheduleBError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const adapter = useMemo(() => getAdapter(carrierId), [carrierId])
  // Null in the browser build; the whole desktop surface keys off this.
  const bridge = useMemo(() => desktopBridge(), [])

  // Load the Schedule B dataset and anything saved locally.
  useEffect(() => {
    // On the desktop a previous refresh may have written a newer dataset beside the app;
    // in the browser there is only ever the bundled one.
    void (async () => {
      try {
        const payload = bridge ? await loadInstalledDataset(bridge, loadBundledPayload) : await loadBundledPayload()
        setScheduleBPayload(payload)
        setScheduleB(createScheduleBIndex(payload))
      } catch (e: unknown) {
        setScheduleBError(e instanceof Error ? e.message : 'Schedule B data unavailable.')
      }
    })()

    void (async () => {
      const [saved, savedOverrides, savedWeights, savedItems, history] = await Promise.all([
        localStore.getProfile(),
        localStore.listOverrides(),
        localStore.listPartWeights(),
        localStore.listItems(),
        localStore.listShipments(),
      ])
      if (saved) setProfile(saved)
      setOverrides(savedOverrides)
      setPartWeights(savedWeights)
      setItems(savedItems)
      setShipments(history)
    })()
  }, [bridge])

  // Persist the profile as it is edited; it is reference data, not shipment data.
  useEffect(() => {
    if (profile === EMPTY_PROFILE) return
    const timer = setTimeout(() => void localStore.saveProfile(profile), 400)
    return () => clearTimeout(timer)
  }, [profile])

  const handleParsed = useCallback(
    async (next: ParsedCipl) => {
      setBusy(true)
      setParsed(next)
      setError(null)

      const header = next.headers[next.availableSets[0]]
      const detected = detectCarrier(header?.vesselAgent)
      const nextCarrier = detected ?? carrierId
      setCarrierId(nextCarrier)

      // Reuse what was learned about this consignee last time.
      const base = defaultShipmentSettings(getAdapter(nextCarrier))
      const known = header ? await localStore.getConsignee(header.consignedTo.name) : null
      setSettings(
        known
          ? {
              ...base,
              consigneeId: known.consigneeId,
              consigneeType: known.consigneeType,
              partiesRelated: known.partiesRelated,
              destinationCountry: known.destinationCountry ?? '',
            }
          : base,
      )
      setBusy(false)
    },
    [carrierId],
  )

  const itemsByPart = useMemo(() => indexByPart(items), [items])

  /**
   * Weights available to a format that prints none.
   *
   * The imported item master is the base layer and a weight typed on the review screen
   * overrides it, because a figure a person entered for this shipment is a deliberate act
   * and a library row is a default.
   */
  const unitWeightsByPart = useMemo(
    () => ({ ...libraryWeights(items), ...partWeightsToMap(partWeights) }),
    [items, partWeights],
  )

  const reconciliation = useMemo(() => {
    if (!parsed) return null
    return reconcile(parsed, scheduleB, {
      eccn: settings.eccn || null,
      sme: settings.sme || null,
      license: settings.license || null,
      overrides: overridesToMap(overrides),
      // Only consulted for formats that state no weights; a printed weight always wins.
      unitWeightsByPart,
      itemsByPart,
      maxRows: adapter.maxCommodityRows,
    })
  }, [parsed, scheduleB, settings.eccn, settings.sme, settings.license, overrides, unitWeightsByPart, itemsByPart, adapter])

  const draft = useMemo(
    () => (reconciliation ? buildDraft(reconciliation, profile, settings, adapter) : null),
    [reconciliation, profile, settings, adapter],
  )

  // The document checks prove what the CIPL says; the draft checks cover the fields a
  // person supplies. Generation is gated on both — reconciled totals alone are not enough
  // to make a form fit to sign.
  const checks = useMemo(
    () => (reconciliation && draft ? [...reconciliation.checks, ...checkDraft(draft, adapter)] : []),
    [reconciliation, draft, adapter],
  )
  const canGenerate = useMemo(
    () => checks.length > 0 && checks.every((c) => c.severity !== 'blocking' || c.passed),
    [checks],
  )

  const saveOverride = useCallback(async (record: OverrideRecord) => {
    await localStore.saveOverride(record)
    setOverrides(await localStore.listOverrides())
  }, [])

  const removeOverride = useCallback(async (sourceCode: string) => {
    await localStore.deleteOverride(sourceCode)
    setOverrides(await localStore.listOverrides())
  }, [])

  const savePartWeight = useCallback(async (partNumber: string, description: string, netWeightKg: number) => {
    await localStore.savePartWeight({
      partNumber,
      description,
      netWeightKg,
      updatedAt: new Date().toISOString(),
    })
    setPartWeights(await localStore.listPartWeights())
  }, [])

  const handleGenerated = useCallback(async () => {
    if (!reconciliation || !parsed) return
    const { header, sliLines, checks } = reconciliation
    const processedAt = new Date().toISOString()
    const record: ShipmentRecord = {
      id: `${header.invoiceNumber}@${processedAt}`,
      invoiceNumber: header.invoiceNumber,
      processedAt,
      carrierId: adapter.id,
      fileName: parsed.fileName,
      consigneeName: header.consignedTo.name,
      destinationCountry: resolveDestinationCountry(header) ?? '',
      totalQuantity: header.totalQuantity,
      totalValueUsd: header.totalValue,
      totalNetWeightKg: header.totalNetWeightKg ?? 0,
      lines: sliLines,
      checks,
      settings,
    }
    await localStore.saveShipment(record)
    if (header.consignedTo.name) {
      await localStore.saveConsignee({
        name: header.consignedTo.name,
        consigneeId: settings.consigneeId,
        consigneeType: settings.consigneeType,
        partiesRelated: settings.partiesRelated,
        destinationCountry: draft?.destinationCountry ?? '',
        lastUsed: new Date().toISOString(),
      })
    }
    setShipments(await localStore.listShipments())
  }, [reconciliation, parsed, adapter, settings, draft])

  const importItemLibrary = useCallback(async (entries: ItemLibraryEntry[], mode: ImportMode) => {
    if (mode === 'merge') await localStore.mergeItems(entries)
    else await localStore.replaceItems(entries)
    setItems(await localStore.listItems())
  }, [])

  const clearItemLibrary = useCallback(async () => {
    if (!window.confirm('Remove the imported item library from this machine?')) return
    await localStore.clearItems()
    setItems([])
  }, [])

  const clearAll = useCallback(async () => {
    if (
      !window.confirm(
        'Delete the saved profile, consignees, overrides, item library and shipment history from this machine?',
      )
    )
      return
    await localStore.clearAll()
    setProfile(EMPTY_PROFILE)
    setOverrides([])
    setPartWeights([])
    setItems([])
    setShipments([])
  }, [])

  return (
    <div className="min-h-dvh">
      <header className="border-b bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h1 className="text-lg font-semibold">FormWaypoint</h1>
            <p className="text-sm text-[var(--color-ink-soft)]">
              Commercial invoice &amp; packing list → Shipper&rsquo;s Letter of Instruction
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="pass">runs entirely on this machine</Badge>
            {scheduleB ? (
              <Badge tone={scheduleBIsStale(scheduleB.generatedAt) ? 'warn' : 'neutral'}>
                Schedule B {scheduleB.generatedAt}
              </Badge>
            ) : (
              <Badge tone="warn">loading Schedule B…</Badge>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-5 py-6">
        {scheduleBError ? (
          <p className="rounded-md border border-[var(--color-warn)] bg-[var(--color-warn-soft)] px-3 py-2 text-sm">
            {scheduleBError} Codes will not be checked for validity until it loads. Run{' '}
            <code className="font-mono text-xs">npm run data:schedule-b</code> to rebuild it.
          </p>
        ) : null}

        {scheduleB && scheduleBIsStale(scheduleB.generatedAt) ? (
          <p className="rounded-md border border-[var(--color-warn)] bg-[var(--color-warn-soft)] px-3 py-2 text-sm">
            The Schedule B dataset was generated {scheduleB.generatedAt}, before the most recent
            January/July revision. Codes retired since then will still pass as active. Rebuild it with{' '}
            <code className="font-mono text-xs">npm run data:schedule-b -- --fetch</code> and redeploy.
          </p>
        ) : null}

        {error ? (
          <p className="rounded-md border border-[var(--color-block)] bg-[var(--color-block-soft)] px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}

        {!parsed ? (
          <>
            <UploadPanel onParsed={(p) => void handleParsed(p)} onError={setError} busy={busy} />
            {bridge ? (
              <ScheduleBRefreshPanel
                bridge={bridge}
                installed={scheduleBPayload}
                items={items}
                libraryLoaded={items.length > 0}
                onRefreshed={(payload) => {
                  setScheduleBPayload(payload)
                  setScheduleB(createScheduleBIndex(payload))
                }}
              />
            ) : null}
            <ItemLibraryPanel
              entries={items}
              scheduleB={scheduleB}
              onImport={(entries, mode) => void importItemLibrary(entries, mode)}
              onClear={() => void clearItemLibrary()}
            />
            <HistoryPanel shipments={shipments} onClear={() => void clearAll()} />
          </>
        ) : reconciliation && draft ? (
          <>
            <Card>
              <CardHeader
                title="Carrier"
                description={
                  parsed.headers[reconciliation.selectedSet]?.vesselAgent
                    ? `The CIPL names ${parsed.headers[reconciliation.selectedSet].vesselAgent}.`
                    : 'Choose the forwarder this shipment is going to.'
                }
                actions={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setParsed(null)
                      setError(null)
                    }}
                  >
                    Start over
                  </Button>
                }
              />
              <CardBody>
                <Select
                  value={carrierId}
                  aria-label="Carrier"
                  className="w-auto"
                  onChange={(e) => {
                    const next = e.target.value as CarrierId
                    setCarrierId(next)
                    setSettings((prev) => applyCarrierDefaults(prev, getAdapter(next)))
                  }}
                >
                  {(Object.keys(CARRIER_LABELS) as CarrierId[]).map((id) => (
                    <option key={id} value={id}>
                      {CARRIER_LABELS[id]}
                    </option>
                  ))}
                </Select>
              </CardBody>
            </Card>

            <ShipmentSummary parsed={parsed} reconciliation={reconciliation} />
            {!parsed.providesWeights ? (
              <PartWeightsPanel
                reconciliation={reconciliation}
                weights={unitWeightsByPart}
                onSave={(part, description, weight) => void savePartWeight(part, description, weight)}
              />
            ) : null}
            <CommodityTable reconciliation={reconciliation} />
            <ChecksPanel checks={checks} canGenerate={canGenerate} />
            <OverridesPanel
              reconciliation={reconciliation}
              overrides={overrides}
              onSave={(record) => void saveOverride(record)}
              onDelete={(sourceCode) => void removeOverride(sourceCode)}
            />
            <ManualFieldsPanel
              profile={profile}
              settings={settings}
              adapter={adapter}
              onProfileChange={setProfile}
              onSettingsChange={setSettings}
            />
            <OutputPanel
              adapter={adapter}
              reconciliation={reconciliation}
              draft={draft}
              canGenerate={canGenerate}
              onGenerated={() => void handleGenerated()}
            />
            <HistoryPanel shipments={shipments} onClear={() => void clearAll()} />
          </>
        ) : null}
      </main>

      <footer className="mx-auto max-w-6xl px-5 pb-10 text-xs text-[var(--color-ink-faint)]">
        Documents are parsed and forms are filled in this browser. Nothing is uploaded. Schedule B data comes from
        the U.S. Census Bureau AES commodity file.
      </footer>
    </div>
  )
}
