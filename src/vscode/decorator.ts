/**
 * VS Code Decoration API layer.
 * Creates/updates/disposes DecorationTypes and applies them to the editor.
 */
import * as vscode from 'vscode'
import { debounce } from '../utils/debounce'
import { loadConfig } from './config'
import { shouldProcessDocument, isLargeFile } from './activationGuard'
import type { HighlightEngine } from '../highlightEngine/index'
import type { PosColorClass } from '../highlightEngine/types'
import type { SidePanelProvider } from './sidePanel'

const POS_COLORS: Record<PosColorClass, { color: string; bg: string; border: string }> = {
  'pos-n':     { color: '#4ade80', bg: 'rgba(34,197,94,0.15)',    border: 'rgba(34,197,94,0.35)' },
  'pos-v':     { color: '#f87171', bg: 'rgba(239,68,68,0.15)',    border: 'rgba(239,68,68,0.35)' },
  'pos-a':     { color: '#c084fc', bg: 'rgba(168,85,247,0.15)',   border: 'rgba(168,85,247,0.35)' },
  'pos-other': { color: '#9ca3af', bg: 'rgba(156,163,175,0.12)',  border: 'rgba(156,163,175,0.3)' },
}

const MAX_DECORATIONS = 5000

function buildDecorationOptions(style: string, colors: { color: string; bg: string; border: string }): vscode.DecorationRenderOptions {
  if (style === 'highlight') {
    return {
      backgroundColor: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: '2px',
    }
  }
  // 'color' mode (default) — text color only
  return { color: colors.color }
}

/**
 * Build a line-start offset index from document text.
 * lineOffsets[i] = character offset where line i begins.
 * Allows O(log n) offset→Position conversion instead of VS Code's O(n) positionAt().
 */
function buildLineOffsets(text: string): number[] {
  const offsets = [0]
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') offsets.push(i + 1)
  }
  return offsets
}

function offsetToPosition(offset: number, lineOffsets: number[]): vscode.Position {
  // Binary search for the line
  let lo = 0
  let hi = lineOffsets.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (lineOffsets[mid] <= offset) lo = mid
    else hi = mid - 1
  }
  return new vscode.Position(lo, offset - lineOffsets[lo])
}

export function createDecorator(
  context: vscode.ExtensionContext,
  engine: HighlightEngine,
  getPanel?: () => SidePanelProvider | undefined,
) {
  let decorationTypes: Map<PosColorClass, vscode.TextEditorDecorationType> = new Map()
  let currentStyle = ''

  function buildDecorationTypes(style: string) {
    for (const dt of decorationTypes.values()) dt.dispose()
    decorationTypes = new Map()
    currentStyle = style
    for (const [cls, colors] of Object.entries(POS_COLORS) as [PosColorClass, typeof POS_COLORS[PosColorClass]][]) {
      decorationTypes.set(cls, vscode.window.createTextEditorDecorationType(buildDecorationOptions(style, colors)))
    }
  }

  function clearDecorations(editor: vscode.TextEditor) {
    for (const dt of decorationTypes.values()) editor.setDecorations(dt, [])
  }

  function applyDecorations(editor: vscode.TextEditor) {
    const t0 = Date.now()
    const config = loadConfig()

    if (!config.enabled || !shouldProcessDocument(editor.document)) {
      clearDecorations(editor)
      return
    }

    if (currentStyle !== config.decorationStyle) {
      buildDecorationTypes(config.decorationStyle)
    }

    // For large files, only process visible ranges
    let text: string
    let baseOffset = 0
    if (isLargeFile(editor.document)) {
      const visibleRange = editor.visibleRanges[0]
      if (!visibleRange) { clearDecorations(editor); return }
      text = editor.document.getText(visibleRange)
      baseOffset = editor.document.offsetAt(visibleRange.start)
    } else {
      text = editor.document.getText()
    }

    // Apply disabled dict filter before processing
    engine.setDisabledDicts(config.disabledDicts || [])

    const t1 = Date.now()
    const decorated = engine.process(text, config)

    // Build line offset index once — O(n chars), then each lookup is O(log lines)
    const t2 = Date.now()
    const lineOffsets = buildLineOffsets(text)

    const rangesByClass = new Map<PosColorClass, vscode.Range[]>()
    for (const cls of decorationTypes.keys()) rangesByClass.set(cls, [])

    let total = 0
    for (const word of decorated) {
      if (total >= MAX_DECORATIONS) break
      const ranges = rangesByClass.get(word.colorClass)
      if (!ranges) continue

      // Use our O(log n) lookup instead of VS Code's O(n) positionAt()
      const startPos = offsetToPosition(word.start, lineOffsets)
      const endPos = offsetToPosition(word.end, lineOffsets)
      ranges.push(new vscode.Range(startPos, endPos))
      total++
    }

    const t3 = Date.now()
    for (const [cls, dt] of decorationTypes) {
      editor.setDecorations(dt, rangesByClass.get(cls) ?? [])
    }

    // Push results to side panel (if open)
    getPanel?.()?.sendAnnotationResult(decorated, editor.document.fileName.split('/').pop() ?? '')
  }

  const debouncedApply = debounce((editor: vscode.TextEditor) => applyDecorations(editor), 300)

  buildDecorationTypes(loadConfig().decorationStyle)

  const subs = [
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) debouncedApply(editor)
    }),
    vscode.workspace.onDidChangeTextDocument(e => {
      const editor = vscode.window.activeTextEditor
      if (editor && editor.document === e.document) debouncedApply(editor)
    }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('adhdgofly')) {
        const editor = vscode.window.activeTextEditor
        if (editor) applyDecorations(editor)
      }
    }),
    vscode.window.onDidChangeTextEditorVisibleRanges(e => {
      if (isLargeFile(e.textEditor.document)) debouncedApply(e.textEditor)
    }),
  ]

  context.subscriptions.push(...subs)

  return {
    triggerUpdate(editor: vscode.TextEditor) {
      debouncedApply(editor)
    },
    forceApply(editor: vscode.TextEditor) {
      applyDecorations(editor)
    },
    annotateSelection() {
      const editor = vscode.window.activeTextEditor
      if (!editor) return
      const selection = editor.selection
      if (selection.isEmpty) {
        vscode.window.showInformationMessage('ADHDGoFly: Please select some text first.')
        return
      }
      const text = editor.document.getText(selection)
      vscode.window.showInformationMessage(`ADHDGoFly: Annotating "${text.slice(0, 40)}..."`)
    },
    dispose() {
      for (const dt of decorationTypes.values()) dt.dispose()
    },
  }
}
