# 009 — 批量处理功能实现总结

> **本文档是当前实现的功能总结**，用于在干净版本上重新实现时的参考。
>
> 如发现问题，请先检查当前代码（`git log`），再对比本文档是否符合预期。

---

## 一、功能总览

批量处理允许用户在 VS Code 侧边栏中对项目内的文件/文件夹进行三级处理（文件/文件夹/整个项目），调用 `HighlightEngine.process()` 提取词汇并显示词性统计结果。

**入口**：侧边栏新增第 4 个 Tab "批量"（插在"词典"和"设置"之间）

**与编辑器高亮的关系**：两者独立。批量处理不修改编辑器 decorations，结果只存入批量视图。但单文件处理（⚡）后会同步 `sendAnnotationResult` 更新标注 Tab。

---

## 二、文件清单

| 文件 | 类型 | 作用 |
|------|------|------|
| `src/batch/types.ts` | 新建 | 类型定义 |
| `src/batch/batchProcessor.ts` | 新建 | 核心处理引擎 |
| `src/extension.ts` | 修改 | 创建 BatchProcessor，注册命令 |
| `src/vscode/sidePanel.ts` | 修改 | 新增 batch 消息处理 + send 方法 |
| `webview/panel.html` | 修改 | 新增"批量"Tab DOM |
| `webview/panel.js` | 修改 | 新增 batch UI 逻辑 |
| `webview/panel.css` | 修改 | 新增 batch 样式 |
| `webview/i18n.js` | 修改 | 新增 batch 翻译键 |
| `package.json` | 修改 | 新增 commands + explorer/context menus |

---

## 三、`src/batch/types.ts` — 类型定义

```typescript
BatchFileResult {
  filePath: string      // 文件绝对路径
  fileName: string      // 文件名
  wordCount: number     // DecoratedWord 数量
  words: DecoratedWord[] // engine.process() 输出
  error?: string        // 处理出错时的错误信息
}

AggregatedStats {
  totalFiles: number
  totalWords: number
  totalProcessed: number
  totalErrors: number
  wordFrequency: Map<string, { pos, count, files[] }>
}
```

**消息类型**（均为接口，用于文档/类型安全）：

| 方向 | 消息类型 |
|------|----------|
| Extension→Webview | `batchProgress`, `batchFileDone`, `batchResult`, `batchFileList` |
| Webview→Extension | `batchOpenFile`, `batchCancel`, `batchClear`, `batchExportAll`, `batchInit`, `batchSelectFile`, `batchSelectFolder`, `processProject`, `batchProcessFileItem`, `batchProcessFolderItem` |

---

## 四、`src/batch/batchProcessor.ts` — 核心引擎

### 4.1 构造函数

```typescript
constructor(
  private engine: HighlightEngine,      // 处理引擎
  private dictManager: DictionaryManager, // 词典管理器（用于导出）
  private sidePanel: SidePanelProvider,   // 侧边栏（用于推送消息）
)
```

### 4.2 文件过滤

**支持扩展名**（硬编码白名单）：
`.md`, `.txt`, `.html`, `.htm`, `.py`, `.go`, `.js`, `.ts`, `.jsx`, `.tsx`

**忽略目录**（硬编码黑名单，不读 .gitignore）：

| 类别 | 目录 |
|------|------|
| 版本控制 | `.git`, `.svn`, `.hg` |
| Node.js | `node_modules`, `.yarn`, `.pnp`, `.pnp.js`, `bower_components`, `jspm_packages` |
| Python | `__pycache__`, `.venv`, `venv`, `.mypy_cache`, `.pytest_cache`, `.ruff_cache`, `.tox`, `eggs` |
| Java/JVM | `.gradle`, `.mvn` |
| Go/PHP/Ruby | `vendor` |
| Rust | `target` |
| Swift/iOS | `Pods`, `.build`, `Carthage`, `DerivedData` |
| JS 构建 | `dist`, `.next`, `.turbo`, `.output`, `.cache`, `coverage`, `.nyc_output` |
| Dart/Flutter | `.dart_tool`, `.packages` |
| IDE | `.idea`, `.vscode`, `.vs` |
| 其他 | `elm-stuff`, `.stack-work`, `cmake-build-debug` |

