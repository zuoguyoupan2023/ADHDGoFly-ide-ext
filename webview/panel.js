// @ts-nocheck
/**
 * ADHDGoFly Side Panel — Webview script.
 * Runs inside VS Code's sandboxed Webview context.
 * All VS Code API access goes through vscode.postMessage / window.addEventListener('message').
 */

const vscode = acquireVsCodeApi()

// ── State ──────────────────────────────────────────────────────────────────

const state = {
  // annotate tab
  words: [],
  fileName: '—',
  posFilter: new Set(['n', 'v', 'a', 'other']),
  wordFreq: [],        // [{ word, pos, count }] sorted
  freqSortMode: 'freq', // 'freq' | 'alpha' | 'pos'
  activeWordTooltip: null,

  // dict tab
  dictList: [],
  disabledDicts: [],   // which dicts are disabled (empty = all enabled)
  currentLang: null,
  currentDictId: null,
  dictSearch: '',
  dictPage: 1,
  dictPageSize: 25,
  dictTotal: 0,
  dictTotalPages: 1,
  dictEntries: [],

  // edit overlay
  editMode: null,   // 'edit' | 'add'
  editLang: null,
  editWord: '',
  editPos: [],

  // ai judging
  aiJudging: false,
  aiProviders: [],

  // export: words from last annotation for "export current doc"
  lastAnnotatedWords: [],
  lastAnnotatedFile: '—',

  // batch tab
  batch: {
    files: [],          // BatchFileResult[]
    processing: false,
    aggPage: 1,
    aggPageSize: 25,
    aggExpandedWord: null,
    total: 0,
    completed: 0,
    projectFiles: [],   // string[] — full paths of all project files
    selectedFiles: new Set(),  // Set<string> — paths of selected files (reserved for future use)
    workspacePath: '',  // workspace root path for relative tree
    folderExpanded: {}, // { [relativePath]: true/false } — folder expand/collapse state
    fileListCollapsed: false, // processed file list collapsed in results tab
  },
}

// ── VS Code API shorthand ───────────────────────────────────────────────────

function post(msg) { vscode.postMessage(msg) }

// ── Tab switching ───────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn))
    document.querySelectorAll('.tab-content').forEach(c => {
      c.classList.toggle('active', c.id === `tab-${tab}`)
    })
    // When batch tab is activated, request project file tree
    if (tab === 'batch') {
      post({ type: 'getProjectFiles' })
    }
  })
})

// ── POS chips (filter) ──────────────────────────────────────────────────────

document.querySelectorAll('#pos-chips .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const pos = chip.dataset.pos
    chip.classList.toggle('active')
    if (chip.classList.contains('active')) state.posFilter.add(pos)
    else state.posFilter.delete(pos)
    buildWordFrequency()
    post({ type: 'posFilterChange', filter: [...state.posFilter] })
  })
})

// ── Word frequency list (annotation tab main view) ──────────────────────

function buildWordFrequency() {
  const visibleClasses = new Set()
  for (const pos of state.posFilter) { visibleClasses.add(`pos-${pos}`) }

  const freqMap = new Map()
  for (const w of state.words) {
    if (!visibleClasses.has(w.colorClass)) continue
    const entry = freqMap.get(w.word)
    if (entry) { entry.count++ }
    else { freqMap.set(w.word, { word: w.word, pos: w.pos, count: 1 }) }
  }
  state.wordFreq = [...freqMap.values()]
  renderWordFrequency()
}

function renderWordFrequency() {
  const isEmpty = !state.wordFreq || state.wordFreq.length === 0
  document.getElementById('freq-empty').style.display = isEmpty ? 'block' : 'none'
  document.getElementById('freq-header').style.display = isEmpty ? 'none' : 'flex'
  document.getElementById('word-frequency-list').style.display = isEmpty ? 'none' : 'block'
  if (isEmpty) return

  document.getElementById('file-name').textContent = state.fileName

  let sorted = [...state.wordFreq]
  if (state.freqSortMode === 'freq') {
    sorted.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
  } else if (state.freqSortMode === 'alpha') {
    sorted.sort((a, b) => a.word.localeCompare(b.word))
  } else if (state.freqSortMode === 'pos') {
    sorted.sort((a, b) => {
      const pa = a.pos.split(',')[0].trim()
      const pb = b.pos.split(',')[0].trim()
      return pa.localeCompare(pb) || b.count - a.count
    })
  }

  const list = document.getElementById('word-frequency-list')
  list.innerHTML = sorted.map(item => {
    const pos = item.pos.split(',').map(p => p.trim()).filter(Boolean)
    const posTags = renderPosTags(pos)
    return `<div class="freq-row" data-word="${escHtml(item.word)}" data-pos="${escHtml(item.pos)}">
      <span class="freq-count">x${item.count}</span>
      <span class="freq-word">${escHtml(item.word)}</span>
      <div class="pos-tags">${posTags}</div>
    </div>`
  }).join('')

  list.querySelectorAll('.freq-row').forEach(row => {
    row.addEventListener('click', () => {
      showWordTooltip({ target: row }, row.dataset.word, row.dataset.pos)
    })
  })

  renderStats()
}

// Sort button handlers
document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    state.freqSortMode = btn.dataset.sort
    renderWordFrequency()
  })
})

function renderStats() {
  const statsBar = document.getElementById('stats-bar')
  if (!state.words || state.words.length === 0) { statsBar.style.display = 'none'; return }
  statsBar.style.display = 'block'

  const totals = { n: 0, v: 0, a: 0, other: 0 }
  for (const w of state.words) {
    const key = w.colorClass.replace('pos-', '')
    if (key in totals) totals[key]++
  }
  const max = Math.max(1, ...Object.values(totals))

  for (const [key, count] of Object.entries(totals)) {
    const row = document.getElementById(`stat-${key}`)
    if (!row) continue
    row.querySelector('.stat-fill').style.width = `${(count / max) * 100}%`
    row.querySelector('.stat-num').textContent = count
  }
}

// ── Word tooltip ────────────────────────────────────────────────────────────

function showWordTooltip(e, word, pos) {
  const tooltip = document.getElementById('word-tooltip')
  document.getElementById('tooltip-word').textContent = word
  document.getElementById('tooltip-pos').textContent = pos
  tooltip.style.display = 'flex'
  state.activeWordTooltip = { word, pos }

  document.getElementById('tooltip-edit').onclick = () => {
    tooltip.style.display = 'none'
    openEditOverlay('edit', state.currentLang ?? 'en', word, pos.split(','))
  }
}

document.addEventListener('click', e => {
  const tooltip = document.getElementById('word-tooltip')
  if (!tooltip.contains(e.target) && !e.target.closest('.freq-row')) {
    tooltip.style.display = 'none'
  }
})

// ── Dict sub-tabs (内置 / 安装 / 社区 / 自建) ────────────────────────────

document.querySelectorAll('.dict-subtab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.dict-subtab').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    const view = btn.dataset.dictview
    document.getElementById('dict-builtin-view').style.display = view === 'builtin' ? 'block' : 'none'
    document.getElementById('dict-list-view').style.display = view === 'installed' ? 'block' : 'none'
    document.getElementById('dict-community-view').style.display = view === 'community' ? 'block' : 'none'
    document.getElementById('dict-user-view').style.display = view === 'user' ? 'block' : 'none'
    if (view === 'community') post({ type: 'getCommunityDicts' })
  })
})

