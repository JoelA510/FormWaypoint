import { useCallback, useEffect, useRef, useState } from 'react'
import type { DesktopBridge } from '../desktop'
import type { ItemLibraryEntry } from '../domain/item-library'
import type { RawPayload } from '../domain/schedule-b'
import { refreshScheduleB, type RefreshResult } from '../domain/schedule-b/refresh'
import { localStore, type ScheduleBCheck } from '../store/local-store'

/** Lives with the app so opening a shipment during a check does not start a second one. */
export function useScheduleBCheck(bridge: DesktopBridge | null, installed: RawPayload | null,
  items: ItemLibraryEntry[], onRefreshed: (payload: RawPayload) => void) {
  const [last, setLast] = useState<ScheduleBCheck | null>(null)
  const [result, setResult] = useState<RefreshResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const version = useRef(0)
  const running = useRef(false)

  useEffect(() => {
    if (!bridge) return
    let active = true
    const initial = version.current
    void localStore.getScheduleBCheck().then(
      saved => { if (active && version.current === initial) setLast(saved) },
      () => { if (active && version.current === initial) setStorageError('The previous Census check could not be read.') },
    )
    return () => { active = false }
  }, [bridge])

  const clear = useCallback(() => {
    version.current++
    setLast(null)
    setResult(null)
    setError(null)
    setStorageError(null)
  }, [])

  async function run() {
    if (!installed || !bridge || running.current) return
    running.current = true
    const attempt = ++version.current
    setBusy(true)
    setError(null)
    setResult(null)
    setStorageError(null)
    let outcome: ScheduleBCheck['outcome'] = 'failed'
    try {
      const refreshed = await refreshScheduleB({ bridge, installed, items, libraryLoaded: items.length > 0,
        today: new Date().toISOString().slice(0, 10) })
      outcome = refreshed.revision.empty ? 'matched' : 'updated'
      if (!refreshed.revision.empty) onRefreshed(refreshed.payload)
      if (attempt === version.current) setResult(refreshed)
    } catch (e) {
      if (attempt === version.current) setError(e instanceof Error ? e.message : 'The refresh did not complete.')
    } finally {
      if (attempt === version.current) {
        const check = { at: new Date().toISOString(), outcome }
        setLast(check)
        try { await localStore.saveScheduleBCheck(check) } catch {
          if (attempt === version.current) setStorageError('The last check could not be saved on this machine.')
        }
      }
      running.current = false
      setBusy(false)
    }
  }
  return { last, result, error, storageError, busy, run, clear }
}
