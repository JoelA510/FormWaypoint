import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Tests use fictitious people and numbers: the repository is public, and a real name, phone,
 * email or tax ID in a fixture is published with it (AGENTS.md, project rule 5).
 */
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function testFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'fixtures' ? [] : testFiles(full)
    return /\.test\.tsx?$/.test(entry.name) || full.includes(`${path.sep}test${path.sep}`) ? [full] : []
  })
}

describe('test data carries no real identity', () => {
  const files = testFiles(SRC)

  it('examines the test files', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('uses only the placeholder EIN and example email domains', () => {
    const found: string[] = []
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8')
      for (const m of text.matchAll(/\b\d{2}-\d{7}\b/g)) if (m[0] !== '00-0000000') found.push(`${path.relative(SRC, file)}: ${m[0]}`)
      for (const m of text.matchAll(/\b[\w.+-]+@([\w-]+\.)+[a-z]{2,}\b/gi)) {
        if (!/@(example\.(com|org|net)|[\w-]+\.example)$/i.test(m[0])) found.push(`${path.relative(SRC, file)}: ${m[0]}`)
      }
    }
    expect(found).toEqual([])
  })
})
