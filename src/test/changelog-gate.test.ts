import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const script = path.join(root, 'scripts/check-changelog.mjs')
const workflow = '.github/workflows/desktop.yml'
let dir = ''

const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: 'pipe' })
const write = (file: string, contents: string) => {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
  writeFileSync(path.join(dir, file), contents)
}
const commit = (message: string) => {
  git('add', '-A')
  git('commit', '-q', '-m', message)
}
const check = () => execFileSync(process.execPath, [script, 'HEAD^1'], { cwd: dir, stdio: 'pipe', encoding: 'utf8' })

// A repository holding the real build workflow and the real changelog, with one commit to
// compare against, as a pull request's merge commit has its base.
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'formwaypoint-changelog-'))
  git('init', '-q')
  mkdirSync(path.join(dir, path.dirname(workflow)), { recursive: true })
  cpSync(path.join(root, workflow), path.join(dir, workflow))
  cpSync(path.join(root, 'CHANGELOG.md'), path.join(dir, 'CHANGELOG.md'))
  write('src/app.ts', 'export const a = 1\n')
  commit('base')
})
// Retries cover Windows briefly holding a file inside the scratch repository's .git.
afterEach(() => rmSync(dir, { recursive: true, force: true, maxRetries: 3 }))

const addEntry = () => {
  const changelog = readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8')
  // A Windows checkout may hold the file with CRLF line endings.
  expect(changelog).toMatch(/## Changes\r?\n/)
  write('CHANGELOG.md', changelog.replace(/## Changes\r?\n/, '## Changes\n\n- 2026-01-01: A test entry.\n'))
}

it('refuses a shipped change that adds no changelog entry', () => {
  write('src/app.ts', 'export const a = 2\n')
  commit('change the app')
  expect(check).toThrow(/adds no entry to CHANGELOG\.md/)
})

it('refuses a shipped change that edits the changelog without adding an entry', () => {
  write('src-tauri/src/lib.rs', '// changed\n')
  write('CHANGELOG.md', readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8') + '\nA closing remark.\n')
  commit('change the shell')
  expect(check).toThrow(/adds no entry to CHANGELOG\.md/)
})

// Found in review: any added bullet used to count, so rewording a line passed for an entry.
it('refuses a shipped change that only rewords a bullet in the instructions', () => {
  write('src/app.ts', 'export const a = 2\n')
  const changelog = readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8')
  expect(changelog).toContain('- Never a real shipment')
  write('CHANGELOG.md', changelog.replace('- Never a real shipment', '- Never, ever, a real shipment'))
  commit('reword an instruction')
  expect(check).toThrow(/adds no entry to CHANGELOG\.md/)
})

it('refuses a shipped change that only rewords an existing entry', () => {
  write('src/app.ts', 'export const a = 2\n')
  const changelog = readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8')
  expect(changelog).toContain(': This changelog starts.')
  write('CHANGELOG.md', changelog.replace(': This changelog starts.', ': This changelog begins.'))
  commit('reword an entry')
  expect(check).toThrow(/adds no entry to CHANGELOG\.md/)
})

it('refuses an entry with no date', () => {
  write('src/app.ts', 'export const a = 2\n')
  const changelog = readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8')
  write('CHANGELOG.md', changelog.replace(/## Changes\r?\n/, '## Changes\n\n- Fixed a thing.\n'))
  commit('undated entry')
  expect(check).toThrow(/adds no entry to CHANGELOG\.md/)
})

it('accepts a shipped change that adds an entry', () => {
  write('public/data/notes.txt', 'changed\n')
  addEntry()
  commit('change a shipped file')
  expect(check()).toMatch(/Changelog entry found for 1 shipped file/)
})

it('asks nothing of a change the desktop build does not ship', () => {
  write('docs/notes.md', 'changed\n')
  write('downloads/index.html', 'changed\n')
  commit('docs only')
  expect(check()).toMatch(/no changelog line is needed/)
})

it('asks nothing of a dependency bump, which the release notes name by pull request', () => {
  write('package-lock.json', '{}\n')
  write('src-tauri/Cargo.lock', '# changed\n')
  commit('bump dependencies')
  expect(check()).toMatch(/no changelog line is needed/)
})

it('fails loudly when the build workflow no longer states its paths', () => {
  write(workflow, 'name: Desktop build\non:\n  workflow_dispatch:\n')
  write('src/app.ts', 'export const a = 3\n')
  commit('drop the path filter')
  expect(check).toThrow(/Cannot read the push paths/)
})