// ── Community dict ────────────────────────────────────────────────────────────

let communityDicts = []

function renderCommunityDicts(dicts) {
  communityDicts = dicts
  const container = document.getElementById('community-dict-list')
  if (!dicts || dicts.length === 0) {
    container.innerHTML = `<div class="empty-state">${t('emptyCommunity')}</div>`
    return
  }
  container.innerHTML = dicts.map(d => {
    const langLabel = d.lang.toUpperCase()
    const installedBadge = d.installed
      ? `<span class="community-installed-badge">${t('installedBadge')}</span>`
      : ''
    const actionBtn = d.installed
      ? `<button class="btn-icon danger" data-action="uninstall" data-id="${escHtml(d.id)}">${t('btnUninstall')}</button>`
      : `<button class="btn-sm" data-action="install" data-id="${escHtml(d.id)}">${t('btnInstall')}</button>`
    return `<div class="community-dict-card">
      <div class="community-dict-header">
        <span class="community-dict-lang">${escHtml(langLabel)}</span>
        <span class="community-dict-name">${escHtml(d.name)}</span>
        <span class="community-dict-count">${t('wordCount')(d.wordCount)}</span>
        ${installedBadge}
      </div>
      <div class="community-dict-desc">${escHtml(d.description)}</div>
      <div class="community-dict-meta">
        <span>v${escHtml(d.version)}</span>
        <span>${t('authorLabel')(escHtml(d.author))}</span>
      </div>
      <div class="community-dict-actions">
        ${actionBtn}
      </div>
    </div>`
  }).join('')

  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { action, id } = btn.dataset
      if (action === 'install') post({ type: 'installCommunityDict', id })
      if (action === 'uninstall') {
        const d = communityDicts.find(x => x.id === id)
        const name = d ? d.name : id
        if (confirm(t('confirmUninstallDict')(name))) {
          post({ type: 'uninstallCommunityDict', id })
        }
      }
    })
  })
}

// ── User-created dict ───────────────────────────────────────────────────────

/** @param {Array<{id:string,name:string,lang:string,wordCount:number,createdAt:string}>} dicts */
function renderUserDicts(dicts) {
  const container = document.getElementById('user-dict-list')
  if (!dicts || dicts.length === 0) {
    container.innerHTML = `<div class="empty-state">${t('emptyUser')}</div>`
    return
  }
  container.innerHTML = dicts.map(d => {
    const langLabel = d.lang.toUpperCase()
    return `<div class="user-dict-card">
      <div class="user-dict-header">
        <span class="user-dict-lang">${escHtml(langLabel)}</span>
        <span class="user-dict-name">${escHtml(d.name)}</span>
        <span class="user-dict-count">${t('wordCount')(d.wordCount)}</span>
        <span class="user-dict-date">${escHtml(d.createdAt)}</span>
      </div>
      <div class="user-dict-actions">
        <button class="btn-sm" data-action="view" data-id="${escHtml(d.id)}" data-lang="${escHtml(d.lang)}" data-name="${escHtml(d.name)}">${t('btnView')}</button>
        <button class="btn-icon danger" data-action="delete" data-id="${escHtml(d.id)}" data-name="${escHtml(d.name)}">${t('btnDelete')}</button>
      </div>
    </div>`
  }).join('')

  container.querySelectorAll('[data-action="view"]').forEach(btn => {
    btn.addEventListener('click', () => {
      openDictDetail(btn.dataset.lang, btn.dataset.name, btn.dataset.id)
    })
  })

  container.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm(t('confirmDeleteUserDict')(btn.dataset.name))) {
        post({ type: 'removeUserDict', id: btn.dataset.id })
      }
    })
  })
}

// ── Save annotation as user dict ───────────────────────────────────────────

// Handle save user dict overlay
document.getElementById('btn-save-user-dict').addEventListener('click', () => {
  if (!state.words || state.words.length === 0) {
    showToast(t('toastNoWords'), 'warn')
    return
  }
  document.getElementById('save-user-dict-name').value = ''
  document.getElementById('save-user-dict-lang').value = 'en'
  document.getElementById('save-user-overlay').style.display = 'flex'
  document.getElementById('save-user-dict-name').focus()
})

document.getElementById('save-user-dict-cancel').addEventListener('click', () => {
  document.getElementById('save-user-overlay').style.display = 'none'
})

document.getElementById('save-user-dict-confirm').addEventListener('click', () => {
  const name = document.getElementById('save-user-dict-name').value.trim()
  if (!name) { showToast(t('toastEnterDictName'), 'warn'); return }
  const lang = document.getElementById('save-user-dict-lang').value
  document.getElementById('save-user-overlay').style.display = 'none'

  // Deduplicate words
  const wordMap = new Map()
  for (const w of state.words) {
    if (!wordMap.has(w.word)) {
      wordMap.set(w.word, w.pos.split(',').map(p => p.trim()).filter(Boolean))
    }
  }

  const words = {}
  for (const [word, pos] of wordMap) {
    words[word] = { pos }
  }

  post({ type: 'saveUserDict', name, lang, words })
})

document.getElementById('btn-refresh-user-dicts').addEventListener('click', () => {
  // The extension will re-send userDictList on the next annotation cycle
  // For now just re-request from the side panel
  post({ type: 'getUserDictList' })
})

// ── Builtin dict rendering ─────────────────────────────────────────────────

/** @param {Array<{id:string,lang:string,name:string,wordCount:number}>} dicts */
function renderBuiltinDicts(dicts) {
  const container = document.getElementById('builtin-dict-list')
  const builtins = (dicts || []).filter(d => d.source === 'builtin')
  if (builtins.length === 0) {
    container.innerHTML = `<div class="empty-state">${t('emptyBuiltin')}</div>`
    return
  }
  container.innerHTML = builtins.map(d => {
    const langLabel = d.lang.toUpperCase()
    return `<div class="builtin-dict-card">
      <span class="builtin-dict-badge">${t('badgeBuiltin')}</span>
      <span class="builtin-dict-lang">${escHtml(langLabel)}</span>
      <span class="builtin-dict-name">${escHtml(d.name)}</span>
      <span class="builtin-dict-count">${t('wordCount')(d.wordCount)}</span>
      <div class="builtin-dict-actions">
        <button class="btn-sm" data-action="view" data-id="${escHtml(d.id)}" data-lang="${escHtml(d.lang)}" data-name="${escHtml(d.name)}">${t('btnView')}</button>
      </div>
    </div>`
  }).join('')

  container.querySelectorAll('[data-action="view"]').forEach(btn => {
    btn.addEventListener('click', () => {
      openDictDetail(btn.dataset.lang, btn.dataset.name, btn.dataset.id)
    })
  })

  // Set dict-list view back since built-in view is now active
  // (openDictDetail hides list views and shows detail view)
}

// ── Dict list (installed) ──────────────────────────────────────────────────

