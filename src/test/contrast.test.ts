import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

// Exercise the actual light/dark color pairs used by the controls and status text.
const css = readFileSync(new URL('../styles/globals.css', import.meta.url), 'utf8')
const colors = new Map([...css.matchAll(/--color-([\w-]+): light-dark\((#[\da-f]{6}), (#[\da-f]{6})\)/gi)]
  .map(([, role, light, dark]) => [role, [light, dark]]))

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

it.each(['light', 'dark'])('keeps small text at 4.5:1 or better in %s appearance', theme => {
  const pairs = [['on-accent', 'accent'], ['on-accent', 'accent-hover'], ['on-block', 'block'],
    ['accent-ink', 'accent-soft'], ['warn', 'warn-soft'], ['pass', 'pass-soft'], ['block', 'block-soft']]
  for (const surface of ['canvas', 'surface', 'sunken']) {
    for (const ink of ['ink', 'ink-soft', 'ink-faint']) pairs.push([ink, surface])
  }
  for (const [ink, ground] of pairs) {
    const [fg, bg] = [ink, ground].map(name => {
      const pair = colors.get(name)
      expect(pair, name).toBeDefined()
      return luminance(pair![theme === 'light' ? 0 : 1])
    })
    expect((Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05), ink + ' on ' + ground).toBeGreaterThanOrEqual(4.5)
  }
})
