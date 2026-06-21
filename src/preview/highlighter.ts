/**
 * Markdown preview highlighter — injected via markdown.previewScripts.
 *
 * Runs in the markdown preview WebView (browser context).
 * Uses segmentMixed from highlightEngine for tokenization,
 * then wraps matched words in colored <span>s in the rendered DOM.
 *
 * Dictionary data is embedded in the bundle as a global (__ADHD_DICT_EN)
 * by scripts/build-preview.mjs (esbuild banner).
 *
 * Uses inline styles (style.color) instead of CSS classes to avoid
 * being overridden by the markdown preview's built-in styles.
 */

import { segmentMixed } from '../highlightEngine/segmenter'

/** Embedded dictionary (word → CSS color), injected by build script */
declare var __ADHD_DICT_EN: Record<string, string>

// ── Constants ───────────────────────────────────────────────────

const HIGHLIGHT_CLASS = 'adhdgofly-hl'
const SKIP_TAGS = new Set(['PRE', 'CODE', 'SCRIPT', 'STYLE'])

// ── State ───────────────────────────────────────────────────────

let processing = false
let observer: MutationObserver | null = null

// ── DOM processing ─────────────────────────────────────────────

/** Check if a node should be skipped (inside code/pre/etc.) */
function shouldSkipNode(node: Node): boolean {
  let el = node.parentElement
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true
    el = el.parentElement
  }
  return false
}

/** Get all eligible text nodes under a root element */
function getTextNodes(root: Element): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (shouldSkipNode(node)) return NodeFilter.FILTER_REJECT
      if (!node.textContent || node.textContent.trim().length < 2) return NodeFilter.FILTER_REJECT
      // Skip text nodes that are already inside a highlighted span
      if (node.parentElement?.classList.contains(HIGHLIGHT_CLASS)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })

  const nodes: Text[] = []
  let n: Text | null
  while ((n = walker.nextNode() as Text | null)) {
    nodes.push(n)
  }
  return nodes
}

/** Process a single text node: tokenize and wrap matches in colored spans */
function processTextNode(node: Text): void {
  const text = node.textContent!
  const dict = window.__ADHD_DICT_EN
  if (!dict || text.length < 2) return

  // Tokenize — segmentMixed returns all segments (dict + non-dict)
  // NOTE: segmentMixed SKIPS whitespace/punctuation (pos++ without pushing).
  // This creates gaps between segments that we must fill with plain text.
  const segments = segmentMixed(text, dict, {}, true)
  if (segments.length === 0) return

  const fragment = document.createDocumentFragment()
  let lastEnd = 0

  for (const seg of segments) {
    // Fill gap before this segment (whitespace/punctuation skipped by segmenter)
    if (seg.start > lastEnd) {
      fragment.appendChild(document.createTextNode(text.slice(lastEnd, seg.start)))
    }

    if (seg.is_in_dict && seg.pos) {
      // Word found in dictionary — wrap in colored span (inline style, no CSS class)
      const span = document.createElement('span')
      span.style.color = seg.pos
      span.style.fontWeight = '500'
      span.textContent = text.slice(seg.start, seg.end)
      fragment.appendChild(span)
    } else {
      // Not in dictionary — plain text
      fragment.appendChild(document.createTextNode(text.slice(seg.start, seg.end)))
    }
    lastEnd = seg.end
  }

  // Trailing text after last segment
  if (lastEnd < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastEnd)))
  }

  node.parentNode?.replaceChild(fragment, node)
}

// ── Logging ─────────────────────────────────────────────────────

function log(...args: unknown[]): void {
  console.log('[ADHDGoFly Preview]', ...args)
}

function warn(...args: unknown[]): void {
  console.warn('[ADHDGoFly Preview]', ...args)
}

/** Process all eligible text nodes in the markdown preview */
function processAll(): void {
  if (processing) return
  processing = true

  // Disconnect observer to break the feedback loop from our own DOM changes
  if (observer) {
    observer.disconnect()
    observer = null
  }

  try {
    const dict = window.__ADHD_DICT_EN
    if (!dict || Object.keys(dict).length === 0) {
      warn('No dictionary found (__ADHD_DICT_EN is empty or missing)')
      return
    }

    const container = document.querySelector('.markdown-body') || document.body
    log('Processing text nodes in', container.className || 'body')

    const nodes = getTextNodes(container)
    if (nodes.length === 0) {
      log('No eligible text nodes found')
      return
    }

    let totalSpansCreated = 0
    let debugFirst = true

    for (const node of nodes) {
      const text = node.textContent!
      const segments = segmentMixed(text, dict, {}, true)
      if (segments.length === 0) continue

      // Debug: show what first node produces
      if (debugFirst && text.trim().length > 10) {
        const inDict = segments.filter(s => s.is_in_dict)
        if (inDict.length > 0) {
          log('DEBUG first node text:', JSON.stringify(text.slice(0, 80)))
          log('DEBUG segments:', segments.length, 'in-dict:', inDict.length)
          log('DEBUG first match:', inDict[0].word, '→', inDict[0].pos)
          debugFirst = false
        }
      }

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
          span.style.fontWeight = '700'
          span.style.textDecoration = 'underline'
          span.textDecoration = 'underline'
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
      totalSpansCreated += spanCount
    }

    // Verify: count actual span elements in the DOM
    const actualSpans = container.querySelectorAll('span[style*="color"]').length
    log(`Processed ${nodes.length} nodes, created ${totalSpansCreated} highlight spans (DOM has ${actualSpans} styled spans)`)
    if (actualSpans > 0) {
      const firstSpan = container.querySelector('span[style*="color"]')!
      log('DEBUG first span in DOM: style=' + firstSpan.getAttribute('style') + ' text=' + JSON.stringify(firstSpan.textContent?.slice(0, 30)))
    }

    // If no spans were created, do a deeper debug
    if (totalSpansCreated === 0 && nodes.length > 0) {
      const sample = nodes[0].textContent!
      log('DEBUG no spans: sample text:', JSON.stringify(sample.slice(0, 60)))
      const segs = segmentMixed(sample, dict, {}, true)
      log('DEBUG no spans: segments:', segs.length)
      const inDict = segs.filter(s => s.is_in_dict)
      log('DEBUG no spans: in-dict:', inDict.length)
      if (inDict.length > 0) {
        log('DEBUG no spans: first match:', inDict[0].word, JSON.stringify(inDict[0].pos))
      } else {
        // Check if "run" is in dict
        const runEntry = dict['run']
        log('DEBUG no spans: dict["run"] =', runEntry, typeof runEntry)
        log('DEBUG no spans: sample words:', JSON.stringify(sample.toLowerCase().match(/\b\w{2,}\b/g)?.slice(0, 10)))
      }
    }
  } catch (err) {
    console.error('[ADHDGoFly Preview] Error:', err)
  } finally {
    processing = false
    // Reconnect observer — any new mutations (user edits, preview re-render) will trigger again
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

  observer.observe(container, {
    childList: true,
    subtree: true,
    characterData: true,
  })
}

// ── Initialization ──────────────────────────────────────────────

function init(): void {
  log('Script loaded, dict available:', !!window.__ADHD_DICT_EN)

  const doProcess = (): void => {
    // No CSS injection needed — using inline styles
    processAll()
    setupObserver()
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', doProcess)
  } else {
    doProcess()
  }
}

init()