function renderDictList(dicts) {
  const container = document.getElementById('dict-list-items')
  if (!dicts || dicts.length === 0) {
    container.innerHTML = `<div class="empty-state">${t('emptyInstalled')}</div>`
    return
  }
  container.innerHTML = dicts.map(d => {
    const isEnabled = !state.disabledDicts.includes(d.id)
    const badge = d.source === 'builtin' ? t('badgeBuiltin') : d.source === 'community' ? t('badgeCommunity') : t('badgeUser')
    const badgeClass = d.source === 'builtin' ? 'badge-builtin' : d.source === 'community' ? 'badge-community' : 'badge-user'
    return `<div class="dict-card">
      <span class="dict-card-badge ${badgeClass}">${badge}</span>
      <span class="dict-card-lang">${escHtml(d.lang.toUpperCase())}</span>
      <span class="dict-card-name">${escHtml(d.name)}</span>
      <span class="dict-card-count">${t('wordCount')(d.wordCount)}</span>
      <label class="dict-checkbox">
        <input type="checkbox" ${isEnabled ? 'checked' : ''} data-action="toggle" data-id="${escHtml(d.id)}" />
        
      </label>
      <div class="dict-card-actions">
        <button class="btn-icon" data-action="view" data-id="${escHtml(d.id)}" data-lang="${escHtml(d.lang)}" data-name="${escHtml(d.name)}">${t('btnView')}</button>
        <button class="btn-icon" data-action="export" data-lang="${escHtml(d.lang)}" data-name="${escHtml(d.name)}">${t('btnExportDict')}</button>
      </div>
    </div>`
  }).join('')

  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { action, lang, name, id } = btn.dataset
      if (action === 'view') openDictDetail(lang, name, id)
      if (action === 'export') post({ type: 'exportDict', lang, name })
    })
  })

  container.querySelectorAll('[data-action="toggle"]').forEach(cb => {
    cb.addEventListener('change', () => {
      post({ type: 'toggleDict', id: cb.dataset.id, enabled: cb.checked })
    })
  })
}

// ── Dict detail ─────────────────────────────────────────────────────────────

function openDictDetail(lang, name, dictId) {
  state.currentLang = lang
  state.currentDictId = dictId
  state.dictSearch = ''
  state.dictPage = 1
  document.getElementById('dict-builtin-view').style.display = 'none'
  document.getElementById('dict-list-view').style.display = 'none'
  document.getElementById('dict-community-view').style.display = 'none'
  document.getElementById('dict-user-view').style.display = 'none'
  document.getElementById('export-bar').style.display = 'none'
  document.getElementById('dict-detail-view').style.display = 'block'
  document.getElementById('detail-lang-label').textContent = name
  document.getElementById('dict-search').value = ''
  fetchEntries()
}

document.getElementById('btn-back-to-list').addEventListener('click', () => {
  state.currentDictId = null
  document.getElementById('dict-detail-view').style.display = 'none'
  // Return to installed tab (first/default)
  document.getElementById('dict-list-view').style.display = 'block'
  document.getElementById('dict-builtin-view').style.display = 'none'
  document.getElementById('dict-community-view').style.display = 'none'
  document.getElementById('dict-user-view').style.display = 'none'
  document.getElementById('export-bar').style.display = 'block'
  document.querySelectorAll('.dict-subtab').forEach(b => b.classList.remove('active'))
  document.querySelector('.dict-subtab[data-dictview="installed"]')?.classList.add('active')
})

// Search
let searchTimer = null
document.getElementById('dict-search').addEventListener('input', e => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    state.dictSearch = e.target.value
    state.dictPage = 1
    fetchEntries()
  }, 250)
})

// Page size buttons
document.querySelectorAll('.ps-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ps-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    state.dictPageSize = parseInt(btn.dataset.size)
    state.dictPage = 1
    fetchEntries()
  })
})

function fetchEntries() {
  post({
    type: 'getDictEntries',
    lang: state.currentLang,
    dictId: state.currentDictId,
    search: state.dictSearch,
    page: state.dictPage,
    pageSize: state.dictPageSize,
  })
}

function renderEntries(entries, total, page, totalPages) {
  state.dictTotal = total
  state.dictTotalPages = totalPages
  state.dictPage = page
  state.dictEntries = entries

  document.getElementById('detail-total').textContent = t('totalWords')(total)

  const list = document.getElementById('dict-entries-list')
  if (!entries || entries.length === 0) {
    list.innerHTML = '<div class="empty-state">' + t('emptySearch') + '</div>'
    document.getElementById('pagination').innerHTML = ''
    return
  }

  list.innerHTML = entries.map(e => `
    <div class="entry-row">
      <span class="entry-word">${escHtml(e.word)}</span>
      <div class="pos-tags">${renderPosTags(e.pos)}</div>
      <div class="entry-actions">
        <button class="btn-icon" data-action="edit" data-word="${escHtml(e.word)}" data-pos="${escHtml(e.pos.join(','))}">${t('tooltipEdit')}</button>
        <button class="btn-icon danger" data-action="delete" data-word="${escHtml(e.word)}">×</button>
      </div>
    </div>
  `).join('')

  list.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { action, word, pos } = btn.dataset
      if (action === 'edit') openEditOverlay('edit', state.currentLang, word, pos.split(','))
      if (action === 'delete') {
        if (confirm(t('confirmDeleteWord')(word))) {
          post({ type: 'deleteWord', lang: state.currentLang, word, search: state.dictSearch, page: state.dictPage, pageSize: state.dictPageSize })
        }
      }
    })
  })

  renderPagination(page, totalPages)
}

function renderPosTags(pos) {
  return pos.map(p => {
    const cls = p === 'adj' || p === 'adv' ? 'a' : (['n','v'].includes(p) ? p : 'other')
    return `<span class="pos-tag ${cls}">${escHtml(p)}</span>`
  }).join('')
}

function renderPagination(page, totalPages) {
  const pag = document.getElementById('pagination')
  if (totalPages <= 1) { pag.innerHTML = ''; return }

  const pages = []
  const lo = Math.max(1, page - 2)
  const hi = Math.min(totalPages, page + 2)
  if (lo > 1) { pages.push(1); if (lo > 2) pages.push('…') }
  for (let i = lo; i <= hi; i++) pages.push(i)
  if (hi < totalPages) { if (hi < totalPages - 1) pages.push('…'); pages.push(totalPages) }

  pag.innerHTML = `
    <button class="page-btn" id="pg-prev" ${page <= 1 ? 'disabled' : ''}>◀</button>
    ${pages.map(p => p === '…'
      ? `<span class="page-ellipsis">…</span>`
      : `<button class="page-btn ${p === page ? 'active' : ''}" data-page="${p}">${p}</button>`
    ).join('')}
    <button class="page-btn" id="pg-next" ${page >= totalPages ? 'disabled' : ''}>▶</button>
  `

  pag.querySelector('#pg-prev')?.addEventListener('click', () => { state.dictPage--; fetchEntries() })
  pag.querySelector('#pg-next')?.addEventListener('click', () => { state.dictPage++; fetchEntries() })
  pag.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => { state.dictPage = parseInt(btn.dataset.page); fetchEntries() })
  })
}

// ── Add word button ──────────────────────────────────────────────────────────

document.getElementById('btn-add-word').addEventListener('click', () => {
  openEditOverlay('add', state.currentLang ?? 'en', '', [])
})

document.getElementById('btn-import-dict').addEventListener('click', () => {
  post({ type: 'importDictFile' })
})

