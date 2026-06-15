import * as vscode from 'vscode'

const SUPPORTED_LANGUAGES = new Set([
  'markdown', 'plaintext', 'html',
  'javascript', 'typescript', 'javascriptreact', 'typescriptreact',
  'python', 'go',
])

const LARGE_FILE_LINE_THRESHOLD = 2000

export function shouldProcessDocument(doc: vscode.TextDocument): boolean {
  return SUPPORTED_LANGUAGES.has(doc.languageId)
}

export function isLargeFile(doc: vscode.TextDocument): boolean {
  return doc.lineCount > LARGE_FILE_LINE_THRESHOLD
}
