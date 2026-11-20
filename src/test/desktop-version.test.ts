import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const files = ['package.json', 'package-lock.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'src-tauri/tauri.conf.json']

function versions(dir: string) {
  const read = (name: string) => readFileSync(path.join(dir, name), 'utf8')
  const lock = JSON.parse(read('package-lock.json'))
  const tauri = JSON.parse(read('src-tauri/tauri.conf.json'))
  return [
    JSON.parse(read('package.json')).version,
    lock.version,
    lock.packages[''].version,
    read('src-tauri/Cargo.toml').match(/\[package\][^[]*?\bversion = "([^"]+)"/)?.[1],
    read('src-tauri/Cargo.lock').match(/name = "formwaypoint"\r?\nversion = "([^"]+)"/)?.[1],
    JSON.parse(read(path.join('src-tauri', tauri.version))).version,
  ]
}

it('keeps the web app, Rust package, lockfiles and installer on the same version', () => {
  const current = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version
  expect(versions(root)).toEqual(Array(6).fill(current))
})

it('stamps successive desktop runs and keeps a retry on its original version', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'formwaypoint-version-'))
  try {
    mkdirSync(path.join(dir, 'src-tauri'))
    for (const file of files) cpSync(path.join(root, file), path.join(dir, file))
    const stamp = (run: string) => execFileSync(process.execPath, [path.join(root, 'scripts/stamp-desktop-version.mjs'), run], { cwd: dir, stdio: 'pipe' })
    for (const [run, expected] of [['51', '1.0.0'], ['52', '1.0.1'], ['52', '1.0.1']]) {
      stamp(run)
      expect(versions(dir)).toEqual(Array(6).fill(expected))
    }
    expect(() => stamp('50')).toThrow()
    expect(() => stamp('65587')).toThrow()
    expect(versions(dir)).toEqual(Array(6).fill('1.0.1'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
