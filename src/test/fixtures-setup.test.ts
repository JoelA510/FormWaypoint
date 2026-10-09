import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { announceFixtures } from './fixtures-setup'

const absent = () => false
const present = () => true

describe('the real-shipment suites never skip silently', () => {
  afterEach(() => vi.restoreAllMocks())

  it('fails the run when the documents are required and absent', () => {
    expect(() => announceFixtures(absent, { FW_REQUIRE_FIXTURES: '1' })).toThrow(/FW_REQUIRE_FIXTURES=1.*6 of 6 documents absent/)
  })

  it('announces the skip, and writes it to the CI job summary', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const summary = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fw-')), 'summary.md')
    announceFixtures(absent, { GITHUB_STEP_SUMMARY: summary })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Real-shipment suites SKIPPED'))
    expect(fs.readFileSync(summary, 'utf8')).toContain('6 of 6 documents absent')
  })

  it('says nothing when every document is present, required or not', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => announceFixtures(present, { FW_REQUIRE_FIXTURES: '1' })).not.toThrow()
    expect(warn).not.toHaveBeenCalled()
  })
})
