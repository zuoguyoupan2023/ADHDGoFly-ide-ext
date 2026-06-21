/**
 * Markdown preview highlighter — injected via markdown.previewScripts.
 *
 * Runs in the markdown preview WebView (browser context).
 * Uses segmentMixed from highlightEngine for tokenization,
 * then wraps matched words in colored <span>s in the rendered DOM.
 *
 * EN + ZH dictionaries are embedded as globals by scripts/build-preview.mjs
 * (word → POS key, e.g. "n"/"v"/"a"/"o").
 *
 * Colors are resolved at runtime from the active palette based on
 * VS Code's theme class (vscode-dark / vscode-light) on <body>.
 * Theme changes automatically refresh all highlight colors.
 */

import { segmentMixed } from '../highlightEngine/segmenter'

/** Embedded dictionaries (word → POS key: "n"/"v"/"a"/"o"), injected by build script */
declare var __ADHD_DICT_EN: Record<string, string>
declare var __ADHD_DICT_ZH: Record<string, string>

// ── Palettes ───────────────────────────────────────────────────

const DARK_PALETTE: Record<string, string> = {
  n: '#4ade80',
  v: '#f87171',
  a: '#a78bfa',
  o: '#9ca3af',
}

const LIGHT_PALETTE: Record<string, string> = {
  n: '#059669',
  v: '#dc2626',
  a: '#7c3aed',
  o: '#6b7280',
}

// ── Constants ───────────────────────────────────────────────────

const HIGHLIGHT_CLASS = 'adhdgofly-hl'
const SKIP_TAGS = new Set(['PRE', 'CODE', 'SCRIPT', 'STYLE'])

// ── State ───────────────────────────────────────────────────────

let processing = false
let observer: MutationObserver | null = null
let themeObserver: MutationObserver | null = null

// ── Theme detection ────────────────────────────────────────────

function isDarkTheme(): boolean {
  if (document.body.classList.contains('vscode-dark')) return true
  if (document.body.classList.contains('vscode-light')) return false
  return true // default to dark
}

function resolveColor(posKey: string): string {
  const palette = isDarkTheme() ? DARK_PALETTE : LIGHT_PALETTE
  return palette[posKey] ?? palette.o
}

// ── DOM processing ─────────────────────────────────────────────

function shouldSkipNode(node: Node): boolean {
  let el = node.parentElement
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true
    el = el.parentElement
  }
  return false
}

function getTextNodes(root: Element): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (shouldSkipNode(node)) return NodeFilter.FILTER_REJECT
      if (!node.textContent || node.textContent.trim().length < 2) return NodeFilter.FILTER_REJECT
      if (node.parentElement?.classList.contains(HIGHLIGHT_CLASS)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  const nodes: Text[] = []
  let n: Text | null
  while ((n = walker.nextNode() as Text | null)) nodes.push(n)
  return nodes
}

// ── Logging ─────────────────────────────────────────────────────

function log(...args: unknown[]): void {
  console.log('[ADHDGoFly Preview]', ...args)
}

// ── Highlight processing ───────────────────────────────────────

function processAll(): void {
  if (processing) return
  processing = true

  if (observer) { observer.disconnect(); observer = null }

  try {
    const enDict = window.__ADHD_DICT_EN
    const zhDict = window.__ADHD_DICT_ZH
    if (!enDict || !zhDict) { log('Dictionaries not available'); return }

    const container = document.querySelector('.markdown-body') || document.body
    const nodes = getTextNodes(container)
    if (nodes.length === 0) return

    let totalSpans = 0

    for (const node of nodes) {
      const text = node.textContent!
      const segments = segmentMixed(text, enDict, zhDict, true)
      if (segments.length === 0) continue

      const fragment = document.createDocumentFragment()
      let lastEnd = 0

      for (const seg of segments) {
        if (seg.start > lastEnd) {
          fragment.appendChild(document.createTextNode(text.slice(lastEnd, seg.start)))
        }
        if (seg.is_in_dict && seg.pos) {
          const span = document.createElement('span')
          span.className = HIGHLIGHT_CLASS
          span.dataset.pos = seg.pos // store POS key for theme refresh
          span.style.color = resolveColor(seg.pos)
          span.style.fontWeight = '500'
          span.textContent = text.slice(seg.start, seg.end)
          fragment.appendChild(span)
          totalSpans++
        } else {
          fragment.appendChild(document.createTextNode(text.slice(seg.start, seg.end)))
        }
        lastEnd = seg.end
      }
      if (lastEnd < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastEnd)))
      }
      node.parentNode?.replaceChild(fragment, node)
    }

    log(`Processed ${nodes.length} nodes, ${totalSpans} highlights (${isDarkTheme() ? 'dark' : 'light'} theme)`)
  } catch (err) {
    console.error('[ADHDGoFly Preview] Error:', err)
  } finally {
    processing = false
    setupObserver()
  }
}

// ── Theme change handler ───────────────────────────────────────

/** Refresh all existing highlight span colors to match current theme */
function refreshThemeColors(): void {
  const palette = isDarkTheme() ? DARK_PALETTE : LIGHT_PALETTE
  const spans = document.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_CLASS}`)
  for (const span of spans) {
    const key = span.dataset.pos
    span.style.color = key ? palette[key] ?? palette.o : palette.o
  }
}

// ── MutationObserver ───────────────────────────────────────────

function setupObserver(): void {
  if (observer) return
  const container = document.querySelector('.markdown-body') || document.body
  observer = new MutationObserver(() => {
    if (!processing) processAll()
  })
  observer.observe(container, { childList: true, subtree: true, characterData: true })
}

function setupThemeObserver(): void {
  if (themeObserver) return
  themeObserver = new MutationObserver(() => {
    // Detect dark↔light toggle and refresh colors in-place
    refreshThemeColors()
  })
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] })
}

// ── Initialization ─────────────────────────────────────────────

function init(): void {
  log('Script loaded, dict EN:', !!window.__ADHD_DICT_EN, 'ZH:', !!window.__ADHD_DICT_ZH)

  const doProcess = (): void => {
    processAll()
    setupObserver()
    setupThemeObserver()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', doProcess)
  } else {
    doProcess()
  }
}

init()
