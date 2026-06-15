/**
 * DictionaryManager — loads, merges, and edits all dictionary layers.
 *
 * Priority (low → high): builtin → community → user edits
 * Merged dicts are cached to avoid rebuilding on every keystroke.
 */
import * as vscode from 'vscode'
import * as fs from 'fs/promises'
import * as path from 'path'
import type { DictMap, RawDictionary } from './types'
import { loadBuiltinDict } from './loader'
import { mergeDicts } from './merger'

/** Persisted user edit for a single word */
interface WordEdit {
  pos?: string[]
  deleted?: boolean
}

/** Persisted structure: lang → word → edit */
type UserEdits = Record<string, Record<string, WordEdit>>

/** Summary info for the panel dict list */
export interface DictInfo {
  id: string
  lang: string
  name: string
  source: 'builtin' | 'community' | 'user'
  wordCount: number
}

/** Track an installed community dict's metadata */
export interface InstalledCommunityMeta {
  id: string
  name: string
  lang: string
  wordCount: number
  version: string
}

/** Track a user-created (self-built) dictionary */
export interface UserDictMeta {
  id: string
  name: string
  lang: string
  wordCount: number
  createdAt: string
}

export class DictionaryManager {
  private builtins: Map<string, DictMap> = new Map()
  /** community dicts keyed by dict id (not lang — multiple per lang possible) */
  private communityDicts: Map<string, { meta: InstalledCommunityMeta; data: DictMap }> = new Map()
  /** user-added words (not from builtin) keyed by lang */
  private userAddedDicts: Map<string, DictMap> = new Map()
  /** user-created (self-built) dictionaries — multiple per lang possible */
  private userDicts: Map<string, { meta: UserDictMeta; data: DictMap }> = new Map()
  /** edits (override pos / delete) applied on top of all layers */
  private userEdits: UserEdits = {}
  /** cached merged result — invalidated when any layer changes */
  private mergeCache: Map<string, DictMap> = new Map()

  private readonly editsStoragePath: string
  private readonly communityStorageDir: string
  private readonly userStorageDir: string
  /** JSON file tracking which community dicts are installed */
  private readonly communityIndexPath: string
  /** JSON file tracking user-created dicts */
  private readonly userIndexPath: string