document.getElementById('btn-export-current').addEventListener('click', () => {
  if (!state.lastAnnotatedWords.length) { showToast(t('toastNoAnnotated'), 'warn'); return }
  post({ type: 'exportCurrentDoc' })
})

// ── Community dict upload ─────────────────────────────────────────────────────

document.getElementById('btn-upload-dict').addEventListener('click', () => {
  document.getElementById('upload-dict-name').value = ''
  document.getElementById('upload-dict-lang').value = 'en'
  document.getElementById('upload-overlay').style.display = 'flex'
  document.getElementById('upload-dict-name').focus()
})

document.getElementById('upload-dict-cancel').addEventListener('click', () => {
  document.getElementById('upload-overlay').style.display = 'none'
})

document.getElementById('upload-dict-confirm').addEventListener('click', () => {
  const name = document.getElementById('upload-dict-name').value.trim()
  if (!name) { showToast(t('toastEnterDictName'), 'warn'); return }
  const lang = document.getElementById('upload-dict-lang').value
  document.getElementById('upload-overlay').style.display = 'none'
  post({ type: 'uploadCommunityDict', name, lang })
})

// ── Edit overlay ─────────────────────────────────────────────────────────────

const POS_BUTTONS = [
  { pos: 'n',     labelKey: 'posN' },    { pos: 'v',     labelKey: 'posV' },
  { pos: 'adj',   labelKey: 'posAdj' },   { pos: 'adv',   labelKey: 'posAdv' },
  { pos: 'prep',  labelKey: 'posPrep' },  { pos: 'conj',  labelKey: 'posConj' },
  { pos: 'pron',  labelKey: 'posPron' },  { pos: 'num',   labelKey: 'posNum' },
  { pos: 'mw',    labelKey: 'posMw' },    { pos: 'interj',labelKey: 'posInterj' },
  { pos: 'part',  labelKey: 'posPart' },  { pos: 'aux',   labelKey: 'posAux' },
]

function openEditOverlay(mode, lang, word, pos) {
  state.editMode = mode
  state.editLang = lang
  state.editWord = word
  state.editPos  = [...pos]

  document.getElementById('overlay-title').textContent = mode === 'add' ? t('addTitle') : t('editTitle')
  const newWordRow = document.getElementById('overlay-new-word-row')
  const wordDisplay = document.getElementById('overlay-word-display')
  if (mode === 'add') {
    newWordRow.style.display = 'block'
    wordDisplay.style.display = 'none'
    document.getElementById('overlay-new-word').value = ''
  } else {
    newWordRow.style.display = 'none'
    wordDisplay.style.display = 'block'
    wordDisplay.textContent = word
  }

  // Render pos grid
  const grid = document.getElementById('pos-grid')
  grid.innerHTML = POS_BUTTONS.map(b => `
    <button class="pos-grid-btn ${state.editPos.includes(b.pos) ? 'selected' : ''}" data-pos="${b.pos}">${t(b.labelKey)}</button>
  `).join('')
  grid.querySelectorAll('.pos-grid-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.pos
      if (state.editPos.includes(p)) state.editPos = state.editPos.filter(x => x !== p)
      else state.editPos.push(p)
      btn.classList.toggle('selected', state.editPos.includes(p))
      renderSelectedPos()
    })
  })

  renderSelectedPos()
  document.getElementById('edit-overlay').style.display = 'flex'
  if (mode === 'add') document.getElementById('overlay-new-word').focus()
}

function renderSelectedPos() {
  const row = document.getElementById('selected-pos-row')
  row.innerHTML = state.editPos.map(p => `
    <span class="sel-tag">${p} <span class="sel-tag-remove" data-pos="${p}">×</span></span>
  `).join('')
  row.querySelectorAll('.sel-tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      state.editPos = state.editPos.filter(x => x !== btn.dataset.pos)
      // Deselect the grid button too
      document.querySelector(`.pos-grid-btn[data-pos="${btn.dataset.pos}"]`)?.classList.remove('selected')
      renderSelectedPos()
    })
  })
  // Enable/disable save button
  document.getElementById('overlay-save').disabled = state.editPos.length === 0
}

document.getElementById('overlay-save').addEventListener('click', () => {
  if (state.editPos.length === 0) return
  let word = state.editWord
  if (state.editMode === 'add') {
    word = document.getElementById('overlay-new-word').value.trim().toLowerCase()
    if (!word) { document.getElementById('overlay-new-word').focus(); return }
  }
  post({
    type: 'addOrEditWord',
    lang: state.editLang,
    word,
    pos: state.editPos,
    search: state.dictSearch,
    page: state.dictPage,
    pageSize: state.dictPageSize,
  })
  document.getElementById('edit-overlay').style.display = 'none'
})

document.getElementById('overlay-cancel').addEventListener('click', () => {
  document.getElementById('edit-overlay').style.display = 'none'
})

// ── AI Judge ───────────────────────────────────────────────────────────────────

document.getElementById('btn-ai-judge').addEventListener('click', () => {
  if (state.aiJudging) return
  let word = state.editWord
  if (state.editMode === 'add') {
    word = document.getElementById('overlay-new-word').value.trim().toLowerCase()
    if (!word) { showToast(t('toastEnterWord'), 'warn'); return }
  }
  state.aiJudging = true
  const btn = document.getElementById('btn-ai-judge')
  btn.disabled = true
  btn.classList.add('loading')
  btn.innerHTML = ICONS.get('sparkles', 12) + ' ' + t('btnAiJudging')
  post({ type: 'aiJudge', word })
})

// ── Settings tab ─────────────────────────────────────────────────────────────

document.getElementById('cfg-enabled').addEventListener('change', e => {
  post({ type: 'updateConfig', key: 'enabled', value: e.target.checked })
})
document.getElementById('cfg-locale').addEventListener('change', e => {
  post({ type: 'updateConfig', key: 'locale', value: e.target.value })
})
document.getElementById('cfg-decoration-style').addEventListener('change', e => {
  post({ type: 'updateConfig', key: 'decorationStyle', value: e.target.value })
})
document.getElementById('cfg-min-word-length').addEventListener('change', e => {
  const v = parseInt(e.target.value)
  if (!isNaN(v) && v >= 1) post({ type: 'updateConfig', key: 'minWordLength', value: v })
})
document.getElementById('cfg-highlight-comments').addEventListener('change', e => {
  post({ type: 'updateConfig', key: 'highlightInComments', value: e.target.checked })
})

// Intensity slider (may not exist if HTML was reverted)
const fsSlider = document.getElementById('cfg-font-size')
if (fsSlider) {
  fsSlider.addEventListener('input', e => {
    const v = parseFloat(e.target.value)
    const label = document.getElementById('cfg-font-size-label')
    if (label) label.textContent = v.toFixed(2) + '×'
  })
  fsSlider.addEventListener('change', e => {
    const v = parseFloat(e.target.value)
    post({ type: 'updateConfig', key: 'highlightFontSize', value: v })
  })
}

// ── AI Settings ─────────────────────────────────────────────────────────────────

document.getElementById('cfg-ai-enabled').addEventListener('change', e => {
  post({ type: 'updateConfig', key: 'aiEnabled', value: e.target.checked })
})

