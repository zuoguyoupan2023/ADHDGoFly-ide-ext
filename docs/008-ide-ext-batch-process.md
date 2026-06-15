# 008 — IDE 批量文件/文件夹/项目处理规划

> **⚠️ 本文档是规划文档，功能尚未实现。** 以下内容反映截至当前的实际架构约束和设计决策。
>
> 实现前需重新确认与 `src/vscode/sidePanel.ts`、`src/highlightEngine/index.ts`、`webview/panel.html/js` 的接口对齐。

> **独立于当前"处理打开的文件"逻辑**的三级处理功能。
> 用户在文件资源管理器中右键 → 处理文件/文件夹/整个项目，结果展示在侧边栏。

---

## 一、功能概述

### 1.1 三级处理

```
┌────────────────────────────────────────────────────────┐
│  三级处理                                              │
│                                                        │
│  一级：处理指定文件                                     │
│  右键 .md/.txt 等文件 → 处理该文件（不切换编辑器）      │
│                                                        │
│  二级：处理指定文件夹                                   │
│  右键文件夹 → 递归扫描，只处理受支持的文件类型          │
│                                                        │
│  三级：处理整个项目                                     │
│  侧边栏按钮 / 命令面板 → 扫描整个 workspace            │
└────────────────────────────────────────────────────────┘
```

### 1.2 与现有逻辑的关系

| 维度 | 现有逻辑（打开的文件） | 新增逻辑（三级处理） |
|------|----------------------|---------------------|
| **触发方式** | 编辑器切换/输入变化 | 资源管理器右键菜单 |
| **目标** | 当前编辑器文档 | 任意文件/文件夹/项目 |
| **结果去向** | 编辑器实时高亮 + 侧边栏"标注"Tab | 侧边栏"批量处理"Tab（第 4 个 Tab） |
| **生命周期** | 随编辑器内容变化刷新 | 手动触发，结果持久到 session 结束 |
| **词典数据** | 共享同一份 DictionaryManager + disabledDicts | 共享同一份 DictionaryManager + disabledDicts |
| **词性配置** | 受 posFilter 影响（设置 Tab） | 应与编辑器高亮使用同一套 posFilter |

**关键原则**：两者互不干扰。三级处理不修改编辑器 decorations，只将结果存入批量结果视图。

---

## 二、VS Code 扩展入口

### 2.1 package.json 新增

```jsonc
// 新增 commands
{
  "command": "adhdgofly.processFile",
  "title": "ADHDGoFly: 处理文件"
},
{
  "command": "adhdgofly.processFolder",
  "title": "ADHDGoFly: 处理文件夹"
},
{
  "command": "adhdgofly.processProject",
  "title": "ADHDGoFly: 处理整个项目"
}
```

### 2.2 资源管理器右键菜单

```jsonc
"menus": {
  "explorer/context": [
    {
      "when": "resourceExtname =~ /\\.(md|txt|html?|py|go|js|ts|jsx|tsx)$/",
      "command": "adhdgofly.processFile",
      "group": "adhdgofly@1"
    },
    {
      "when": "explorerResourceIsFolder",
      "command": "adhdgofly.processFolder",
      "group": "adhdgofly@2"
    }
    // processProject 不放在资源管理器右键（深层文件夹也会出现）
    // 改为放在侧边栏批量处理 Tab 的按钮 + 命令面板
  ]
}
```

`processProject` 不注册到 `explorer/context`。`workspaceFolderCount > 0` 条件会让该命令出现在所有文件和文件夹的右键菜单中（包括深层子目录），不符合用户预期。改为：

- **命令面板**：输入"ADHDGoFly: 处理整个项目"触发
- **侧边栏批量 Tab**：顶部按钮"处理整个项目"

### 2.3 extension.ts 注册