  constructor(private readonly context: vscode.ExtensionContext) {
    this.editsStoragePath = path.join(context.globalStorageUri.fsPath, 'user-edits.json')
    this.communityStorageDir = path.join(context.globalStorageUri.fsPath, 'community-dicts')
    this.communityIndexPath = path.join(context.globalStorageUri.fsPath, 'community-index.json')
    this.userStorageDir = path.join(context.globalStorageUri.fsPath, 'user-dicts')
    this.userIndexPath = path.join(context.globalStorageUri.fsPath, 'user-index.json')
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  async loadBuiltins(): Promise<void> {
    const t0 = Date.now()
    const [en, zh] = await Promise.all([
      loadBuiltinDict(this.context.extensionUri, 'EN'),
      loadBuiltinDict(this.context.extensionUri, 'ZH'),
    ])
    if (en) this.builtins.set('en', en)
    if (zh) this.builtins.set('zh', zh)
    await this.loadUserEdits()
    await this.loadCommunityDicts()
    await this.loadUserDicts()
    this.mergeCache.clear()
  }

  private async loadUserEdits(): Promise<void> {
    try {
      const raw = await fs.readFile(this.editsStoragePath, 'utf-8')
      this.userEdits = JSON.parse(raw) as UserEdits
    } catch {
      this.userEdits = {}
    }
  }

  private async saveUserEdits(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.editsStoragePath), { recursive: true })
      await fs.writeFile(this.editsStoragePath, JSON.stringify(this.userEdits, null, 2), 'utf-8')
    } catch (err) {
      console.error('[adhdgofly] Failed to save user edits:', err)
    }
  }

  // ── Community dict persistence ──────────────────────────────────────────

  private async loadCommunityDicts(): Promise<void> {
    try {
      const raw = await fs.readFile(this.communityIndexPath, 'utf-8')
      const index: InstalledCommunityMeta[] = JSON.parse(raw)
      for (const meta of index) {
        const filePath = path.join(this.communityStorageDir, `${meta.id}.json`)
        try {
          const dataRaw = await fs.readFile(filePath, 'utf-8')
          const data: DictMap = JSON.parse(dataRaw)
          this.communityDicts.set(meta.id, { meta, data })
        } catch (e) {
          console.warn(`[adhdgofly] Failed to load community dict ${meta.id}:`, e)
        }
      }
    } catch {
      // No community index yet — first run
    }
  }

  private async saveCommunityIndex(): Promise<void> {
    try {
      await fs.mkdir(this.communityStorageDir, { recursive: true })
      const index: InstalledCommunityMeta[] = []
      for (const { meta } of this.communityDicts.values()) {
        index.push(meta)
      }
      await fs.writeFile(this.communityIndexPath, JSON.stringify(index, null, 2), 'utf-8')
    } catch (err) {
      console.error('[adhdgofly] Failed to save community index:', err)
    }
  }

  /** Load (or reload) a community dictionary from downloaded data */
  async loadCommunityDict(meta: InstalledCommunityMeta, data: DictMap): Promise<void> {
    this.communityDicts.set(meta.id, { meta, data })
    // Persist to disk
    await fs.mkdir(this.communityStorageDir, { recursive: true })
    await fs.writeFile(
      path.join(this.communityStorageDir, `${meta.id}.json`),
      JSON.stringify(data),
      'utf-8',
    )
    await this.saveCommunityIndex()
    this.invalidateCache(meta.lang)
  }

  /** Remove an installed community dictionary */
  async removeCommunityDict(id: string): Promise<void> {
    const entry = this.communityDicts.get(id)
    if (!entry) return
    this.communityDicts.delete(id)
    // Remove from disk
    try {
      await fs.unlink(path.join(this.communityStorageDir, `${id}.json`))
    } catch { /* file may not exist */ }
    await this.saveCommunityIndex()
    this.invalidateCache(entry.meta.lang)
  }

  /** Get list of installed community dict IDs */
  getInstalledCommunityDictIds(): string[] {
    return [...this.communityDicts.keys()]
  }

  /** Check if a community dict is installed */
  isCommunityDictInstalled(id: string): boolean {
    return this.communityDicts.has(id)
  }

  // ── User-created dict persistence ─────────────────────────────────────────

  private async loadUserDicts(): Promise<void> {
    try {
      const raw = await fs.readFile(this.userIndexPath, 'utf-8')
      const index: UserDictMeta[] = JSON.parse(raw)
      for (const meta of index) {
        const filePath = path.join(this.userStorageDir, `${meta.id}.json`)
        try {
          const dataRaw = await fs.readFile(filePath, 'utf-8')
          const data: DictMap = JSON.parse(dataRaw)
          this.userDicts.set(meta.id, { meta, data })
        } catch (e) {
          console.warn(`[adhdgofly] Failed to load user dict ${meta.id}:`, e)
        }
      }
    } catch {
      // No user index yet
    }
  }

  private async saveUserIndex(): Promise<void> {
    try {
      await fs.mkdir(this.userStorageDir, { recursive: true })
      const index: UserDictMeta[] = []
      for (const { meta } of this.userDicts.values()) {
        index.push(meta)
      }
      await fs.writeFile(this.userIndexPath, JSON.stringify(index, null, 2), 'utf-8')
    } catch (err) {
      console.error('[adhdgofly] Failed to save user index:', err)
    }
  }

  /**
   * Create a new user (self-built) dictionary from a word map.
   * Returns the new dict ID.
   */
  async createUserDict(name: string, lang: string, words: Record<string, { pos: string[] }>): Promise<string> {
    const id = `user-${Date.now()}`
    const meta: UserDictMeta = {
      id,
      name,
      lang,
      wordCount: Object.keys(words).length,
      createdAt: new Date().toISOString().slice(0, 10),
    }
    const data: DictMap = {}
    for (const [w, entry] of Object.entries(words)) {
      data[w.toLowerCase()] = { pos: entry.pos }
    }
    this.userDicts.set(id, { meta, data })
    // Persist to disk
    await fs.mkdir(this.userStorageDir, { recursive: true })
    await fs.writeFile(path.join(this.userStorageDir, `${id}.json`), JSON.stringify(data), 'utf-8')
    await this.saveUserIndex()
    this.invalidateCache(lang)
    return id
  }

  /** Remove a user-created dictionary by ID */
  async removeUserDict(id: string): Promise<void> {
    const entry = this.userDicts.get(id)
    if (!entry) return
    this.userDicts.delete(id)
    try {
      await fs.unlink(path.join(this.userStorageDir, `${id}.json`))
    } catch { /* file may not exist */ }
    await this.saveUserIndex()
    this.invalidateCache(entry.meta.lang)
  }

  /** Add or edit a word directly in a user-created dictionary */
  async addWordToUserDict(dictId: string, word: string, pos: string[]): Promise<void> {
    const entry = this.userDicts.get(dictId)
    if (!entry) return
    entry.data[word.toLowerCase()] = { pos }
    // Persist
    await fs.writeFile(path.join(this.userStorageDir, `${dictId}.json`), JSON.stringify(entry.data), 'utf-8')
    entry.meta.wordCount = Object.keys(entry.data).length
    await this.saveUserIndex()
    this.invalidateCache(entry.meta.lang)
  }

  /** Remove a word from a user-created dictionary */
  async removeWordFromUserDict(dictId: string, word: string): Promise<void> {
    const entry = this.userDicts.get(dictId)
    if (!entry) return
    delete entry.data[word.toLowerCase()]
    await fs.writeFile(path.join(this.userStorageDir, `${dictId}.json`), JSON.stringify(entry.data), 'utf-8')
    entry.meta.wordCount = Object.keys(entry.data).length
    await this.saveUserIndex()
    this.invalidateCache(entry.meta.lang)
  }

  /** Get list of user-created dicts */
  getUserDictList(): UserDictMeta[] {
    return [...this.userDicts.values()].map(e => e.meta)
  }

  /** Check if a user dict exists */
  isUserDict(id: string): boolean {
    return this.userDicts.has(id)
  }

  // ── Disabled dicts filtering ─────────────────────────────────────────────

  private _disabledDicts: Set<string> = new Set()

  /** Set which dicts are disabled. Empty set = all enabled (default). */
  setDisabledDicts(ids: string[]): void {
    const s = new Set(ids)
    if (!setsEqual(s, this._disabledDicts)) {
      this._disabledDicts = s
      this.mergeCache.clear()
    } else {
    }
  }

  /** Check if a specific dict ID is enabled (i.e. not in the disabled list) */
  isEnabled(id: string): boolean {
    return !this._disabledDicts.has(id)
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  getDict(lang: string): DictMap | null {
    if (this.mergeCache.has(lang)) {
      const cached = this.mergeCache.get(lang)!
      return cached
    }

    let builtin: DictMap | undefined
    const builtinId = `builtin-${lang}`
    if (!this._disabledDicts.has(builtinId)) {
      builtin = this.builtins.get(lang)
    }
    // Merge only enabled community dicts for this language
    let community: DictMap | undefined
    for (const [id, { meta, data }] of this.communityDicts) {
      if (meta.lang !== lang) continue
      if (this._disabledDicts.has(id)) continue
      if (!community) community = { ...data }
      else community = mergeDicts(community, data)
    }
    let userAdded: DictMap | undefined
    for (const [id, { meta, data }] of this.userDicts) {
      if (meta.lang !== lang) continue
      if (this._disabledDicts.has(id)) continue
      if (!userAdded) userAdded = { ...data }
      else userAdded = mergeDicts(userAdded, data)
    }
    // Also merge the legacy single-per-lang user dict if it exists and is enabled
    const legacyUserAddedId = `user-${lang}`
    if (!this._disabledDicts.has(legacyUserAddedId)) {
      const legacy = this.userAddedDicts.get(lang)
      if (legacy) userAdded = mergeDicts(userAdded, legacy)
    }

    if (!builtin && !community && !userAdded) {
      return null
    }

    // Merge layers, then apply word-level edits on top
    const base = mergeDicts(builtin, community, userAdded)
    const edits = this.userEdits[lang] ?? {}
    for (const [word, edit] of Object.entries(edits)) {
      if (edit.deleted) {
        delete base[word]
      } else if (edit.pos) {
        base[word] = { pos: edit.pos }
      }
    }

    this.mergeCache.set(lang, base)
    return base
  }

  getLoadedLanguages(): string[] {
    const langs = new Set([
      ...this.builtins.keys(),
      ...this.communityDicts.keys(),
      ...this.userAddedDicts.keys(),
    ])
    for (const { meta } of this.userDicts.values()) langs.add(meta.lang)
    return [...langs]
  }

  /**
   * Get a merged dict for multiple languages.
   * Each language's getDict() respects disabledDicts.
   * Used by the mixed segmentation mode.
   */
  getMergedDict(langs: string[]): DictMap {
    const result: DictMap = {}
    for (const lang of langs) {
      const d = this.getDict(lang)
      if (d) Object.assign(result, d)
    }
    return result
  }

  /** List of dictionaries for the panel's dict-list view */
  getDictList(): DictInfo[] {
    const list: DictInfo[] = []
    for (const lang of this.builtins.keys()) {
      const d = this.builtins.get(lang)!
      list.push({ id: `builtin-${lang}`, lang, name: langDisplayName(lang), source: 'builtin', wordCount: Object.keys(d).length })
    }
    for (const [id, { meta, data }] of this.communityDicts) {
      list.push({ id, lang: meta.lang, name: meta.name, source: 'community', wordCount: Object.keys(data).length })
    }
    for (const lang of this.userAddedDicts.keys()) {
      const d = this.userAddedDicts.get(lang)!
      list.push({ id: `user-${lang}`, lang, name: `My Dict (${lang.toUpperCase()})`, source: 'user', wordCount: Object.keys(d).length })
    }
    for (const [id, { meta, data }] of this.userDicts) {
      list.push({ id, lang: meta.lang, name: meta.name, source: 'user', wordCount: Object.keys(data).length })
    }
    return list
  }

  /** Get entries from a specific single dictionary by its ID */
  getDictEntriesById(dictId: string, search: string, page: number, pageSize: number): {
    entries: Array<{ word: string; pos: string[] }>
    total: number
    page: number
    totalPages: number
  } {
    let dict: DictMap | undefined

    // Check builtin
    if (dictId.startsWith('builtin-')) {
      const lang = dictId.replace('builtin-', '')
      dict = this.builtins.get(lang)
    }
    // Check community
    if (!dict) {
      const entry = this.communityDicts.get(dictId)
      if (entry) dict = entry.data
    }
    // Check user
    if (!dict && dictId.startsWith('user-')) {
      // Check new multi-dict storage first
      const entry = this.userDicts.get(dictId)
      if (entry) dict = entry.data
      // Fallback to legacy single-per-lang storage
      if (!dict) {
        const lang = dictId.replace('user-', '')
        dict = this.userAddedDicts.get(lang)
      }
    }

    if (!dict) {
      return { entries: [], total: 0, page: 1, totalPages: 1 }
    }

    let entries = Object.entries(dict).map(([word, entry]) => ({
      word,
      pos: entry.pos,
    }))

    if (search.trim()) {
      const term = search.trim().toLowerCase()
      entries = entries.filter(e => e.word.toLowerCase().includes(term))
    }

    entries.sort((a, b) => a.word.localeCompare(b.word))
    return paginateEntries(entries, page, pageSize)
  }

  /** Get paginated + filtered word entries for a language (merged + edits applied) */
  getDictEntries(lang: string, search: string, page: number, pageSize: number): {
    entries: Array<{ word: string; pos: string[] }>
    total: number
    page: number
    totalPages: number
  } {
    const dict = this.getDict(lang) ?? {}
    let entries = Object.entries(dict).map(([word, entry]) => ({
      word,
      pos: entry.pos,
    }))

    if (search.trim()) {
      const term = search.trim().toLowerCase()
      entries = entries.filter(e => e.word.toLowerCase().includes(term))
    }

    entries.sort((a, b) => a.word.localeCompare(b.word))

    return paginateEntries(entries, page, pageSize)
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  async addOrEditWord(lang: string, word: string, pos: string[]): Promise<void> {
    if (!this.userEdits[lang]) this.userEdits[lang] = {}
    this.userEdits[lang][word.toLowerCase()] = { pos }
    this.invalidateCache(lang)
    await this.saveUserEdits()
  }

  async deleteWord(lang: string, word: string): Promise<void> {
    if (!this.userEdits[lang]) this.userEdits[lang] = {}
    this.userEdits[lang][word.toLowerCase()] = { deleted: true }
    this.invalidateCache(lang)
    await this.saveUserEdits()
  }

  /** Import a local JSON file (dict-app compatible format) as a user dict */
  async importDictFile(filePath: string): Promise<{ lang: string; wordCount: number }> {
    const raw: RawDictionary = JSON.parse(await fs.readFile(filePath, 'utf-8'))
    const lang = (raw as any).language ?? 'en'
    const normalized: DictMap = {}
    for (const [w, entry] of Object.entries(raw.words)) {
      normalized[w.toLowerCase()] = { pos: entry.pos }
    }
    this.userAddedDicts.set(lang, normalized)
    this.invalidateCache(lang)
    return { lang, wordCount: Object.keys(normalized).length }
  }

  /** Export a language's merged dict (including user edits) as a JSON file */
  exportDict(lang: string, name: string): string {
    const dict = this.getDict(lang) ?? {}
    const words: Record<string, { pos: string[] }> = {}
    for (const [w, entry] of Object.entries(dict)) {
      words[w] = { pos: entry.pos }
    }
    const payload = {
      version: '1.0',
      lastUpdated: new Date().toISOString().slice(0, 10),
      language: lang,
      source: 'adhdgofly-ide-ext',
      name,
      wordCount: Object.keys(words).length,
      words,
    }
    return JSON.stringify(payload, null, 2)
  }

  invalidateCache(lang?: string): void {
    if (lang) this.mergeCache.delete(lang)
    else this.mergeCache.clear()
  }
}

function langDisplayName(lang: string): string {
  const names: Record<string, string> = {
    en: 'English', zh: '中文(简体)', fr: 'Français',
    es: 'Español', ru: 'Русский', ja: '日本語',
  }
  return names[lang] ?? lang.toUpperCase()
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

function paginateEntries(
  entries: Array<{ word: string; pos: string[] }>,
  page: number,
  pageSize: number,
): { entries: Array<{ word: string; pos: string[] }>; total: number; page: number; totalPages: number } {
  const total = entries.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.max(1, Math.min(page, totalPages))
  const start = (safePage - 1) * pageSize
  const paged = entries.slice(start, start + pageSize)
  return { entries: paged, total, page: safePage, totalPages }
}
