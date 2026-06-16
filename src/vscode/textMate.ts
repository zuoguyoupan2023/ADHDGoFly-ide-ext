/**
 * Detects comment and string literal ranges in code files.
 * Uses regex patterns as a lightweight alternative to TextMate grammar parsing.
 */
import * as vscode from 'vscode'

const COMMENT_PATTERNS: Record<string, RegExp[]> = {
  javascript: [/\/\/.*$/gm, /\/\*[\s\S]*?\*\//g],
  typescript: [/\/\/.*$/gm, /\/\*[\s\S]*?\*\//g],
  javascriptreact: [/\/\/.*$/gm, /\/\*[\s\S]*?\*\//g],
  typescriptreact: [/\/\/.*$/gm, /\/\*[\s\S]*?\*\//g],
  python: [/#.*$/gm, /"""[\s\S]*?"""/g, /'''[\s\S]*?'''/g],
  go: [/\/\/.*$/gm, /\/\*[\s\S]*?\*\//g],
  html: [/<!--[\s\S]*?-->/g],
}

export function getAnnotatableRanges(doc: vscode.TextDocument): vscode.Range[] | null {
  // Markdown and plaintext: whole document
  if (doc.languageId === 'markdown' || doc.languageId === 'plaintext') return null

  const patterns = COMMENT_PATTERNS[doc.languageId]
  if (!patterns) return null  // unsupported language — skip

  const text = doc.getText()
  const ranges: vscode.Range[] = []

  for (const pattern of patterns) {
    pattern.lastIndex = 0  // reset regex state
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      const startPos = doc.positionAt(match.index)
      const endPos = doc.positionAt(match.index + match[0].length)
      ranges.push(new vscode.Range(startPos, endPos))
    }
  }

  return ranges
}
