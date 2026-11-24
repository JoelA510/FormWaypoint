// Run by CI on a pull request: a change the desktop build ships needs a line in CHANGELOG.md
// (ADR 0011). Usage: node scripts/check-changelog.mjs <base revision>
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const base = process.argv[2] ?? ''
if (!base) throw new Error('Usage: node scripts/check-changelog.mjs <base revision>')
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' })

// What a push to main rebuilds and publishes is read from the workflow that does it, so this
// check cannot drift from the build it guards.
const workflow = readFileSync('.github/workflows/desktop.yml', 'utf8')
const block = workflow.match(/^ {4}paths:\r?\n((?: {6}- .+\r?\n)+)/m)
const shipped = [...(block?.[1] ?? '').matchAll(/^ {6}- '([^']+)'\r?$/gm)].map((match) => match[1])
if (shipped.length === 0) throw new Error('Cannot read the push paths from .github/workflows/desktop.yml.')
const ships = (file) => shipped.some((path) => (path.endsWith('/**') ? file.startsWith(path.slice(0, -2)) : file === path))

// A dependency bump or a change to the build workflow publishes a build too, but nothing a
// shipper would notice; the release's generated notes name the pull request.
const quiet = ['package.json', 'package-lock.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', '.github/workflows/desktop.yml']

const changed = git('diff', '--name-only', '--no-renames', base, 'HEAD').split('\n').filter(Boolean)
const needing = changed.filter((file) => ships(file) && !quiet.includes(file))
if (needing.length === 0) {
  console.log('No shipped file changed: no changelog line is needed.')
  process.exit(0)
}

// Touching the file is not enough: the pull request has to add an entry.
const added = git('diff', '--unified=0', base, 'HEAD', '--', 'CHANGELOG.md').split('\n').filter((line) => /^\+- \S/.test(line))
if (added.length === 0) {
  console.error(`This change ships in the desktop build (${needing.length} file(s), first: ${needing[0]}) and adds no entry to CHANGELOG.md.`)
  console.error('Add a line under "Changes", newest first: "- YYYY-MM-DD: what changed for the person using the app."')
  process.exit(1)
}
console.log(`Changelog entry found for ${needing.length} shipped file(s).`)
