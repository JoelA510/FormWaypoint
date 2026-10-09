// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './error-boundary'
import { ERROR_LOG_LIMIT, logError, readErrorLog, setErrorContext } from '../lib/error-log'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Reconcile(): never {
  throw new TypeError("Cannot read properties of undefined (reading 'weightKg')")
}

describe('an error during render', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    localStorage.clear()
    container = document.createElement('div')
    document.body.append(container)
    // React reports a caught render error to the console as well; that is expected here.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    container.remove()
    vi.restoreAllMocks()
  })

  it('shows what failed instead of an empty window, and records it', async () => {
    setErrorContext({ workflow: 'standard' })
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <ErrorBoundary>
          <Reconcile />
        </ErrorBoundary>,
      )
    })

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("reading 'weightKg'")
    expect(container.textContent).toContain('Start over')
    expect(container.textContent).toContain('Export diagnostics')

    const log = readErrorLog()
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ kind: 'render', context: { workflow: 'standard' } })
    expect(log[0].message).toContain("reading 'weightKg'")
    expect(log[0].version).toMatch(/^\d+\.\d+\.\d+/)
    await act(async () => root.unmount())
  })
})

describe('the local error log', () => {
  beforeEach(() => localStorage.clear())

  it('keeps only the newest entries', () => {
    for (let i = 0; i < ERROR_LOG_LIMIT + 5; i++) logError('error', new Error(`failure ${i}`))
    const log = readErrorLog()
    expect(log).toHaveLength(ERROR_LOG_LIMIT)
    expect(log[0].message).toBe('failure 5')
    expect(log.at(-1)?.message).toBe(`failure ${ERROR_LOG_LIMIT + 4}`)
  })

  it('records what was thrown when it is not an Error', () => {
    logError('rejection', 'the census.gov request timed out')
    logError('rejection', { code: 7 })
    expect(readErrorLog().map((e) => e.message)).toEqual(['the census.gov request timed out', '{"code":7}'])
  })

  it('starts over rather than failing when the stored log is corrupt', () => {
    localStorage.setItem('formwaypoint:error-log', '{not json')
    expect(readErrorLog()).toEqual([])
    logError('error', new Error('after corruption'))
    expect(readErrorLog().map((e) => e.message)).toEqual(['after corruption'])
  })
})