**最大文件限制**：`MAX_FILES = 500`，超出时弹窗让用户选择（前100/前500/全部/取消）。

### 4.3 scanFolder — 迭代目录扫描

使用 **while 循环 + 栈**（非递归）避免 stack overflow：

```typescript
async scanFolder(uri: Uri): Promise<Uri[]> {
  const stack = [uri], visited = new Set<string>()
  while (stack.length > 0) {
    const current = stack.pop()
    // realpath 解析真实路径防止 symlink 循环
    const realPath = await realpath(current.fsPath)
    if (visited.has(realPath)) continue
    visited.add(realPath)
    const entries = await vscode.workspace.fs.readDirectory(current)
    for (const [name, type] of entries) {
      if (是目录) { if (在忽略列表) continue; stack.push(完整路径) }
      else if (是文件且扩展名匹配) results.push(完整路径)
    }
  }
  return results
}
```

### 4.4 processFile — 处理单个文件

```typescript
async processFile(uri, engineConfig): Promise<BatchFileResult>
```

- 读取文件内容 → `engine.process(content, engineConfig)` → 返回 `DecoratedWord[]`
- 出错时返回带 `error` 字段的 `BatchFileResult`（不抛异常）
- 纯处理函数：不加载配置、不推送侧边栏

### 4.5 processFiles — 并发池

- **4 路并发**（`CONCURRENCY = 4`）
- 用 `i++` 索引分配 + `Promise.all` 管理并发
- 每次迭代前检查 `this.cancelled` 和 `CancellationToken`

### 4.6 processWithProgress — 带进度

```typescript
async processWithProgress(files: Uri[])
```

- 统一加载配置（`loadConfig()`）
- 统一设置 `engine.setDisabledDicts()`
- 使用 `vscode.window.withProgress({ cancellable: true })`
- 每文件：`sendBatchProgress` + `sendBatchFileDone`
- 完成：`sendBatchResult`（全量数据）
- 取消：`sendBatchProgress({ cancelled: true })`

### 4.7 公开入口

| 方法 | 功能 |
|------|------|
| `processSingleFile(uri)` | 单文件：加载配置 → processFile → sendBatchFileDone |
| `processFolder(uri)` | 文件夹：scanFolder → processWithProgress |
| `processWithProgress(files)` | 带进度的批量处理 |
| `cancel()` | 设 cancelled flag |
| `clear()` | 清空 results Map + 重置 flag |
| `getResults()` | 获取所有 BatchFileResult |
| `getAggregatedStats()` | 跨文件词频统计 |
| `exportAllAsDict(name, lang)` | 合并所有词汇 → `createUserDict` |

---

## 五、`src/extension.ts` — 入口集成

**在现有激活流程中插入**（在 `loadBuiltins()` 之前）：

```
1. 创建 dictManager, engine, sidePanelProvider
2. 注册原有命令（enable, disable, annotateSelection, exportDict）
3. ← 新建：创建 BatchProcessor(engine, dictManager, sidePanelProvider)
4. ← 新建：sidePanelProvider.setBatchProcessor(batchProcessor)
5. ← 新建：注册 3 个命令（processFile, processFolder, processProject）
6. await dictManager.loadBuiltins()
7. sidePanelProvider?.sendDictList()
8. 创建 decorator, 注册 side panel
```

**3 个注册的命令**（用于 package.json 右键菜单）：

| 命令 | 来源 |
|------|------|
| `adhdgofly.processFile` | 资源管理器右键文件 |
| `adhdgofly.processFolder` | 资源管理器右键文件夹 |
| `adhdgofly.processProject` | 命令面板（不放右键菜单） |

---

## 六、`src/vscode/sidePanel.ts` — 消息中枢

### 6.1 新增导入 + 属性

```typescript
import type { BatchProcessor } from '../batch/batchProcessor'
import type { BatchFileResult } from '../batch/types'

private batchProcessor?: BatchProcessor  // setBatchProcessor() 注入
```

### 6.2 新增 send 方法