```typescript
context.subscriptions.push(
  vscode.commands.registerCommand('adhdgofly.processFile', async (uri: vscode.Uri) => {
    try {
      await batchProcessor.processSingleFile(uri)
    } catch (err) {
      vscode.window.showErrorMessage('ADHDGoFly: 处理文件失败 -- ' + (err as Error).message)
    }
  }),
  vscode.commands.registerCommand('adhdgofly.processFolder', async (uri: vscode.Uri) => {
    try {
      await batchProcessor.processFolder(uri)
    } catch (err) {
      vscode.window.showErrorMessage('ADHDGoFly: 处理文件夹失败 -- ' + (err as Error).message)
    }
  }),
  vscode.commands.registerCommand('adhdgofly.processProject', async () => {
    try {
      const folders = vscode.workspace.workspaceFolders
      if (!folders) { vscode.window.showWarningMessage('未打开任何项目'); return }
      await batchProcessor.processFolder(folders[0].uri)
    } catch (err) {
      vscode.window.showErrorMessage('ADHDGoFly: 处理项目失败 -- ' + (err as Error).message)
    }
  }),
)
```

`extension.ts` 还需要在 `activate()` 中创建 `BatchProcessor` 实例，传入 `HighlightEngine`（非 `DictionaryManager` 直接，详见 3.2）。

`processProject` 命令直接复用 `processFolder`——处理整个项目本质就是处理工作区根目录，不设独立方法。`IBatchProcessor` 接口中不包含 `processProject()`。

单文件入口 `processSingleFile` 与 `processFolder` 共享配置初始化逻辑：

```typescript
// BatchProcessor 中
async processSingleFile(uri: vscode.Uri): Promise<void> {
  const config = loadConfig()
  this.engine.setDisabledDicts(config.disabledDicts || [])
  const engineConfig: EngineConfig = {
    languages: config.languages,
    minWordLength: config.minWordLength,
    posFilter: config.posFilter,
    highlightInComments: config.highlightInComments,
  }
  const result = await this.processFile(uri, engineConfig)
  this.sidePanel.sendBatchFileDone({
    filePath: result.filePath,
    words: result.words,
    wordCount: result.wordCount,
  })
}
```

---

## 三、处理引擎：BatchProcessor

### 3.1 文件扫描

```typescript
export class BatchProcessor {
  constructor(
    private engine: HighlightEngine,         // ← 传引擎而非 dictManager
    private sidePanel: SidePanelProvider,
  ) {}

  // 受支持的文件扩展名
  private supportedExts = new Set([
    '.md', '.txt', '.html', '.htm',
    '.py', '.go',
    '.js', '.ts', '.jsx', '.tsx',
  ])

  // 忽略的目录（硬编码黑名单，不读取 .gitignore）
  // 已知局限：不支持用户自定义忽略规则
  private ignoreDirs = new Set([
    'node_modules', '.git', '.svn',
    '__pycache__', '.venv', 'venv',
    'dist', 'build', '.next', '.turbo',
    'target', '.output',
  ])

  async scanFile(uri: vscode.Uri): Promise<boolean> {
    const ext = path.extname(uri.fsPath).toLowerCase()
    return this.supportedExts.has(ext)
  }

  async scanFolder(uri: vscode.Uri): Promise<vscode.Uri[]> {
    const results: vscode.Uri[] = []
    const entries = await fs.readdir(uri.fsPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(uri.fsPath, entry.name)
      if (entry.isDirectory()) {
        if (this.ignoreDirs.has(entry.name)) continue
        results.push(...await this.scanFolder(vscode.Uri.file(fullPath)))
      } else if (entry.isFile()) {
        if (this.supportedExts.has(path.extname(entry.name).toLowerCase())) {
          results.push(vscode.Uri.file(fullPath))
        }
      }
    }
    return results
  }
}
```

### 3.2 处理单个文件 — 对齐实际 HighlightEngine API

⚠️ **与旧版规划的关键区别**：实际的 `HighlightEngine.process()` 使用逐字符混排分段器（`segmentMixed`），不再是简单的 `engine.process(content, config)` 调用。

