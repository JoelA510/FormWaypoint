/**
 * A record of what failed, kept on this machine.
 *
 * There is no server to report to, and there must not be one: nothing leaves the machine. So a
 * failure is written to a small log in the app's own storage (localStorage, which the desktop
 * build keeps in its WebView2 profile), and the person can export it when they want help with
 * it. Without this, an error in the installed app leaves nothing behind at all: no console, no
 * devtools, no trace of which version was running.
 *
 * An entry carries the error message, which can quote what was being read when it failed. The
 * log never leaves the machine unless the person exports it.
 */
import { version } from '../../package.json'
import type { DesktopBridge } from '../desktop'
import { deliver, type Delivery } from './deliver'

export const APP_VERSION: string = version

const STORAGE_KEY = 'formwaypoint:error-log'
/** The newest entries are kept; older ones roll off. */
export const ERROR_LOG_LIMIT = 200

export type ErrorKind = 'render' | 'error' | 'rejection'

export interface ErrorLogEntry {
  at: string
  version: string
  kind: ErrorKind
  message: string
  stack?: string
  /** Where the app was: the workflow, the Schedule B dataset. Never document content. */
  context: Record<string, string>
}

let context: Record<string, string> = {}

export function setErrorContext(next: Record<string, string>): void {
  context = { ...context, ...next }
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    // Storage can be blocked outright (a hardened browser profile); the log is then in-memory only.
    return null
  }
}

export function readErrorLog(): ErrorLogEntry[] {
  const raw = storage()?.getItem(STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ErrorLogEntry[]) : []
  } catch {
    // A corrupted log is not worth failing over; it is replaced by the next entry.
    return []
  }
}

function describe(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: error.message, stack: error.stack }
  if (typeof error === 'string') return { message: error }
  try {
    return { message: JSON.stringify(error) ?? String(error) }
  } catch {
    return { message: String(error) }
  }
}

export function logError(kind: ErrorKind, error: unknown): ErrorLogEntry {
  const { message, stack } = describe(error)
  const entry: ErrorLogEntry = {
    at: new Date().toISOString(),
    version: APP_VERSION,
    kind,
    message: message.slice(0, 2000),
    ...(stack ? { stack: stack.slice(0, 4000) } : {}),
    context: { ...context },
  }
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify([...readErrorLog(), entry].slice(-ERROR_LOG_LIMIT)))
  } catch {
    // Best effort: full or blocked storage must not turn one error into two.
  }
  return entry
}

/** Uncaught errors and unhandled rejections, which no component sees. */
export function installGlobalErrorLogging(target: Pick<Window, 'addEventListener'>): void {
  target.addEventListener('error', (event) => logError('error', (event as ErrorEvent).error ?? (event as ErrorEvent).message))
  target.addEventListener('unhandledrejection', (event) => logError('rejection', (event as PromiseRejectionEvent).reason))
}

export function diagnosticsReport(): string {
  return JSON.stringify(
    {
      app: 'FormWaypoint',
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      userAgent: globalThis.navigator?.userAgent ?? '',
      entries: readErrorLog(),
    },
    null,
    2,
  )
}

export function exportDiagnostics(bridge: DesktopBridge | null): Promise<Delivery> {
  const stamp = new Date().toISOString().slice(0, 10)
  return deliver(
    bridge,
    `formwaypoint-diagnostics-${stamp}.json`,
    new TextEncoder().encode(diagnosticsReport()),
    'application/json',
  )
}
