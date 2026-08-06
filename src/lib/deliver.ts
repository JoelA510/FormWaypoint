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

/**
 * A name that is a file name and not a path.
 *
 * Every output this application writes is named after something a person typed or a document
 * printed — an invoice number, an air waybill number, a shipper's reference. None of those is
 * constrained to characters a filesystem likes, and `SO/13310965` is an entirely ordinary way
 * to write a reference. Unsanitised, it becomes `SO/13310965_dg-checklist.md`: the desktop
 * shell rejects it outright, correctly, with a message about plain file names that says
 * nothing about the reference that caused it, and the browser silently renames it.
 *
 * So the separators go, along with the other characters Windows refuses and the control
 * characters that can arrive pasted in from a spreadsheet. Replaced rather than dropped, so
 * two references differing only in punctuation do not collapse onto one name.
 */
export function safeFileName(name: string, fallback = 'document'): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex -- the point is to strip them
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\:*?"<>|]/g, '-')
    // A run of dots survives the separator pass and would still be refused by the desktop
    // shell, which rejects any name containing `..` outright.
    .replace(/\.{2,}/g, '-')
    .replace(/\s+/g, ' ')
    // Leading dots would hide the file; trailing dots and spaces are stripped by Windows
    // itself, which turns `shipment .pdf` into something the app cannot then find.
    .replace(/^\.+/, '')
    .trim()
  // Reserved device names are still reserved with an extension: `CON.pdf` is not a file.
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i
  // A name left with no letters or digits names nothing — `..` reduces to a dash, and a file
  // called `-` is worse than one called `document`.
  if (!cleaned || !/[a-z0-9]/i.test(cleaned) || reserved.test(cleaned)) return fallback
  // Long enough for any reference, short of the 255-byte limit most filesystems impose.
  if (cleaned.length <= MAX_FILE_NAME) return cleaned
  // Truncate the stem, not the name: a `.pdf` cut off the end leaves a file the operating
  // system cannot open by type, and leaves the desktop shell's duplicate handling — which
  // splits on the extension — appending `(2)` to something that no longer has one.
  const dot = cleaned.lastIndexOf('.')
  const extension = dot > 0 && cleaned.length - dot <= 8 ? cleaned.slice(dot) : ''
  const stem = extension ? cleaned.slice(0, dot) : cleaned
  return `${stem.slice(0, MAX_FILE_NAME - extension.length - 1)}…${extension}`
}

/** Comfortably inside the 255 bytes most filesystems allow for a single name. */
const MAX_FILE_NAME = 120

export async function deliver(
  bridge: DesktopBridge | null,
  requestedName: string,
  bytes: Uint8Array,
  mimeType = 'application/pdf',
): Promise<Delivery> {
  const fileName = safeFileName(requestedName)
  if (!bridge) {
    downloadBytes(bytes, fileName, mimeType)
    return { fileName, path: null }
  }
  // The name may come back with a `(2)` the caller did not ask for, because a file of that
  // name was already there. Report what was actually written, not what was requested.
  const path = await bridge.saveOutput(fileName, bytes)
  return { fileName: path.split(/[\\/]/).pop() || fileName, path }
}

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
