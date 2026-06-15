/**
 * HighlightEngine — pure logic, zero vscode imports.
 * Coordinates language detection, segmentation and matching.
 *
 * Uses character-by-character dispatch (not per-paragraph language detection)
 * so mixed-language text like "- ❌ 不支持 streaming" handles both
 * Latin and CJK tokens correctly within a single pass.
 *
 * Ported from dict-app/src-tauri/src/segmenter.rs `segment_with_lang()`.
 */
import type { DecoratedWord, SupportedLang } from './types'
import { isSpaceDelimited } from './language'
import { segmentMixed } from './segmenter'
import { matchSegments } from './matcher'
import type { DictionaryManager } from '../dictionary/manager'

export interface EngineConfig {
  languages: SupportedLang[]
  minWordLength: number
  posFilter: string[]
}

export class HighlightEngine {
  constructor(private readonly dictManager: DictionaryManager) {}

  /** Set which dictionaries are disabled (blacklist). */
  setDisabledDicts(ids: string[]): void {
    this.dictManager.setDisabledDicts(ids)
  }

  /**
   * Process a full document text and return decorated words.
   * Single pass — character-by-character dispatch to Latin or CJK segmentation.
   *
   * @param text - Full document text
   * @param config - Current extension config
   */
  process(text: string, config: EngineConfig): DecoratedWord[] {
    const t0 = Date.now()

    // Separate enabled languages into Latin (space-delimited) and CJK groups
    const latinLangs = config.languages.filter(l => isSpaceDelimited(l))
    const cjkLangs = config.languages.filter(l => !isSpaceDelimited(l))

    // Get merged dicts (respects disabledDicts)
    const latinDict = this.dictManager.getMergedDict(latinLangs)
    const cjkDict = this.dictManager.getMergedDict(cjkLangs)

    // English lemmatizer only needed when English is enabled
    const enEnabled = config.languages.includes('en')

    // Single pass over all text
    const segments = segmentMixed(text, latinDict, cjkDict, enEnabled)

    if (segments.length > 0) {
      const matched = segments.filter(s => s.is_in_dict)
    }

    return matchSegments(segments, config.minWordLength, config.posFilter)
  }
}
