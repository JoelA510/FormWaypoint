/**
 * The Schedule B refresh, desktop only.
 *
 * Hidden entirely in the browser build, because it cannot work there: census.gov serves no
 * CORS header, so the page can never fetch the concordance itself. Offering a button that
 * always failed would be worse than not offering one.
 */
import { useState } from 'react'
import { Badge, Button, Card, CardBody, CardHeader } from '../components/ui'
import type { DesktopBridge } from '../desktop'
import type { ItemLibraryEntry } from '../domain/item-library'
import type { RawPayload } from '../domain/schedule-b'
import { scheduleBIsStale } from '../domain/schedule-b'
import { refreshScheduleB, type RefreshResult } from '../domain/schedule-b/refresh'

export function ScheduleBRefreshPanel({
  bridge,
  installed,
  items,
  libraryLoaded,
  onRefreshed,
}: {
  bridge: DesktopBridge
  installed: RawPayload | null
  items: ItemLibraryEntry[]
  libraryLoaded: boolean
  onRefreshed: (payload: RawPayload) => void
}) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<RefreshResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const stale = installed ? scheduleBIsStale(installed.generatedAt) : false

  async function run() {
    if (!installed) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const outcome = await refreshScheduleB({
        bridge,
        installed,
        items,
        libraryLoaded,
        today: new Date().toISOString().slice(0, 10),
      })
      setResult(outcome)
      if (!outcome.revision.empty) onRefreshed(outcome.payload)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'The refresh did not complete.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Schedule B dataset"
        description="Downloads the Census Bureau commodity file and records what changed, so the revision can be reviewed and carried into the item master."
        actions={
          installed ? (
            <Badge tone={stale ? 'warn' : 'pass'}>
              {installed.count.toLocaleString()} codes · {installed.generatedAt}
            </Badge>
          ) : undefined
        }
      />
      <CardBody className="space-y-3">
        {error ? (
          <p className="rounded-md border border-[var(--color-block)] bg-[var(--color-block-soft)] px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}

        {result ? <RefreshReport result={result} /> : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button variant={stale ? 'primary' : 'default'} onClick={() => void run()} disabled={busy || !installed}>
            {busy ? 'Checking the Census Bureau…' : 'Check for a new revision'}
          </Button>
          <p className="text-xs text-[var(--color-ink-soft)]">
            {stale
              ? 'The installed dataset predates the most recent January/July revision.'
              : 'Schedule B is revised each January and July.'}
          </p>
        </div>
      </CardBody>
    </Card>
  )
}

function RefreshReport({ result }: { result: RefreshResult }) {
  const { revision, affected, written, directory } = result

  if (revision.empty) {
    return (
      <p className="rounded-md border border-[var(--color-pass)] bg-[var(--color-pass-soft)] px-3 py-2 text-sm">
        No change. The published concordance matches the installed dataset, so nothing was written.
      </p>
    )
  }

  return (
    <div className="space-y-2 rounded-md border border-[var(--color-pass)] bg-[var(--color-pass-soft)] px-3 py-2 text-sm">
      <p>
        Updated to {revision.to}: <strong className="tabular">{revision.added.length}</strong> added ·{' '}
        <strong className="tabular">{revision.retired.length}</strong> retired ·{' '}
        <strong className="tabular">{revision.changed.length}</strong> redefined.
      </p>
      <p>
        {affected.length ? (
          <>
            <strong className="tabular">{affected.length}</strong> part(s) in your item master are affected —{' '}
            {affected.filter((a) => a.severity === 'retired').length} retired,{' '}
            {affected.filter((a) => a.severity === 'unit').length} with a changed unit of quantity. The worklist is
            in the change log.
          </>
        ) : (
          'No part in your item master is classified under a code this revision changed.'
        )}
      </p>
      <div className="text-xs text-[var(--color-ink-soft)]">
        <p>Written to {directory}:</p>
        <ul className="mt-0.5 space-y-0.5">
          {written.map((name) => (
            <li key={name} className="tabular">
              {name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
