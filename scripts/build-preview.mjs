/**
 * Build the markdown preview highlighter bundle.
 *
 * 1. Generates full EN + ZH color maps from dictionary JSONs
 * 2. Bundles src/preview/highlighter.ts into browser-compatible .js
 * 3. Prepends both dictionaries as globals (prevents script ordering issues)
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

// ── Color mapping — synced with matcher.ts POS_COLOR_MAP ────────────

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

// ── Dictionary builder ────────────────────────────────────────────

function buildDict(lang, filePath) {
  console.log(`Loading ${lang} dictionary from ${filePath}...`)
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  const entries = Object.entries(raw.words)

  const colorMap = {}
  for (const [word, entry] of entries) {
    if (entry.pos && entry.pos.length > 0) {
      colorMap[word.toLowerCase()] = posToColor(entry.pos[0])
    }
  }

  // Sort for deterministic output
  const sorted = Object.keys(colorMap).sort()
  const result = {}
  for (const w of sorted) result[w] = colorMap[w]

  const js = JSON.stringify(result)
  const kb = (Buffer.byteLength(js, 'utf-8') / 1024).toFixed(1)
  console.log(`  ${Object.keys(result).length} words (${kb}KB)`)

  return { js, wordCount: Object.keys(result).length, sizeKb: kb }
}

// ── Step 1: Build dictionaries ─────────────────────────────────────

console.log('\n=== Building dictionaries ===')
const en = buildDict('EN', path.join(root, 'dictionaries', 'EN_word.json'))
const zh = buildDict('ZH', path.join(root, 'dictionaries', 'ZH_word.json'))

const bannerJs = 'var __ADHD_DICT_EN=' + en.js + ';var __ADHD_DICT_ZH=' + zh.js + ';'
const totalKb = (Buffer.byteLength(bannerJs, 'utf-8') / 1024 / 1024).toFixed(1)
console.log(`\nTotal dictionary data: ${totalKb}MB`)

// ── Step 2: Bundle highlighter with esbuild ────────────────────────

console.log('\n=== Bundling highlighter ===')
await esbuild.build({
  entryPoints: [path.join(root, 'src', 'preview', 'highlighter.ts')],
  outfile: path.join(outDir, 'highlighter.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  minify: false,
  sourcemap: false,
  logLevel: 'info',
  banner: { js: bannerJs },
})

const stats = fs.statSync(path.join(outDir, 'highlighter.js'))
const mb = (stats.size / 1024 / 1024).toFixed(1)
console.log(`\nhighlighter.js: ${mb}MB (EN ${en.sizeKb}KB + ZH ${zh.sizeKb}KB embedded)`)
console.log('Preview bundle ready.')
