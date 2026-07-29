import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, CardBody, CardHeader, Select } from './components/ui'
import { UploadPanel } from './features/upload-panel'
import { ChecksPanel, CommodityTable, OverridesPanel, PartOverridesPanel, ShipmentSummary } from './features/review'
import { ManualFieldsPanel } from './features/manual-fields'
import { ItemLibraryPanel, ItemMasterUpdatesPanel, type ImportMode } from './features/item-library'
import { HistoryPanel, OutputPanel } from './features/output-panel'
import { reconcile, resolveDestinationCountry } from './domain/reconcile'
import { indexByPart, libraryChanges, libraryWeights, type ItemLibraryEntry } from './domain/item-library'
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
import {
  KEYED_CARRIERS,
  detectCarrier,
  getAdapter,
  isKeyedCarrier,
  type CarrierId,
  type ShipmentCarrierId,
} from './carriers/registry'
import {
  localStore,
  overrideCodes,
  overrideWeights,
  overridesToMap,
  type OverrideRecord,
  type PartOverrideRecord,
  type ShipmentRecord,
} from './store/local-store'
import type { ParsedCipl } from './domain/types'

const CARRIER_LABELS: Record<ShipmentCarrierId, string> = {
  'nippon-express': 'Nippon Express USA',
  ceva: 'CEVA Logistics',
  fedex: 'FedEx — keyed into Ship Manager',
  ups: 'UPS — keyed into WorldShip',
}

