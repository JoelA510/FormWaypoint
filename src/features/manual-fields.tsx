import { Badge, Card, CardBody, CardHeader, Field, Input, Select, Textarea, Toggle } from '../components/ui'
import type { CompanyProfile, ShipmentSettings } from '../domain/draft'
import type { CarrierAdapter } from '../carriers/types'
import type { ExportControlOverride } from '../domain/reconcile'
import { partKey } from '../domain/part-key'
import { useEffect, useState } from 'react'

/**
 * The values a CIPL cannot supply.
 *
 * Kept visually separate from the extracted data on purpose: everything on this screen is
 * either a saved company constant or a decision the filer is making, and the SLI's
 * compliance-controlled fields must never be quietly inferred from a shipping document.
 */
export function ManualFieldsPanel({
  profile,
  settings,
  adapter,
  onProfileChange,
  onSettingsChange,
  parts = [],
  exportControlByPart = {},
  onExportControlChange,
}: {
  profile: CompanyProfile
  settings: ShipmentSettings
  adapter: CarrierAdapter
  onProfileChange: (next: CompanyProfile) => void
  onSettingsChange: (next: ShipmentSettings) => void
  /** Part numbers on this shipment, in the order the invoice lists them. */
  parts?: string[]
  /** Export control entered against a part, keyed by uppercased part number. */
  exportControlByPart?: Record<string, ExportControlOverride>
  /** Omitted before a document is loaded, when there are no parts to enter anything against. */
  onExportControlChange?: (part: string, next: ExportControlOverride) => void
}) {
  const setProfile = <K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) =>
    onProfileChange({ ...profile, [key]: value })
  const setSetting = <K extends keyof ShipmentSettings>(key: K, value: ShipmentSettings[K]) =>
    onSettingsChange({ ...settings, [key]: value })

  const isNippon = adapter.id === 'nippon-express'

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="This shipment"
          description="Not present on the CIPL — supply these before generating."
          actions={<Badge tone="warn">manual</Badge>}
        />
        <CardBody className="space-y-3">
          <Field
            label="Shipment reference"
            hint="Internal sales-order number. On past shipments this was an SO number that appears nowhere on the CIPL."
          >
            {(id) => (
              <Input
                id={id}
                value={settings.shipmentReference}
                onChange={(e) => setSetting('shipmentReference', e.target.value)}
                placeholder="e.g. 13370794"
              />
            )}
          </Field>

          {isNippon ? (
            <Field label="Transportation reference" hint="Air waybill or booking number assigned by the forwarder.">
              {(id) => (
                <Input
                  id={id}
                  value={settings.transportationReference}
                  onChange={(e) => setSetting('transportationReference', e.target.value)}
                  placeholder="e.g. NEU-5112 9514"
                />
              )}
            </Field>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Country of destination"
              hint="Leave blank to use the document. Some layouts state none."
            >
              {(id) => (
                <Input
                  id={id}
                  value={settings.destinationCountry}
                  onChange={(e) => setSetting('destinationCountry', e.target.value)}
                  placeholder="from the document"
                />
              )}
            </Field>
            <Field label="Incoterm" hint="Leave blank to use the document's trade terms.">
              {(id) => (
                <Select id={id} value={settings.incoterm} onChange={(e) => setSetting('incoterm', e.target.value)}>
                  <option value="">from the document</option>
                  {['EXW', 'FCA', 'FOB', 'FAS', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'].map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <Field label="Consignee ID" hint="EORI in the EU, USCI in China. Required by some destinations.">
            {(id) => (
              <Input
                id={id}
                value={settings.consigneeId}
                onChange={(e) => setSetting('consigneeId', e.target.value)}
                placeholder="e.g. NL008305535"
              />
            )}
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Mode of transport">
              {(id) => (
                <Select
                  id={id}
                  value={settings.mode}
                  onChange={(e) => setSetting('mode', e.target.value as ShipmentSettings['mode'])}
                >
                  {adapter.supportedModes.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Ultimate consignee type">
              {(id) => (
                <Select
                  id={id}
                  value={settings.consigneeType}
                  onChange={(e) => setSetting('consigneeType', e.target.value as ShipmentSettings['consigneeType'])}
                >
                  <option value="DIRECT_CONSUMER">Direct consumer</option>
                  <option value="RESELLER">Reseller</option>
                  <option value="GOVERNMENT_ENTITY">Government entity</option>
                  <option value="OTHER">Other / unknown</option>
                </Select>
              )}
            </Field>
          </div>

          {isNippon ? (
            <Field label="Service term">
              {(id) => (
                <Select id={id} value={settings.term} onChange={(e) => setSetting('term', e.target.value)}>
                  <option value="DD">Door to door</option>
                  <option value="DP">Door to port</option>
                  <option value="PP">Port to port</option>
                  <option value="PD">Port to door</option>
                  <option value="PC">Port to CFS</option>
                  <option value="CP">CFS to port</option>
                  <option value="CC">CFS to CFS</option>
                </Select>
              )}
            </Field>
          ) : null}

          <Field
            label="Named place / port"
            hint={
              isNippon
                ? 'Qualifies the incoterm, e.g. the port in FOB SFO.'
                : 'Qualifies the incoterm, e.g. the port in FOB SFO. This form has no box for it, so it goes ' +
                  'into the special instructions. Leave blank where the document already names one.'
            }
          >
            {(id) => (
              <Input
                id={id}
                value={settings.namedPlace}
                onChange={(e) => setSetting('namedPlace', e.target.value)}
                placeholder="e.g. SFO"
              />
            )}
          </Field>

          <Field label="Pieces and dimensions" hint="Dimensions are not on the CIPL. Package count and gross weight are pre-filled.">
            {(id) => (
              <Textarea
                id={id}
                value={settings.piecesAndDimensions}
                onChange={(e) => setSetting('piecesAndDimensions', e.target.value)}
                placeholder="1 Pallet&#10;52 x 48 x 50"
              />
            )}
          </Field>

          <Field label="Special instructions">
            {(id) => (
              <Textarea
                id={id}
                value={settings.specialInstructions}
                onChange={(e) => setSetting('specialInstructions', e.target.value)}
              />
            )}
          </Field>

          <fieldset className="space-y-3 rounded-md border border-[var(--color-warn)] px-3 py-3">
            <legend className="px-1 text-xs font-semibold tracking-wide text-[var(--color-warn)] uppercase">
              Export control — your classification
            </legend>
            <p className="text-xs text-[var(--color-ink-soft)]">
              A CIPL never carries an ECCN. Its absence does not make a commodity EAR99, and EAR99 does not by
              itself make the shipment NLR. Enter what you have determined.
            </p>
            {/* On blur, not per keystroke. These three are part of what makes a commodity row a
                row, so every character regroups the shipment — and a figure entered against a
                row that momentarily stops existing is dropped and does not come back. Typing
                `5A992.c` should not be able to discard the weights on the screen above. */}
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="ECCN / EAR99">
                {(id) => (
                  <ControlInput
                    id={id}
                    value={settings.eccn}
                    label="ECCN for the shipment"
                    placeholder="EAR99"
                    onCommit={(next) => setSetting('eccn', next)}
                  />
                )}
              </Field>
              <Field label="SME">
                {(id) => (
                  <Select id={id} value={settings.sme} onChange={(e) => setSetting('sme', e.target.value)}>
                    <option value="">—</option>
                    <option value="N">N</option>
                    <option value="Y">Y</option>
                  </Select>
                )}
              </Field>
              <Field label="Licence / NLR">
                {(id) => (
                  <ControlInput
                    id={id}
                    value={settings.license}
                    label="Licence for the shipment"
                    placeholder="NLR"
                    onCommit={(next) => setSetting('license', next)}
                  />
                )}
              </Field>
            </div>
            {onExportControlChange && parts.length ? (
              <PerPartExportControl
                parts={parts}
                blanket={{ eccn: settings.eccn, license: settings.license, sme: settings.sme }}
                entered={exportControlByPart}
                onChange={onExportControlChange}
              />
            ) : null}
          </fieldset>

          <fieldset className="space-y-2.5 rounded-md border px-3 py-3">
            <legend className="px-1 text-xs font-semibold tracking-wide text-[var(--color-ink-soft)] uppercase">
              Declarations — confirm each
            </legend>
            <Toggle
              label="Related-party transaction"
              checked={settings.partiesRelated}
              onChange={(v) => setSetting('partiesRelated', v)}
              hint="At least 10% common ownership between exporter and consignee."
            />
            <Toggle
              label="Hazardous materials"
              checked={settings.hazardous}
              onChange={(v) => setSetting('hazardous', v)}
              hint="Cannot be inferred from a product description."
            />
            <Toggle
              label="Routed export transaction"
              checked={settings.routedExport}
              onChange={(v) => setSetting('routedExport', v)}
            />
            <Toggle label="Insured" checked={settings.insured} onChange={(v) => setSetting('insured', v)} />
            {isNippon ? (
              <>
                <Toggle label="Containerized" checked={settings.containerized} onChange={(v) => setSetting('containerized', v)} />
                <Toggle label="Jetpak service" checked={settings.jetpak} onChange={(v) => setSetting('jetpak', v)} />
              </>
            ) : null}
          </fieldset>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Exporter profile" description="Saved on this machine and reused on every shipment." />
        <CardBody className="space-y-3">
          <Field label="USPPI name">
            {(id) => <Input id={id} value={profile.usppiName} onChange={(e) => setProfile('usppiName', e.target.value)} />}
          </Field>
          <Field label="Address" hint="One line per row.">
            {(id) => (
              <Textarea
                id={id}
                value={profile.usppiAddressLines.join('\n')}
                onChange={(e) => setProfile('usppiAddressLines', e.target.value.split('\n'))}
              />
            )}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ZIP code">
              {(id) => <Input id={id} value={profile.usppiZip} onChange={(e) => setProfile('usppiZip', e.target.value)} />}
            </Field>
            <Field label="USPPI EIN">
              {(id) => <Input id={id} value={profile.usppiEin} onChange={(e) => setProfile('usppiEin', e.target.value)} />}
            </Field>
            <Field label="Contact name">
              {(id) => <Input id={id} value={profile.contactName} onChange={(e) => setProfile('contactName', e.target.value)} />}
            </Field>
            <Field label="Contact phone">
              {(id) => <Input id={id} value={profile.contactPhone} onChange={(e) => setProfile('contactPhone', e.target.value)} />}
            </Field>
            <Field label="Point of origin" hint="State where the goods begin their journey.">
              {(id) => <Input id={id} value={profile.pointOfOrigin} onChange={(e) => setProfile('pointOfOrigin', e.target.value)} />}
            </Field>
            <Field label="Signer name">
              {(id) => <Input id={id} value={profile.signerName} onChange={(e) => setProfile('signerName', e.target.value)} />}
            </Field>
            <Field label="Signer title">
              {(id) => <Input id={id} value={profile.signerTitle} onChange={(e) => setProfile('signerTitle', e.target.value)} />}
            </Field>
            <Field label="Signer initials" hint="CEVA box 33 is initialled.">
              {(id) => <Input id={id} value={profile.signerInitials} onChange={(e) => setProfile('signerInitials', e.target.value)} />}
            </Field>
            <Field label="Signer email">
              {(id) => <Input id={id} type="email" value={profile.signerEmail} onChange={(e) => setProfile('signerEmail', e.target.value)} />}
            </Field>
            <Field label="Signer phone">
              {(id) => <Input id={id} value={profile.signerPhone} onChange={(e) => setProfile('signerPhone', e.target.value)} />}
            </Field>
          </div>
          <p className="rounded-md bg-[var(--color-sunken)] px-3 py-2 text-xs text-[var(--color-ink-soft)]">
            Signature boxes are never filled automatically. The generated PDF stays editable so it can be signed
            after review.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}

/**
 * Export control for the part that does not match the rest of the shipment.
 *
 * Closed by default and counting what is inside it, because the shipment-wide values above are
 * right on almost every shipment and a table of empty boxes on every part would read as work
 * to do. Opening it is the deliberate act; the values above keep applying to everything left
 * untouched.
 *
 * Each field falls back independently, so a part can carry its own ECCN under the shipment's
 * licence. The shipment-wide value is each box's placeholder — what would be filed if the box
 * stayed empty — so typing over it is visibly a substitution.
 */
function PerPartExportControl({
  parts,
  blanket,
  entered,
  onChange,
}: {
  parts: string[]
  blanket: ExportControlOverride
  entered: Record<string, ExportControlOverride>
  onChange: (part: string, next: ExportControlOverride) => void
}) {
  const [open, setOpen] = useState(false)
  const count = parts.filter((part) => {
    const own = entered[partKey(part)]
    return Boolean(own?.eccn || own?.license || own?.sme)
  }).length

  return (
    <div className="border-t border-[var(--color-warn)]/30 pt-3">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left text-xs font-semibold tracking-wide text-[var(--color-warn)] uppercase"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>
          Per-part override — {count ? `${count} of ${parts.length} set` : `${parts.length} part${parts.length === 1 ? '' : 's'}`}
        </span>
        <span aria-hidden>{open ? '−' : '+'}</span>
      </button>
      {open ? (
        <>
          <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
            For the item that is classified differently from the rest. Anything left empty files the
            shipment-wide value above. A part filed on its own values is named in the checks.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs tracking-wide text-[var(--color-ink-faint)] uppercase">
                  <th className="py-1.5 pr-3 font-semibold">Part</th>
                  <th className="py-1.5 pr-3 font-semibold">ECCN</th>
                  <th className="py-1.5 pr-3 font-semibold">Licence</th>
                  <th className="py-1.5 font-semibold">SME</th>
                </tr>
              </thead>
              <tbody>
                {parts.map((part) => {
                  const key = partKey(part)
                  const own = entered[key] ?? {}
                  const set = (field: keyof ExportControlOverride, value: string) =>
                    onChange(key, { ...own, [field]: value.trim() || undefined })
                  return (
                    <tr key={key} className="border-t align-middle">
                      <td className="tabular py-1.5 pr-3 whitespace-nowrap">{part}</td>
                      <td className="py-1.5 pr-3">
                        <ControlInput
                          value={own.eccn}
                          label={`ECCN for ${part}`}
                          placeholder={blanket.eccn || '—'}
                          onCommit={(next) => set('eccn', next)}
                        />
                      </td>
                      <td className="py-1.5 pr-3">
                        <ControlInput
                          value={own.license}
                          label={`Licence for ${part}`}
                          placeholder={blanket.license || '—'}
                          onCommit={(next) => set('license', next)}
                        />
                      </td>
                      <td className="py-1.5">
                        <Select
                          value={own.sme ?? ''}
                          aria-label={`SME for ${part}`}
                          onChange={(e) => set('sme', e.target.value)}
                        >
                          <option value="">{blanket.sme || '—'}</option>
                          <option value="N">N</option>
                          <option value="Y">Y</option>
                        </Select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  )
}

/**
 * One export-control value for one part, committed on blur.
 *
 * Not per keystroke, for the same reason the commodity figures are not: export control is
 * part of what makes a commodity row a row, so every character regroups the rows. `3A001.a`
 * typed a letter at a time files the shipment under `3`, then `3A`, then `3A0` — and each
 * regrouping moves rows out from under any figure entered against them, which is not
 * something a keystroke should be able to do.
 */
function ControlInput({
  id,
  value,
  label,
  placeholder,
  onCommit,
}: {
  id?: string
  value: string | undefined
  label: string
  placeholder: string
  onCommit: (next: string) => void
}) {
  const [draft, setDraft] = useState(value ?? '')
  useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  return (
    <Input
      id={id}
      value={draft}
      aria-label={label}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        // Only where something moved. Export control is part of the commodity-row grouping
        // key, so every commit regroups the shipment and re-runs every check — and this table
        // is designed to be opened and mostly left alone, so tabbing across it would pay that
        // twice per part for nothing.
        if (draft === (value ?? '')) return
        onCommit(draft)
      }}
    />
  )
}