| 方法 | 消息类型 | 触发时机 |
|------|----------|----------|
| `sendBatchProgress(msg)` | `batchProgress` | 每处理完一个文件 |
| `sendBatchFileDone(msg)` | `batchFileDone` | 每处理完一个文件 |
| `sendBatchResult(files)` | `batchResult` | 全部处理完毕 |

### 6.3 新增消息处理

| 消息 | 功能 |
|------|------|
| `batchOpenFile` | `vscode.commands.executeCommand('vscode.open', Uri.file(filePath))` |
| `batchCancel` | `this.batchProcessor?.cancel()` |
| `batchClear` | `clear()` + 发空 `batchResult` |
| `batchExportAll` | `exportAllAsDict()` name/lang 弹窗 |
| `batchInit` | 首次打开批量 Tab 时扫描 workspace，发 `batchFileList` |
| `batchSelectFile` | 扫 workspace → QuickPick 选文件 → `processSingleFile` |
| `batchSelectFolder` | 扫 workspace → QuickPick 选文件夹 → `processFolder` |
| `processProject` | `processFolder(workspaceFolders[0].uri)` |
| `batchProcessFileItem` | 根据路径 `processSingleFile` + 同步标注 Tab + Toast |
| `batchProcessFolderItem` | 根据路径 `processFolder` |

---

## 七、Webview — panel.html

### 7.1 Tab 结构

第 4 个 Tab `data-tab="batch"`，插入在 `dicts` 和 `settings` 之间：

```
┌─ 标注 ─┬─ 词典 ─┬─ 批量 ─┬─ 设置 ─┐
│
│ [点击 ▶ 处理对应层级]    [清除]
│ ┌────────────────────────┐
│ │ 文件视图 │ 词汇汇总     │  ← 子 Tab
│ ├────────────────────────┤
│ │ 📁 projectname ▼ ⚡    │
│ │  ├ 📁 src ▼ ⚡         │
│ │  │  ├ file.ts ⚡ n:12  │
│ │  │  └ util.ts ⚡ v:8   │
│ │  └ 📁 docs ▼ ⚡        │
│ └────────────────────────┘
│ ████████░░░░ 50%   [取消]
│ 总计: 12 文件  成功: 11  失败: 1
│ [+ 导出全部为词典]
└────────────────────────────────────
```

### 7.2 DOM 元素

| 元素 | 作用 |
|------|------|
| `batch-actions` | 操作栏（提示 + 清除按钮） |
| `batch-subtabs` | 子 Tab（文件视图 / 词汇汇总） |
| `batch-view-files` | 文件视图容器 |
| `batch-tree` | 文件树容器 |
| `batch-view-vocab` | 词汇汇总容器 |
| `batch-agg-list` | 聚合词汇列表 |
| `batch-agg-pagination` | 词汇分页 |
| `batch-progress-bar` | 进度条（visibility 控制，无布局抖动） |
| `batch-progress-fill` | 进度填充条 |
| `batch-progress-text` | 进度文字 |
| `batch-stats` | 统计汇总 |
| `batch-export-bar` | 导出全部按钮 |

---

## 八、Webview — panel.js

### 8.1 新增状态

```javascript
batch: {
  files: [],          // BatchFileResult[] 已处理文件结果
  processing: false,  // 是否正在处理中
  aggPage: 1,         // 词汇汇总当前页码
  aggPageSize: 25,    // 词汇汇总每页条数
  aggExpandedWord: null, // 展开显示文件列表的词汇
  total: 0,           // 总文件数
  completed: 0,       // 已完成数
  filePaths: [],      // 扫描得到的全部文件路径
  subFolders: [],     // 所有子文件夹路径
  workspacePath: '',  // workspace 根目录路径
  inited: false,      // 是否已发送 batchInit
}
```

### 8.2 新增消息处理

| 消息 | 处理 |
|------|------|
| `batchFileList` | 保存 `filePaths/workspacePath` → `renderBatchFileTree()` |
| `batchProgress` | 更新 `processing/completed/total` → `renderBatchProgress()` |
| `batchFileDone` | 追加到 `files[]` → `renderBatchFileTree()` |
| `batchResult` | 替换 `files[]` → `renderBatchFileTree()` + `renderBatchStats()` + `renderBatchVocab()` |

