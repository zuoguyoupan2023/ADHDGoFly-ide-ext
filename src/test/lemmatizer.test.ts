import { describe, it, expect } from 'vitest'
import { lookupWithLemma } from '../highlightEngine/lemmatizer'

const dict = {
  'run':    { pos: ['v'] },
  'make':   { pos: ['v'] },
  'quick':  { pos: ['adj'] },
  'ring':   { pos: ['v', 'n'] },  // blacklisted from stripping
}

describe('lookupWithLemma', () => {
  it('direct lookup', () => {
    expect(lookupWithLemma('run', dict)).toEqual({ pos: ['v'] })
  })

  it('handles -ing suffix: running → run', () => {
    expect(lookupWithLemma('running', dict)).toBeTruthy()
  })

  it('handles -ing + stem+e: making → make', () => {
    expect(lookupWithLemma('making', dict)).toBeTruthy()
  })

  it('does not strip blacklisted words: ring', () => {
    // "ring" is in dict directly, should still match
    expect(lookupWithLemma('ring', dict)).toEqual({ pos: ['v', 'n'] })
  })

  it('returns null for unknown words', () => {
    expect(lookupWithLemma('xyzzy', dict)).toBeNull()
  })
})
