import { describe, it, expect } from 'vitest'
import { matchSegments } from '../highlightEngine/matcher'
import type { Segment } from '../highlightEngine/types'

const segments: Segment[] = [
  { word: 'quick', start: 0, end: 5, is_in_dict: true, pos: 'adj' },
  { word: 'fox',   start: 6, end: 9, is_in_dict: true, pos: 'n' },
  { word: 'jumps', start: 10, end: 15, is_in_dict: true, pos: 'v' },
  { word: 'a',     start: 16, end: 17, is_in_dict: true, pos: 'det' },
]

describe('matchSegments', () => {
  it('filters by minWordLength', () => {
    const result = matchSegments(segments, 2, ['n', 'v', 'adj', 'adv', 'other'])
    expect(result.find(w => w.word === 'a')).toBeUndefined()
  })

  it('assigns correct color classes', () => {
    const result = matchSegments(segments, 2, ['n', 'v', 'adj', 'adv', 'other'])
    expect(result.find(w => w.word === 'quick')?.colorClass).toBe('pos-a')
    expect(result.find(w => w.word === 'fox')?.colorClass).toBe('pos-n')
    expect(result.find(w => w.word === 'jumps')?.colorClass).toBe('pos-v')
  })

  it('respects posFilter', () => {
    const result = matchSegments(segments, 2, ['n'])  // only nouns
    expect(result.find(w => w.word === 'fox')).toBeTruthy()
    expect(result.find(w => w.word === 'quick')).toBeUndefined()
  })
})
