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
import { localDate } from './lib/report'
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
  overrideDescriptions,
  overrideWeights,
  overridesToMap,
  type DgConsignmentRecord,
  type OverrideRecord,
  type PartOverrideRecord,
  type PartOverridePatch,
  type ShipmentRecord,
} from './store/local-store'
import { DangerousGoodsPanel } from './features/dangerous-goods'
import { newConsignment, type DgConsignment } from './domain/dangerous-goods/types'
import type { ParsedCipl } from './domain/types'

/**
 * The two workflows this application holds, kept apart on purpose.
 *
 * Conventional export paperwork and dangerous goods paperwork answer different questions and
 * fail in different ways. Putting the lithium battery questions in front of every ordinary
 * shipment would make them noise, and noise is how a hazard question comes to be answered
 * without being read.
 */
type Workflow = 'standard' | 'dangerous-goods'

const CARRIER_LABELS: Record<ShipmentCarrierId, string> = {
  'nippon-express': 'Nippon Express USA',
  ceva: 'CEVA Logistics',
  fedex: 'FedEx — keyed into Ship Manager',
  ups: 'UPS — keyed into WorldShip',
}

export function App() {
  const [workflow, setWorkflow] = useState<Workflow>('standard')
  const [parsed, setParsed] = useState<ParsedCipl | null>(null)
  const [carrierId, setCarrierId] = useState<ShipmentCarrierId>('nippon-express')
  const [profile, setProfile] = useState<CompanyProfile>(EMPTY_PROFILE)
  const [settings, setSettings] = useState<ShipmentSettings>(() => defaultShipmentSettings(getAdapter('nippon-express')))
  const [overrides, setOverrides] = useState<OverrideRecord[]>([])
  const [partOverrides, setPartOverrides] = useState<PartOverrideRecord[]>([])
  const [items, setItems] = useState<ItemLibraryEntry[]>([])
  const [shipments, setShipments] = useState<ShipmentRecord[]>([])
  const [dgConsignments, setDgConsignments] = useState<DgConsignmentRecord[]>([])
  // Held here rather than inside the tab, which unmounts when the other one is shown. A
  // half-entered dangerous goods consignment is measured, weighed, looked-up work; losing it
  // to a glance at the standard flow would be its own kind of data loss.
  const [dgConsignment, setDgConsignment] = useState<DgConsignment>(newConsignment)
  const [scheduleB, setScheduleB] = useState<ScheduleBIndex | null>(null)
  const [scheduleBPayload, setScheduleBPayload] = useState<RawPayload | null>(null)
  const [scheduleBError, setScheduleBError] = useState<string | null>(null)
  /**
   * What could not be *read* when the page loaded. Set once and left alone.
   *
   * Kept apart from the write report below because they answer different questions and
   * clear at different times: a later write succeeding says nothing about the reads that
   * failed, and the panels those reads would have filled are still empty. Folding the two
   * together erased this within the first second of every affected session, since the
   * profile autosave fires 400 ms after load.
   */
  const [restoreError, setRestoreError] = useState<string | null>(null)
  /** The most recent write failure, withdrawn when a write succeeds. */
  const [writeError, setWriteError] = useState<string | null>(null)
  /**
   * A form that was generated whose history record was not written.
   *
   * Sticky, like the profile note and for the same reason: it is about an artifact that
   * already exists and an audit row that does not, and no later success makes that untrue.
   * Left on the transient banner, the next part-weight correction withdrew it.
   */
  const [unrecordedShipment, setUnrecordedShipment] = useState<string | null>(null)
  /**
   * Whether the stored profile was actually read.
   *
   * The autosave below is guarded on the profile still being `EMPTY_PROFILE`, which held
   * while a failed read meant a failed write too. It no longer does — a transient failure
   * can leave this screen empty over a database that opens fine a moment later — so the
   * first keystroke would have saved a near-blank profile over the real one. Nothing is
   * written back until something was read.
   */
  const [profileLoaded, setProfileLoaded] = useState(false)
  /**
   * Set when the profile read failed, which is a different thing from a write failing.
   *
   * Sticky, and reported separately, because nothing will write the profile back for the
   * rest of the page's life: autosaving over a form that was never filled from storage
   * would replace the saved profile with whatever is on screen. A successful write to some
   * other store clears the transient banner and must not clear this.
   */
  const [profileUnavailable, setProfileUnavailable] = useState(false)
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

  /**
   * Runs a store write, saying so when it fails and withdrawing a stale complaint when it
   * does not.
   *
   * Every one of these used to be a bare `await` inside a `void`-ed callback, which was
   * survivable while a store that could be read could also be written. A tab superseded by
   * a newer version in another window breaks that: every write rejects, and an import or a
   * weight correction disappears without a word. And a message about a failure that has
   * since cleared is its own kind of wrong, so a success takes it back down.
   */
  const write = useCallback(
    async (what: string, run: () => Promise<void>, refresh?: () => Promise<void>): Promise<void> => {
      try {
        await run()
        setWriteError(null)
      } catch (e: unknown) {
        const because = e instanceof Error ? e.message : 'the local database could not be reached'
        setWriteError(`${what} could not be saved on this machine: ${because}`)
        return
      }
      // Refreshing the list on screen is not the obligation the write satisfied. Inside the
      // same try, a committed write whose read-back failed was reported as "could not be
      // saved" — the misreport already fixed for the retention record and for `clearAll`.
      try {
        await refresh?.()
      } catch {
        // The list re-reads on the next load; what was written is written.
      }
    },
    [],
  )

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

    // Settled rather than all-or-nothing, and reported rather than swallowed. One rejecting
    // read used to discard the other five, so a browser that refused a single store left the
    // profile blank and the retention panel reading "Nothing prepared yet" for consignments
    // still inside their two-year window — with no indication that anything had failed.
    void (async () => {
      const [saved, savedOverrides, savedPartOverrides, savedItems, history, dgHistory] =
        await Promise.allSettled([
          localStore.getProfile(),
          localStore.listOverrides(),
          localStore.listPartOverrides(),
          localStore.listItems(),
          localStore.listShipments(),
          localStore.listDgConsignments(),
        ])
      if (saved.status === 'fulfilled') {
        if (saved.value) setProfile(saved.value)
        setProfileLoaded(true)
      } else {
        setProfileUnavailable(true)
      }
      if (savedOverrides.status === 'fulfilled') setOverrides(savedOverrides.value)
      if (savedPartOverrides.status === 'fulfilled') setPartOverrides(savedPartOverrides.value)
      if (savedItems.status === 'fulfilled') setItems(savedItems.value)
      if (history.status === 'fulfilled') setShipments(history.value)
      if (dgHistory.status === 'fulfilled') setDgConsignments(dgHistory.value)

      const failed = [
        [saved, 'the exporter profile'],
        [savedOverrides, 'the classification overrides'],
        [savedPartOverrides, 'the per-part weights'],
        [savedItems, 'the item library'],
        [history, 'the shipment history'],
        [dgHistory, 'the dangerous goods retention records'],
      ] as const
      const missing = failed.filter(([result]) => result.status === 'rejected').map(([, label]) => label)
      if (missing.length) {
        setRestoreError(
          `This machine's stored data could not be read: ${missing.join(', ')}. What is shown is incomplete — ` +
            'do not take an empty panel as evidence that nothing was saved.',
        )
      }
    })()
  }, [bridge])

  // Persist the profile as it is edited; it is reference data, not shipment data.
  useEffect(() => {
    if (!profileLoaded || profile === EMPTY_PROFILE) return
    // Reported, not swallowed. A tab superseded by a newer version in another window can no
    // longer write at all, and edits that vanish without a word are worse than edits that
    // fail loudly.
    const timer = setTimeout(() => void write('The exporter profile', () => localStore.saveProfile(profile)), 400)
    return () => clearTimeout(timer)
  }, [profile, profileLoaded, write])

  const handleParsed = useCallback(
    async (next: ParsedCipl) => {
      setBusy(true)
      setParsed(next)
      setError(null)

      try {
        const header = next.headers[next.availableSets[0]]
        const detected = detectCarrier(header?.vesselAgent)
        const nextCarrier = detected ?? carrierId
        setCarrierId(nextCarrier)

        const base = defaultShipmentSettings(
          getAdapter(isKeyedCarrier(nextCarrier) ? 'nippon-express' : (nextCarrier as CarrierId)),
        )
        // Reset before the lookup, not after it.
        //
        // `defaultShipmentSettings` blanks the export-control triplet deliberately — an
        // ECCN is a classification the filer makes per shipment, and one carried over from
        // the last one would be filed against these goods with the export-control check
        // passing on it. Setting the defaults only on the success path left exactly that
        // behind whenever the saved-consignee read failed.
        setSettings(base)

        // Then reuse what was learned about this consignee last time.
        const known = header ? await localStore.getConsignee(header.consignedTo.name) : null
        if (known) {
          setSettings({
            ...base,
            consigneeId: known.consigneeId,
            consigneeType: known.consigneeType,
            partiesRelated: known.partiesRelated,
            destinationCountry: known.destinationCountry ?? '',
          })
        }
      } catch (e) {
        // The parse already succeeded; only the saved-consignee lookup can land here. The
        // shipment is still workable, so say what was lost rather than wedging the screen.
        setError(
          e instanceof Error
            ? `Saved consignee details could not be read (${e.message}); enter them by hand.`
            : 'Saved consignee details could not be read; enter them by hand.',
        )
      } finally {
        setBusy(false)
      }
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

  /** Commodity wording the operator saved, for the keying sheets. Never generated. */
  const descriptionsByPart = useMemo(() => overrideDescriptions(partOverrides), [partOverrides])

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

  const saveOverride = useCallback(
    async (record: OverrideRecord) => {
      await write(
        'The classification override',
        () => localStore.saveOverride(record),
        async () => setOverrides(await localStore.listOverrides()),
      )
    },
    [write],
  )

  const removeOverride = useCallback(
    async (sourceCode: string) => {
      await write(
        'The removal of the classification override',
        () => localStore.deleteOverride(sourceCode),
        async () => setOverrides(await localStore.listOverrides()),
      )
    },
    [write],
  )

  /**
   * Saves one field of a part's manual values.
   *
   * The merge happens inside the store's transaction, not here. Both fields are edited by two
   * controls in the same table row, and a blur and a click land milliseconds apart — merging
   * against this component's `partOverrides` would build the second write from a snapshot
   * taken before the first landed and silently erase it.
   */
  const savePartOverride = useCallback(
    async (partNumber: string, description: string, patch: PartOverridePatch) => {
      await write(
        `The saved values for part ${partNumber}`,
        () => localStore.savePartOverride(partNumber, description, patch),
        async () => setPartOverrides(await localStore.listPartOverrides()),
      )
    },
    [write],
  )

  const savePartWeight = useCallback(
    (partNumber: string, description: string, netWeightKg: number) =>
      savePartOverride(partNumber, description, { netWeightKg }),
    [savePartOverride],
  )

  const savePartDescription = useCallback(
    (partNumber: string, description: string, sliDescription: string) =>
      savePartOverride(partNumber, description, { sliDescription }),
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
   * The store deletes a record left with neither field rather than keeping an empty row, so
   * clearing the code off a code-only part removes it entirely.
   */
  const clearPartCode = useCallback(
    (partNumber: string) => savePartOverride(partNumber, '', { exportCode: '', reason: '', enteredBy: '' }),
    [savePartOverride],
  )

  /** What the manual entries would change in the item master, for the export worklist. */
  const pendingLibraryChanges = useMemo(() => libraryChanges(partOverrides, items), [partOverrides, items])

  const librarySource = useMemo(() => {
    const sources = [...new Set(items.map((e) => e.source).filter(Boolean))]
    return sources.length ? sources.join(' + ') : null
  }, [items])

  const handleGenerated = useCallback(async () => {
    if (!reconciliation || !parsed) return
    const { header, sliLines } = reconciliation
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
      // The combined list, not `reconciliation.checks` alone: generation was gated on the
      // draft checks too, and an audit record that cannot show the profile and destination
      // were complete at the time is missing half of what it exists to answer.
      checks,
      settings,
    }
    // Reported, not swallowed. This is the audit record for a form that has already been
    // written and opened, and `db()` rejects rather than hanging now — so a tab superseded
    // by a newer version in another window would lose the record while the panel went on
    // saying "Saved to …". The consignee is convenience data and the list on screen is a
    // view; the record is the only one of the three that has to be said out loud.
    try {
      await localStore.saveShipment(record)
      setWriteError(null)
      setUnrecordedShipment(null)
    } catch (e: unknown) {
      const because = e instanceof Error ? e.message : 'this machine’s stored data could not be reached'
      setUnrecordedShipment(
        `The form was generated, but this machine did not record the shipment (${because}). The history entry ` +
          'is the audit trail for what was filed — note the invoice number somewhere else.',
      )
    }
    // Two independent things, in their own attempts. Sharing one, a failed consignee write
    // skipped the history refresh after a shipment record that had gone in.
    try {
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
    } catch {
      // Consignee autofill is convenience data; it is re-offered from the next document.
    }
    try {
      setShipments(await localStore.listShipments())
    } catch {
      // The history list re-reads on the next load.
    }
  }, [reconciliation, parsed, adapter, settings, draft, checks])

  const handleDgPrepared = useCallback(async (record: DgConsignmentRecord) => {
    await localStore.saveDgConsignment(record)
    // Refreshing the list on screen is not part of the obligation the write satisfies. The
    // caller reports a rejection here as "this machine did not record that it was
    // prepared", which would be false if the record went in and only the read back failed —
    // and would send someone to duplicate evidence that is already on file.
    try {
      setDgConsignments(await localStore.listDgConsignments())
    } catch {
      // The record itself is written, and the list is re-read on the next load — but the
      // panel checks this list to tell a second download of the same consignment from a
      // second preparation of it. Left stale, printing the checklist after the declaration
      // would file a duplicate retention row. So what was written is put in by hand.
      setDgConsignments((prev) => [record, ...prev.filter((r) => r.id !== record.id)])
    }
  }, [])

  const importItemLibrary = useCallback(
    async (entries: ItemLibraryEntry[], mode: ImportMode) => {
      await write(
        'The imported item library',
        async () => {
          if (mode === 'merge') await localStore.mergeItems(entries)
          else await localStore.replaceItems(entries)
        },
        async () => setItems(await localStore.listItems()),
      )
    },
    [write],
  )

  const clearItemLibrary = useCallback(async () => {
    if (!window.confirm('Remove the imported item library from this machine?')) return
    await write(
      'The removal of the item library',
      () => localStore.clearItems(),
      () => Promise.resolve(setItems([])),
    )
  }, [write])

  const clearAll = useCallback(async () => {
    if (
      !window.confirm(
        'Delete the saved profile, consignees, overrides, item library and shipment history from this machine? ' +
          'Prepared dangerous goods consignments still inside their two-year retention window are kept — they ' +
          'evidence the retention rule and are only removed once that date has passed.',
      )
    )
      return
    // Reported, not abandoned. `db()` rejects rather than hanging now, so a superseded tab
    // reaches here and threw straight out of the callback: nothing deleted, no panel reset,
    // and a confirmation dialog that had just promised the data was gone.
    try {
      await localStore.clearAll()
      setWriteError(null)
    } catch (e: unknown) {
      setWriteError(
        e instanceof Error
          ? `Nothing was deleted: ${e.message}`
          : 'Nothing was deleted — this machine’s stored data could not be reached.',
      )
      return
    }
    setProfile(EMPTY_PROFILE)
    setOverrides([])
    setPartOverrides([])
    setItems([])
    setShipments([])
    // The retention records survive `clearAll` by design, so the panel is re-read rather
    // than emptied. A failed read leaves what is on screen, which is still true.
    try {
      setDgConsignments(await localStore.listDgConsignments())
    } catch {
      // Already deleted everything it was asked to; the list refreshes on the next load.
    }
  }, [])

  return (
    <div className="min-h-dvh">
      <header className="border-b bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h1 className="text-lg font-semibold">FormWaypoint</h1>
            <p className="text-sm text-[var(--color-ink-soft)]">
              {workflow === 'standard'
                ? 'Commercial invoice & packing list → Shipper’s Letter of Instruction'
                : 'Lithium and sodium batteries by air → Shipper’s Declaration for Dangerous Goods'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="pass">runs entirely on this machine</Badge>
            {workflow === 'standard' ? (
              scheduleB ? (
                <Badge tone={scheduleBIsStale(scheduleB.generatedAt) ? 'warn' : 'neutral'}>
                  Schedule B {scheduleB.generatedAt}
                </Badge>
              ) : (
                <Badge tone="warn">loading Schedule B…</Badge>
              )
            ) : (
              <Badge tone="neutral">IATA DGR · air</Badge>
            )}
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-5" aria-label="Workflow">
          {(
            [
              ['standard', 'Standard shipping'],
              ['dangerous-goods', 'Dangerous goods — air'],
            ] as [Workflow, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-current={workflow === id ? 'page' : undefined}
              onClick={() => setWorkflow(id)}
              className={
                workflow === id
                  ? 'border-b-2 border-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-ink)]'
                  : 'border-b-2 border-transparent px-3 py-2 text-sm text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
              }
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-5 py-6">
        {/* Above the tabs, because local storage backs the panels on both of them. */}
        {restoreError ? (
          <p className="rounded-md border border-[var(--color-block)] bg-[var(--color-block-soft)] px-3 py-2 text-sm">
            {restoreError}
          </p>
        ) : null}

        {writeError ? (
          <p className="rounded-md border border-[var(--color-block)] bg-[var(--color-block-soft)] px-3 py-2 text-sm">
            {writeError}
          </p>
        ) : null}

        {unrecordedShipment ? (
          <p className="rounded-md border border-[var(--color-block)] bg-[var(--color-block-soft)] px-3 py-2 text-sm">
            {unrecordedShipment}
          </p>
        ) : null}

        {profileUnavailable ? (
          <p className="rounded-md border border-[var(--color-block)] bg-[var(--color-block-soft)] px-3 py-2 text-sm">
            The saved exporter profile could not be read, so nothing typed into it is being written back —
            saving over a form that was never filled from storage would replace the profile that is there.
            Reload the page.
          </p>
        ) : null}

        {workflow === 'dangerous-goods' ? (
          <DangerousGoodsPanel
            profile={profile}
            bridge={bridge}
            records={dgConsignments}
            consignment={dgConsignment}
            onConsignmentChange={setDgConsignment}
            onPrepared={handleDgPrepared}
          />
        ) : (
          <>
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
                today={localDate()}
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
                descriptions={descriptionsByPart}
                weightsNeeded={!parsed.providesWeights}
                enteredBy={profile.signerName}
                onSaveWeight={(part, description, weight) => void savePartWeight(part, description, weight)}
                onSaveCode={(part, description, code, reason) => void savePartCode(part, description, code, reason)}
                onSaveDescription={(part, description, text) => void savePartDescription(part, description, text)}
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
                bridge={bridge}
                descriptionsByPart={descriptionsByPart}
                sourceFile={parsed.fileName}
                excludedSets={parsed.availableSets.filter((set) => set !== reconciliation.selectedSet)}
                scheduleB={scheduleB}
                codesByPart={codesByPart}
                classificationOverrides={overridesToMap(overrides)}
                eccn={settings.eccn || null}
                license={settings.license || null}
                sme={settings.sme || null}
              />
              <HistoryPanel shipments={shipments} onClear={() => void clearAll()} />
            </>
          ) : null}
          </>
        )}
      </main>

      <footer className="mx-auto max-w-6xl px-5 pb-10 text-xs text-[var(--color-ink-faint)]">
        {workflow === 'standard' ? (
          <>
            Documents are parsed and forms are filled in this browser. Nothing is uploaded. Schedule B data comes from
            the U.S. Census Bureau AES commodity file.
          </>
        ) : (
          <>
            Classification, limits and hazard communication follow the IATA Dangerous Goods Regulations as taught in
            the Labelmaster <em>Shipping Lithium Batteries — Excepted &amp; Fully Regulated</em> multimodal course.
            State and operator variations are not held here and must be read separately for every shipment.
          </>
        )}
      </footer>
    </div>
  )
}
