/**
 * The desktop bridge.
 *
 * In the browser build this is absent and every feature that needs it stays hidden. In the
 * Tauri build it is the only route to the two things a webview cannot do for itself:
 * reaching census.gov (which serves no CORS header, so a page-side `fetch` is blocked no
 * matter how the app is packaged) and writing files a person can open afterwards.
 *
 * Deliberately tiny. Every decision — what to parse, what changed, what to write — stays in
 * TypeScript where it is tested; Rust does an HTTP GET and some file IO and nothing else.
 * The less that lives on the far side of this interface, the less of the app is only
 * verifiable by running the packaged binary.
 */

export interface DesktopBridge {
  /** Downloads the Census concordance. The URL is fixed on the Rust side, not passed in. */
  fetchConcordance(): Promise<string>
  /** Writes a file into the app's data directory, creating it if needed. */
  writeDataFile(name: string, contents: string): Promise<string>
  /** Reads a file from the app's data directory, or null when it is not there. */
  readDataFile(name: string): Promise<string | null>
  /** Absolute path of the data directory, for showing the user where things landed. */
  dataDir(): Promise<string>
  /**
   * Writes a generated document to the Downloads folder and returns its full path.
   *
   * Not a webview download. A blob download goes wherever the webview decides — the process
   * working directory on Linux, somewhere unannounced on Windows — and the page is told
   * neither the folder nor the final name, so it cannot say where the file went or open it.
   */
  saveOutput(name: string, bytes: Uint8Array): Promise<string>
  /** Opens a path `saveOutput` returned with whatever the system opens that type with. */
  openOutput(path: string): Promise<void>
  /** Absolute path of the output directory, for naming it before anything is written. */
  outputDir(): Promise<string>
}

interface TauriInternals {
  invoke(command: string, args?: Record<string, unknown>): Promise<unknown>
}

/**
 * Tauri v2 exposes `invoke` on the window as `__TAURI_INTERNALS__`. Reading it directly
 * rather than importing `@tauri-apps/api` keeps the browser bundle free of a dependency it
 * would never call, and keeps the two builds byte-identical apart from this check.
 */
function internals(): TauriInternals | null {
  const candidate = (globalThis as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__
  return candidate && typeof candidate.invoke === 'function' ? candidate : null
}

export function isDesktop(): boolean {
  return internals() !== null
}

/**
 * A command that fails rejects with the `String` from its `Err`, not with an `Error`.
 *
 * Callers reasonably check `e instanceof Error`, so without this every Rust-side failure
 * arrives as an unrecognised value and gets reported as a generic "did not complete" —
 * throwing away the one sentence that says what actually went wrong.
 */
async function call<T>(tauri: TauriInternals, command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return (await tauri.invoke(command, args)) as T
  } catch (raw: unknown) {
    if (raw instanceof Error) throw raw
    throw new Error(typeof raw === 'string' ? raw : `The ${command} command failed: ${JSON.stringify(raw)}`)
  }
}

/** The bridge when running under Tauri, or null in a browser. */
export function desktopBridge(): DesktopBridge | null {
  const tauri = internals()
  if (!tauri) return null

  return {
    fetchConcordance: () => call<string>(tauri, 'fetch_concordance'),
    writeDataFile: (name, contents) => call<string>(tauri, 'write_data_file', { name, contents }),
    readDataFile: (name) => call<string | null>(tauri, 'read_data_file', { name }),
    dataDir: () => call<string>(tauri, 'data_dir'),
    // Sent as a plain array: Tauri's JSON transport cannot carry a `Uint8Array`, and a
    // filled SLI is a couple of hundred kilobytes on a button press, not a hot path.
    saveOutput: (name, bytes) => call<string>(tauri, 'save_output', { name, bytes: Array.from(bytes) }),
    openOutput: (path) => call<void>(tauri, 'open_output', { path }),
    outputDir: () => call<string>(tauri, 'output_dir'),
  }
}