document.getElementById('btn-add-provider').addEventListener('click', () => {
  state.aiProviders.push({
    name: t('providerNewName'), apiUrl: 'https://api.openai.com/v1/chat/completions',
    apiKey: '', model: 'gpt-4o-mini', isPrimary: state.aiProviders.length === 0,
  })
  renderProvidersList()
  showSaveBtn()
})

document.getElementById('btn-save-providers').addEventListener('click', saveProviders)

function renderProvidersList() {
  const container = document.getElementById('ai-providers-list')
  container.innerHTML = state.aiProviders.map((p, i) => {
    const hasKey = p.apiKey ? t('badgeConfigured') : t('badgeNotConfigured')
    const primaryBadge = p.isPrimary ? '<span class="provider-badge primary">' + t('badgePrimary') + '</span>' : ''
    return `<div class="provider-card">
      <div class="provider-card-header">
        <label class="provider-radio" title="${t('providerRadioTitle')}">
          <input type="radio" name="ai-primary" ${p.isPrimary ? 'checked' : ''} data-idx="${i}" />
        </label>
        <span class="provider-card-name">${escHtml(p.name)}</span>
        <span class="provider-card-status">${primaryBadge}<span class="provider-badge ${p.apiKey ? 'ok' : ''}">${hasKey}</span></span>
        <button class="provider-card-toggle" data-idx="${i}">▼</button>
        <button class="provider-card-del" data-idx="${i}">×</button>
      </div>
      <div class="provider-card-body" id="provider-body-${i}" style="display:none">
        <div class="provider-field">
          <label>${t('providerFieldName')}</label>
          <input type="text" class="provider-input" data-idx="${i}" data-field="name" value="${escHtml(p.name)}" />
        </div>
        <div class="provider-field">
          <label>${t('providerFieldApiUrl')}</label>
          <input type="text" class="provider-input" data-idx="${i}" data-field="apiUrl" value="${escHtml(p.apiUrl)}" />
        </div>
        <div class="provider-field">
          <label>${t('providerFieldApiKey')}</label>
          <input type="password" class="provider-input" data-idx="${i}" data-field="apiKey" value="${escHtml(p.apiKey)}" />
        </div>
        <div class="provider-field">
          <label>${t('providerFieldModel')}</label>
          <input type="text" class="provider-input" data-idx="${i}" data-field="model" value="${escHtml(p.model)}" />
        </div>
      </div>
    </div>`
  }).join('')

  // Toggle card body
  container.querySelectorAll('.provider-card-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const body = document.getElementById(`provider-body-${btn.dataset.idx}`)
      body.style.display = body.style.display === 'none' ? 'block' : 'none'
      btn.textContent = body.style.display === 'none' ? '▼' : '▲'
    })
  })

  // Delete provider
  container.querySelectorAll('.provider-card-del').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.aiProviders.length <= 1) { showToast(t('toastKeepOneProvider'), 'warn'); return }
      state.aiProviders.splice(parseInt(btn.dataset.idx), 1)
      // Fix isPrimary if the primary was removed
      if (!state.aiProviders.some(p => p.isPrimary) && state.aiProviders.length > 0) {
        state.aiProviders[0].isPrimary = true
      }
      renderProvidersList()
      showSaveBtn()
    })
  })

  // Primary radio
  container.querySelectorAll('input[name="ai-primary"]').forEach(radio => {
    radio.addEventListener('change', () => {
      state.aiProviders.forEach((p, i) => { p.isPrimary = i === parseInt(radio.dataset.idx) })
      renderProvidersList()
      showSaveBtn()
    })
  })

  // Inline field edit
  container.querySelectorAll('.provider-input').forEach(input => {
    let timer = null
    input.addEventListener('input', () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const idx = parseInt(input.dataset.idx)
        const field = input.dataset.field
        state.aiProviders[idx][field] = input.value
        showSaveBtn()
      }, 300)
    })
  })
}

function showSaveBtn() {
  document.getElementById('btn-save-providers').style.display = 'inline-block'
}

function saveProviders() {
  const raw = JSON.stringify(state.aiProviders)
  post({ type: 'updateConfig', key: 'aiProviders', value: raw })
  document.getElementById('btn-save-providers').style.display = 'none'
  showToast(t('toastProvidersSaved'), 'info')
}

function applyConfig(cfg) {
  document.getElementById('cfg-enabled').checked = cfg.enabled
  document.getElementById('cfg-decoration-style').value = cfg.decorationStyle ?? 'color'
  document.getElementById('cfg-min-word-length').value = cfg.minWordLength
  document.getElementById('cfg-highlight-comments').checked = cfg.highlightInComments

  // ── Locale 必须先设置，后续 renderDictList/renderProvidersList 使用 t() 才能读到正确语言 ──
  const localeEl = document.getElementById('cfg-locale')
  if (localeEl) localeEl.value = cfg.locale ?? 'auto'
  const hiddenLocale = document.getElementById('__adhd-locale')
  if (hiddenLocale) hiddenLocale.setAttribute('data-value', cfg.locale ?? 'auto')
  setLanguage(cfg.locale === 'auto' ? detectLanguage() : cfg.locale)
  injectStaticIcons()

  // AI config
  document.getElementById('cfg-ai-enabled').checked = cfg.aiEnabled ?? true
  if (cfg.aiProviders && cfg.aiProviders.length > 0) {
    state.aiProviders = cfg.aiProviders.map(p => ({ ...p }))
    renderProvidersList()
  }
  document.getElementById('btn-save-providers').style.display = 'none'
  // Dict disabled state
  state.disabledDicts = cfg.disabledDicts || []
  if (state.dictList.length > 0) renderDictList(state.dictList)
  // Intensity slider (may not exist if HTML was reset)
  const fsSlider = document.getElementById('cfg-font-size')
  if (fsSlider) {
    const fs = cfg.highlightFontSize ?? 1.0
    fsSlider.value = fs
    const label = document.getElementById('cfg-font-size-label')
    if (label) label.textContent = fs.toFixed(2) + '×'
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────

let toastTimer = null
function showToast(msg, level = 'info') {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.className = `toast ${level !== 'info' ? level : ''}`
  el.style.display = 'block'
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { el.style.display = 'none' }, 2500)
}

// ── Message handler ───────────────────────────────────────────────────────────

window.addEventListener('message', e => {
  const msg = e.data
  switch (msg.type) {

    case 'annotationResult':
      state.words = msg.words
      state.fileName = msg.fileName
      state.lastAnnotatedWords = msg.words
      state.lastAnnotatedFile  = msg.fileName
      buildWordFrequency()
      // Show save-dict button when there are annotated words
      document.getElementById('save-dict-bar').style.display = msg.words.length > 0 ? 'block' : 'none'
      break

    case 'dictList':
      state.dictList = msg.dicts
      renderDictList(msg.dicts)
      renderBuiltinDicts(msg.dicts)
      break

    case 'dictEntries':
      renderEntries(msg.entries, msg.total, msg.page, msg.totalPages)
      break

    case 'config':
      applyConfig(msg.config)
      // Sync posFilter chips with config
      if (msg.config.posFilter) {
        state.posFilter = new Set(msg.config.posFilter)
        document.querySelectorAll('#pos-chips .chip').forEach(chip => {
          chip.classList.toggle('active', state.posFilter.has(chip.dataset.pos))
        })
        buildWordFrequency()
      }
      break

    case 'communityDictList':
      renderCommunityDicts(msg.dicts)
      break

    case 'userDictList':
      renderUserDicts(msg.dicts)
      break

    case 'projectFileList': {
      state.batch.projectFiles = msg.files || []
      state.batch.workspacePath = msg.workspacePath || ''
      // Select all by default
      state.batch.selectedFiles = new Set(msg.files || [])
      renderProjectFileTree()
      break
    }

    case 'toast':
      showToast(msg.message, msg.level)
      break

    case 'aiJudgeResult': {
      // Reset AI button state
      state.aiJudging = false
      const btn = document.getElementById('btn-ai-judge')
      btn.disabled = false
      btn.classList.remove('loading')
      btn.innerHTML = ICONS.get('sparkles', 12) + ' ' + t('btnAiJudge')
      // Auto-select returned POS tags
      if (msg.pos && msg.pos.length > 0) {
        state.editPos = msg.pos
        // Update grid button selections
        document.querySelectorAll('.pos-grid-btn').forEach(el => {
          el.classList.toggle('selected', state.editPos.includes(el.dataset.pos))
        })
        renderSelectedPos()
        showToast(t('aiJudgeToast')(msg.providerName || '?', msg.word, msg.pos.join(', ')), 'info')
      }
      break
    }

    // ── Batch processing ──────────────────────────────────────────────────

    case 'batchProgress': {
      state.batch.processing = !msg.cancelled && msg.completed < msg.total
      state.batch.total = msg.total
      state.batch.completed = msg.completed
      renderBatchProgress(msg)
      if (msg.cancelled) {
        showToast(t('batchCancel'), 'warn')
      }
      break
    }

    case 'batchFileDone': {
      // Find or create file result
      let existing = state.batch.files.find(f => f.filePath === msg.filePath)
      if (existing) {
        existing.words = msg.words
        existing.wordCount = msg.wordCount
      } else {
        state.batch.files.push({
          filePath: msg.filePath,
          fileName: msg.filePath.split(/[/\\]/).pop(),
          wordCount: msg.wordCount,
          words: msg.words,
        })
      }
      renderBatchTree()
      renderBatchStats()
      renderAggregatedFrequency()
      document.getElementById('batch-export-bar').style.display = state.batch.files.length > 0 ? 'block' : 'none'
      if (state.batch.files.length > 0) switchToResultsTab()
      break
    }

    case 'batchResult': {
      state.batch.files = msg.files || []
      state.batch.processing = false
      renderBatchTree()
      renderBatchStats()
      renderAggregatedFrequency()
      document.getElementById('batch-export-bar').style.display = state.batch.files.length > 0 ? 'block' : 'none'
      if (state.batch.files.length > 0) switchToResultsTab()
      break
    }
  }
})

// ── Batch sub-tab switching ─────────────────────────────────────────

document.querySelectorAll('.batch-subtab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.batch-subtab').forEach(b => b.classList.toggle('active', b === btn))
    const view = btn.dataset.batchview
    document.getElementById('batch-view-files').style.display = view === 'files' ? 'flex' : 'none'
    document.getElementById('batch-view-results').style.display = view === 'results' ? 'flex' : 'none'
  })
})