### 8.3 渲染函数

#### renderBatchFileTree()

- 从 `state.batch.filePaths`（扁平绝对路径）构建层级树
- 路径转为相对于 workspace root 的相对路径
- 顶部渲染项目根目录行 `📁 projectname`
- 每行渲染：`▼/▶` 折叠箭头 + `⚡` 处理按钮 + `📁 folder` / 文件名
- 已处理的文件显示词性统计（`n:12 v:8`）
- **事件绑定**（使用 `container.querySelectorAll` + `addEventListener`）：
  - `.bf-caret` → 展开/折叠文件夹
  - `.bf-process-btn` → 发 `batchProcessFileItem`/`batchProcessFolderItem`/`processProject`
  - `.batch-file-row` → 打开编辑器（排除 ⚡ 点击）

#### renderBatchProgress(msg)

- 进度条用 `visibility` + `opacity` 控制显隐（无布局抖动）
- 数字用 `tabular-nums` 等宽防止文字抖动
- 完成 1.5s 后自动隐藏

#### renderBatchStats()

- 显示：总计文件、成功数、失败数
- 失败数有红色 `.error-text` 样式，失败为 0 时隐藏

#### renderBatchVocab()

- 从 `getAggregatedWords()` 获取跨文件合并的词频列表
- 分页显示（每页 25 条）
- 每条显示：词 + 词性标签 + 出现文件数
- 点击行展开显示具体文件名列表

### 8.4 事件监听器

| 元素 | 触发 |
|------|------|
| `.batch-subtab` | 切换文件视图/词汇汇总 |
| `btn-batch-clear` | 清空所有结果 |
| `btn-batch-cancel` | 取消当前处理 |

### 8.5 初始化

第一次点击"批量"Tab 时发送 `batchInit`（在 Tab 切换监听器中判断 `tab === 'batch' && !state.batch.inited`）。

---

## 九、Webview — panel.css 新增样式

全部以 `.batch-*` / `.bf-*` / `#tab-batch` 为前缀，不与其他 Tab 冲突。

| 选择器 | 作用 |
|--------|------|
| `#tab-batch.active` | 批量 Tab 容器（flex 布局） |
| `.batch-actions` | 操作栏 |
| `.batch-hint` | 使用提示文字 |
| `.batch-subtabs` / `.batch-subtab` | 子 Tab 切换 |
| `.batch-view-content` | 文件/词汇视图容器 |
| `.batch-tree` | 文件树（`min-height: 80px`, `overflow-anchor: auto`） |
| `.batch-folder-row` | 文件夹行 |
| `.bf-carets` / `.bf-caret` | 折叠箭头 |
| `.bf-process-btn` | ⚡ 处理按钮 |
| `.bf-name` / `.bf-children` | 文件夹名 / 子容器 |
| `.batch-file-row` | 文件行 |
| `.batch-file-error` | 错误状态（红色） |
| `.batch-file-counts` | 词性统计（n:12 v:8） |
| `.batch-progress-bar` | 进度条容器（`visibility` 控制，无 transition） |
| `.batch-progress-fill` | 进度填充条（`cancelled` 红色） |
| `.batch-progress-info` | 进度文字 + 取消按钮（`tabular-nums`） |
| `.batch-stats` / `.batch-stats-header` | 统计 |
| `.batch-aggregated` / `.batch-agg-row` | 词汇汇总 |
| `.error-text` | 错误计数红色 |

---

## 十、i18n.js 新增键