export function App() {
  const [parsed, setParsed] = useState<ParsedCipl | null>(null)
  const [carrierId, setCarrierId] = useState<ShipmentCarrierId>('nippon-express')
  const [profile, setProfile] = useState<CompanyProfile>(EMPTY_PROFILE)
  const [settings, setSettings] = useState<ShipmentSettings>(() => defaultShipmentSettings(getAdapter('nippon-express')))
  const [overrides, setOverrides] = useState<OverrideRecord[]>([])
  const [partOverrides, setPartOverrides] = useState<PartOverrideRecord[]>([])
  const [items, setItems] = useState<ItemLibraryEntry[]>([])
  const [shipments, setShipments] = useState<ShipmentRecord[]>([])
  const [scheduleB, setScheduleB] = useState<ScheduleBIndex | null>(null)
  const [scheduleBPayload, setScheduleBPayload] = useState<RawPayload | null>(null)
  const [scheduleBError, setScheduleBError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const keyedCarrier = isKeyedCarrier(carrierId) ? carrierId : null
  // A keyed carrier has no form of its own. The draft still needs an adapter to assemble
  // and check values, so one is used purely as scaffolding and never offered as output.
  const adapter = useMemo(
    () => getAdapter(isKeyedCarrier(carrierId) ? 'nippon-express' : (carrierId as CarrierId)),
    [carrierId],
  )
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
      const [saved, savedOverrides, savedPartOverrides, savedItems, history] = await Promise.all([
        localStore.getProfile(),
        localStore.listOverrides(),
        localStore.listPartOverrides(),
        localStore.listItems(),
        localStore.listShipments(),
      ])
      if (saved) setProfile(saved)
      setOverrides(savedOverrides)
      setPartOverrides(savedPartOverrides)
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
      const base = defaultShipmentSettings(
        getAdapter(isKeyedCarrier(nextCarrier) ? 'nippon-express' : (nextCarrier as CarrierId)),
      )
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
    () => ({ ...libraryWeights(items), ...overrideWeights(partOverrides) }),
    [items, partOverrides],
  )

  /**
   * Commodity numbers entered against a part.
   *
   * Unlike the weights this has no library layer beneath it. The item master's code is
   * reference data the reconciliation *reports on* — where it disagrees with the CIPL that
   * disagreement is the finding — so letting it silently change what gets filed would erase
   * the very check that surfaces it. Only what a person typed goes in here.
   */
  const codesByPart = useMemo(() => overrideCodes(partOverrides), [partOverrides])

  const reconciliation = useMemo(() => {
    if (!parsed) return null
    return reconcile(parsed, scheduleB, {
      eccn: settings.eccn || null,
      sme: settings.sme || null,
      license: settings.license || null,
      overrides: overridesToMap(overrides),
      codesByPart,
      // Only consulted for formats that state no weights; a printed weight always wins.
      unitWeightsByPart,
      itemsByPart,
      maxRows: adapter.maxCommodityRows,
    })
  }, [parsed, scheduleB, settings.eccn, settings.sme, settings.license, overrides, codesByPart, unitWeightsByPart, itemsByPart, adapter])

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

  /**
   * Saves one field of a part's manual values without disturbing the other.
   *
   * One record holds both the weight and the code, so writing either has to merge rather than
   * replace — entering a code for a part that already has a weight must not silently drop the
   * weight and re-block the shipment. The existing record is matched case-insensitively and
   * its own key reused, because a part whose casing differs between two documents is one part
   * and must not end up as two rows.
   */
  const savePartOverride = useCallback(
    async (partNumber: string, description: string, patch: Partial<PartOverrideRecord>) => {
      const existing = partOverrides.find(
        (r) => r.partNumber.trim().toUpperCase() === partNumber.trim().toUpperCase(),
      )
      await localStore.savePartOverride({
        ...existing,
        partNumber: existing?.partNumber ?? partNumber,
        description: description || existing?.description || '',
        netWeightKg: existing?.netWeightKg ?? null,
        ...patch,
        updatedAt: new Date().toISOString(),
      })
      setPartOverrides(await localStore.listPartOverrides())
    },
    [partOverrides],
  )

  const savePartWeight = useCallback(
    (partNumber: string, description: string, netWeightKg: number) =>
      savePartOverride(partNumber, description, { netWeightKg }),
    [savePartOverride],
  )

  const savePartCode = useCallback(
    (partNumber: string, description: string, exportCode: string, reason: string) =>
      savePartOverride(partNumber, description, { exportCode, reason, enteredBy: profile.signerName.trim() }),
    [savePartOverride, profile.signerName],
  )

  /**
   * Drops the code override, keeping any weight.
   *
   * A part with neither left is deleted outright rather than kept as an empty row, so the
   * item-master worklist does not carry an entry that says nothing.
   */
  const clearPartCode = useCallback(
    async (partNumber: string) => {
      const existing = partOverrides.find(
        (r) => r.partNumber.trim().toUpperCase() === partNumber.trim().toUpperCase(),
      )
      if (!existing) return
      if (existing.netWeightKg == null) {
        await localStore.deletePartOverride(existing.partNumber)
      } else {
        await localStore.savePartOverride({
          ...existing,
          exportCode: '',
          reason: '',
          enteredBy: '',
          updatedAt: new Date().toISOString(),
        })
      }
      setPartOverrides(await localStore.listPartOverrides())
    },
    [partOverrides],
  )

  /** What the manual entries would change in the item master, for the export worklist. */
  const pendingLibraryChanges = useMemo(() => libraryChanges(partOverrides, items), [partOverrides, items])

  const librarySource = useMemo(() => {
    const sources = [...new Set(items.map((e) => e.source).filter(Boolean))]
    return sources.length ? sources.join(' + ') : null
  }, [items])

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
    setPartOverrides([])
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
            <ItemMasterUpdatesPanel
              changes={pendingLibraryChanges}
              librarySource={librarySource}
              today={new Date().toISOString().slice(0, 10)}
              bridge={bridge}
            />
            <HistoryPanel shipments={shipments} onClear={() => void clearAll()} />
          </>
        ) : reconciliation && draft ? (
          <>
            <Card>
              <CardHeader
                title="Carrier"
                description={
                  keyedCarrier
                    ? `The CIPL names ${parsed.headers[reconciliation.selectedSet]?.vesselAgent ?? KEYED_CARRIERS[keyedCarrier].label}. ` +
                      `This shipment is keyed into ${KEYED_CARRIERS[keyedCarrier].application}; no SLI is generated.`
                    : parsed.headers[reconciliation.selectedSet]?.vesselAgent
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
                    const next = e.target.value as ShipmentCarrierId
                    setCarrierId(next)
                    setSettings((prev) =>
                      applyCarrierDefaults(
                        prev,
                        getAdapter(isKeyedCarrier(next) ? 'nippon-express' : (next as CarrierId)),
                      ),
                    )
                  }}
                >
                  {(Object.keys(CARRIER_LABELS) as ShipmentCarrierId[]).map((id) => (
                    <option key={id} value={id}>
                      {CARRIER_LABELS[id]}
                    </option>
                  ))}
                </Select>
              </CardBody>
            </Card>

            <ShipmentSummary parsed={parsed} reconciliation={reconciliation} />
            {/*
              Always shown, unlike the weights-only panel it replaces. A code can need
              correcting on any document, and the format that prints weights is the one whose
              codes there is no library figure to check against.
            */}
            <PartOverridesPanel
              reconciliation={reconciliation}
              weights={unitWeightsByPart}
              codes={codesByPart}
              weightsNeeded={!parsed.providesWeights}
              enteredBy={profile.signerName}
              onSaveWeight={(part, description, weight) => void savePartWeight(part, description, weight)}
              onSaveCode={(part, description, code, reason) => void savePartCode(part, description, code, reason)}
              onClearCode={(part) => void clearPartCode(part)}
            />
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
              keyedCarrier={keyedCarrier}
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