```typescript
// src/batch/types.ts
interface BatchFileResult {
  filePath: string
  fileName: string
  wordCount: number
  words: DecoratedWord[]
  error?: string
}
```

```typescript
async processFile(uri: vscode.Uri, engineConfig: EngineConfig): Promise<BatchFileResult> {
  try {
    const content = (await vscode.workspace.fs.readFile(uri)).toString()

    // ── 调用实际的 HighlightEngine.process() ────────────
    const decorated: DecoratedWord[] = this.engine.process(content, engineConfig)

    const result: BatchFileResult = {
      filePath: uri.fsPath,
      fileName: path.basename(uri.fsPath),
      wordCount: decorated.length,
      words: decorated,
    }
    this.results.set(uri.fsPath, result)
    return result
  } catch (err) {
    const result: BatchFileResult = {
      filePath: uri.fsPath,
      fileName: path.basename(uri.fsPath),
      wordCount: 0,
      words: [],
      error: (err as Error).message,
    }
    this.results.set(uri.fsPath, result)
    return result
  }
}
```

**关键点**：
- `processFile` 是纯处理函数——不关心配置加载，不推送侧边栏消息，职责单一
- `disabledDicts` 在 `processWithProgress` 入口统一设置（见 §4.1），不在每个文件重复调用
- `engineConfig` 由调用方传入，包括 `highlightInComments`（见 §4.1）
- 出错时返回带 `error` 的结果，不抛异常中断整个流程

### 3.3 并发控制（含取消）

```typescript
async processFiles(
  files: vscode.Uri[],
  engineConfig: EngineConfig,
  onFileDone: (result: BatchFileResult) => void,
  token?: vscode.CancellationToken,
): Promise<void> {
  const CONCURRENCY = 4
  let completed = 0
  const total = files.length

  const run = async (file: vscode.Uri) => {
    if (this.cancelled || token?.isCancellationRequested) return
    const result = await this.processFile(file, engineConfig)
    if (this.cancelled || token?.isCancellationRequested) return
    completed++
    onFileDone(result)    // ← 推送增量结果到侧边栏，而非在 processFile 内部
  }

  // 并发池：每次跑 CONCURRENCY 个
  let i = 0
  const next = async (): Promise<void> => {
    if (i >= files.length) return
    if (this.cancelled || token?.isCancellationRequested) return
    const idx = i++
    await run(files[idx])
    await next()
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => next()))
}
```

### 3.4 结果存储

```typescript
// 内存中，以文件路径为 key
private results: Map<string, BatchFileResult> = new Map()

// 聚合统计（注意：DecoratedWord 是按 offset 的平铺列表，
// 聚合需要按词合并、跨文件统计，是 O(n×m) 操作）
getAggregatedStats(): {
  totalFiles: number
  totalWords: number        // DecoratedWord 总数
  totalProcessed: number    // 成功数
  totalErrors: number
  wordFrequency: Map<string, { pos: string; count: number; files: string[] }>
}
```

---

## 四、进度与取消

### 4.1 双重进度反馈 + 增量结果

**策略**：每处理完一个文件，发送一次进度数字 + 该文件的结果增量（方案 A）。

```
每处理完一个文件:
  Extension → Webview:
    { type: 'batchProgress',   completed: n, total: N }      // 50 bytes — 更新进度条
    { type: 'batchFileDone',   filePath, words, wordCount }  // ~20KB — 追加到树形视图

完成时:
  Extension → Webview:
    { type: 'batchResult', files: BatchFileResult[] }        // 可选，Webview 已有全部数据
```

