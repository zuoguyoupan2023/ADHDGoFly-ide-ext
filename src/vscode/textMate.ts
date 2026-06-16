/**
 * Detects comment and string literal ranges in code files.
 * Uses regex patterns as a lightweight alternative to TextMate grammar parsing.
 *
 * Also detects Markdown code block ranges for filtering.
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

/**
 * Detect Markdown code block ranges (fenced and inline) that should be
 * excluded from vocabulary highlighting.
 *
 * Fenced: ``` ... ```
 * Inline: `code`
 *
 * Returns an array of ranges to SKIP (code content that shouldn't be highlighted).
 */
export function getMarkdownCodeBlockRanges(doc: vscode.TextDocument): vscode.Range[] {
  const text = doc.getText()
  const ranges: vscode.Range[] = []

  // Fenced code blocks: ```lang\n ... \n```
  const fenceRegex = /```[\s\S]*?```/g
  let match: RegExpExecArray | null
  while ((match = fenceRegex.exec(text)) !== null) {
    const startPos = doc.positionAt(match.index)
    const endPos = doc.positionAt(match.index + match[0].length)
    ranges.push(new vscode.Range(startPos, endPos))
  }

  // Inline code: `code` (but not ``` fences which are already caught above)
  const inlineCodeRegex = /(?<!`)`[^`\n]+`(?!`)/g
  while ((match = inlineCodeRegex.exec(text)) !== null) {
    const startPos = doc.positionAt(match.index)
    const endPos = doc.positionAt(match.index + match[0].length)
    ranges.push(new vscode.Range(startPos, endPos))
  }

  return ranges
}
