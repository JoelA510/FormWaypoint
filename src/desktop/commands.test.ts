import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The page and the native shell agree on every command's name and arguments.
 *
 * `src/desktop/index.ts` invokes commands by string, and Tauri matches them to the Rust
 * functions registered in `src-tauri/src/lib.rs` only at run time. A renamed command or argument
 * compiles on both sides and fails only in the installed app, with an error the person cannot
 * act on. So both files are read here and compared. Tauri passes a camelCase argument to a
 * snake_case parameter, and supplies `AppHandle` itself.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8')
const snake = (name: string) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

function rustCommands(source: string): Map<string, string[]> {
  const commands = new Map<string, string[]>()
  for (const m of source.matchAll(/#\[tauri::command\]\s*(?:async\s+)?fn\s+(\w+)\s*\(([^)]*)\)/g)) {
    const params = m[2]
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p && !/AppHandle/.test(p))
      .map((p) => p.split(':')[0].trim())
    commands.set(m[1], params)
  }
  return commands
}

function registered(source: string): string[] {
  const list = /generate_handler!\[([^\]]*)\]/.exec(source)?.[1] ?? ''
  return list.split(',').map((s) => s.trim()).filter(Boolean)
}

function pageCalls(source: string): Map<string, string[]> {
  const calls = new Map<string, string[]>()
  for (const m of source.matchAll(/call<[^>]*>\(tauri,\s*'(\w+)'(?:,\s*\{([^}]*)\})?\)/g)) {
    const keys = (m[2] ?? '')
      .split(',')
      .map((k) => k.trim().split(':')[0].trim())
      .filter(Boolean)
    calls.set(m[1], keys.map(snake))
  }
  return calls
}

describe('the commands between the page and the native shell', () => {
  const rust = read('src-tauri/src/lib.rs')
  const commands = rustCommands(rust)
  const handlers = registered(rust)
  const calls = pageCalls(read('src/desktop/index.ts'))

  it('finds the commands on both sides', () => {
    expect(handlers.length).toBeGreaterThan(0)
    expect(calls.size).toBeGreaterThan(0)
  })

  it('registers every command the shell defines, and only those', () => {
    expect([...handlers].sort()).toEqual([...commands.keys()].sort())
  })

  it('calls only registered commands, with exactly the arguments each takes', () => {
    for (const [name, args] of calls) {
      expect(handlers, `the page calls ${name}`).toContain(name)
      expect([...args].sort(), `arguments of ${name}`).toEqual([...(commands.get(name) ?? [])].sort())
    }
  })

  it('has a caller for every registered command', () => {
    expect([...calls.keys()].sort()).toEqual([...handlers].sort())
  })
})
