import { describe, it, expect } from 'vitest'
import { detectLanguage, detectLanguageSegments } from '../highlightEngine/language'

describe('detectLanguage', () => {
  it('detects English', () => {
    expect(detectLanguage('The quick brown fox jumps over the lazy dog')).toBe('en')
  })

  it('detects Chinese', () => {
    expect(detectLanguage('这是一段中文文本，用于测试语言检测功能是否正常工作')).toBe('zh')
  })

  it('detects Japanese', () => {
    expect(detectLanguage('これはテストのための日本語テキストです')).toBe('ja')
  })
})

describe('detectLanguageSegments', () => {
  it('splits mixed document into segments', () => {
    const text = 'The quick brown fox\n\n这是中文段落\n\nAnother English paragraph'
    const segs = detectLanguageSegments(text)
    expect(segs.length).toBeGreaterThanOrEqual(2)
    expect(segs.some(s => s.lang === 'en')).toBe(true)
    expect(segs.some(s => s.lang === 'zh')).toBe(true)
  })
})
