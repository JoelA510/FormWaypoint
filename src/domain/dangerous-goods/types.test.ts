import { describe, expect, it } from 'vitest'
import { emptyEntry, isAnswered, unansweredQuestions, type BatteryEntry } from './types'

describe('what a battery entry still needs answering', () => {
  it('starts with every classification question open, not pre-answered', () => {
    const fresh = emptyEntry('e1')
    expect(unansweredQuestions(fresh)).toEqual([
      'chemistry',
      'cell or battery',
      'shipping configuration',
      'article level',
      'condition',
    ])
    expect(isAnswered(fresh)).toBe(false)
  })

  it('drops each question as it is answered, and is answered only when all are', () => {
    let entry: BatteryEntry = emptyEntry('e1')
    entry = { ...entry, spec: { ...entry.spec, chemistry: 'lithium-metal' } }
    expect(unansweredQuestions(entry)).not.toContain('chemistry')
    entry = { ...entry, spec: { ...entry.spec, form: 'battery', configuration: 'standalone' } }
    entry = { ...entry, articleLevel: 'battery-pack' }
    expect(unansweredQuestions(entry)).toEqual(['condition'])
    expect(isAnswered(entry)).toBe(false)
    entry = { ...entry, condition: 'sound' }
    expect(unansweredQuestions(entry)).toEqual([])
    expect(isAnswered(entry)).toBe(true)
  })

  it('leaves the energy figure to its own check', () => {
    const answered: BatteryEntry = {
      ...emptyEntry('e1'),
      spec: { chemistry: 'lithium-ion', form: 'cell', configuration: 'standalone', wattHours: null, lithiumContentG: null },
      articleLevel: 'cell',
      condition: 'sound',
    }
    expect(isAnswered(answered)).toBe(true)
  })
})
