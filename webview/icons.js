/**
 * SVG Icon definitions — Lucide-style outline icons.
 * Inline SVGs for use in VS Code Webview (CSP: default-src 'none').
 * All icons use currentColor to inherit theme colors.
 */
var ICONS = {
  // ── Helpers ────────────────────────────────────────────────
  _svg: function (path, size) {
    size = size || 14
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>'
  },
  _s: function (p) { return this._svg(p) },

  // ── Icons ──────────────────────────────────────────────────
  folder:      '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  file:        '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  barChart3:   '<path d="M3 3v18h18"/><path d="M7 16v-3"/><path d="M12 16v-7"/><path d="M17 16v-4"/>',
  zap:         '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  sparkles:    '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
  alertCircle: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  refreshCw:   '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>',
  chevronRight:'<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronUp:   '<path d="m18 15-6-6-6 6"/>',
  x:           '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  arrowLeft:   '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',

  // ── Convenience methods ────────────────────────────────────
  small: function (path)  { return this._svg(path, 12) },
  medium: function (path) { return this._svg(path, 16) },
  withLabel: function (path, label) { return this._svg(path, 14) + ' ' + label },
}

// Helper wrapper so callers can do ICONS.wrap(ICONS.folder) or ICONS.s('folder')
ICONS.wrap = function (path, size) { return ICONS._svg(path, size) }
ICONS.get = function (name, size) {
  var path = ICONS[name]
  return path ? ICONS._svg(path, size || 14) : ''
}