```typescript
async processWithProgress(files: vscode.Uri[]): Promise<void> {
  const total = files.length
  if (total === 0) {
    vscode.window.showInformationMessage('ADHDGoFly: 没有找到受支持的文件')
    return
  }

  // ── 预处理：统一配置，只做一次 ──────────────────────
  const config = loadConfig()
  this.engine.setDisabledDicts(config.disabledDicts || [])    // ← 只设一次，不在每个文件重复
  const engineConfig: EngineConfig = {
    languages: config.languages,
    minWordLength: config.minWordLength,
    posFilter: config.posFilter,
    highlightInComments: config.highlightInComments,          // ← 代码文件注释高亮
  }

  // 通知栏进度（cancellable）
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'ADHDGoFly: 处理文件中...',
    cancellable: true,
  }, async (_progress, token) => {
    // 初始状态
    this.sidePanel.sendBatchProgress({ completed: 0, total })

    await this.processFiles(files, engineConfig, (result) => {
      const done = this.results.size
      // 每文件一条：进度数字
      _progress.report({ message: `${done}/${total}` })
      this.sidePanel.sendBatchProgress({ completed: done, total })
      // 每文件一条：增量结果（不重复发送全量）
      this.sidePanel.sendBatchFileDone({
        filePath: result.filePath,
        words: result.words,
        wordCount: result.wordCount,
      })
    }, token)

    // 完成/取消
    if (token.isCancellationRequested) {
      this.sidePanel.sendBatchProgress({ completed: this.results.size, total, cancelled: true })
    } else {
      this.sidePanel.sendBatchResult([...this.results.values()])
    }
  })
}
```

### 4.2 取消 — P0 功能

取消功能是 **P0**（不是 P2）。用户处理大文件夹时必须有中断能力：

- `vscode.window.withProgress` 自带 `cancellable: true` 和 `token.isCancellationRequested`
- 并发池每次 `run` 前检查 `token.isCancellationRequested`（已在 §3.3 接入）
- 侧边栏进度条同时显示"取消"按钮，点击后发 `{ type: 'batchCancel' }` → `extension.ts` 调用 `batchProcessor.cancel()`
- `cancel()` 设一个 flag，`processFiles` 的每次迭代额外检查该 flag

```typescript
private cancelled = false

cancel(): void {
  this.cancelled = true
}

async processFiles(files, engineConfig, onFileDone, token): Promise<void> {
  this.cancelled = false
  // ...并发池中额外检查 this.cancelled
  // 实际 run 内检查: if (this.cancelled || token?.isCancellationRequested) return
}
```

> 使用简单 boolean flag 而非 `AbortController`，避免与 `withProgress` 的 `CancellationToken` 两套机制打架。

### 4.3 大项目保护

超出限制时提供更多选项：

```typescript
const MAX_FILES = 500

async processFolder(uri: vscode.Uri): Promise<void> {
  const files = await this.scanFolder(uri)
  if (files.length > MAX_FILES) {
    const choice = await vscode.window.showWarningMessage(
      `项目中包含 ${files.length} 个受支持文件，超过限制(${MAX_FILES})。`,
      { modal: true },
      '处理前 100 个', '处理前 500 个', '全部处理', '取消'
    )
    if (choice === '取消' || !choice) return
    if (choice === '处理前 100 个') files.length = 100
    else if (choice === '处理前 500 个') files.length = 500
    // '全部处理' → 不限制
  }
  await this.processWithProgress(files)
}
```

---

## 五、侧边栏批量结果视图

### 5.1 新 Tab：Batch Results

**当前侧边栏已有 3 个 Tab**（`panel.html:15-18`）：`标注` | `词典` | `设置`。

批量处理将是第 **4 个 Tab**（插入在"词典"和"设置"之间，保持功能分组）：

