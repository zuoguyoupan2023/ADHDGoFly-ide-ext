/**
 * i18n — minimal translation table for ADHDGoFly side panel.
 * Detects VS Code language from <html lang> attribute.
 * Plain JS — NO TypeScript annotations.
 */

var TRANSLATIONS = {
  zh: {
    tabAnnotate: '标注', tabDicts: '词典', tabSettings: '设置',
    dictInstalled: '安装', dictBuiltin: '内置', dictCommunity: '社区', dictUser: '自建',
    wordList: '词汇列表', emptyAnnotate: '打开一个 .md 或 .txt 文件，词汇频率将显示在这里。',
    sectionInstalled: '已安装词典', sectionBuiltin: '内置词典',
    sectionCommunity: '社区词典', sectionUser: '自建词典',
    emptyInstalled: '暂无词典', emptyBuiltin: '无内置词典',
    emptyUser: '暂无自建词典。从标注 Tab 保存词汇即可创建。',
    emptyCommunity: '暂无可用社区词典',
    emptySearch: '无匹配词汇',
    loading: '加载中...',
    settingsHighlight: '高亮设置', settingsAi: 'AI 词性判定',
    settingEnabled: '启用高亮', settingStyle: '标注模式', settingMinWord: '最小词长',
    settingComment: '注释中标注', settingIntensity: '高亮强度',
    styleColor: '文字变色', styleHighlight: '色框',
    settingAiEnabled: '启用 AI 判定',
    btnImport: '+ 导入', btnExport: '导出当前文档词汇',
    btnUpload: '+ 上传', btnRefresh: '↻', btnBack: '← 返回', btnAddWord: '+ 新增',
    btnSave: '保存', btnCancel: '取消', btnConfirm: '确认上传',
    btnView: '查看', btnDelete: '删除', btnExportDict: '导出', btnUninstall: '卸载', btnInstall: '安装',
    btnAddProvider: '+ 添加提供商', btnSaveProviders: '保存提供商设置',
    btnAiJudge: 'AI 判定', btnAiJudging: '判定中...',
    searchPlaceholder: '搜索词汇...',
    editTitle: '编辑词性', addTitle: '新增词汇', inputWord: '输入词汇...', selectPos: '选择词性',
    saveAsDict: '+ 保存为自建词典',
    saveDictTitle: '保存为自建词典', saveDictName: '词典名称', saveDictLang: '语言', btnSaveDict: '保存',
    uploadDictTitle: '上传词典到社区', uploadDictName: '词典名称', uploadDictLang: '词典语言',
    uploadDesc: '将上传当前已编辑的所有词典数据（含手动修改和新增的词条）',
    sortFreq: '频率↓', sortAlpha: 'A→Z', sortPos: '词性',
    totalWords: (n) => `共 ${n.toLocaleString()} 词`,
    wordCount: (n) => `${n.toLocaleString()} 词`,
    installedBadge: '✓ 已安装',
    authorLabel: (a) => `作者：${a}`,
    badgeBuiltin: '内', badgeCommunity: '社', badgeUser: '自',
    badgePrimary: '主用', badgeConfigured: '已配置', badgeNotConfigured: '未配置',
    providerFieldName: '名称', providerFieldApiUrl: 'API URL', providerFieldApiKey: 'API Key', providerFieldModel: 'Model',
    providerRadioTitle: '设为主用',
    toastNoWords: '没有词汇可保存',
    toastEnterDictName: '请输入词典名称',
    toastNoAnnotated: '当前文档无标注词汇',
    toastEnterWord: '请先输入词汇',
    toastProvidersSaved: 'AI 提供商设置已保存',
    toastKeepOneProvider: '至少保留一个提供商',
    confirmDeleteUserDict: (name) => `确定删除自建词典「${name}」？此操作不可恢复。`,
    confirmUninstallDict: (name) => `确定卸载「${name}」？`,
    confirmDeleteWord: (word) => `确定删除词条「${word}」？`,
    posN: 'n 名词', posV: 'v 动词', posAdj: 'adj 形容词', posAdv: 'adv 副词',
    posPrep: 'prep 介词', posConj: 'conj 连词', posPron: 'pron 代词', posNum: 'num 数词',
    posMw: 'mw 量词', posInterj: 'interj 叹词', posPart: 'part 助词', posAux: 'aux 助动词',
    posLabelN: '名', posLabelV: '动', posLabelA: '形', posLabelOther: '其他',
    tooltipEdit: '编辑',
    saveDictNamePlaceholder: '如：我的项目词汇',
    uploadDictNamePlaceholder: '输入词典名称...',
    providerNewName: '新提供商',
    aiJudgeToast: (p, word, pos) => `AI 判定 [${p}]：${word} → [${pos}]`,

    // Batch processing
    tabBatch: '批量',
    batchProcessProject: '处理整个项目',
    batchProcessFolder: '处理该文件夹',
    batchProcessFile: '处理该文件',
    batchClear: '清除',
    batchCancel: '取消',
    batchProgress: (done, total) => `已处理: ${done}/${total} 文件`,
    batchTotalFiles: (n) => `总计: ${n} 文件`,
    batchSuccessCount: (n) => `成功: ${n}`,
    batchErrorCount: (n) => `失败: ${n}`,
    batchExportAll: '导出全部为词典',
    batchAggregated: '折叠词汇频率',
    batchMergedWords: (n) => `共 ${n} 个唯一词`,
    batchNoResults: '暂无批量处理结果',
    batchLoadingTree: '正在加载项目文件...',
    batchSelectAll: '全选',
    batchViewFiles: '文件视图',
    batchViewResults: '处理结果',
    batchOpenFile: '点击文件在编辑器中打开',
    batchOverMax: (files, limit) => `项目中包含 ${files} 个受支持文件，超过限制(${limit})。`,
    batchProcessFirst100: '处理前 100 个',
    batchProcessFirst500: '处理前 500 个',
    batchProcessAll: '全部处理',
    batchExportAllTooltip: '将批量结果中的词汇合并导出为自建词典',
    batchExportFile: '导出该文件词汇',
    batchFileError: (msg) => `解析失败: ${msg}`,
  },
  en: {
    tabAnnotate: 'Annotate', tabDicts: 'Dicts', tabSettings: 'Settings',
    dictInstalled: 'Installed', dictBuiltin: 'Built-in', dictCommunity: 'Community', dictUser: 'My Dicts',
    wordList: 'Word List', emptyAnnotate: 'Open a .md or .txt file to see vocabulary frequency here.',
    sectionInstalled: 'Installed Dictionaries', sectionBuiltin: 'Built-in Dictionaries',
    sectionCommunity: 'Community Dictionaries', sectionUser: 'My Dictionaries',
    emptyInstalled: 'No dictionaries installed.', emptyBuiltin: 'No built-in dictionaries.',
    emptyUser: 'No custom dictionaries yet. Save vocabulary from the Annotate tab.',
    emptyCommunity: 'No community dictionaries available.',
    emptySearch: 'No matching words.',
    loading: 'Loading...',
    settingsHighlight: 'Highlight', settingsAi: 'AI POS Judging',
    settingEnabled: 'Enable Highlighting', settingStyle: 'Style', settingMinWord: 'Min Word Length',
    settingComment: 'Highlight Comments', settingIntensity: 'Intensity',
    styleColor: 'Text Color', styleHighlight: 'Box',
    settingAiEnabled: 'Enable AI Judge',
    btnImport: '+ Import', btnExport: 'Export Current Vocab',
    btnUpload: '+ Upload', btnRefresh: '↻', btnBack: '← Back', btnAddWord: '+ Add Word',
    btnSave: 'Save', btnCancel: 'Cancel', btnConfirm: 'Confirm Upload',
    btnView: 'View', btnDelete: 'Delete', btnExportDict: 'Export', btnUninstall: 'Uninstall', btnInstall: 'Install',
    btnAddProvider: '+ Add Provider', btnSaveProviders: 'Save Provider Settings',
    btnAiJudge: 'AI Judge', btnAiJudging: 'Judging...',
    searchPlaceholder: 'Search words...',
    editTitle: 'Edit POS', addTitle: 'Add Word', inputWord: 'Enter word...', selectPos: 'Select POS',
    saveAsDict: '+ Save as Dictionary',
    saveDictTitle: 'Save as Custom Dictionary', saveDictName: 'Dictionary Name', saveDictLang: 'Language', btnSaveDict: 'Save',
    uploadDictTitle: 'Upload to Community', uploadDictName: 'Dictionary Name', uploadDictLang: 'Language',
    uploadDesc: 'Uploads your current edited dictionary data (including manual additions and modifications).',
    sortFreq: 'Freq↓', sortAlpha: 'A→Z', sortPos: 'POS',
    totalWords: (n) => `${n.toLocaleString()} words total`,
    wordCount: (n) => `${n.toLocaleString()} words`,
    installedBadge: '✓ Installed',
    authorLabel: (a) => `Author: ${a}`,
    badgeBuiltin: 'B', badgeCommunity: 'C', badgeUser: 'U',
    badgePrimary: 'Primary', badgeConfigured: 'Configured', badgeNotConfigured: 'Not configured',
    providerFieldName: 'Name', providerFieldApiUrl: 'API URL', providerFieldApiKey: 'API Key', providerFieldModel: 'Model',
    providerRadioTitle: 'Set as primary',
    toastNoWords: 'No words to save.',
    toastEnterDictName: 'Please enter a dictionary name.',
    toastNoAnnotated: 'No annotated words in the current document.',
    toastEnterWord: 'Please enter a word first.',
    toastProvidersSaved: 'AI provider settings saved.',
    toastKeepOneProvider: 'At least one provider is required.',
    confirmDeleteUserDict: (name) => `Delete custom dictionary "${name}"? This cannot be undone.`,
    confirmUninstallDict: (name) => `Uninstall "${name}"?`,
    confirmDeleteWord: (word) => `Delete entry "${word}"?`,
    posN: 'n noun', posV: 'v verb', posAdj: 'adj adjective', posAdv: 'adv adverb',
    posPrep: 'prep preposition', posConj: 'conj conjunction', posPron: 'pron pronoun', posNum: 'num numeral',
    posMw: 'mw measure word', posInterj: 'interj interjection', posPart: 'part particle', posAux: 'aux auxiliary',
    posLabelN: 'n', posLabelV: 'v', posLabelA: 'a', posLabelOther: 'o',
    tooltipEdit: 'Edit',
    saveDictNamePlaceholder: 'e.g., My project vocab',
    uploadDictNamePlaceholder: 'Enter dictionary name...',
    providerNewName: 'New Provider',
    aiJudgeToast: (p, word, pos) => `AI judged [${p}]: ${word} → [${pos}]`,

    // Batch processing
    tabBatch: 'Batch',
    batchProcessProject: 'Process Project',
    batchProcessFolder: 'Process This Folder',
    batchProcessFile: 'Process This File',
    batchClear: 'Clear',
    batchCancel: 'Cancel',
    batchProgress: (done, total) => `Processed: ${done}/${total} files`,
    batchTotalFiles: (n) => `Total: ${n} files`,
    batchSuccessCount: (n) => `Success: ${n}`,
    batchErrorCount: (n) => `Failed: ${n}`,
    batchExportAll: 'Export All as Dict',
    batchAggregated: 'Merged Frequency',
    batchMergedWords: (n) => `${n} unique words`,
    batchNoResults: 'No batch results yet',
    batchLoadingTree: 'Loading project files...',
    batchSelectAll: 'Select All',
    batchViewFiles: 'Files',
    batchViewResults: 'Results',
    batchOpenFile: 'Click to open in editor',
    batchOverMax: (files, limit) => `Project has ${files} supported files, exceeding limit (${limit}).`,
    batchProcessFirst100: 'Process first 100',
    batchProcessFirst500: 'Process first 500',
    batchProcessAll: 'Process All',
    batchExportAllTooltip: 'Export all batch results as a custom dictionary',
    batchExportFile: 'Export file vocabulary',
    batchFileError: (msg) => `Parse failed: ${msg}`,
  },
}

function detectLanguage() {
  var localeEl = document.getElementById('__adhd-locale')
  if (localeEl) {
    var v = localeEl.getAttribute('data-value')
    if (v === 'zh' || v === 'en') return v
  }
  var html = document.documentElement
  if (html && html.lang) {
    if (html.lang.startsWith('zh')) return 'zh'
    if (html.lang.startsWith('en')) return 'en'
  }
  return 'en'
}

function t(key) {
  var lang = window.__ADHD_LANG || 'en'
  var dict = TRANSLATIONS[lang] || TRANSLATIONS.en
  return dict[key] !== undefined ? dict[key] : key
}

function applyI18n() {
  var els = document.querySelectorAll('[data-i18n]')
  for (var i = 0; i < els.length; i++) {
    var el = els[i]
    el.textContent = t(el.getAttribute('data-i18n'))
  }
  var inputs = document.querySelectorAll('[data-i18n-placeholder]')
  for (var j = 0; j < inputs.length; j++) {
    inputs[j].placeholder = t(inputs[j].getAttribute('data-i18n-placeholder'))
  }
}

function setLanguage(lang) {
  window.__ADHD_LANG = lang
  applyI18n()
}