function switchToResultsTab() {
  document.querySelectorAll('.batch-subtab').forEach(b => b.classList.remove('active'))
  document.querySelector('.batch-subtab[data-batchview="results"]')?.classList.add('active')
  document.getElementById('batch-view-files').style.display = 'none'
  document.getElementById('batch-view-results').style.display = 'flex'
}

// ── Batch rendering ─────────────────────────────────────────────────────────

function renderBatchProgress(msg) {
  const bar = document.getElementById('batch-progress-bar')
  const fill = document.getElementById('batch-progress-fill')
  const text = document.getElementById('batch-progress-text')
  const pct = msg.total > 0 ? (msg.completed / msg.total) * 100 : 0

  // Show progress bar using visibility (no layout shift)
  bar.classList.add('visible')
  fill.style.width = pct + '%'
  fill.classList.toggle('cancelled', !!msg.cancelled)
  text.textContent = t('batchProgress')(msg.completed, msg.total)

  // Hide progress on completion
  if (msg.cancelled || msg.completed >= msg.total) {
    setTimeout(() => { if (!state.batch.processing) bar.classList.remove('visible') }, 1500)
  }
}

function toRelativePath(absolutePath) {
  const wp = state.batch.workspacePath
  if (!wp) return absolutePath.replace(/\\/g, '/')
  const normalized = absolutePath.replace(/\\/g, '/')
  const normalizedWp = wp.replace(/\\/g, '/').replace(/\/+$/, '') + '/'
  if (normalized.startsWith(normalizedWp)) {
    return normalized.slice(normalizedWp.length)
  }
  return normalized
}

function buildBatchTreeData() {
  // Build hierarchical tree from flat file paths (relative to workspace root)
  const root = { name: '', children: [], files: [] }
  for (const f of state.batch.files) {
    const relPath = toRelativePath(f.filePath)
    const parts = relPath.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      let child = node.children.find(c => c.name === parts[i])
      if (!child) {
        child = { name: parts[i], children: [], files: [] }
        node.children.push(child)
      }
      node = child
    }
    node.files.push(f)
  }
  return root
}

function renderBatchTree() {
  const container = document.getElementById('batch-tree')
  const files = state.batch.files
  if (state.batch.processing && files.length === 0) {
    container.innerHTML = '<div class="empty-state">' + t('loading') + '</div>'
    return
  }
  if (!files || files.length === 0) {
    container.innerHTML = '<div class="empty-state">' + t('batchNoResults') + '</div>'
    return
  }

  // Collapsible file path list
  const collapsed = state.batch.fileListCollapsed
  const scrollTop = container.scrollTop

  let html = '<div class="batch-collapsible-section">' +
    '<div class="batch-collapsible-header" id="batch-filelist-toggle">' +
    '<span>' + (collapsed ? '▶' : '▼') + ' ' + t('batchTotalFiles')(files.length) + '</span>' +
    '</div>' +
    '<div class="batch-collapsible-body" id="batch-filelist-body" style="display:' + (collapsed ? 'none' : 'block') + '">' +
    '<div class="batch-results-path-list">'

  for (const f of files) {
    const relPath = toRelativePath(f.filePath)
    const counts = getCountsHtml(f)
    const errorHtml = f.error
      ? `<span class="batch-file-error"> ${ICONS.get('alertCircle', 11)} ${t('batchFileError')(escHtml(f.error))}</span>`
      : ''
    html += `<div class="batch-result-row" data-filepath="${escHtml(f.filePath)}">
      <span class="batch-result-path">${escHtml(relPath)}${errorHtml}</span>
      <span class="batch-file-counts">${counts}</span>
    </div>`
  }
  html += '</div></div></div>'

  container.innerHTML = html
  container.scrollTop = scrollTop

  // Toggle collapse
  const toggle = document.getElementById('batch-filelist-toggle')
  if (toggle) {
    toggle.addEventListener('click', () => {
      state.batch.fileListCollapsed = !state.batch.fileListCollapsed
      renderBatchTree()
    })
  }

  container.querySelectorAll('.batch-result-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.batch-collapsible-header')) return
      post({ type: 'batchOpenFile', filePath: row.dataset.filepath })
    })
  })
}

