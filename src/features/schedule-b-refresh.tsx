/**
 * The Schedule B refresh, desktop only.
 *
 * Hidden entirely in the browser build, because it cannot work there: census.gov serves no
 * CORS header, so the page can never fetch the concordance itself. Offering a button that
 * always failed would be worse than not offering one.
 */
import { Badge, Button, Card, CardBody, CardHeader } from '../components/ui'
import { scheduleBIsStale, type RawPayload } from '../domain/schedule-b'
import type { RefreshResult } from '../domain/schedule-b/refresh'
import type { useScheduleBCheck } from './use-schedule-b-check'

export function ScheduleBRefreshPanel({ installed, check }: {
  installed: RawPayload | null
  check: ReturnType<typeof useScheduleBCheck>
}) {
  const { last, result, error, storageError, busy, run } = check
  const failed = last?.outcome === 'failed' && !busy
  const stale = installed ? scheduleBIsStale(installed.generatedAt) : false

  return (
    <Card>
      <CardHeader
        title="Schedule B dataset"
        description="Downloads the Census Bureau commodity file and records what changed, so the revision can be reviewed and carried into the item master."
        actions={
          installed ? (
            <Badge tone={stale ? 'warn' : 'pass'}>
              {installed.count.toLocaleString()} codes · Installed revision {installed.generatedAt}
            </Badge>
          ) : undefined
        }
      />
      <CardBody className="space-y-3">
        {last && <p className="text-sm">Last checked <time dateTime={last.at}>{new Date(last.at).toLocaleString()}</time>
          {' · '}{({ matched: 'Dataset matched', updated: 'Revision installed', failed: 'Check failed' })[last.outcome]}</p>}
        {storageError && <p role="status" className="text-sm">{storageError}</p>}
        {failed && <div role="alert" className="rounded-md border border-[var(--color-warn)] px-3 py-2 text-sm">
          <p>The Census check did not finish. {installed
            ? `You can continue reviewing shipments with the installed revision from ${installed.generatedAt}.`
            : 'Wait for the installed dataset to load.'} Retry the check when ready.</p>
          {error && <details><summary className="cursor-pointer">Technical details</summary><p>{error}</p></details>}
        </div>}

        {result ? <RefreshReport result={result} /> : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button variant={stale ? 'primary' : 'default'} onClick={() => void run()} disabled={busy || !installed}>
            {busy ? 'Checking the Census Bureau…' : failed ? 'Retry Census check' : 'Check for a new revision'}
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
