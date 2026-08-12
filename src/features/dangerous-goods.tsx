/**
 * The dangerous goods workflow: lithium and sodium batteries by air.
 *
 * Deliberately its own screen, sharing nothing with the CIPL → SLI flow but the design
 * language and the checks panel. The two jobs have almost nothing in common: one reads a
 * document and proves its arithmetic, the other asks a person what is in a box and tells them
 * what the regulations make of it. Folding dangerous goods into the standard flow would put a
 * hazard question in front of every ordinary shipment, which is how hazard questions come to
 * be answered without being read.
 *
 * Nothing here is uploaded, and nothing here is inferred. Every field the regulations turn on
 * is asked, and an unanswered one blocks rather than defaults.
 */
import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
  Toggle,
} from '../components/ui'
import { ChecksPanel } from './review'
import { assess, overpackOrder, packageCountInConsignment } from '../domain/dangerous-goods/assess'
import { buildChecklist } from '../domain/dangerous-goods/checklist'
import { buildDeclaration, formatKg, retainUntil } from '../domain/dangerous-goods/dgd'
import {
  CHEMISTRY_LABELS,
  CONFIGURATION_LABELS,
  FORM_LABELS,
  type Chemistry,
  type CellOrBattery,
  type Configuration,
} from '../domain/dangerous-goods/lithium'
import {
  emptyEntry,
  emptyOverpack,
  emptyPackage,
  newConsignment,
  nextDgId,
  PROHIBITED_CO_PACKED_CLASSES,
  type ArticleLevel,
  type BatteryCondition,
  type BatteryEntry,
  type DgConsignment,
  type DgPackage,
  type StateOfChargeBasis,
  type VehicleDetermination,
} from '../domain/dangerous-goods/types'
import { renderDeclaration } from '../carriers/dgd/render'
import { deliver, open as openDelivery, type Delivery } from '../lib/deliver'
import { localDate } from '../lib/report'
import type { DesktopBridge } from '../desktop'
import type { CompanyProfile } from '../domain/draft'
import type { DgConsignmentRecord } from '../store/local-store'

const CONDITION_LABELS: Record<BatteryCondition, string> = {
  sound: 'Sound — undamaged, not for disposal',
  'damaged-or-defective': 'Damaged, defective, or not diagnosable',
  'for-recycling-or-disposal': 'Being sent for recycling or disposal',
  'prototype-or-preproduction': 'Prototype or low production run',
}

const ARTICLE_LEVEL_LABELS: Record<ArticleLevel, string> = {
  cell: 'Cell',
  module: 'Module',
  'battery-pack': 'Assembled battery pack',
  equipment: 'Equipment containing cells or batteries',
}

/**
 * How long after filing a consignment a second download counts as the same preparation.
 *
 * Generating the declaration and then printing the bench checklist is one preparation and
 * belongs in one retention row; coming back to the same shipment next quarter is not, and
 * must not inherit the first one's date. Half an hour is long enough for the first and far
 * short of the second.
 */
const SAME_PREPARATION_MS = 30 * 60 * 1000

const SOC_BASIS_LABELS: Record<StateOfChargeBasis, string> = {
  'rated-capacity': 'Rated capacity',
  'rated-design-capacity': 'Rated design capacity',
  'indicated-capacity': 'Indicated battery capacity',
}