function getCountsHtml(fileResult) {
  if (fileResult.error) return ''
  const posCounts = {}
  for (const w of fileResult.words) {
    const key = w.colorClass.replace('pos-', '')
    posCounts[key] = (posCounts[key] || 0) + 1
  }
  const parts = []
  if (posCounts.n) parts.push(`n:${posCounts.n}`)
  if (posCounts.v) parts.push(`v:${posCounts.v}`)
  if (posCounts.a) parts.push(`a:${posCounts.a}`)
  if (posCounts.other) parts.push(`${t('posLabelOther')}:${posCounts.other}`)
  return parts.join(' ')
}

function renderBatchStats() {
  const files = state.batch.files
  if (!files || files.length === 0) {
    document.getElementById('batch-stats').style.display = 'none'
    return
  }
  document.getElementById('batch-stats').style.display = 'block'
  let success = 0
  let errors = 0
  for (const f of files) {
    if (f.error) errors++
    else success++
  }
  document.getElementById('batch-stats-total').textContent = t('batchTotalFiles')(files.length)
  document.getElementById('batch-stats-success').textContent = t('batchSuccessCount')(success)
  document.getElementById('batch-stats-errors').textContent = t('batchErrorCount')(errors)
  document.getElementById('batch-stats-errors').style.display = errors > 0 ? 'inline' : 'none'
}

function getAggregatedWords() {
  const freqMap = new Map()
  for (const f of state.batch.files) {
    if (f.error) continue
    const seen = new Set()
    for (const w of f.words) {
      const existing = freqMap.get(w.word)
      if (existing) {
        if (!seen.has(w.word)) {
          existing.fileCount++
          existing.files.push(f.filePath)
          seen.add(w.word)
        }
        existing.totalCount++
      } else {
        freqMap.set(w.word, {
          word: w.word,
          pos: w.pos,
          totalCount: 1,
          fileCount: 1,
          files: [f.filePath],
        })
        seen.add(w.word)
      }
    }
  }
  return [...freqMap.values()].sort((a, b) => b.fileCount - a.fileCount || b.totalCount - a.totalCount)
}

function renderAggregatedFrequency() {
  const section = document.getElementById('batch-aggregated-section')
  const files = state.batch.files
  const allWords = getAggregatedWords()
  if (!files || files.length === 0 || allWords.length === 0) {
    section.style.display = 'none'
    return
  }
  section.style.display = 'block'

  document.getElementById('batch-agg-count').textContent = t('batchMergedWords')(allWords.length)

  const pageSize = state.batch.aggPageSize
  const totalPages = Math.max(1, Math.ceil(allWords.length / pageSize))
  const page = Math.min(state.batch.aggPage, totalPages)
  const start = (page - 1) * pageSize
  const pageItems = allWords.slice(start, start + pageSize)

  document.getElementById('batch-agg-pagination-info').textContent = t('totalWords')(allWords.length) + ` · ${page}/${totalPages}`

  const list = document.getElementById('batch-agg-list')
  list.innerHTML = pageItems.map(item => {
    const posHtml = renderPosTags(item.pos.split(',').map(p => p.trim()).filter(Boolean))
    const expanded = state.batch.aggExpandedWord === item.word
    const expandHtml = expanded
      ? `<div class="batch-agg-expanded">${item.files.map(fp => ICONS.get('file', 11) + ' ' + escHtml(fp.replace(/\\/g, '/').split('/').pop())).join('<br>')}</div>`
      : ''
    return `<div class="batch-agg-row" data-word="${escHtml(item.word)}">
      <span class="batch-agg-word">${escHtml(item.word)}</span>
      <div class="pos-tags">${posHtml}</div>
      <span class="batch-agg-files">${item.fileCount} 文件 · ${item.totalCount} 次</span>
    </div>${expandHtml}`
  }).join('')

  list.querySelectorAll('.batch-agg-row').forEach(row => {
    row.addEventListener('click', () => {
      const word = row.dataset.word
      state.batch.aggExpandedWord = state.batch.aggExpandedWord === word ? null : word
      renderAggregatedFrequency()
    })
  })

  // Pagination (reuse dict's renderPagination)
  renderBatchAggPagination(page, totalPages)
}

function renderBatchAggPagination(page, totalPages) {
  const pag = document.getElementById('batch-agg-pagination')
  if (totalPages <= 1) { pag.innerHTML = ''; return }

  const pages = []
  const lo = Math.max(1, page - 2)
  const hi = Math.min(totalPages, page + 2)
  if (lo > 1) { pages.push(1); if (lo > 2) pages.push('…') }
  for (let i = lo; i <= hi; i++) pages.push(i)
  if (hi < totalPages) { if (hi < totalPages - 1) pages.push('…'); pages.push(totalPages) }

  pag.innerHTML = `
    <button class="page-btn" data-agg-page="prev" ${page <= 1 ? 'disabled' : ''}>◀</button>
    ${pages.map(p => p === '…'
      ? `<span class="page-ellipsis">…</span>`
      : `<button class="page-btn ${p === page ? 'active' : ''}" data-agg-page="${p}">${p}</button>`
    ).join('')}
    <button class="page-btn" data-agg-page="next" ${page >= totalPages ? 'disabled' : ''}>▶</button>
  `

  pag.querySelectorAll('[data-agg-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.aggPage
      if (p === 'prev') state.batch.aggPage = Math.max(1, page - 1)
      else if (p === 'next') state.batch.aggPage = Math.min(totalPages, page + 1)
      else state.batch.aggPage = parseInt(p)
      renderAggregatedFrequency()
    })
  })
}

// ── Project file tree (pre-processing view) ──────────────────────────────

