/**
 * Build the markdown preview highlighter bundle.
 *
 * 1. Generates EN + ZH dictionaries (word → POS key, e.g. "n"/"v"/"a"/"o")
 * 2. Bundles src/preview/highlighter.ts into browser-compatible .js
 * 3. Prepends both dictionaries as globals (avoids script ordering issues)
 *
 * POS keys are resolved to colors at runtime by highlighter.ts
 * based on the detected theme (dark/light).
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

// ── POS key mapping — synced with matcher.ts POS_COLOR_MAP ──────────

function posToKey(posStr) {
  const primary = posStr.split(',')[0].trim().toLowerCase()
  if (primary === 'n' || primary === 'nr' || primary === 'ns' || primary === 'nt' || primary === 'nz' || primary === 't') return 'n'
  if (primary === 'v') return 'v'
  if (primary === 'adj' || primary === 'a' || primary === 'adv' || primary === 'd') return 'a'
  return 'o'
}

// ── Dictionary builder ────────────────────────────────────────────

function buildDict(lang, filePath) {
  console.log(`Loading ${lang} dictionary from ${filePath}...`)
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  const entries = Object.entries(raw.words)

  const posMap = {}
  for (const [word, entry] of entries) {
    if (entry.pos && entry.pos.length > 0) {
      posMap[word.toLowerCase()] = posToKey(entry.pos[0])
    }
  }

  // Sort for deterministic output
  const sorted = Object.keys(posMap).sort()
  const result = {}
  for (const w of sorted) result[w] = posMap[w]

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
