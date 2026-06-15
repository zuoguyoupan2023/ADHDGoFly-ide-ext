/**
 * Merges multiple DictMap layers with priority:
 * builtin → community → user-custom (highest priority last)
 */
import type { DictMap } from './types'

export function mergeDicts(...layers: (DictMap | null | undefined)[]): DictMap {
  const merged: DictMap = {}
  for (const layer of layers) {
    if (!layer) continue
    for (const [word, entry] of Object.entries(layer)) {
      merged[word] = entry
    }
  }
  return merged
}
