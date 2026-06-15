import { describe, it, expect } from 'vitest'
import { segmentSpaceDelimited, segmentCJK, segmentText } from '../highlightEngine/segmenter'

const EN_DICT = {
  'quick': { pos: ['adj'] },
  'brown': { pos: ['adj'] },
  'fox':   { pos: ['n'] },
  'jump':  { pos: ['v'] },
  'run':   { pos: ['v'] },
}

const ZH_DICT = {
  '快速': { pos: ['adj'] },
  '狐狸': { pos: ['n'] },
}

describe('segmentSpaceDelimited', () => {
  it('matches exact words', () => {
    const segs = segmentSpaceDelimited('The quick brown fox', EN_DICT, 'en')
    const matched = segs.filter(s => s.is_in_dict).map(s => s.word)
    expect(matched).toContain('quick')
    expect(matched).toContain('brown')
    expect(matched).toContain('fox')
  })

  it('handles inflection: jumps → jump', () => {
    const segs = segmentSpaceDelimited('The fox jumps over', EN_DICT, 'en')
    const jumps = segs.find(s => s.word === 'jumps')
    expect(jumps?.is_in_dict).toBe(true)
  })

  it('handles inflection: running → run', () => {
    const segs = segmentSpaceDelimited('He is running fast', EN_DICT, 'en')
    const running = segs.find(s => s.word === 'running')
    expect(running?.is_in_dict).toBe(true)
  })
})

describe('segmentCJK', () => {
  it('matches CJK words with forward max matching', () => {
    const segs = segmentCJK('这只快速的狐狸', ZH_DICT)
    const matched = segs.filter(s => s.is_in_dict).map(s => s.word)
    expect(matched).toContain('快速')
    expect(matched).toContain('狐狸')
  })
})

describe('segmentText dispatch', () => {
  it('uses space-delimited for English', () => {
    const segs = segmentText('quick fox', 'en', EN_DICT)
    expect(segs.some(s => s.word === 'quick')).toBe(true)
  })

  it('uses CJK for Chinese', () => {
    const segs = segmentText('快速狐狸', 'zh', ZH_DICT)
    expect(segs.some(s => s.word === '快速')).toBe(true)
  })
})
