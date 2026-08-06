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
import { useCallback, useMemo, useState } from 'react'
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
import { assess, packageCountInConsignment } from '../domain/dangerous-goods/assess'
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
  emptyConsignment,
  emptyEntry,
  emptyPackage,
  type BatteryCondition,
  type BatteryEntry,
  type DgConsignment,
  type DgPackage,
} from '../domain/dangerous-goods/types'
import { renderDeclaration } from '../carriers/dgd/render'
import { deliver, open as openDelivery, type Delivery } from '../lib/deliver'
import { localDate } from '../lib/report'
import type { DesktopBridge } from '../desktop'
import type { CompanyProfile } from '../domain/draft'
import type { DgConsignmentRecord } from '../store/local-store'

const CONDITION_LABELS: Record<BatteryCondition, string> = {
  sound: 'Sound — undamaged, not for disposal',
  'damaged-or-defective': 'Damaged or defective',
  'for-recycling-or-disposal': 'Being sent for recycling or disposal',
  'prototype-or-preproduction': 'Prototype or low production run',
}

let sequence = 0
const nextId = (prefix: string) => `${prefix}${(sequence += 1)}`

export function DangerousGoodsPanel({
  profile,
  bridge,
  records,
  onPrepared,
}: {
  /** The exporter profile the standard flow already holds; the shipper block is seeded from it. */
  profile: CompanyProfile
  bridge: DesktopBridge | null
  records: DgConsignmentRecord[]
  onPrepared: (record: DgConsignmentRecord) => void
}) {
  const [consignment, setConsignment] = useState<DgConsignment>(() => ({
    ...emptyConsignment(),
    packages: [emptyPackage(nextId('pkg-'), nextId('ent-'))],
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [saved, setSaved] = useState<Delivery | null>(null)

  const assessment = useMemo(() => assess(consignment), [consignment])
  const declaration = useMemo(() => buildDeclaration(consignment, assessment), [consignment, assessment])

  const patch = useCallback(
    (changes: Partial<DgConsignment>) => setConsignment((prev) => ({ ...prev, ...changes })),
    [],
  )

  const seedShipper = useCallback(() => {
    patch({ shipper: { name: profile.usppiName, addressLines: profile.usppiAddressLines } })
  }, [patch, profile])

  const updatePackage = useCallback((id: string, changes: Partial<DgPackage>) => {
    setConsignment((prev) => ({
      ...prev,
      packages: prev.packages.map((p) => (p.id === id ? { ...p, ...changes } : p)),
    }))
  }, [])

  const updateEntry = useCallback((packageId: string, entryId: string, changes: Partial<BatteryEntry>) => {
    setConsignment((prev) => ({
      ...prev,
      packages: prev.packages.map((p) =>
        p.id === packageId
          ? { ...p, entries: p.entries.map((e) => (e.id === entryId ? { ...e, ...changes } : e)) }
          : p,
      ),
    }))
  }, [])

  /** Records what was prepared, which is the two-year retention obligation in practice. */
  const record = useCallback((): DgConsignmentRecord => {
    const now = new Date()
    const preparedAt = now.toISOString()
    return {
      id: `${consignment.airWaybillNumber || consignment.shippersReference || 'consignment'}@${preparedAt}`,
      preparedAt,
      retainUntil: retainUntil(now),
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
  }, [consignment, assessment])

  async function generateDeclaration() {
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
      onPrepared(record())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The declaration could not be generated.')
    } finally {
      setBusy(false)
    }
  }

  async function downloadChecklist() {
    setError(null)
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
      onPrepared(record())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The checklist could not be saved.')
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
              <Field label="Operating airline" hint="Named in the operator variation reminder.">
                {(id) => (
                  <Input
                    id={id}
                    value={consignment.operator}
                    onChange={(e) => patch({ operator: e.target.value })}
                    placeholder="e.g. UPS"
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
            label={`Operator variations checked (IATA 2.8.3)${consignment.operator ? ` — ${consignment.operator}` : ''}`}
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
    onChange({ ...consignment, packages: [...consignment.packages, emptyPackage(nextId('pkg-'), nextId('ent-'))] })

  const removePackage = (id: string) =>
    onChange({ ...consignment, packages: consignment.packages.filter((p) => p.id !== id) })

  const addEntry = (packageId: string) =>
    onChange({
      ...consignment,
      packages: consignment.packages.map((p) =>
        p.id === packageId ? { ...p, entries: [...p.entries, emptyEntry(nextId('ent-'))] } : p,
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
    onChange({
      ...consignment,
      overpacks: [...consignment.overpacks, { id: nextId('ovp-'), marks: '', count: 1 }],
    })

  const updateOverpack = (id: string, changes: Partial<DgConsignment['overpacks'][number]>) =>
    onChange({
      ...consignment,
      overpacks: consignment.overpacks.map((o) => (o.id === id ? { ...o, ...changes } : o)),
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
        {consignment.packages.map((pkg, index) => {
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
                            {classification.band === 'unknown' ? (
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
            <div key={overpack.id} className="mt-2 grid gap-3 sm:grid-cols-3">
              <Field label={`Overpack ${i + 1} — identical count`}>
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={1}
                    value={overpack.count}
                    onChange={(e) => updateOverpack(overpack.id, { count: Number(e.target.value) || 1 })}
                  />
                )}
              </Field>
              <Field label="Identification marks" className="sm:col-span-2" hint="All of them, e.g. #A001, #A002.">
                {(id) => (
                  <Input
                    id={id}
                    value={overpack.marks}
                    onChange={(e) => updateOverpack(overpack.id, { marks: e.target.value })}
                  />
                )}
              </Field>
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
        <Field
          label="State of charge (%)"
          hint={isMetal ? 'Not applicable — lithium metal is not rechargeable.' : 'Of rated capacity.'}
        >
          {(id) => (
            <Input
              id={id}
              type="number"
              min={0}
              max={100}
              disabled={isMetal}
              value={entry.stateOfChargePercent ?? ''}
              onChange={(e) => onChange({ stateOfChargePercent: number(e.target.value) })}
            />
          )}
        </Field>
      </div>

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

      <div className="grid gap-2 sm:grid-cols-3">
        <Toggle
          label="UN 38.3 test summary on file"
          checked={entry.testSummaryOnFile}
          onChange={(next) => onChange({ testSummaryOnFile: next })}
        />
        <Toggle
          label="Watt-hour rating marked on the case"
          checked={entry.wattHourMarkedOnCase}
          onChange={(next) => onChange({ wattHourMarkedOnCase: next })}
        />
        <Toggle
          label="Button cells installed in equipment"
          checked={entry.buttonCellsInEquipment}
          onChange={(next) => onChange({ buttonCellsInEquipment: next })}
          hint="Including circuit boards."
        />
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
          assessment.packages.map((assessed, index) => (
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
          <Button onClick={onChecklist} disabled={!assessment.canGenerate}>
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
                  <th className="py-2 font-semibold">Keep until</th>
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
                    <td className="py-2 pr-4 text-[var(--color-ink-faint)]">{record.preparedAt.slice(0, 10)}</td>
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
