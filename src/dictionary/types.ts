/** Raw format stored in JSON files (dict-app compatible) */
export interface RawDictEntry {
  pos: string[]
  frequency?: number
  source?: string
}

export type RawDictionary = {
  version?: string
  lastUpdated?: string
  words: Record<string, RawDictEntry>
}

/** Normalized runtime format: word → pos-string */
export type DictMap = Record<string, { pos: string[] }>

/** Community dictionary metadata from dictionary.adhdgofly.online */
export interface CommunityDictMeta {
  id: string
  name: string
  lang: string
  wordCount: number
  author: string
  version: string
  sha256: string
  downloadUrl: string
}