```
┌─────────────────────┐
│ 标注 | 词典 | 批量 | 设置│  ← 第 4 个 tab
├─────────────────────┤
│ [处理整个项目]  [清除] │  ← 操作按钮
├─────────────────────┤
│ 📁 项目名            │
│  ├─ README.md       │  ← 文件列表（树形）
│  │   n: 12  v: 8   │  ← 词性统计
│  │                  │     出错文件用 ⚠️ 标记 + 红色文字
│  ├─ src/            │
│  │  ├─ index.ts     │
│  │  │   n: 45 v: 23 │
│  │  └─ utils.ts     │  ← 出错 → ⚠️ utils.ts  解析失败: xxx
│  └─ docs/           │
│     └─ guide.md     │
│         n: 6  v: 2  │
├─────────────────────┤
│ 进度: ████████░░ 50% │  ← 处理中实时显示
│ 已处理: 12/24 文件   │
│ (点击「取消」中断)    │
├─────────────────────┤
│ 总计: 12 文件        │
│       成功: 11       │
│       失败: 1 ⚠️     │
│       n: 71 v: 36  │
│       adj: 12 ...   │
├─────────────────────┤
│ [导出全部为词典]      │
│ [合并词汇频率 ▼]     │  ← 可折叠区域，聚合视图需分页
└─────────────────────┘
```

### 5.2 Webview panel.js 扩展

新增消息类型（注意消息方向约定与现有代码一致）：

```typescript
// Extension → Webview（扩展主动推送）
{ type: 'batchProgress',  completed: number, total: number, cancelled?: boolean }
{ type: 'batchFileDone',  filePath: string, words: DecoratedWord[], wordCount: number }
{ type: 'batchResult',    files: BatchFileResult[] }

// Webview → Extension（用户操作触发）
{ type: 'batchOpenFile',   filePath: string }       // 点击文件 → 打开编辑器
{ type: 'batchExportAll' }
{ type: 'batchExportFile', filePath: string }
{ type: 'batchCancel' }                              // 侧边栏取消按钮
{ type: 'batchClear' }                               // 清除当前结果
```

### 5.3 词汇合并汇总

```
批量结果界面底部（可折叠区域）：
  合并词汇频率（所有文件去重汇总）

  ┌───────────────────────────────────┐
  │ ▼ 合并词汇频率（共 342 个唯一词）  │  ← 可折叠
  ├───────────────────────────────────┤
  │ [25] [50] [100]       第 1 / 14 页│  ← 分页控件
  ├───────────────────────────────────┤
  │ 词        | 词性 | 出现文件数     │
  │──────────|──────|──────────────│
  │ implement | v    | 3 个文件       │
  │ function  | n    | 5 个文件       │
  │ 实现      | v    | 2 个文件       │
  │ ...                               │
  ├───────────────────────────────────┤
  │ ◀ 1 2 3 ... 14 ▶                  │
  └───────────────────────────────────┘
  点击行 → 展开显示出现在哪些文件的哪些行
```

**聚合视图必须分页**：500 个文件 × 1000+ 去重词汇时，一次性渲染所有 DOM 节点会卡死 Webview。复用现有词典管理 Tab 的分页模式（25/50/100 条目/页）。

**类型转换注意**：`DecoratedWord[]`（按 offset 平铺）→ 聚合模型 `{ pos: string; count: number; files: string[] }` 需要 O(n×m) 的归并操作，大项目时有明显计算开销（~100ms 级）。若需异步计算，注意 Webview CSP 限制（见注意事项第 12 条）。

---

## 六、数据流图

```
用户右键文件
     │
     ▼
extension.ts (command handler)
     │
     ├─ scanFile() / scanFolder()
     │     │
     │     ▼
     │  vscode.workspace.fs.readFile()
     │     │
     │     ▼
     │  loadConfig() → { languages, minWordLength, posFilter, disabledDicts }
     │     │
     │     ├─ engine.setDisabledDicts(config.disabledDicts)  ← 同步禁用词典
     │     │
     │     ▼
     │  engine.process(content, {
     │    languages: config.languages,
     │    minWordLength: config.minWordLength,
     │    posFilter: config.posFilter,       ← 尊重用户词性过滤
     │    highlightInComments: config.highlightInComments,  ← 代码注释高亮
     │  })
     │  (HighlightEngine → segmentMixed → matchSegments)
     │     │
     │     ▼
     │  BatchFileResult { filePath, words, wordCount, error? }
     │     │
     │     ▼
     │  this.results.set(filePath, result)
     │     │
     │     ├─ sidePanel.sendBatchFileDone({ filePath, words })  ← 每文件增量
     │     ├─ sidePanel.sendBatchProgress({ completed, total })  ← 每文件进度
     │     │
     │     ▼
     │  (完成时) sidePanel.sendBatchResult(allResults)
     │     │
     │     ▼
     │  webview panel.js → 渲染批量结果树
     │
     ├─ [批量导出]
     │     │
     │     ▼
     │  用户选择语言（若混合语言）→ dictManager.createUserDict()
     │
     └─ [点击单文件]     ← Webview → Extension
           │
           ▼
        vscode.commands.executeCommand('vscode.open', uri)
```

