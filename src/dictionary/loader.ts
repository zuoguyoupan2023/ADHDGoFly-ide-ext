/**
 * Loads built-in dictionaries bundled with the VSIX.
 * Built-in dicts live at <extensionUri>/dictionaries/*.json
 */
import * as vscode from 'vscode'
import * as fs from 'fs/promises'
import * as path from 'path'
import type { RawDictionary, DictMap } from './types'

export function normalizeDictionary(raw: RawDictionary): DictMap {
  const result: DictMap = {}
  for (const [word, entry] of Object.entries(raw.words)) {
    result[word.toLowerCase()] = { pos: entry.pos }
  }
  return result
}

export async function loadBuiltinDict(extensionUri: vscode.Uri, lang: string): Promise<DictMap | null> {
  const filePath = path.join(extensionUri.fsPath, 'dictionaries', `${lang.toUpperCase()}_word.json`)
  const t0 = Date.now()
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const t1 = Date.now()
    const raw: RawDictionary = JSON.parse(content)
    const t2 = Date.now()
    const result = normalizeDictionary(raw)
    return result
  } catch (err) {
    console.error(`[adhdgofly] Failed to load builtin dict ${lang}:`, err)
    return null
  }
}
