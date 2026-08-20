import { Badge, Card, CardBody, CardHeader, Field, Input, Select, Textarea, Toggle } from '../components/ui'
import type { CompanyProfile, ShipmentSettings } from '../domain/draft'
import type { CarrierAdapter } from '../carriers/types'

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
}: {
  profile: CompanyProfile
  settings: ShipmentSettings
  adapter: CarrierAdapter
  onProfileChange: (next: CompanyProfile) => void
  onSettingsChange: (next: ShipmentSettings) => void
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
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="ECCN / EAR99">
                {(id) => (
                  <Input id={id} value={settings.eccn} onChange={(e) => setSetting('eccn', e.target.value)} placeholder="EAR99" />
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
                  <Input id={id} value={settings.license} onChange={(e) => setSetting('license', e.target.value)} placeholder="NLR" />
                )}
              </Field>
            </div>
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
