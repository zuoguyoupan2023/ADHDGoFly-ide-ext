/**
 * Build the markdown preview highlighter bundle.
 *
 * 1. Generates compact EN dictionary from dictionaries/EN_word.json
 * 2. Uses esbuild to bundle src/preview/highlighter.ts (plus pure-logic
 *    imports from highlightEngine/) into a single browser-compatible .js file
 * 3. Prepends dictionary data as a banner so it's available as a global
 *   (avoids script ordering issues with previewScripts array loading)
 *
 * Usage: node scripts/build-preview.mjs
 */
import * as esbuild from 'esbuild'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outDir = path.join(root, 'out', 'preview')

fs.mkdirSync(outDir, { recursive: true })

// ── Step 1: Build compact dictionary ──────────────────────────────

// Color mapping — synced with matcher.ts POS_COLOR_MAP
const POS_TO_COLOR = {
  n: '#4ade80',   // noun green
  v: '#f87171',   // verb red
  adj: '#a78bfa', // adjective purple
  adv: '#a78bfa', // adverb purple
}

function posToColor(posStr) {
  const primary = posStr.split(',')[0].trim().toLowerCase()
  if (primary === 'n' || primary === 'nr' || primary === 'ns' || primary === 'nt' || primary === 'nz' || primary === 't') return POS_TO_COLOR.n
  if (primary === 'v') return POS_TO_COLOR.v
  if (primary === 'adj' || primary === 'a' || primary === 'adv' || primary === 'd') return POS_TO_COLOR.adj
  return '#9ca3af' // other gray
}

console.log('Building compact dictionary from EN_word.json...')
const enRaw = JSON.parse(fs.readFileSync(path.join(root, 'dictionaries', 'EN_word.json'), 'utf-8'))
const entries = Object.entries(enRaw.words)

// Build full color map (no sampling — all words)
const colorMap = {}
for (const [word, entry] of entries) {
  if (entry.pos && entry.pos.length > 0) {
    colorMap[word.toLowerCase()] = posToColor(entry.pos[0])
  }
}

// Sort for deterministic output
const sortedWords = Object.keys(colorMap).sort()
const fullDict = {}
for (const w of sortedWords) {
  fullDict[w] = colorMap[w]
}

// Generate dict JS string that will be prepended as a banner
const dictJs = 'var __ADHD_DICT_EN=' + JSON.stringify(fullDict) + ';'
const dictSizeKb = (Buffer.byteLength(dictJs, 'utf-8') / 1024).toFixed(1)
console.log(`Dictionary: ${Object.keys(fullDict).length} words (${dictSizeKb}KB) [full, no sampling]`)

// ── Step 2: Bundle highlighter with esbuild ───────────────────────

console.log('Bundling highlighter...')
await esbuild.build({
  entryPoints: [path.join(root, 'src', 'preview', 'highlighter.ts')],
  outfile: path.join(outDir, 'highlighter.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  minify: false,
  sourcemap: false, // disable sourcemap to avoid CSP issues in some IDEs
  logLevel: 'info',
  // Prepend dictionary data before the IIFE — always available as a global
  banner: {
    js: dictJs,
  },
})

const stats = fs.statSync(path.join(outDir, 'highlighter.js'))
console.log(`highlighter.js: ${(stats.size / 1024).toFixed(1)}KB (dict embedded)`)
console.log('Preview bundle ready.')
