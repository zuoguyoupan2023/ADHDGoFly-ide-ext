/**
 * VS Code Decoration API layer.
 * Creates/updates/disposes DecorationTypes and applies them to the editor.
 */
import * as vscode from 'vscode'
import { debounce } from '../utils/debounce'
import { loadConfig } from './config'
import { shouldProcessDocument, isLargeFile } from './activationGuard'
import { getAnnotatableRanges } from './textMate'
import { sanitizeCodeBlocks } from '../highlightEngine/index'
import type { HighlightEngine } from '../highlightEngine/index'
import type { PosColorClass } from '../highlightEngine/types'
import type { SidePanelProvider } from './sidePanel'

/**
 * Color palettes for POS decorations.
 * Each palette has dark and light variants — VS Code picks the right one
 * based on the current editor theme. Synced with preview palettes in
 * src/preview/highlighter.ts and docs/013-dual-theme-preview-colors.md.
 */
interface PaletteEntry { color: string; bg: string; border: string }

const POS_COLORS: Record<PosColorClass, { dark: PaletteEntry; light: PaletteEntry }> = {
  'pos-n': {
    dark:  { color: '#4ade80', bg: 'rgba(34,197,94,0.15)',    border: 'rgba(34,197,94,0.35)' },
    light: { color: '#059669', bg: 'rgba(5,150,101,0.15)',    border: 'rgba(5,150,101,0.35)' },
  },
  'pos-v': {
    dark:  { color: '#f87171', bg: 'rgba(239,68,68,0.15)',    border: 'rgba(239,68,68,0.35)' },
    light: { color: '#dc2626', bg: 'rgba(220,38,38,0.15)',    border: 'rgba(220,38,38,0.35)' },
  },
  'pos-a': {
    dark:  { color: '#c084fc', bg: 'rgba(168,85,247,0.15)',   border: 'rgba(168,85,247,0.35)' },
    light: { color: '#7c3aed', bg: 'rgba(124,58,237,0.15)',   border: 'rgba(124,58,237,0.35)' },
  },
  'pos-other': {
    dark:  { color: '#9ca3af', bg: 'rgba(156,163,175,0.12)',  border: 'rgba(156,163,175,0.3)' },
    light: { color: '#6b7280', bg: 'rgba(107,114,128,0.12)',  border: 'rgba(107,114,128,0.3)' },
  },
}

const MAX_DECORATIONS = 5000

