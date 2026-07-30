/**
 * Getting a generated document to the person who asked for it.
 *
 * The two builds have to do this differently, and the difference matters. In a browser the
 * only route is a download, and where it lands is the browser's business. On the desktop
 * that same route was the problem: a blob download hands the bytes to the webview, which
 * saves them wherever it decides — the process working directory on Linux, somewhere
 * unannounced on Windows — and hands nothing back, so the app could not say where the file
 * went, could not open it, and could not even tell whether it had been written.
 *
 * So the desktop build writes the file itself, through a command that returns the full path.
 * That is what makes "saved to X" and "open it" possible at all.
 */
import type { DesktopBridge } from '../desktop'
import { downloadBytes } from './utils'

export interface Delivery {
  fileName: string
  /** Full path, or null in a browser where the app never learns one. */
  path: string | null
}

export async function deliver(
  bridge: DesktopBridge | null,
  fileName: string,
  bytes: Uint8Array,
  mimeType = 'application/pdf',
): Promise<Delivery> {
  if (!bridge) {
    downloadBytes(bytes, fileName, mimeType)
    return { fileName, path: null }
  }
  // The name may come back with a `(2)` the caller did not ask for, because a file of that
  // name was already there. Report what was actually written, not what was requested.
  const path = await bridge.saveOutput(fileName, bytes)
  return { fileName: path.split(/[\\/]/).pop() || fileName, path }
}

export const deliverText = (bridge: DesktopBridge | null, fileName: string, text: string) =>
  deliver(bridge, fileName, new TextEncoder().encode(text), 'text/plain')

/**
 * Hands the file to the system's default application for its type.
 *
 * Silent on failure by design: the file is written either way, the path is on screen, and a
 * machine with no association for `.pdf` is not a reason to make a successful generation
 * look like a failed one.
 */
export async function open(bridge: DesktopBridge | null, delivery: Delivery): Promise<void> {
  if (!bridge || !delivery.path) return
  try {
    await bridge.openOutput(delivery.path)
  } catch {
    /* the path is displayed; opening is a convenience */
  }
}
