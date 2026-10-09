import type { CheckResult } from '../domain/types'

/**
 * The blocking failures in a reconciliation, leaving out the one a test causes on purpose by
 * passing no Schedule B index. Suites that isolate a single check reconcile without the dataset,
 * which blocks generation on its own; this asks whether anything *else* would.
 */
export function blockersBesidesDataset(checks: CheckResult[]): string[] {
  return checks.filter((c) => c.severity === 'blocking' && !c.passed && c.id !== 'schedule-b-unavailable').map((c) => c.id)
}