function renderProjectFileTree() {
  const container = document.getElementById('batch-file-tree')
  const files = state.batch.projectFiles
  if (!files || files.length === 0) {
    container.innerHTML = '<div class="empty-state">' + t('batchNoResults') + '</div>'
    return
  }

  // Build hierarchical tree from relative paths
  const relFiles = files.map(fp => toRelativePath(fp))
  const root = { name: '', children: [], files: [] }
  for (let fi = 0; fi < relFiles.length; fi++) {
    const rp = relFiles[fi]
    const parts = rp.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      let child = node.children.find(c => c.name === parts[i])
      if (!child) {
        child = { name: parts[i], children: [], files: [] }
        node.children.push(child)
      }
      node = child
    }
    node.files.push(files[fi])  // Store full path for data attributes
  }

  // Get project root name from workspace path
  const wp = state.batch.workspacePath || ''
  const projectName = wp.replace(/\\/g, '/').split('/').filter(Boolean).pop() || '项目'

  let html = '<div class="batch-project-info">' + t('batchTotalFiles')(files.length) + '</div>'

  // Project root folder row with ⚡ to process entire project
  html += '<div class="batch-folder-row bf-folder-row bf-root-row" style="padding-left:4px">' +
    ICONS.get('folder', 12) + ' ' + escHtml(projectName) +
    '<button class="bf-process-btn" data-type="project" data-path="' + escHtml(wp) + '" title="' + t('batchProcessProject') + '">' + ICONS.get('zap', 12) + '</button>' +
    '</div>'

  // Assign expand keys to each subdirectory for toggle state
  function assignExpandKeys(node, parentKey) {
    for (const c of node.children) {
      c._expandKey = parentKey ? parentKey + '/' + c.name : c.name
      assignExpandKeys(c, c._expandKey)
    }
  }
  assignExpandKeys(root, '')

  function renderNode(node, depth) {
    const hasChildren = node.children.length > 0 || node.files.length > 0
    if (node.name) {
      const expanded = state.batch.folderExpanded[node._expandKey] !== false
      const arrow = hasChildren ? (expanded ? '▼' : '▶') : ''
      html += '<div class="bf-folder-row bf-folder-toggle" data-expand-key="' + node._expandKey + '" style="padding-left:' + (4 + depth * 12) + 'px">' +
        '<span class="bf-arrow">' + arrow + '</span>' +
        ICONS.get('folder', 12) + ' ' + escHtml(node.name) +
        '<button class="bf-process-btn" data-type="folder" data-path="' + escHtml(getFolderPath(node, depth)) + '" title="' + t('batchProcessFolder') + '">' + ICONS.get('zap', 11) + '</button>' +
        '</div>'
    }
    const expanded = node.name ? state.batch.folderExpanded[node._expandKey] !== false : true
    if (expanded) {
      for (const fp of node.files) {
        const name = fp.replace(/\\/g, '/').split('/').pop()
        html += '<div class="batch-file-row" data-filepath="' + escHtml(fp) + '" style="padding-left:' + (4 + (depth + 1) * 12) + 'px">' +
          '<span class="batch-file-name">' + escHtml(name) + '</span>' +
          '<button class="bf-process-btn" data-type="file" data-path="' + escHtml(fp) + '" title="' + t('batchProcessFile') + '">' + ICONS.get('zap', 11) + '</button>' +
          '</div>'
      }
      for (const c of node.children) {
        renderNode(c, depth + (node.name ? 1 : 0))
      }
    }
  }

  function getFolderPath(node, depth) {
    // Reconstruct folder path by joining ancestors
    // Simple approach: check if node's files all share a common prefix
    if (node.files.length > 0) {
      const first = node.files[0]
      const parts = first.replace(/\\/g, '/').split('/')
      return parts.slice(0, parts.length - 1).join('/')
    }
    if (node.children.length > 0) {
      return getFolderPath(node.children[0], depth + 1)
    }
    return ''
  }

  root.children.sort((a, b) => a.name.localeCompare(b.name))
  for (const c of root.children) renderNode(c, 0)

  container.innerHTML = html
  container.scrollTop = 0

  // Folder toggle: click folder row to expand/collapse
  container.querySelectorAll('.bf-folder-toggle').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.bf-process-btn')) return
      const key = row.dataset.expandKey
      if (key) {
        state.batch.folderExpanded[key] = state.batch.folderExpanded[key] === false
        renderProjectFileTree()
      }
    })
  })

  // Handle ⚡ process buttons (per-file / per-folder / per-project)
  container.querySelectorAll('.bf-process-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const type = btn.dataset.type
      const path = btn.dataset.path
      if (type === 'project') {
        // Process entire project — triggers folder scan + process
        post({ type: 'processProject' })
      } else if (type === 'file') {
        post({ type: 'batchProcessFileItem', filePath: path })
      } else if (type === 'folder') {
        post({ type: 'batchProcessFolderItem', filePath: path })
      }
    })
  })

  // Handle file row click (open file in editor)
  container.querySelectorAll('.batch-file-row').forEach(row => {
    row.addEventListener('click', () => {
      const fp = row.dataset.filepath
      if (fp) post({ type: 'batchOpenFile', filePath: fp })
    })
  })

  // Handle select all
  const selectAll = document.getElementById('batch-select-all')
  if (selectAll) {
    selectAll.addEventListener('change', () => {
      if (selectAll.checked) {
        state.batch.selectedFiles = new Set(state.batch.projectFiles)
      } else {
        state.batch.selectedFiles = new Set()
      }
      renderProjectFileTree()
    })
  }
}

// ── Batch event listeners ────────────────────────────────────────────────────

document.getElementById('btn-batch-clear').addEventListener('click', () => {
  state.batch.files = []
  state.batch.processing = false
  state.batch.aggPage = 1
  document.getElementById('batch-progress-bar').classList.remove('visible')
  document.getElementById('batch-stats').style.display = 'none'
  document.getElementById('batch-aggregated-section').style.display = 'none'
  document.getElementById('batch-export-bar').style.display = 'none'
  document.getElementById('batch-tree').innerHTML = '<div class="empty-state">' + t('batchNoResults') + '</div>'
  // Switch back to files view
  document.querySelectorAll('.batch-subtab').forEach(b => b.classList.remove('active'))
  document.querySelector('.batch-subtab[data-batchview="files"]')?.classList.add('active')
  document.getElementById('batch-view-files').style.display = 'flex'
  document.getElementById('batch-view-results').style.display = 'none'
  if (state.batch.projectFiles.length > 0) {
    renderProjectFileTree()
  }
  post({ type: 'batchClear' })
})

document.getElementById('btn-batch-cancel').addEventListener('click', () => {
  post({ type: 'batchCancel' })
})

document.getElementById('btn-batch-export-all').addEventListener('click', () => {
  post({ type: 'batchExportAll' })
})

// Aggregated frequency collapsible toggle
document.getElementById('batch-agg-toggle').addEventListener('click', () => {
  const body = document.getElementById('batch-agg-body')
  const isVisible = body.style.display !== 'none'
  body.style.display = isVisible ? 'none' : 'block'
  document.getElementById('batch-agg-toggle').querySelector('span:first-child').textContent =
    (isVisible ? '▶' : '▼') + ' ' + t('batchAggregated')
})

// Aggregated frequency page size buttons
document.querySelectorAll('#batch-aggregated-section .ps-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.parentElement.querySelectorAll('.ps-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    state.batch.aggPageSize = parseInt(btn.dataset.size)
    state.batch.aggPage = 1
    renderAggregatedFrequency()
  })
})

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ── Init ──────────────────────────────────────────────────────────────────────

// Init i18n language detection
window.__ADHD_LANG = detectLanguage()
// Apply i18n to static HTML elements
applyI18n()

// Inject SVG icons into static elements that previously had emoji
function injectStaticIcons() {
  // Batch subtabs: prepend SVG before label text
  const batchFilesBtn = document.querySelector('.batch-subtab[data-batchview="files"]')
  const batchResultsBtn = document.querySelector('.batch-subtab[data-batchview="results"]')
  if (batchFilesBtn && !batchFilesBtn.querySelector('svg')) {
    batchFilesBtn.innerHTML = ICONS.get('folder', 12) + ' ' + batchFilesBtn.textContent.trim()
  }
  if (batchResultsBtn && !batchResultsBtn.querySelector('svg')) {
    batchResultsBtn.innerHTML = ICONS.get('barChart3', 12) + ' ' + batchResultsBtn.textContent.trim()
  }

  // AI judge button: prepend sparkles SVG
  const aiBtn = document.getElementById('btn-ai-judge')
  if (aiBtn && !aiBtn.querySelector('svg')) {
    aiBtn.innerHTML = ICONS.get('sparkles', 12) + ' ' + aiBtn.textContent.trim()
  }
}
injectStaticIcons()

// Tell extension we're ready
post({ type: 'ready' })