function buildDecorationOptions(style: string, colors: { dark: PaletteEntry; light: PaletteEntry }): vscode.DecorationRenderOptions {
  if (style === 'highlight') {
    return {
      dark: { backgroundColor: colors.dark.bg, border: `1px solid ${colors.dark.border}` },
      light: { backgroundColor: colors.light.bg, border: `1px solid ${colors.light.border}` },
      borderRadius: '2px',
    }
  }
  // 'color' mode (default) — text color only
  return { dark: { color: colors.dark.color }, light: { color: colors.light.color } }
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
    console.log('[ADHDGoFly] applyDecorations start, posFilter:', JSON.stringify(config.posFilter))

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

    // ── Pre-process text for markdown files ─────────────────────────
    // Strip fenced code blocks and inline code spans (replace with spaces
    // to preserve character offsets), so code tokens never enter the engine.
    const langId = editor.document.languageId
    let processText = text
    let sidePanelText = text  // side panel gets the original text for word list
    if (langId === 'markdown') {
      processText = sanitizeCodeBlocks(text)
    }

    // Apply disabled dict filter before processing
    engine.setDisabledDicts(config.disabledDicts || [])

    // Run engine WITHOUT posFilter to get ALL words for toggle support.
    // We'll filter for display below. The full range set is stored in
    // lastRangesByClass so setPosFilter can toggle POS instantly.
    const posFilter = config.posFilter
    let decorated = engine.process(processText, { ...config, posFilter: ['n', 'v', 'a', 'other'] })

    // ── Code files: restrict to comments/strings ────────────────────
    if (langId !== 'markdown' && langId !== 'plaintext') {
      const annotatable = getAnnotatableRanges(editor.document)
      if (annotatable && annotatable.length > 0) {
        const annotatableOffsets = annotatable.map(r => ({
          start: editor.document.offsetAt(r.start),
          end: editor.document.offsetAt(r.end),
        }))
        decorated = decorated.filter(w => {
          const absStart = w.start + baseOffset
          const absEnd = w.end + baseOffset
          return annotatableOffsets.some(r => absStart >= r.start && absEnd <= r.end)
        })
      } else if (annotatable && annotatable.length === 0) {
        // No comments/strings in this file — nothing to highlight
        decorated = []
      }
    }

    // Build line offset index once — O(n chars), then each lookup is O(log lines)
    const t2 = Date.now()
    const lineOffsets = buildLineOffsets(text)  // Use original text offsets for decoration positioning

    // Build ranges for ALL POS classification (stored for toggle support)
    const allRangesByClass = new Map<PosColorClass, vscode.Range[]>()
    for (const cls of decorationTypes.keys()) allRangesByClass.set(cls, [])

    for (const word of decorated) {
      const ranges = allRangesByClass.get(word.colorClass)
      if (!ranges) continue
      const startPos = offsetToPosition(word.start, lineOffsets)
      const endPos = offsetToPosition(word.end, lineOffsets)
      ranges.push(new vscode.Range(startPos, endPos))
    }

    // Persist full ranges for instant toggle (overwrite to catch document edits)
    lastRangesByClass.set(editor.document.uri.toString(), allRangesByClass)
    console.log('[ADHDGoFly] applyDecorations: stored ranges, pos-n:', allRangesByClass.get('pos-n')?.length ?? 0, 'pos-v:', allRangesByClass.get('pos-v')?.length ?? 0)

    // Filter to only visible POS for actual display
    const displayRanges = new Map<PosColorClass, vscode.Range[]>()
    for (const [cls, ranges] of allRangesByClass) {
      let filterKey: string
      if (cls === 'pos-n') filterKey = 'n'
      else if (cls === 'pos-v') filterKey = 'v'
      else if (cls === 'pos-a') filterKey = 'a'
      else filterKey = 'other'

      if (posFilter.includes(filterKey)) {
        displayRanges.set(cls, ranges)
      } else {
        displayRanges.set(cls, [])
      }
    }

    const t3 = Date.now()
    for (const [cls, dt] of decorationTypes) {
      editor.setDecorations(dt, displayRanges.get(cls) ?? [])
    }

    // Push filtered results to side panel (matching what's actually visible)
    const visibleDecorated = decorated.filter(w => {
      let key: string
      if (w.colorClass === 'pos-n') key = 'n'
      else if (w.colorClass === 'pos-v') key = 'v'
      else if (w.colorClass === 'pos-a') key = 'a'
      else key = 'other'
      return posFilter.includes(key)
    })
    getPanel?.()?.sendAnnotationResult(visibleDecorated, editor.document.fileName.split('/').pop() ?? '')
  }

  /** Per-document storage of last computed ranges, keyed by document URI */
  const lastRangesByClass = new Map<string, Map<PosColorClass, vscode.Range[]>>()

  /**
   * Toggle POS visibility WITHOUT reprocessing the document.
   *
   * For each POS class:
   *   - If the key is in the active filter → reapply stored ranges
   *   - If the key is NOT in the filter → clear decorations (hide)
   *
   * This is O(1) per class — no segmentation, no dict lookup, no DOM traversal.
   */
  function setPosFilter(filter: string[]): void {
    console.log('[ADHDGoFly] setPosFilter called with:', JSON.stringify(filter))
    const editor = vscode.window.activeTextEditor
    if (!editor) { console.log('[ADHDGoFly] setPosFilter: no active editor'); return }

    const docKey = editor.document.uri.toString()
    const docRanges = lastRangesByClass.get(docKey)
    if (!docRanges) {
      console.log('[ADHDGoFly] setPosFilter: no cached ranges for', docKey, '- falling back to full reprocess')
      applyDecorations(editor)
      return
    }

    console.log('[ADHDGoFly] setPosFilter: ranges keys =', [...docRanges.keys()].join(','))
    for (const [k, r] of docRanges) console.log(`  ${k}: ${r.length} ranges`)

    const filterToClass: Record<string, PosColorClass> = {
      n: 'pos-n',
      v: 'pos-v',
      a: 'pos-a',
      other: 'pos-other',
    }

    for (const [cls, dt] of decorationTypes) {
      let filterKey: string | null = null
      for (const [key, posClass] of Object.entries(filterToClass)) {
        if (posClass === cls) { filterKey = key; break }
      }
      if (!filterKey) continue

      const show = filter.includes(filterKey)
      const ranges = docRanges.get(cls) ?? []
      console.log(`[ADHDGoFly] setPosFilter: ${cls} show=${show} ranges=${ranges.length}`)
      editor.setDecorations(dt, show ? ranges : [])
    }
    console.log('[ADHDGoFly] setPosFilter done')
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
    setPosFilter,
    annotateSelection() {
      const editor = vscode.window.activeTextEditor
      if (!editor) return
      const selection = editor.selection
      if (selection.isEmpty) {
        vscode.window.showInformationMessage('adhdgofly-ide-ext: Please select some text first.')
        return
      }
      const text = editor.document.getText(selection)
      vscode.window.showInformationMessage(`adhdgofly-ide-ext: Annotating "${text.slice(0, 40)}..."`)
    },
    dispose() {
      for (const dt of decorationTypes.values()) dt.dispose()
    },
  }
}