| 键 | zh | en |
|---|---|---|
| `tabBatch` | 批量 | Batch |
| `batchProcessProject` | 处理整个项目 | Process Project |
| `batchProcessFile` | 处理文件 | Process File |
| `batchProcessFolder` | 处理文件夹 | Process Folder |
| `batchViewFiles` | 文件视图 | Files |
| `batchViewVocab` | 词汇汇总 | Vocabulary |
| `batchClear` | 清除 | Clear |
| `batchCancel` | 取消 | Cancel |
| `batchProgress` | 已处理: {0}/{1} 文件 | Processed: {0}/{1} files |
| `batchTotalFiles` | 总计: {0} 文件 | Total: {0} files |
| `batchSuccessCount` | 成功: {0} | Success: {0} |
| `batchErrorCount` | 失败: {0} ⚠️ | Failed: {0} ⚠️ |
| `batchExportAll` | 导出全部为词典 | Export All as Dict |
| `batchAggregated` | 合并词汇频率 | Merged Frequency |
| `batchMergedWords` | 共 {0} 个唯一词 | {0} unique words |
| `batchNoResults` | 暂无批量处理结果 | No batch results yet |
| `batchOpenFile` | 点击文件在编辑器中打开 | Click to open in editor |
| `batchOverMax` | 项目中包含 {0} 个受支持文件... | Project has {0} supported files... |
| `batchProcessFirst100` | 处理前 100 个 | Process first 100 |
| `batchProcessFirst500` | 处理前 500 个 | Process first 500 |
| `batchProcessAll` | 全部处理 | Process All |

---

## 十一、数据流图

```
用户点击 ⚡（单文件）
  │
  ▼
panel.js: post({ type: 'batchProcessFileItem', filePath })
  │
  ▼
sidePanel.handleMessage: batchProcessFileItem
  │
  ├─ batchProcessor.processSingleFile(Uri)
  │   ├─ loadConfig()
  │   ├─ engine.setDisabledDicts()
  │   ├─ processFile() → engine.process() → DecoratedWord[]
  │   └─ sidePanel.sendBatchFileDone({ filePath, words, wordCount })
  │
  ├─ sendAnnotationResult(words, fileName)  // 同步标注 Tab
  │
  └─ post({ type: 'toast', message: '已处理完毕' })

panel.js: 收到 batchFileDone
  │
  ├─ state.batch.files.push(result)
  ├─ renderBatchFileTree()  // 更新该行显示词性统计
  └─ [如果当前在词汇汇总 Tab，用户需切换到词汇汇总查看]
```

```
用户点击 ⚡（文件夹 / 整个项目）
  │
  ▼
sidePanel.handleMessage: batchProcessFolderItem / processProject
  │
  ▼
batchProcessor.processFolder(uri)
  │
  ├─ scanFolder(uri)  // 迭代扫描
  ├─ [如果 > 500 文件，弹窗选择数量]
  └─ processWithProgress(files)
      │
      ├─ vscode.window.withProgress({ cancellable: true })
      │
      ├─ 每文件:
      │   ├─ processFile() → engine.process()
      │   ├─ sendBatchProgress({ completed, total })
      │   └─ sendBatchFileDone({ filePath, words })
      │
      └─ 完成:
          ├─ sendBatchProgress({ completed, total, cancelled? })
          └─ sendBatchResult([...results])

panel.js: 每文件收到 batchFileDone → renderBatchFileTree()
panel.js: 收到 batchResult → renderBatchFileTree() + renderBatchStats() + renderBatchVocab()
```

---

## 十二、package.json — 扩展入口

```jsonc
// 新增 activationEvents
"onCommand:adhdgofly.processFile",
"onCommand:adhdgofly.processFolder",
"onCommand:adhdgofly.processProject"

// 新增 commands
{ "command": "adhdgofly.processFile",    "title": "ADHDGoFly: 处理文件" },
{ "command": "adhdgofly.processFolder",  "title": "ADHDGoFly: 处理文件夹" },
{ "command": "adhdgofly.processProject", "title": "ADHDGoFly: 处理整个项目" }

// 新增 explorer/context 右键菜单
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
```


---

## 十三、已知问题

1. **标注/词典 Tab 在提交 7/8/Update 后失效**（原因未完全确定，推测是 `renderBatchFileTree()` 运行时异常影响消息处理队列）
2. **单文件处理（⚡）同步标注 Tab** 在 `batchProcessFileItem` 中通过 `sendAnnotationResult` 实现，这是后面补加的
3. **进度条早期有抖动问题**，通过改用 `visibility` 控制显隐和 `tabular-nums` 等宽数字缓解
4. **`scanFolder` 最初用递归导致 stack overflow**（symlink 循环），后改为迭代 + `realpath` 去重
