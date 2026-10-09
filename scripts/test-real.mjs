// `npm run test:real`: the whole suite, failing rather than skipping when the real shipment
// documents are absent. Sets FW_REQUIRE_FIXTURES here rather than in package.json so it works
// in Windows shells too. Record each run in docs/testing.md.
import { spawnSync } from 'node:child_process'

const result = spawnSync('npx', ['vitest', 'run'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, FW_REQUIRE_FIXTURES: '1' },
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