---

## 七、导出集成

### 7.1 批量导出为自建词典

```typescript
async exportAllAsDict(name: string, lang: string): Promise<void> {
  const merged: Record<string, { pos: string[] }> = {}
  for (const result of this.results.values()) {
    if (result.error) continue
    for (const word of result.words) {
      if (!merged[word.word]) {
        const pos = word.pos.split(',').map(p => p.trim()).filter(Boolean)
        merged[word.word] = { pos }
      } else {
        // 合并词性（去重）
        const existing = new Set(merged[word.word].pos)
        for (const p of word.pos.split(',').map(p => p.trim())) {
          if (p) existing.add(p)
        }
        merged[word.word] = { pos: [...existing] }
      }
    }
  }
  await dictManager.createUserDict(name, lang, merged)
}
```

### 7.2 导出语言选择

批量结果可能包含多种语言的词汇（中英混排文件）。导出时需要处理：

1. **自动检测**：扫描所有词汇的字符特征，判断语言
2. **用户选择**：弹窗让用户选择导出到哪个语言的词典
3. **混合处理**：如果检测为混合语言，提示用户"检测到混合语言词汇，请选择目标语言分类"，或允许分语言导出多个词典

### 7.3 单文件导出

与目前"导出当前文档词汇"逻辑相同，但数据源是批量结果而非编辑器内容。

---

## 八、实现步骤

| 步骤 | 内容 | 文件 |
|------|------|------|
| 1 | package.json: 新增 commands + menus（processProject 不放 explorer/context） | `package.json` |
| 2 | extension.ts: 注册 3 个命令 + 创建 BatchProcessor（传 HighlightEngine） | `src/extension.ts` |
| 3 | 新建 BatchProcessor 类（扫描 + 并发控制 + 结果管理） | `src/batch/batchProcessor.ts` |
| 4 | 新建 BatchResult 类型定义 | `src/batch/types.ts` |
| 5 | sidePanel.ts: 新增 sendBatchProgress + sendBatchResult + batch 消息处理（batchOpenFile / batchExportAll / batchCancel / batchClear） | `src/vscode/sidePanel.ts` |
| 6 | panel.html: 新增"批量处理"Tab（第 4 个 Tab，插在"词典"和"设置"之间） | `webview/panel.html` |
| 7 | panel.js: 批量结果树渲染 + 进度条 + 错误状态 + 聚合视图分页 + 交互 | `webview/panel.js` |
| 8 | panel.css: 批量处理 Tab 样式（树形视图、进度条、错误状态、聚合表格） | `webview/panel.css` |
| 9 | i18n.js: 新增批量处理相关翻译键（详见下方列表） | `webview/i18n.js` |

**需要新增的 i18n 键**：

