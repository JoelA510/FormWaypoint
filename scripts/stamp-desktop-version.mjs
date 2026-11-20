// Run in the Desktop build workflow's checkout before compiling either half of the app.
import { readFileSync, writeFileSync } from 'node:fs'

const firstRun = 51 // Desktop build runs 1-50 shipped the old 0.1.0 version.
const run = process.argv[2] ?? ''
const patch = Number(run) - firstRun
if (!/^\d+$/.test(run) || patch < 0 || patch > 65535) {
  throw new Error('Desktop build number is outside the Windows version range for this release series.')
}

const read = (file) => readFileSync(file, 'utf8')
const pkg = JSON.parse(read('package.json'))
const [major, minor] = pkg.version.split('.')
const version = `${major}.${minor}.${patch}`
const lock = JSON.parse(read('package-lock.json'))
pkg.version = lock.version = lock.packages[''].version = version

// Both Cargo files identify the application package by name immediately before its version.
// Leave dependency versions alone even when they happen to equal the application's.
const crate = /(^name = "formwaypoint"\r?\nversion = ")[^"]+(")/m
const updates = ['src-tauri/Cargo.toml', 'src-tauri/Cargo.lock'].map((file) => {
  const source = read(file)
  if (!crate.test(source)) throw new Error(`Cannot locate the formwaypoint package version in ${file}.`)
  return [file, source.replace(crate, (_, prefix, suffix) => prefix + version + suffix)]
})
updates.push(['package.json', JSON.stringify(pkg, null, 2) + '\n'])
updates.push(['package-lock.json', JSON.stringify(lock, null, 2) + '\n'])
for (const [file, contents] of updates) writeFileSync(file, contents)
console.log(`FormWaypoint Windows build ${run}: ${version}`)
