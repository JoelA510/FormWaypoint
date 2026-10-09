import fs from 'node:fs'
import { FIXTURE_NAMES, hasFixture } from './fixtures'

/**
 * Says, before any test runs, whether the real-shipment suites will run or skip.
 *
 * Those suites skip when the shipment documents are absent, which is every CI run and every
 * fresh checkout. A skip that only shows as a count on the summary line reads as a pass, so it
 * is announced here, and written to the job summary when CI provides one.
 *
 * `FW_REQUIRE_FIXTURES=1` turns the skip into a failure, for the run that is meant to prove the
 * tool against real shipments (before a release, on the machine that holds them).
 */
export default function setup(): void {
  announceFixtures()
}

export function announceFixtures(
  isPresent: (name: (typeof FIXTURE_NAMES)[number]) => boolean = hasFixture,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const missing = FIXTURE_NAMES.filter((name) => !isPresent(name))
  if (missing.length === 0) return

  const message =
    `Real-shipment suites SKIPPED: ${missing.length} of ${FIXTURE_NAMES.length} documents absent ` +
    `(${missing.join(', ')}). Weights, values and parties are still checked against synthetic ` +
    `shipments; see src/test/fixtures.ts to run the real ones.`

  if (env.FW_REQUIRE_FIXTURES === '1') {
    throw new Error(`FW_REQUIRE_FIXTURES=1, but the ${message}`)
  }

  console.warn(`\n⚠ ${message}\n`)
  const summary = env.GITHUB_STEP_SUMMARY
  if (summary) fs.appendFileSync(summary, `> [!WARNING]\n> ${message}\n`)
}