| 键 | zh | en |
|---|---|---|
| `tabBatch` | 批量 | Batch |
| `batchProcessProject` | 处理整个项目 | Process Project |
| `batchClear` | 清除 | Clear |
| `batchCancel` | 取消 | Cancel |
| `batchProgress` | 已处理: {0}/{1} 文件 | Processed: {0}/{1} files |
| `batchTotalFiles` | 总计: {0} 文件 | Total: {0} files |
| `batchSuccessCount` | 成功: {0} | Success: {0} |
| `batchErrorCount` | 失败: {0} | Failed: {0} |
| `batchExportAll` | 导出全部为词典 | Export All as Dict |
| `batchAggregated` | 合并词汇频率 | Merged Frequency |
| `batchMergedWords` | 共 {0} 个唯一词 | {0} unique words |
| `batchNoResults` | 暂无批量处理结果 | No batch results yet |
| `batchOpenFile` | 点击文件在编辑器中打开 | Click to open in editor |
| `batchOverMax` | 项目中包含 {0} 个受支持文件，超过限制({1})。 | Project has {0} supported files, exceeding limit ({1}). |
| `batchProcessFirst100` | 处理前 100 个 | Process first 100 |
| `batchProcessFirst500` | 处理前 500 个 | Process first 500 |
| `batchProcessAll` | 全部处理 | Process All |

### 要导出的 BatchProcessor 接口

```typescript
// sidePanel.ts 需要调用的 BatchProcessor 方法：
interface IBatchProcessor {
  processSingleFile(uri: vscode.Uri): Promise<void>
  processFile(uri: vscode.Uri, engineConfig: EngineConfig): Promise<BatchFileResult>
  processFolder(uri: vscode.Uri): Promise<void>
  cancel(): void
  clear(): void
  getResults(): BatchFileResult[]
  exportAllAsDict(name: string, lang: string): Promise<void>
}
// processProject 无独立方法——命令直接调用 processFolder(folders[0].uri)
```

### 优先级

**P0（核心）**：步骤 1-5 — 命令触发 + 后台处理 + 并发控制 + 取消 + 数据存储
**P1（展示 + 交互）**：步骤 6-9 — 侧边栏批量结果 UI + 进度条 + 错误状态 + 聚合视图 + 导出
**P2（完善）**：大项目保护多选项、.gitignore 支持（可选）、Web Worker 聚合计算（注意 CSP 限制，详见注意事项第 12 条）

> **P0 包含"取消"**：用户在处理大文件夹时必须能中断，这是基础体验，不是后期完善项。

---

## 九、注意事项

1. **性能**：使用并发控制（每次最多 4 个文件并行），详见 3.3
2. **postMessage 增量推送**：采用方案 A，每完成一个文件发送进度数字（50 bytes）+ 增量结果（该文件 ~20KB）。500 次 postMessage 在 VS Code Webview 中约 50ms 总开销，可忽略。Webview 端增量 append 到树形视图，用户实时看到结果逐步填充
3. **内存**：批量结果存储在内存中，大项目可能占用数十 MB，可考虑设置结果上限或结果数量警告
4. **已有结果更新**：如果用户处理了同一个文件夹两次，第二次应覆盖之前的结果
5. **与 decorations 的关系**：批量处理不修改编辑器 decorations，两者独立
6. **跨 workspace 支持**：多根 workspace 需要用户选择针对哪个文件夹处理
7. **disabledDicts 同步**：在 `processWithProgress` 入口统一调用一次 `engine.setDisabledDicts()`（见 §4.1），不在每个文件重复设置
8. **posFilter 一致**：从 `loadConfig()` 读取 `posFilter` 注入 `EngineConfig`，与编辑器高亮行为一致
9. **.gitignore 局限**：当前使用硬编码黑名单，不支持读取项目 `.gitignore`。如需支持需在扫描文件夹时解析 `.gitignore` 规则，这是未来优化方向
10. **导出语言选择**：批量结果可能包含混合语言词汇，导出时需用户指定目标语言或自动检测
11. **聚合视图分页**：字数超过 100 时使用分页（复用现有词典管理的 25/50/100 分页组件），避免 Webview 性能问题
12. **Web Worker CSP 限制**：Webview 的 CSP 头为 `script-src {{CSP_SOURCE}}`，禁止 Blob URL 创建 worker。如需用 Web Worker 做聚合计算，必须将 worker 文件放在 `webview/` 目录下，通过 `webview.asWebviewUri()` 转换路径后加载。不能使用 `new Worker(blob:...)` 或内联 worker
