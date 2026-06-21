/**
 * Markdown preview highlighter — injected via markdown.previewScripts.
 *
 * Runs in the markdown preview WebView (browser context).
 * Uses segmentMixed from highlightEngine for tokenization,
 * then wraps matched words in colored <span>s in the rendered DOM.
 *
 * EN + ZH dictionaries are embedded as globals by scripts/build-preview.mjs.
 * Uses inline styles (style.color) to avoid being overridden by preview CSS.
 */

import { segmentMixed } from '../highlightEngine/segmenter'

/** Embedded dictionaries (word → CSS color), injected by build script */
declare var __ADHD_DICT_EN: Record<string, string>
declare var __ADHD_DICT_ZH: Record<string, string>

// ── Constants ───────────────────────────────────────────────────

const HIGHLIGHT_CLASS = 'adhdgofly-hl'
const SKIP_TAGS = new Set(['PRE', 'CODE', 'SCRIPT', 'STYLE'])

// ── State ───────────────────────────────────────────────────────

let processing = false
let observer: MutationObserver | null = null

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

function processAll(): void {
  if (processing) return
  processing = true

  if (observer) {
    observer.disconnect()
    observer = null
  }

  try {
    const enDict = window.__ADHD_DICT_EN
    const zhDict = window.__ADHD_DICT_ZH
    if (!enDict || !zhDict) {
      log('Dictionaries not available')
      return
    }

    const container = document.querySelector('.markdown-body') || document.body
    const nodes = getTextNodes(container)
    if (nodes.length === 0) return

    let totalSpans = 0

    for (const node of nodes) {
      const text = node.textContent!
      // Pass EN as latinDict, ZH as cjkDict — segmentMixed dispatches by character type
      const segments = segmentMixed(text, enDict, zhDict, true)
      if (segments.length === 0) continue

      const fragment = document.createDocumentFragment()
      let lastEnd = 0
      let spanCount = 0

      for (const seg of segments) {
        if (seg.start > lastEnd) {
          fragment.appendChild(document.createTextNode(text.slice(lastEnd, seg.start)))
        }
        if (seg.is_in_dict && seg.pos) {
          const span = document.createElement('span')
          span.style.color = seg.pos
          span.style.fontWeight = '500'
          span.textContent = text.slice(seg.start, seg.end)
          fragment.appendChild(span)
          spanCount++
        } else {
          fragment.appendChild(document.createTextNode(text.slice(seg.start, seg.end)))
        }
        lastEnd = seg.end
      }
      if (lastEnd < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastEnd)))
      }
      node.parentNode?.replaceChild(fragment, node)
      totalSpans += spanCount
    }

    log(`Processed ${nodes.length} nodes, ${totalSpans} highlights`)
  } catch (err) {
    console.error('[ADHDGoFly Preview] Error:', err)
  } finally {
    processing = false
    setupObserver()
  }
}

// ── MutationObserver ────────────────────────────────────────────

function setupObserver(): void {
  if (observer) return
  const container = document.querySelector('.markdown-body') || document.body
  observer = new MutationObserver(() => {
    if (!processing) processAll()
  })
  observer.observe(container, { childList: true, subtree: true, characterData: true })
}

// ── Initialization ──────────────────────────────────────────────

function init(): void {
  log('Script loaded, EN:', !!window.__ADHD_DICT_EN, 'ZH:', !!window.__ADHD_DICT_ZH)

  const doProcess = (): void => {
    processAll()
    setupObserver()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', doProcess)
  } else {
    doProcess()
  }
}

init()
