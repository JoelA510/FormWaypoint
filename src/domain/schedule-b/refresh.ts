/**
 * The Schedule B refresh, start to finish, with the IO held at arm's length.
 *
 * Everything that decides anything lives here and takes a `DesktopBridge`, so the whole
 * sequence can be driven by a fake in tests. The packaged binary is then the only thing
 * that has to be trusted to do an HTTP GET and write a file.
 *
 * Order matters and is the point: parse, diff, and write *both* outputs before the dataset
 * itself is replaced. A refresh that swapped the dataset first and then failed to write the
 * log would leave the operator with codes they cannot account for and no record of what
 * moved — the exact situation the change log exists to prevent.
 */
import type { DesktopBridge } from '../../desktop'
import type { ItemLibraryEntry } from '../item-library'
import { parseConcordance } from './parse-concordance'
import type { RawPayload } from '.'
import {
  affectedParts,
  changeLogFileName,
  diffScheduleB,
  renderAffectedCsv,
  renderChangeLog,
  type AffectedPart,
  type ScheduleBRevision,
} from './revision'

/** Name of the dataset inside the app data directory. */
export const DATASET_FILE = 'schedule-b.json'

export interface RefreshResult {
  revision: ScheduleBRevision
  affected: AffectedPart[]
  /** Files written, in the order they were written. Empty when nothing changed. */
  written: string[]
  /** The new dataset, for the caller to install without re-reading it from disk. */
  payload: RawPayload
  /** Where the files went, for showing the user. */
  directory: string
}

export interface RefreshOptions {
  bridge: DesktopBridge
  /** The dataset currently in use, to diff against. */
  installed: RawPayload
  /** The imported item library, for the affected-parts worklist. */
  items: ItemLibraryEntry[]
  /** Whether a library is loaded at all — distinct from one that is loaded and empty. */
  libraryLoaded: boolean
  today: string
}

/**
 * Downloads, diffs, writes, and reports.
 *
 * Returns without writing anything when the concordance is unchanged. Rewriting an
 * identical dataset would be harmless, but an empty change log dated today would not: it
 * reads as "this revision changed nothing", which is a different claim from "there was no
 * revision".
 */
export async function refreshScheduleB(options: RefreshOptions): Promise<RefreshResult> {
  const { bridge, installed, items, libraryLoaded, today } = options

  const text = await bridge.fetchConcordance()
  // Throws if the body is too small to be the concordance, before anything is written.
  const { payload } = parseConcordance(text, { today })

  const revision = diffScheduleB(installed, payload)
  const directory = await bridge.dataDir()

  if (revision.empty) {
    return { revision, affected: [], written: [], payload, directory }
  }

  const affected = affectedParts(revision, items)
  const written: string[] = []

  const logName = changeLogFileName(revision)
  await bridge.writeDataFile(logName, renderChangeLog(revision, affected, { source: payload.source, libraryLoaded }))
  written.push(logName)

  if (affected.length) {
    const csvName = changeLogFileName(revision, 'csv')
    await bridge.writeDataFile(csvName, renderAffectedCsv(affected))
    written.push(csvName)
  }

  // Last, and only once the record of what changed is safely on disk.
  await bridge.writeDataFile(DATASET_FILE, JSON.stringify(payload))
  written.push(DATASET_FILE)

  return { revision, affected, written, payload, directory }
}

/**
 * The dataset to start from: whatever a previous refresh wrote, else the one shipped in the
 * bundle. A refreshed dataset has to survive restarts, or every launch would validate
 * against the build-time copy and every refresh would rediscover the same revision.
 */
export async function loadInstalledDataset(
  bridge: DesktopBridge,
  fallback: () => Promise<RawPayload>,
): Promise<RawPayload> {
  const stored = await bridge.readDataFile(DATASET_FILE)
  if (!stored) return fallback()
  try {
    const parsed = JSON.parse(stored) as RawPayload
    if (parsed?.codes && Object.keys(parsed.codes).length) return parsed
  } catch {
    // A corrupted file must not take the app down with it — the bundled dataset is a
    // perfectly good answer, and the staleness banner will say it is old.
  }
  return fallback()
}
