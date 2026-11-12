import { useId, useState } from 'react'
import { Button, Card, CardBody, CardHeader, Textarea } from '../components/ui'
import type { SliDraft } from '../carriers/types'
import { buildBookingSummary } from '../domain/booking-summary'
import type { ShipmentHeader } from '../domain/types'

/**
 * The shipment's booking facts as text to copy into a pickup request.
 *
 * Copying is the whole of it. Nothing is sent: the text goes to the clipboard on this machine
 * and the person pastes it where they choose (AGENTS.md project rule 3). The box is read-only
 * and selectable, so where the clipboard is refused the text can still be selected and copied
 * by hand, and the panel says so instead of failing quietly.
 *
 * Not gated on the checks. A pickup is usually requested before the paperwork is finished, and
 * every line here is what the document states or what was typed, each saying so when it is
 * missing; none is a figure the checks prove.
 */
export function BookingSummaryPanel({
  header,
  draft,
  carrier,
}: {
  header: ShipmentHeader
  draft: SliDraft
  /** The carrier's name where the draft cannot give it: a shipment keyed into FedEx or UPS. */
  carrier?: string
}) {
  const id = useId()
  const text = buildBookingSummary(header, draft, carrier)
  const [copied, setCopied] = useState<'copied' | 'refused' | null>(null)
  // The text a result was reported for. A result shown beside text that has since changed
  // would say "Copied" about a summary that is not on the clipboard.
  const [copiedText, setCopiedText] = useState('')
  const status = copiedText === text ? copied : null

  async function copy() {
    try {
      // Absent in a non-secure context and in some embedded webviews.
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
      await navigator.clipboard.writeText(text)
      setCopied('copied')
    } catch {
      // Any refusal has the same remedy, which is on the screen: select the text and copy it.
      setCopied('refused')
    }
    setCopiedText(text)
  }

  return (
    <Card>
      <CardHeader
        title="Booking summary"
        description="The facts a pickup request asks for, to copy and paste. Nothing is sent from here."
      />
      <CardBody className="space-y-3">
        <label htmlFor={id} className="sr-only">
          Booking summary text
        </label>
        <Textarea id={id} readOnly value={text} rows={text.split('\n').length} className="tabular font-mono text-xs" />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void copy()}>Copy the summary</Button>
          <span role="status" className="text-xs text-[var(--color-ink-faint)]">
            {status === 'copied'
              ? 'Copied.'
              : status === 'refused'
                ? 'The clipboard was not available. Select the text above and copy it.'
                : ''}
          </span>
        </div>
      </CardBody>
    </Card>
  )
}