export function DangerousGoodsPanel({
  profile,
  bridge,
  records,
  consignment,
  onConsignmentChange: setConsignment,
  onPrepared,
}: {
  /** The exporter profile the standard flow already holds; the shipper block is seeded from it. */
  profile: CompanyProfile
  bridge: DesktopBridge | null
  records: DgConsignmentRecord[]
  /** Held above this component so switching tabs does not discard it. */
  consignment: DgConsignment
  onConsignmentChange: Dispatch<SetStateAction<DgConsignment>>
  /**
   * Awaited, and its failure carried into the caller's `catch`. The retention record is
   * the evidence that this declaration was produced; writing the PDF and reporting "Saved
   * to …" over a rejected write would leave the file on disk with nothing behind it.
   */
  onPrepared: (record: DgConsignmentRecord) => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [saved, setSaved] = useState<Delivery | null>(null)

  const assessment = useMemo(() => assess(consignment), [consignment])
  const declaration = useMemo(() => buildDeclaration(consignment, assessment), [consignment, assessment])

  const patch = useCallback(
    (changes: Partial<DgConsignment>) => setConsignment((prev) => ({ ...prev, ...changes })),
    [setConsignment],
  )

  const seedShipper = useCallback(() => {
    patch({ shipper: { name: profile.usppiName, addressLines: profile.usppiAddressLines } })
  }, [patch, profile])

  const updatePackage = useCallback((id: string, changes: Partial<DgPackage>) => {
    setConsignment((prev) => ({
      ...prev,
      packages: prev.packages.map((p) => (p.id === id ? { ...p, ...changes } : p)),
    }))
  }, [setConsignment])

  const updateEntry = useCallback((packageId: string, entryId: string, changes: Partial<BatteryEntry>) => {
    setConsignment((prev) => ({
      ...prev,
      packages: prev.packages.map((p) =>
        p.id === packageId
          ? { ...p, entries: p.entries.map((e) => (e.id === entryId ? { ...e, ...changes } : e)) }
          : p,
      ),
    }))
  }, [setConsignment])

  /**
   * Records what was prepared, which is the two-year retention obligation in practice.
   *
   * Downloading the declaration and then the checklist is one preparation of one
   * consignment, not two, and minting a fresh timestamp for each put two indistinguishable
   * rows in the retention list — the `busy` guards only ever stopped a double-click on one
   * button. So a consignment already on file keeps the identity it was filed under, and the
   * second write lands on the first. Edit anything and it is a new preparation, with its
   * own row.
   *
   * Matched against the records rather than remembered in a ref, because this panel
   * unmounts every time the other tab is shown: a component-local memory of the last write
   * forgets across a tab switch, and across a reload, which is exactly when someone comes
   * back to print the checklist for what they generated earlier.
   *
   * And bounded in time, because that match is on content alone. Preparing the same
   * consignment again months later is a *new* preparation with its own two-year window;
   * inheriting the old row's date would back-date it, overwrite the earlier evidence, and
   * shorten the period both are kept for. Only a record from the last little while is the
   * same preparation as this one.
   */
  const record = useCallback((): DgConsignmentRecord => {
    const now = Date.now()
    const fingerprint = JSON.stringify(consignment)
    const filed = records.find((r) => {
      if (JSON.stringify(r.consignment) !== fingerprint) return false
      // Bounded at both ends. Without a floor, a record stamped in the future — a clock
      // that has since been corrected, a record restored from a machine set ahead —
      // satisfied "less than half an hour ago", and a genuinely new preparation then reused
      // its id and overwrote the earlier row with a back-dated one.
      const age = now - new Date(r.preparedAt).getTime()
      return age >= 0 && age < SAME_PREPARATION_MS
    })
    const preparedAt = filed?.preparedAt ?? new Date(now).toISOString()
    return {
      id: `${consignment.airWaybillNumber || consignment.shippersReference || 'consignment'}@${preparedAt}`,
      preparedAt,
      retainUntil: retainUntil(new Date(preparedAt)),
      airWaybillNumber: consignment.airWaybillNumber,
      shippersReference: consignment.shippersReference,
      consigneeName: consignment.consignee.name,
      airportOfDeparture: consignment.airportOfDeparture,
      airportOfDestination: consignment.airportOfDestination,
      aircraft: consignment.aircraft,
      declarationRequired: assessment.declarationRequired,
      unNumbers: [...new Set(assessment.classifications.map((c) => c.unNumber))],
      packingInstructions: [...new Set(assessment.classifications.map((c) => c.packingInstructionLabel))],
      packages: assessment.totals.packages,
      netWeightKg: assessment.totals.netWeightKg,
      consignment,
      checks: assessment.checks,
    }
  }, [consignment, assessment, records])

  /**
   * Writes the retention record, and reports a failed write as what it is.
   *
   * Called after the file has been delivered and opened, so a rejection here is not a
   * failed generation: the artifact exists, and telling someone it could not be generated
   * would send them to produce a second one. What is missing is the evidence that this one
   * was produced, which is the two-year obligation and has to be said plainly — beside the
   * "Saved to …" line, not instead of it.
   */
  async function retain(artifact: string) {
    try {
      await onPrepared(record())
    } catch (e) {
      const because = e instanceof Error ? e.message : 'the record could not be written'
      setError(
        `The ${artifact} was saved, but this machine did not record that it was prepared (${because}). ` +
          'The retention record is the evidence of preparation and has to be kept for two years — note this ' +
          'consignment somewhere else, and check the browser storage for this site.',
      )
    }
  }

  async function generateDeclaration() {
    // Guarded like the checklist below: each run appends a retention record, and a
    // double-click that writes two files is noise while one that writes two audit rows is
    // misinformation.
    if (busy) return
    setBusy(true)
    setError(null)
    setWarnings([])
    try {
      const rendered = await renderDeclaration(declaration)
      setWarnings(rendered.warnings)
      const delivery = await deliver(
        bridge,
        `${consignment.airWaybillNumber || consignment.shippersReference || 'consignment'}_shippers-declaration.pdf`,
        rendered.bytes,
      )
      setSaved(delivery)
      // Opened straight away, like the SLI: the next thing anyone does with a declaration is
      // read it, print it in colour and sign it by hand.
      await openDelivery(bridge, delivery)
      await retain('declaration')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The declaration could not be generated.')
    } finally {
      setBusy(false)
    }
  }

  async function downloadChecklist() {
    // Guarded like the declaration: each run appends a retention record, and a double-click
    // that writes two files is noise while one that writes two audit rows is misinformation.
    if (busy) return
    setBusy(true)
    setError(null)
    // And cleared like it. The warnings come from drawing the declaration; left standing
    // beside a checklist download they describe a form this button does not produce.
    setWarnings([])
    try {
      const markdown = buildChecklist(consignment, assessment, localDate())
      const delivery = await deliver(
        bridge,
        `${consignment.airWaybillNumber || consignment.shippersReference || 'consignment'}_dg-checklist.md`,
        new TextEncoder().encode(markdown),
        'text/markdown',
      )
      setSaved(delivery)
      await openDelivery(bridge, delivery)
      // Recorded too: for a Section II consignment this checklist is the only artifact, and a
      // consignment that left the tool with no record has no audit trail at all.
      await retain('checklist')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The checklist could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Consignment"
          description="One or more packages from one shipper, at one time and one address, to one consignee."
          actions={
            <div className="flex items-center gap-2">
              <Badge tone={assessment.declarationRequired ? 'warn' : 'accent'}>
                {assessment.declarationRequired ? 'declaration required' : 'Section II — no declaration'}
              </Badge>
              <Badge tone={assessment.requiredAircraft === 'cargo-aircraft-only' ? 'block' : 'neutral'}>
                {assessment.requiredAircraft === 'cargo-aircraft-only' ? 'cargo aircraft only' : 'passenger permitted'}
              </Badge>
              {/*
                Explicit, because this consignment now survives a tab switch. Held state with
                no way to clear it is how the next shipment inherits the last one's figures.
              */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (!window.confirm('Clear this consignment and start a new one?')) return
                  setConsignment(newConsignment())
                  setSaved(null)
                  setWarnings([])
                  setError(null)
                }}
              >
                Start a new consignment
              </Button>
            </div>
          }
        />
        <CardBody className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            {profile.usppiName ? (
              <Button size="sm" onClick={seedShipper}>
                Use the exporter profile ({profile.usppiName})
              </Button>
            ) : null}
            <PartyEditor
              label="Shipper"
              party={consignment.shipper}
              onChange={(shipper) => patch({ shipper })}
            />
            <PartyEditor
              label="Consignee"
              party={consignment.consignee}
              onChange={(consignee) => patch({ consignee })}
            />
          </div>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Airport of departure" hint="Full airport or city name — not a code.">
                {(id) => (
                  <Input
                    id={id}
                    value={consignment.airportOfDeparture}
                    onChange={(e) => patch({ airportOfDeparture: e.target.value })}
                    placeholder="Los Angeles"
                  />
                )}
              </Field>
              <Field label="Airport of destination" hint="Full airport or city name — not a code.">
                {(id) => (
                  <Input
                    id={id}
                    value={consignment.airportOfDestination}
                    onChange={(e) => patch({ airportOfDestination: e.target.value })}
                    placeholder="Amsterdam"
                  />
                )}
              </Field>
              <Field label="Air waybill number" hint="Leave blank for the forwarder to complete.">
                {(id) => (
                  <Input
                    id={id}
                    value={consignment.airWaybillNumber}
                    onChange={(e) => patch({ airWaybillNumber: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Shipper's reference" hint="Optional, box 4.">
                {(id) => (
                  <Input
                    id={id}
                    value={consignment.shippersReference}
                    onChange={(e) => patch({ shippersReference: e.target.value })}
                  />
                )}
              </Field>
              <Field
                label="Aircraft"
                hint={
                  assessment.requiredAircraft === 'cargo-aircraft-only'
                    ? 'The contents restrict this to cargo aircraft only.'
                    : 'A consignment the goods allow on a passenger aircraft may still be offered as cargo only.'
                }
              >
                {(id) => (
                  <Select
                    id={id}
                    value={consignment.aircraft}
                    onChange={(e) => patch({ aircraft: e.target.value as DgConsignment['aircraft'] })}
                  >
                    <option value="cargo-aircraft-only">Cargo aircraft only</option>
                    <option value="passenger-and-cargo">Passenger and cargo aircraft</option>
                  </Select>
                )}
              </Field>
              <Field label="Forwarder" hint="Books the space and coordinates DG review. Not the airline.">
                {(id) => (
                  <Input
                    id={id}
                    value={consignment.forwarder}
                    onChange={(e) => patch({ forwarder: e.target.value })}
                  />
                )}
              </Field>
              <Field
                label="Operating carrier"
                hint="The airline whose aircraft this flies on. Operator variations attach here, not to the forwarder."
              >
                {(id) => (
                  <Input
                    id={id}
                    value={consignment.operatingCarrier}
                    onChange={(e) => patch({ operatingCarrier: e.target.value })}
                    placeholder="e.g. UPS Airlines"
                  />
                )}
              </Field>
              <Field label="Carrier read from" hint="Booking confirmation, master air waybill.">
                {(id) => (
                  <Input
                    id={id}
                    value={consignment.operatingCarrierSource}
                    onChange={(e) => patch({ operatingCarrierSource: e.target.value })}
                    placeholder="booking confirmation"
                  />
                )}
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="24-hour emergency contact" hint="The registrant, e.g. CHEMTREC.">
                {(id) => (
                  <Input
                    id={id}
                    value={consignment.emergencyContactName}
                    onChange={(e) => patch({ emergencyContactName: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Emergency telephone" hint="Answered 24 hours, by someone who knows the shipment.">
                {(id) => (
                  <Input
                    id={id}
                    value={consignment.emergencyContactPhone}
                    onChange={(e) => patch({ emergencyContactPhone: e.target.value })}
                    placeholder="1-800-424-9300"
                  />
                )}
              </Field>
            </div>

            <Field label="Additional handling information" hint="Anything else the operator needs to know.">
              {(id) => (
                <Textarea
                  id={id}
                  value={consignment.additionalHandlingInformation}
                  onChange={(e) => patch({ additionalHandlingInformation: e.target.value })}
                />
              )}
            </Field>
          </div>
        </CardBody>
      </Card>

      <PackagesEditor
        consignment={consignment}
        assessment={assessment}
        onUpdatePackage={updatePackage}
        onUpdateEntry={updateEntry}
        onChange={setConsignment}
      />

      <RequirementsPanel consignment={consignment} assessment={assessment} />

      <ChecksPanel
        checks={assessment.checks}
        canGenerate={assessment.canGenerate}
        description="What the regulations make of what you have described. Nothing is generated while a blocking check fails."
      />

      <Card>
        <CardHeader
          title="Signature and variations"
          description="The declaration is signed under penalty; the variations are the part no dataset can answer."
        />
        <CardBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Name of signatory">
              {(id) => (
                <Input id={id} value={consignment.signerName} onChange={(e) => patch({ signerName: e.target.value })} />
              )}
            </Field>
            <Field label="Title" hint="Optional.">
              {(id) => (
                <Input
                  id={id}
                  value={consignment.signerTitle}
                  onChange={(e) => patch({ signerTitle: e.target.value })}
                />
              )}
            </Field>
            <Field label="Place" hint="Optional.">
              {(id) => (
                <Input
                  id={id}
                  value={consignment.signerPlace}
                  onChange={(e) => patch({ signerPlace: e.target.value })}
                />
              )}
            </Field>
            <Field label="Date signed">
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={consignment.signerDate}
                  onChange={(e) => patch({ signerDate: e.target.value })}
                />
              )}
            </Field>
          </div>
          <Toggle
            label="State variations checked (IATA 2.8.1)"
            checked={consignment.stateVariationsChecked}
            onChange={(next) => patch({ stateVariationsChecked: next })}
            hint="For the countries of origin, transit and destination. This application holds no variation data."
          />
          <Toggle
            label={`Operator variations checked (IATA 2.8.3)${consignment.operatingCarrier ? ` — ${consignment.operatingCarrier}` : ''}`}
            checked={consignment.operatorVariationsChecked}
            onChange={(next) => patch({ operatorVariationsChecked: next })}
            hint="An airline may forbid what the DGR allows, and lithium batteries attract more variations than anything else."
          />
        </CardBody>
      </Card>

      <DeclarationPanel
        declaration={declaration}
        assessment={assessment}
        busy={busy}
        error={error}
        warnings={warnings}
        saved={saved}
        bridge={bridge}
        onGenerate={() => void generateDeclaration()}
        onChecklist={() => void downloadChecklist()}
      />

      <DgHistoryPanel records={records} />
    </>
  )
}

function PartyEditor({
  label,
  party,
  onChange,
}: {
  label: string
  party: DgConsignment['shipper']
  onChange: (next: DgConsignment['shipper']) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={`${label} name`}>
        {(id) => (
          <Input id={id} value={party.name} onChange={(e) => onChange({ ...party, name: e.target.value })} />
        )}
      </Field>
      <Field label={`${label} address`} hint="One line per line; the country belongs on it.">
        {(id) => (
          <Textarea
            id={id}
            value={party.addressLines.join('\n')}
            onChange={(e) => onChange({ ...party, addressLines: e.target.value.split('\n') })}
          />
        )}
      </Field>
    </div>
  )
}

function PackagesEditor({
  consignment,
  assessment,
  onUpdatePackage,
  onUpdateEntry,
  onChange,
}: {
  consignment: DgConsignment
  assessment: ReturnType<typeof assess>
  onUpdatePackage: (id: string, changes: Partial<DgPackage>) => void
  onUpdateEntry: (packageId: string, entryId: string, changes: Partial<BatteryEntry>) => void
  onChange: (next: DgConsignment) => void
}) {
  const addPackage = () =>
    onChange({ ...consignment, packages: [...consignment.packages, emptyPackage(nextDgId('pkg-'), nextDgId('ent-'))] })

  const removePackage = (id: string) =>
    onChange({ ...consignment, packages: consignment.packages.filter((p) => p.id !== id) })

  const addEntry = (packageId: string) =>
    onChange({
      ...consignment,
      packages: consignment.packages.map((p) =>
        p.id === packageId ? { ...p, entries: [...p.entries, emptyEntry(nextDgId('ent-'))] } : p,
      ),
    })

  const removeEntry = (packageId: string, entryId: string) =>
    onChange({
      ...consignment,
      packages: consignment.packages.map((p) =>
        p.id === packageId ? { ...p, entries: p.entries.filter((e) => e.id !== entryId) } : p,
      ),
    })

  const addOverpack = () =>
    onChange({ ...consignment, overpacks: [...consignment.overpacks, emptyOverpack(nextDgId('ovp-'))] })

  const updateOverpack = (id: string, changes: Partial<DgConsignment['overpacks'][number]>) =>
    onChange({
      ...consignment,
      overpacks: consignment.overpacks.map((o) => (o.id === id ? { ...o, ...changes } : o)),
    })

  /** Removes the overpack and detaches anything in it, so no package points at a gap. */
  const removeOverpack = (id: string) =>
    onChange({
      ...consignment,
      overpacks: consignment.overpacks.filter((o) => o.id !== id),
      packages: consignment.packages.map((p) => (p.overpackId === id ? { ...p, overpackId: null } : p)),
    })

  return (
    <Card>
      <CardHeader
        title="Packages"
        description="One entry per battery type in the box. The limits are per package; the marking exemptions are per consignment."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="neutral">
              {assessment.totals.packages} package{assessment.totals.packages === 1 ? '' : 's'} ·{' '}
              {formatKg(assessment.totals.netWeightKg)} kg
            </Badge>
            <Button size="sm" onClick={addPackage}>
              Add package
            </Button>
          </div>
        }
      />
      <CardBody className="space-y-4">
        {/* Numbered the way the declaration and the bench checklist number them, so
            "Package 2" here is the box "### 2." describes. Packages sharing an overpack are
            emitted together on the paperwork, and a screen that listed them in entry order
            gave the same ordinal to two different boxes. */}
        {overpackOrder(consignment.packages, (p) => p.overpackId).map((pkg, index) => {
          const assessed = assessment.packages.find((p) => p.pkg.id === pkg.id)
          const total = packageCountInConsignment(pkg, consignment)
          return (
            <div key={pkg.id} className="rounded-md border bg-[var(--color-sunken)] p-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">
                  Package {index + 1}
                  {total !== pkg.count ? (
                    <span className="ml-2 font-normal text-[var(--color-ink-faint)]">
                      {total} in the consignment, across its overpacks
                    </span>
                  ) : null}
                </p>
                {consignment.packages.length > 1 ? (
                  <Button size="sm" variant="ghost" onClick={() => removePackage(pkg.id)}>
                    Remove package
                  </Button>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Packaging" hint="As it is described on the declaration.">
                  {(id) => (
                    <Input
                      id={id}
                      value={pkg.packagingType}
                      onChange={(e) => onUpdatePackage(pkg.id, { packagingType: e.target.value })}
                      placeholder="Fibreboard box"
                    />
                  )}
                </Field>
                <Field
                  label="Identical packages"
                  hint={pkg.overpackId ? 'Per overpack.' : 'In the consignment.'}
                >
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      min={1}
                      value={pkg.count}
                      onChange={(e) => onUpdatePackage(pkg.id, { count: Number(e.target.value) || 0 })}
                    />
                  )}
                </Field>
                <Field label="UN specification mark" hint="Required at Sections I and IA.">
                  {(id) => (
                    <Input
                      id={id}
                      value={pkg.unSpecificationMark}
                      onChange={(e) => onUpdatePackage(pkg.id, { unSpecificationMark: e.target.value })}
                      placeholder="4G/Y25/S/26/USA/+D02390"
                    />
                  )}
                </Field>
                <Field label="Overpack">
                  {(id) => (
                    <Select
                      id={id}
                      value={pkg.overpackId ?? ''}
                      onChange={(e) => onUpdatePackage(pkg.id, { overpackId: e.target.value || null })}
                    >
                      <option value="">None</option>
                      {consignment.overpacks.map((o, i) => (
                        <option key={o.id} value={o.id}>
                          Overpack {i + 1}
                          {o.marks ? ` — ${o.marks}` : ''}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>

              {/*
                Three weights, entered as three numbers. None is computed from the others:
                deriving battery net from gross minus equipment is how a declaration ends up
                stating a quantity nobody weighed.
              */}
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Package gross weight (kg)" hint="The whole package on a scale.">
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      step="0.001"
                      min={0}
                      value={pkg.grossWeightKg ?? ''}
                      onChange={(e) =>
                        onUpdatePackage(pkg.id, {
                          grossWeightKg: e.target.value.trim() === '' ? null : Number(e.target.value),
                        })
                      }
                    />
                  )}
                </Field>
                <Field label="Equipment net weight (kg)" hint="Zero for a standalone shipment.">
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      step="0.001"
                      min={0}
                      value={pkg.equipmentNetWeightKg ?? ''}
                      onChange={(e) =>
                        onUpdatePackage(pkg.id, {
                          equipmentNetWeightKg: e.target.value.trim() === '' ? null : Number(e.target.value),
                        })
                      }
                    />
                  )}
                </Field>
                <Field
                  label="Packaging authorization limit (kg)"
                  hint="Where the tested design holds less than the packing instruction allows."
                >
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      step="0.001"
                      min={0}
                      value={pkg.packagingAuthorizationLimitKg ?? ''}
                      onChange={(e) =>
                        onUpdatePackage(pkg.id, {
                          packagingAuthorizationLimitKg: e.target.value.trim() === '' ? null : Number(e.target.value),
                        })
                      }
                    />
                  )}
                </Field>
                <div className="self-end pb-1">
                  <Toggle
                    label="Also holds prohibited dangerous goods"
                    checked={pkg.coPackedWithProhibitedClass}
                    onChange={(next) => onUpdatePackage(pkg.id, { coPackedWithProhibitedClass: next })}
                    hint={
                      `Not permitted in the same outer packaging: ${PROHIBITED_CO_PACKED_CLASSES.join('; ')}. ` +
                      'Division 1.4S is permitted, and Divisions 4.2, 4.3 and 5.2, Class 8 and Division 2.2 are ' +
                      'not on the list.'
                    }
                  />
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {pkg.entries.map((entry, entryIndex) => {
                  const classification = assessed?.entries.find((e) => e.entry.id === entry.id)?.classification
                  return (
                    <div key={entry.id} className="rounded-md border bg-[var(--color-surface)] p-3">
                      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-xs font-semibold tracking-wide text-[var(--color-ink-soft)] uppercase">
                          Battery type {entryIndex + 1}
                        </p>
                        {pkg.entries.length > 1 ? (
                          <Button size="sm" variant="ghost" onClick={() => removeEntry(pkg.id, entry.id)}>
                            Remove
                          </Button>
                        ) : null}
                      </div>
                      <EntryEditor
                        entry={entry}
                        onChange={(changes) => onUpdateEntry(pkg.id, entry.id, changes)}
                      />
                      {classification ? (
                        <p className="mt-3 border-t pt-2 text-sm">
                          <span className="font-semibold tabular">{classification.unNumber}</span>{' '}
                          <span className="text-[var(--color-ink-soft)]">{classification.properShippingName}</span>{' '}
                          <span className="text-[var(--color-ink-faint)]">
                            · Class {classification.hazardClass} · PI {classification.packingInstruction}
                            {/*
                              The unstated-rating wording belongs to entries whose treatment
                              the rating decides. A standalone sodium ion battery under
                              PI 976 is classified identically either way — saying its
                              section is pending would contradict the check beside it and
                              hide the limit for a consignment this tool will file.
                            */}
                            {classification.sectionUndetermined ? (
                              <> — the section follows from the energy content, which has not been stated</>
                            ) : (
                              <>
                                {classification.section ? ` Section ${classification.section}` : ''} ·{' '}
                                {classification.aircraft === 'cargo-aircraft-only'
                                  ? 'cargo aircraft only'
                                  : `≤ ${classification.limits.passengerKg} kg passenger`}
                                , ≤ {classification.limits.cargoKg} kg cargo ·{' '}
                                {classification.declarationRequired ? 'declaration required' : 'no declaration'}
                              </>
                            )}
                          </span>
                        </p>
                      ) : null}
                      {/*
                        Column M, on screen beside the entry it belongs to. The checks cite
                        individual provisions where one decides an answer, but a shipper
                        reading a classification needs the list itself — it is what the
                        column is for, and the ones that do not decide anything here are
                        still the ones a state or operator variation is written against.
                      */}
                      {classification?.specialProvisions.length ? (
                        <ul className="mt-2 space-y-0.5 text-xs text-[var(--color-ink-faint)]">
                          {classification.specialProvisions.map((provision) => (
                            <li key={provision}>{provision}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  )
                })}
                <Button size="sm" onClick={() => addEntry(pkg.id)}>
                  Add another battery type to this package
                </Button>
              </div>
            </div>
          )
        })}

        <div className="border-t pt-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Overpacks</p>
              <p className="text-sm text-[var(--color-ink-soft)]">
                An enclosure consolidating packages. Several identical ones must each carry an identification mark,
                and every mark and label on the packages inside is reproduced outside unless it stays visible.
              </p>
            </div>
            <Button size="sm" onClick={addOverpack}>
              Add overpack
            </Button>
          </div>
          {consignment.overpacks.map((overpack, i) => (
            <div key={overpack.id} className="mt-3 space-y-3 rounded-md border p-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label={`Overpack ${i + 1} — identical count`}>
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      min={1}
                      value={overpack.count}
                      // Zero, like the package count beside it, not one. Coerced to one, a
                      // cleared box silently under-counted the consignment: the package
                      // total is the product of the two, so six packages read as two, the
                      // two-package battery mark exemption was granted, and the mark came
                      // off the marks list and the bench checklist for packages that need
                      // it. `dg.overpack-count` is there to refuse this, and could never
                      // see it.
                      onChange={(e) => updateOverpack(overpack.id, { count: Number(e.target.value) || 0 })}
                    />
                  )}
                </Field>
                <Field
                  label="Identification marks"
                  className="sm:col-span-2"
                  hint="All of them, e.g. #A001, #A002. Must read identically on the box and on the declaration."
                >
                  {(id) => (
                    <Input
                      id={id}
                      value={overpack.marks}
                      onChange={(e) => updateOverpack(overpack.id, { marks: e.target.value })}
                    />
                  )}
                </Field>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Toggle
                  label="Inner marks and labels stay visible through it"
                  checked={overpack.innerMarksVisible}
                  onChange={(next) => updateOverpack(overpack.id, { innerMarksVisible: next })}
                  hint="Otherwise every one of them is reproduced on the exterior."
                />
                <Toggle
                  label="Also holds prohibited dangerous goods"
                  checked={overpack.coPackedWithProhibitedClass}
                  onChange={(next) => updateOverpack(overpack.id, { coPackedWithProhibitedClass: next })}
                  hint="The same list applies to an overpack as to an outer packaging."
                />
              </div>
              <Button size="sm" variant="ghost" onClick={() => removeOverpack(overpack.id)}>
                Remove overpack
              </Button>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  )
}

function EntryEditor({
  entry,
  onChange,
}: {
  entry: BatteryEntry
  onChange: (changes: Partial<BatteryEntry>) => void
}) {
  const isMetal = entry.spec.chemistry === 'lithium-metal'
  const setSpec = (changes: Partial<BatteryEntry['spec']>) => onChange({ spec: { ...entry.spec, ...changes } })
  const number = (value: string) => (value.trim() === '' ? null : Number(value))

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Chemistry">
          {(id) => (
            <Select
              id={id}
              value={entry.spec.chemistry}
              onChange={(e) => setSpec({ chemistry: e.target.value as Chemistry })}
            >
              {(Object.keys(CHEMISTRY_LABELS) as Chemistry[]).map((value) => (
                <option key={value} value={value}>
                  {CHEMISTRY_LABELS[value]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Cell or battery" hint="Two or more cells connected together is a battery.">
          {(id) => (
            <Select
              id={id}
              value={entry.spec.form}
              onChange={(e) => setSpec({ form: e.target.value as CellOrBattery })}
            >
              {(Object.keys(FORM_LABELS) as CellOrBattery[]).map((value) => (
                <option key={value} value={value}>
                  {FORM_LABELS[value]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Shipping configuration">
          {(id) => (
            <Select
              id={id}
              value={entry.spec.configuration}
              onChange={(e) => setSpec({ configuration: e.target.value as Configuration })}
            >
              {(Object.keys(CONFIGURATION_LABELS) as Configuration[]).map((value) => (
                <option key={value} value={value}>
                  {CONFIGURATION_LABELS[value]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {isMetal ? (
          <Field label="Lithium content per cell/battery (g)" hint="Not the package total.">
            {(id) => (
              <Input
                id={id}
                type="number"
                step="0.01"
                min={0}
                value={entry.spec.lithiumContentG ?? ''}
                onChange={(e) => setSpec({ lithiumContentG: number(e.target.value) })}
              />
            )}
          </Field>
        ) : (
          <Field label="Watt-hours per cell/battery" hint="Volts × ampere-hours. mAh ÷ 1000 = Ah.">
            {(id) => (
              <Input
                id={id}
                type="number"
                step="0.1"
                min={0}
                value={entry.spec.wattHours ?? ''}
                onChange={(e) => setSpec({ wattHours: number(e.target.value) })}
              />
            )}
          </Field>
        )}
        <Field label="Net battery weight per package (kg)" hint="The batteries only — not the equipment or the box.">
          {(id) => (
            <Input
              id={id}
              type="number"
              step="0.001"
              min={0}
              value={entry.netWeightKgPerPackage ?? ''}
              onChange={(e) => onChange({ netWeightKgPerPackage: number(e.target.value) })}
            />
          )}
        </Field>
        <Field label="How many per package" hint="Decides the marking exemption for equipment.">
          {(id) => (
            <Input
              id={id}
              type="number"
              min={0}
              value={entry.countPerPackage ?? ''}
              onChange={(e) => onChange({ countPerPackage: number(e.target.value) })}
            />
          )}
        </Field>
        <Field label="Article level" hint="What is physically in the box, at the level its type is tested.">
          {(id) => (
            <Select
              id={id}
              value={entry.articleLevel}
              onChange={(e) => onChange({ articleLevel: e.target.value as ArticleLevel })}
            >
              {(Object.keys(ARTICLE_LEVEL_LABELS) as ArticleLevel[]).map((value) => (
                <option key={value} value={value}>
                  {ARTICLE_LEVEL_LABELS[value]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {/*
        UN 38.3 coverage, asked as two questions rather than a tick. A module-level summary
        held against an assembled pack reads as qualification and is not one, and it is the
        failure that looks compliant right up until an airline asks.
      */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="UN 38.3 test summary covers"
          hint="A summary for the modules does not qualify the pack assembled from them."
        >
          {(id) => (
            <Select
              id={id}
              value={entry.testSummaryScope ?? ''}
              onChange={(e) =>
                onChange({ testSummaryScope: e.target.value ? (e.target.value as ArticleLevel) : null })
              }
            >
              <option value="">No test summary on file</option>
              {(Object.keys(ARTICLE_LEVEL_LABELS) as ArticleLevel[]).map((value) => (
                <option key={value} value={value}>
                  {ARTICLE_LEVEL_LABELS[value]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Test summary reference" hint="Report number or document reference — something retrievable.">
          {(id) => (
            <Input
              id={id}
              value={entry.testSummaryReference}
              onChange={(e) => onChange({ testSummaryReference: e.target.value })}
            />
          )}
        </Field>
      </div>

      {/*
        State of charge as evidence. The basis matters as much as the number: 30% of rated
        capacity and 25% of indicated capacity are different standards written for different
        entries, and a gauge reading cannot satisfy a rated-capacity limit.
      */}
      {isMetal ? null : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="State of charge (%)">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={0}
                max={100}
                value={entry.stateOfChargePercent ?? ''}
                onChange={(e) => onChange({ stateOfChargePercent: number(e.target.value) })}
              />
            )}
          </Field>
          <Field label="Measured against">
            {(id) => (
              <Select
                id={id}
                value={entry.stateOfChargeBasis ?? ''}
                onChange={(e) =>
                  onChange({
                    stateOfChargeBasis: e.target.value ? (e.target.value as StateOfChargeBasis) : null,
                  })
                }
              >
                <option value="">Not recorded</option>
                {(Object.keys(SOC_BASIS_LABELS) as StateOfChargeBasis[]).map((value) => (
                  <option key={value} value={value}>
                    {SOC_BASIS_LABELS[value]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Device or method">
            {(id) => (
              <Input
                id={id}
                value={entry.stateOfChargeMethod}
                onChange={(e) => onChange({ stateOfChargeMethod: e.target.value })}
                placeholder="BMS readout"
              />
            )}
          </Field>
          <Field label="Measured on">
            {(id) => (
              <Input
                id={id}
                type="date"
                value={entry.stateOfChargeMeasuredAt}
                onChange={(e) => onChange({ stateOfChargeMeasuredAt: e.target.value })}
              />
            )}
          </Field>
          <Field label="Measured by">
            {(id) => (
              <Input
                id={id}
                value={entry.stateOfChargeMeasuredBy}
                onChange={(e) => onChange({ stateOfChargeMeasuredBy: e.target.value })}
              />
            )}
          </Field>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Condition">
          {(id) => (
            <Select
              id={id}
              value={entry.condition}
              onChange={(e) => onChange({ condition: e.target.value as BatteryCondition })}
            >
              {(Object.keys(CONDITION_LABELS) as BatteryCondition[]).map((value) => (
                <option key={value} value={value}>
                  {CONDITION_LABELS[value]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Description" hint="For your own review screen. Never filed.">
          {(id) => (
            <Input
              id={id}
              value={entry.description}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder="e.g. drill battery packs"
            />
          )}
        </Field>
      </div>

      {/*
        Only asked where it can matter. A standalone battery is UN3480 or UN3090 whatever the
        machine it will eventually power turns out to be.
      */}
      {entry.spec.configuration === 'standalone' ? null : (
        <Field
          label="Is the equipment a vehicle?"
          hint="A vehicle is a self-propelled apparatus designed to carry persons or goods — a different UN entry entirely."
        >
          {(id) => (
            <Select
              id={id}
              value={entry.vehicleDetermination}
              onChange={(e) => onChange({ vehicleDetermination: e.target.value as VehicleDetermination })}
            >
              <option value="not-determined">Not determined</option>
              <option value="not-a-vehicle">No — equipment</option>
              <option value="is-a-vehicle">Yes — a vehicle</option>
            </Select>
          )}
        </Field>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <Toggle
          label="Watt-hour rating marked on the case"
          checked={entry.wattHourMarkedOnCase}
          onChange={(next) => onChange({ wattHourMarkedOnCase: next })}
        />
        {/* Only meaningful for cells installed in equipment, and both rules that key on it
            — the test-summary exception and the battery mark — require that. Offered on a
            standalone entry, it read as a claim the regulations do not recognise. */}
        {entry.spec.configuration === 'contained-in-equipment' ? (
          <Toggle
            label="Button cells installed in equipment"
            checked={entry.buttonCellsInEquipment}
            onChange={(next) => onChange({ buttonCellsInEquipment: next })}
            hint="Including circuit boards."
          />
        ) : null}
        {entry.spec.configuration !== 'standalone' ? (
          <Toggle
            label="Prepared to Section I"
            checked={entry.prepareToSectionI}
            onChange={(next) => onChange({ prepareToSectionI: next })}
            hint="For a package over the 5 kg Section II limit. UN specification packaging, Class 9 label, declaration and full dangerous goods training."
          />
        ) : null}
      </div>
    </div>
  )
}

function RequirementsPanel({
  consignment,
  assessment,
}: {
  consignment: DgConsignment
  assessment: ReturnType<typeof assess>
}) {
  return (
    <Card>
      <CardHeader
        title="What goes on the packages"
        description="Marks, labels and the air waybill wording — the whole of the hazard communication for a Section II consignment."
      />
      <CardBody className="space-y-4">
        {assessment.airWaybillStatements.length ? (
          <div className="rounded-md border bg-[var(--color-sunken)] px-3 py-2">
            <p className="text-xs font-semibold tracking-wide text-[var(--color-ink-soft)] uppercase">
              Air waybill, handling information
            </p>
            <ul className="mt-1 space-y-0.5">
              {assessment.airWaybillStatements.map((statement) => (
                <li key={statement} className="text-sm">
                  “{statement}”
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!assessment.packages.length ? (
          <EmptyState title="Nothing described yet">Add a package and the batteries in it.</EmptyState>
        ) : (
          // Through `overpackOrder`, like the editor, the declaration and the bench sheet.
          // This is the panel that says which marks go on which box, so its "Package 2"
          // being a different box from the editor's is the worst place for the two to
          // disagree.
          overpackOrder(assessment.packages, (p) => p.pkg.overpackId).map((assessed, index) => (
            <div key={assessed.pkg.id}>
              <p className="text-sm font-medium">
                Package {index + 1} — {packageCountInConsignment(assessed.pkg, consignment)} ×{' '}
                {assessed.pkg.packagingType || 'package'}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-[var(--color-ink-soft)]">
                {assessed.hazardCommunication.map((mark) => (
                  <li key={mark}>{mark}</li>
                ))}
                {assessed.batteryMarkExemption ? (
                  <li className="text-[var(--color-ink-faint)]">
                    Battery mark not required — {assessed.batteryMarkExemption}
                  </li>
                ) : null}
              </ul>
            </div>
          ))
        )}
      </CardBody>
    </Card>
  )
}

function DeclarationPanel({
  declaration,
  assessment,
  busy,
  error,
  warnings,
  saved,
  bridge,
  onGenerate,
  onChecklist,
}: {
  declaration: ReturnType<typeof buildDeclaration>
  assessment: ReturnType<typeof assess>
  busy: boolean
  error: string | null
  warnings: string[]
  saved: Delivery | null
  bridge: DesktopBridge | null
  onGenerate: () => void
  onChecklist: () => void
}) {
  return (
    <Card>
      <CardHeader
        title="Generate"
        description={
          assessment.declarationRequired
            ? 'A Shipper’s Declaration in the IATA format, and the bench checklist that goes with it.'
            : 'No declaration is required for a Section II consignment — the checklist is the deliverable.'
        }
        actions={assessment.canGenerate ? <Badge tone="pass">checks passed</Badge> : <Badge tone="block">blocked</Badge>}
      />
      <CardBody className="space-y-4">
        {!assessment.canGenerate ? (
          <p className="rounded-md border border-[var(--color-block)] bg-[var(--color-block-soft)] px-3 py-2 text-sm">
            A blocking check has not passed. Nothing is generated until it does — a declaration that looks complete
            and is wrong is the worst thing this tool could produce.
          </p>
        ) : null}

        {assessment.declarationRequired && declaration.lines.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs tracking-wide text-[var(--color-ink-faint)] uppercase">
                  <th className="py-2 pr-4 font-semibold">UN no.</th>
                  <th className="py-2 pr-4 font-semibold">Proper shipping name</th>
                  <th className="py-2 pr-4 font-semibold">Class</th>
                  <th className="py-2 pr-4 font-semibold">Quantity and type of packing</th>
                  <th className="py-2 font-semibold">Packing inst.</th>
                </tr>
              </thead>
              <tbody>
                {declaration.lines.map((line, i) => (
                  <tr key={`${line.unNumber}-${i}`} className="border-b last:border-b-0 align-top">
                    <td className="tabular py-2 pr-4">{line.unNumber}</td>
                    <td className="py-2 pr-4">{line.properShippingName.join(' ')}</td>
                    <td className="tabular py-2 pr-4">{line.classOrDivision}</td>
                    <td className="py-2 pr-4">
                      {line.quantityAndType.join(' ')}
                      {line.annotations.map((annotation) => (
                        <span key={annotation} className="block text-[var(--color-ink-faint)]">
                          {annotation}
                        </span>
                      ))}
                    </td>
                    <td className="tabular py-2">{line.packingInstruction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
              {declaration.pages.length} sheet{declaration.pages.length === 1 ? '' : 's'}, numbered page x of y.
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          {assessment.declarationRequired ? (
            <Button variant="primary" onClick={onGenerate} disabled={!assessment.canGenerate || busy}>
              {busy ? 'Generating…' : 'Download the Shipper’s Declaration'}
            </Button>
          ) : null}
          <Button onClick={onChecklist} disabled={!assessment.canGenerate || busy}>
            Download the package checklist
          </Button>
          <span className="text-xs text-[var(--color-ink-faint)]">
            The signature box is left blank — a typewritten signature is not acceptable.
          </span>
        </div>

        {declaration.notes.length ? (
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-[var(--color-ink-soft)]">
            {declaration.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}

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
                <span className="tabular">{saved.fileName}</span> was downloaded — check your browser&rsquo;s downloads.
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
            <p className="text-xs font-semibold tracking-wide text-[var(--color-warn)] uppercase">While drawing the form</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardBody>
    </Card>
  )
}

export function DgHistoryPanel({ records }: { records: DgConsignmentRecord[] }) {
  return (
    <Card>
      <CardHeader
        title="Retention"
        description="Prepared consignments, kept on this machine. A copy of the signed declaration must be retained for two years."
      />
      <CardBody>
        {!records.length ? (
          <EmptyState title="Nothing prepared yet">
            Consignments you generate a declaration or checklist for are listed here, with the date their retention
            obligation runs to.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs tracking-wide text-[var(--color-ink-faint)] uppercase">
                  <th className="py-2 pr-4 font-semibold">Air waybill</th>
                  <th className="py-2 pr-4 font-semibold">Consignee</th>
                  <th className="py-2 pr-4 font-semibold">Entries</th>
                  <th className="py-2 pr-4 text-right font-semibold">Pkgs</th>
                  <th className="py-2 pr-4 text-right font-semibold">Net kg</th>
                  <th className="py-2 pr-4 font-semibold">Prepared</th>
                  {/*
                    "At least": the two years run from acceptance by the initial carrier,
                    which is on or after the preparation date this is computed from.
                  */}
                  <th className="py-2 font-semibold">Keep until at least</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-b last:border-b-0">
                    <td className="tabular py-2 pr-4">{record.airWaybillNumber || '—'}</td>
                    <td className="py-2 pr-4">{record.consigneeName || '—'}</td>
                    <td className="tabular py-2 pr-4">
                      {record.unNumbers.join(', ')}
                      <span className="ml-2 text-[var(--color-ink-faint)]">
                        PI {record.packingInstructions.join(', ')}
                      </span>
                    </td>
                    <td className="tabular py-2 pr-4 text-right">{record.packages}</td>
                    <td className="tabular py-2 pr-4 text-right">{formatKg(record.netWeightKg)}</td>
                    <td className="py-2 pr-4 text-[var(--color-ink-faint)]">{localDate(new Date(record.preparedAt))}</td>
                    <td className="tabular py-2">{record.retainUntil}</td>
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
