# ADHDGoFly Highlight — Phase 2 实现总结

> 记录当前版本实现了哪些功能、具体怎么实现的，以及开发过程中遇到的关键问题和解法。

---

## 一、当前实现了什么

### 功能层面

| 功能 | 状态 | 说明 |
|------|------|------|
| Markdown / 纯文本自动高亮 | ✅ | 打开 .md / .txt 文件后约 1s 内出现词性着色 |
| 代码文件支持 | ✅ | js/ts/py/go/html，仅高亮注释和字符串范围 |
| 英语词性高亮 | ✅ | 名词绿、动词红、形容词紫、副词紫、其他灰 |
| 中文词性高亮 | ✅ | BMM 正向最大匹配分词 |
| 词形还原（英语） | ✅ | running→run, making→make，含黑名单防误匹配 |
| 混排语言检测 | ✅（已升级） | ~~按段落分类~~ → 逐字符调度（dict-app 同款），消除混排遗漏 |
| 大文件优化 | ✅ | > 2000 行只处理可见区域（visibleRanges） |
| 配置项 | ✅ | 11 个设置项，涵盖高亮和 AI 词性判定 |
| 单元测试 | ✅ | 18 个测试，覆盖分词/匹配/词形还原/语言检测 |
| F5 调试 / VSIX 打包 | ✅ | 两种本地测试方式都可用 |
| 侧边栏（WebviewView） | ✅ | 三 Tab：标注视图/词典管理/设置 |
| 标注视图 | ✅ | 实时展示当前文档标注结果 + 词性统计 + 频率排序 |
| 词条编辑覆层 | ✅ | 点击词汇弹出编辑弹窗，选择词性后保存 |
| 词典管理 | ✅ | 列表 → 详情（分页/搜索）→ 编辑/新增/删除词条 |
| 词典导入/导出 | ✅ | 导出 JSON（兼容 dict-app 格式）/ 导入外部 JSON |
| AI 词性判定 | ✅ | 可配置多 Provider（主用选择），调用 OpenAI 兼容 API |
| 导出当前文档词汇 | ✅ | 去重后生成独立 JSON 词典 |
| 社区词典安装/卸载 | ✅ | 从 dictionary.adhdgofly.online 浏览、安装、卸载 |
| 社区词典上传 | ✅ | 提交本地词典到社区（管理员审核后发布）|
| 词典启用/禁用 | ✅ | 使用 `disabledDicts` 黑名单方案，已修复原全关＝全开的 bug |
| 词典来源徽章 | ✅ | 内置(内)、社区(社)、导入(自) 三种徽章 |
| 词典独立查看 | ✅ | 查看特定词典词条，不与其他词典合并 |
| 保存标注为自建词典 | ✅ | 标注 Tab → 保存为自建词典 → 持久化磁盘，显示在"自建"Tab |
| 自建词典管理 | ✅ | 查看/编辑/删除词条，在本地 Tab 可勾选开关 |
| 词典格式规范 | ✅ | `docs/006-dict-format.md` — 全 ADHDGoFly 生态统一格式 |
| 词典内置文件更新 | ✅ | EN/ZH 替换为带 meta 信息的 0000 版本（+5 词条/语言） |
| 高亮强度调节 | ⚠️ | 映射为 fontWeight（VS Code 不支持 fontSize） |
| posFilter 联动编辑器 | ✅ | 取消勾选词性 chips 时编辑器高亮同步移除 |

### 尚未实现（规划中）

- ChatParticipant（VS Code 内置 AI 聊天集成）
- MCP 工具（Cursor / Windsurf）
- 词典社区管理后台完善（管理员审核页面已有但功能不完整）
- JetBrains 支持

---

## 二、架构：模块怎么分层

最重要的设计决定：**`highlightEngine/` 完全不 import `vscode`**，是纯 TypeScript 逻辑。

```
src/
├── extension.ts          入口，只做注册和生命周期管理
│
├── highlightEngine/      ★ 纯逻辑层（零 vscode 依赖）
│   ├── types.ts          Segment / DecoratedWord / LanguageSegment 类型
│   ├── language.ts       语言检测 + 按段落分析混排文档
│   ├── lemmatizer.ts     英语词形还原（suffix stripping + 黑名单）
│   ├── segmenter.ts      BMM 分词（空格分隔 / CJK 前向匹配）
│   ├── matcher.ts        词性 → 颜色类映射
│   └── index.ts          流程调度：language → segment → match
│
├── dictionary/           词典数据层（含社区下载器）
│   ├── types.ts          RawDictionary / DictMap 类型
│   ├── loader.ts         异步加载 VSIX 内置词典 JSON
│   ├── merger.ts         多层词典合并
│   ├── downloader.ts      社区词典 API 接口 + mock 实现
│   └── manager.ts        统一入口，带 merge 缓存
│
├── utils/
│   ├── debounce.ts       300ms 防抖
│   └── stopwords.ts      JS/TS/Python/Go 编程关键词黑名单
│
└── vscode/               VS Code 平台适配层（所有 vscode.* 调用集中在这里）
    ├── activationGuard.ts  shouldProcessDocument() / isLargeFile()
    ├── config.ts           读取 workspace settings
    ├── decorator.ts        Decoration 创建/更新/清除，O(log n) offset→Position 转换
    ├── textMate.ts         注释/字符串范围正则检测
    ├── sidePanel.ts        WebviewView 侧边栏（三 Tab 消息处理 + config/dict 分发）
    └── aiJudge.ts          AI 词性判定（调用用户配置的 OpenAI 兼容 API）
```

**为什么这样分**：和 Vue 项目把 API 调用抽到 `service/` 是同一个道理。
- `highlightEngine/` 可以用 Vitest 直接测试，不需要启动 VS Code Extension Host
- 未来移植到 JetBrains 只需换 `vscode/` 适配层，逻辑层原封不动

---

## 三、关键实现细节

### 3.1 词典加载

词典文件格式（原始 JSON，来自 dict-app，复制为独立副本）：
```json
{
  "version": "1.0",
  "lastUpdated": "2025-02-11T22:35:23",
  "words": {
    "quick": { "pos": ["adj"] },
    "run":   { "pos": ["v"] }
  }
}
```

`loader.ts` 用 `fs/promises` 异步读取，`normalizeDictionary()` 把嵌套结构展平为 `Record<string, {pos: string[]}>`，方便 O(1) 查找。

EN（147,406 词条）+ ZH（349,172 词条）用 `Promise.all` 并行加载，总耗时约 845ms。

### 3.2 分词流程

```
文档文本
  ↓ detectLanguageSegments()  按 \n\n 分段，每段独立检测语言
  ↓ segmentText()
      英/法/西/俄 → segmentSpaceDelimited()  按空格/标点 split
      中/日       → segmentCJK()             前向最大匹配（maxLen=8）
  ↓ lookupWithLemma()（英语）  suffix stripping: ing/ed/s/ly/er/est/tion
  ↓ matchSegments()            过滤 minWordLength，映射颜色类
```

### 3.3 Decoration 渲染

5 种 `TextEditorDecorationType`，每种对应一个词性：

| 词性 | 颜色 |
|------|------|
| 名词 n | 绿色背景 `rgba(34,197,94,0.15)` + 绿边框 |
| 动词 v | 红色背景 `rgba(239,68,68,0.15)` + 红边框 |
| 形容词 adj | 蓝色背景 `rgba(59,130,246,0.15)` + 蓝边框 |
| 副词 adv | 靛蓝背景 `rgba(99,102,241,0.15)` + 靛蓝边框 |
| 其他 | 灰色背景 `rgba(156,163,175,0.12)` + 灰边框 |

只用 `backgroundColor` + `border`，**不用 `color`**，避免覆盖 TextMate 语法高亮的文本颜色。

---

## 四、遇到的问题和解法

### 问题 1：首次高亮延迟约 7 秒

**现象**：打开 .md 文件后，高亮出现需要 7 秒以上。

**排查过程**：在 `loader.ts` / `manager.ts` / `decorator.ts` 分别加 `console.time` log，在 Extension Development Host 的 DevTools Console 查看。

**日志显示**：
```
loadBuiltins total: 845ms       ← 词典加载
engine.process:     131ms       ← 分词
build ranges:         1ms
setDecorations:       0ms
applyDecorations:   132ms       ← 渲染总计
```
代码总耗时不到 1 秒，但页面等了 5 秒多才出现高亮。

**根本原因分析**：

原来的 `activate()` 是 `await dictManager.loadBuiltins()` 然后再 `triggerUpdate()`。问题有两层：

1. **同步 IO 阻塞**：`loader.ts` 原来用 `fs.readFileSync` + 串行循环，EN + ZH 两个大文件（13MB 合计）在主线程同步解析，直接冻结 Extension Host。

2. **时序问题**：改成异步后，`activate()` 返回前已经 `await` 完词典加载，再调用 `triggerUpdate()`——但 `triggerUpdate` 走的是 300ms debounce，而 Extension Development Host 窗口在激活时本身还在初始化渲染管线，导致这次触发没有产生实际渲染，之后再也没有事件重新触发。

**解法**：

```
修复 1：loader.ts 改用 fs/promises 异步读取
修复 2：Promise.all 并行加载 EN + ZH（不串行）
修复 3：extension.ts 中 loadBuiltins() 不再 await，改为 .then() 回调
         词典加载完成后调用 forceApply()（不走 debounce，直接渲染）
修复 4：decorator.ts 暴露 forceApply() 方法
修复 5：DictionaryManager 加 mergeCache，getDict() 不再每次重建合并 Map
```

关键代码（`extension.ts`）：
```typescript
// 不 await，不阻塞激活
dictManager.loadBuiltins().then(() => {
  const editor = vscode.window.activeTextEditor
  if (editor) decoratorInstance?.forceApply(editor)  // 绕过 debounce 立即渲染
})
```

**最终效果**：打开文件后约 1 秒内（词典加载完成时）立即出现高亮。

### 问题 2：5000 次 positionAt() 导致渲染慢

**原因**：VS Code 的 `document.positionAt(offset)` 每次调用都是 O(行数) 操作——它从第 0 行开始数，找到 offset 对应的 (line, character)。对一个 1000 行的文档，调用 5000 次就是 500 万次操作。

**解法**：自己维护行起始偏移量索引，把查找从 O(n) 降到 O(log n)：

```typescript
function buildLineOffsets(text: string): number[] {
  const offsets = [0]
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') offsets.push(i + 1)
  }
  return offsets  // lineOffsets[i] = 第 i 行的起始 offset
}

function offsetToPosition(offset: number, lineOffsets: number[]): vscode.Position {
  // 二分查找，O(log n)
  let lo = 0, hi = lineOffsets.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (lineOffsets[mid] <= offset) lo = mid
    else hi = mid - 1
  }
  return new vscode.Position(lo, offset - lineOffsets[lo])
}
```

`buildLineOffsets` 只需要调用一次（O(n chars)），之后 5000 次查找每次 O(log n)，`build ranges` 耗时从数秒降到 1ms。

### 问题 3：中文/符号混排时 decoration 范围错位导致"虚假中文高亮"

**现象**：只启用英文词典时，`**OpenAI 格式**` 中的"格式"、`格式**（Codex` 中的"格式"虚显示为绿色/紫色。

**排查过程**：在 `decorator.ts`、`manager.ts`、`index.ts`、`segmenter.ts` 的关键节点加 `console.log` 追踪。日志确认：
- zh 词典正确禁用，所有 zh 语言段落被跳过
- 受影响的段落被检测为 `en`（CJK 比例低于 30%）
- 被"着色"的"格式"实际上并未匹配中文词典——匹配的是同 token 中的英文单词

**根因**：`segmentSpaceDelimited()` 的位置计算错误。

```
token = "格式**（Codex"
clean = token.replace(/[^\w'-]/g, '').toLowerCase()  // → "codex"
// 旧代码：
start = pos                    // token 开头 → 包含"格式**（"
end   = pos + clean.length     // pos + 5 → 只覆盖了 token 前 5 个字符
// 范围 [pos, pos+5) = "格式**（C" → "格式"被着色
```

实际匹配是 "codex"，但因为装饰范围从原始 token 起点开始计算，覆盖到了前面的"格式"。

**解法**：用 `token.match(/[\w'-]+/)` 找到单词字符在 token 内部的**实际偏移**，装饰范围只覆盖被匹配的英文单词本身。

```typescript
// src/highlightEngine/segmenter.ts — segmentSpaceDelimited
const wordMatch = token.match(/[\w'-]+/)
if (!wordMatch) { pos += token.length; continue }
const rawWord = wordMatch[0]
const clean = rawWord.toLowerCase()

// ...dict lookup...

segments.push({
  word: clean,
  start: pos + wordMatch.index!,          // 单词在 token 内的实际起点
  end: pos + wordMatch.index! + rawWord.length,  // 正确的结束位置
  is_in_dict: posStr !== null,
  pos: posStr,
})
pos += token.length  // pos 推进不变
```

**教训**：`segmentSpaceDelimited` 的 token 经过 `replace()` 后长度会变化，但 `start`/`end` 应该基于原始 token 内部实际单词位置计算。token 长度不应与 cleaned word 长度混用。

### 问题 4：自建词典持久化 —— 从标注结果保存为用户词典

**背景**：标注 Tab 中的词汇列表先前只能导出为文件（`导出当前文档词汇`），不能以"词典"形态保存在扩展中，无法像内置/社区词典那样勾选启用。

**实现**：

1. **`DictionaryManager` 新增多用户词典存储**（`manager.ts`）：
   - `userDicts: Map<string, { meta: UserDictMeta; data: DictMap }>` — 类似社区词典的多词典架构
   - `userStorageDir` + `userIndexPath` — 磁盘持久化（与 community dicts 相同的模式）
   - `createUserDict(name, lang, words)` → 生成 `user-{timestamp}` ID，保存到磁盘
   - `removeUserDict(id)` → 删除词典文件 + 更新索引
   - `addWordToUserDict()` / `removeWordFromUserDict()` — 直接修改词典数据
   - `getDict()` 在合并时遍历所有启用的自建词典

2. **UI 交互**（`panel.html` / `panel.js` / `panel.css`）：
   - 标注 Tab 底部新增 `+ 保存为自建词典` 按钮（有词汇时自动显示）
   - 弹出名称/语言选择框（VS Code Webview 沙箱限制 `prompt()`，改用自定义 overlay）
   - 词典 Tab 新增"自建"子标签（与内置/安装/社区平级）
   - 自建词典卡片显示名称、语言、词数、创建日期
   - 支持查看（进入详情页分页/搜索/编辑/删除词条）、删除整个词典
   - 在"安装"Tab 中与其他词典一样显示复选框，可勾选启用/禁用

**关键代码**（`manager.ts`）：
```typescript
async createUserDict(name: string, lang: string, words: Record<string, {pos:string[]}>): Promise<string> {
  const id = `user-${Date.now()}`
  const meta = { id, name, lang, wordCount: Object.keys(words).length, createdAt: new Date().toISOString().slice(0, 10) }
  const data: DictMap = {}
  for (const [w, entry] of Object.entries(words)) data[w.toLowerCase()] = { pos: entry.pos }
  this.userDicts.set(id, { meta, data })
  await fs.writeFile(path.join(this.userStorageDir, `${id}.json`), JSON.stringify(data), 'utf-8')
  await this.saveUserIndex()
  this.invalidateCache(lang)
  return id
}
```

### 问题 5：侧边栏词汇列表高度被截断

**现象**：标注 Tab 的词汇列表只占侧边栏一半高度，下方存在空白但列表内容不可见，需要滚动才显示。

**根因**：`.word-freq-list` 有固定 `max-height: 240px`，且父容器 `#tab-annotate` 没有使用 flex 布局填充剩余空间。

**解法**：改用 flex 布局填充可用高度：

```css
html, body { height: 100%; display: flex; flex-direction: column; }
#tab-annotate.active { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.word-freq-section { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.word-freq-list { flex: 1; min-height: 0; overflow-y: auto; }
```

### 问题 6：词典 Tab 重构 —— 内置/安装/社区/自建 四标签

**背景**：原"本地"Tab 把内置、社区、自建词典混在一起，不够直观。且缺少专门查看内置词典的入口。

**改动**：
- "本地" → 改名为"安装"，列出所有已安装词典（内置 + 社区 + 自建），提供复选框开关
- 新增"内置"Tab，仅显示 en/zh 两个内置词典，提供查看入口
- "社区"Tab不变，浏览/安装/卸载
- "自建"Tab 显示用户创建的词典

**状态追踪**：`state.dictList` 包含全部词典列表，前端用 `d.source` 过滤各 Tab 的显示内容。

### 问题 7：混排遗漏 —— 取消语言分类，改用逐字符调度

**背景**：原来的 `detectLanguageSegments()` 按段落检测 CJK 比例（阈值 30%），低于则判为 `en`。这导致 `- ❌ 不支持 streaming` 这类段落（CJK 约 18%）的中文词被完全忽略。

**解法**：移植 dict-app 的 `segment_with_lang()` 逐字符调度方案（`segmenter.rs:81-160`），替换为 `segmentMixed()`：

```
旧流程（index.ts）:
  detectLanguageSegments(text) → 按 \n\n 分段
    → 每段 detectLanguage() → CJK > 30%? → 判 zh/en
    → zh → segmentCJK() → 只查 ZH 词典
    → en → segmentSpaceDelimited() → CJK 剥离 → 中文全丢

新流程（index.ts）:
  合并所有启用的拉丁词典为 latinDict (en/fr/es/ru)
  合并所有启用的 CJK 词典为 cjkDict (zh/ja)
  → segmentMixed(text, latinDict, cjkDict, enEnabled)
    → 逐字符判断:
      ASCII → 提取连续 ASCII 块 → lookupWithLemma → 查 latinDict
      CJK   → 前向最大匹配 → 查 cjkDict (以词为单位，非逐字)
             → "键盘"匹配为整体，不是"键"+"盘"
     其他   → 跳过
```

**关键代码**（`segmenter.ts`）：

```typescript
// CJK: forward max matching — 查完整词
for (let len = maxLookup; len >= 1; len--) {
  const word = chars.slice(pos, pos + len).join('');
  const entry = cjkDict[word] ?? null;
  if (entry != null) {
    // 找到匹配，推进 pos += len（跳过整个词）
    segments.push({ word, start: pos, end: pos + len, is_in_dict: true, pos: posStr });
    pos += len;  matched = true;  break;
  }
}
// 只有找不到任何匹配时才退化为单字符
if (!matched) { /* 单字符 fallback */ }
```

**词典层的配合**：`manager.ts` 新增 `getMergedDict(langs)`，将多个语言的词典合并为一个 DictMap（各语言的 `getDict()` 各自遵守 disabledDicts 黑名单）。

**效果**：
- `我想用chatgpt` → 我想用(CJK查ZH) + chatgpt(ASCII查EN) ✅
- `- ❌ 不支持 streaming` → 不支持(CJK查ZH) + streaming(ASCII查EN) ✅
- 不再需要段落级语言检测，不依赖 CJK 比例阈值

**参考资料**：
- 实现参考 `dict-app/src-tauri/src/segmenter.rs` 的 `segment_with_lang()`
- 词典格式规范见 `docs/006-dict-format.md`

---

## 五、配置项

```
adhdgofly.enabled              boolean  默认 true           高亮总开关
adhdgofly.languages            array    默认 ["en","zh"]    启用的词典语言
adhdgofly.minWordLength        number   默认 2              最小标注词长
adhdgofly.highlightInComments  boolean  默认 true           注释内标注
adhdgofly.decorationStyle      string   color/highlight     标注模式
adhdgofly.highlightFontSize    number   0.8–1.5 默认 1.0    高亮强度（映射为 fontWeight）
adhdgofly.posFilter            array    默认全部词性         显示哪些词性
adhdgofly.disabledDicts        array    默认 []             禁用的词典 ID（空=全部启用）
adhdgofly.aiEnabled            boolean  默认 true           AI 判定总开关
adhdgofly.aiProviders          string   JSON 数组            AI 提供商列表
```

---

## 六、本地测试方法

**方式一：F5 调试（日常开发）**
1. 用 VS Code / Kiro 打开 `adhdgofly-ide-ext` 文件夹
2. 按 F5 → 弹出 Extension Development Host 新窗口
3. 在新窗口里打开任意 .md 文件 → 约 1 秒后出现高亮
4. 改代码 → Cmd+Shift+F5 重载

**方式二：VSIX 安装（测试最终效果）**
```bash
vsce package --no-yarn
# 然后在 VS Code：扩展面板 → ... → Install from VSIX
```

---

## 七、侧边栏与 Webview 通信

### 消息协议

Extension → Webview（侧边栏向页面推送消息）：

| 消息类型 | 触发时机 | 数据 |
|---------|---------|------|
| `config` | Webview ready / 设置变更 | 完整 ExtensionConfig |
| `dictList` | ready / 词典变更 | 所有词典列表 |
| `dictEntries` | 请求结果返回 | 分页词条数据 |
| `annotationResult` | 每次高亮渲染后 | words + stats + fileName |
| `toast` | 操作反馈 | message + level |
| `aiJudgeResult` | AI 判定完成/失败 | word + pos + providerName |
| `communityDictList` | 社区词典列表结果 | dicts[] |
| `userDictList` | 自建词典列表 | dicts[] |

Webview → Extension（页面操作）：

| 消息类型 | 操作 | 对应处理 |
|---------|------|---------|
| `ready` | 初始化 | 推送 config + dictList |
| `getDictEntries` | 查询词条 | 分页/搜索返回 |
| `addOrEditWord` | 保存词条 | 写入词典 + 刷新列表 |
| `deleteWord` | 删除词条 | 写入词典 + 刷新列表 |
| `exportDict` | 导出词典 | 系统保存对话框 |
| `exportCurrentDoc` | 导出当前文档词汇 | 去重后保存 JSON |
| `importDictFile` | 导入词典 | 系统文件选择器 |
| `posFilterChange` | 词性筛选 | 更新配置 |
| `updateConfig` | 设置变更 | 更新配置 + 回推 config |
| `aiJudge` | AI 判定请求 | 调用 aiJudge.ts |
| `toggleDict` | 词典开关 | 更新 enabledDicts 配置 |
| `getCommunityDicts` | 社区列表 | 从 API 获取可安装词典 |
| `installCommunityDict` | 安装社区词典 | 下载 + 持久化 |
| `uninstallCommunityDict` | 卸载社区词典 | 删除本地存储 |
| `uploadCommunityDict` | 上传到社区 | 调用 API 提交 |
| `saveUserDict` | 保存自建词典 | 创建用户词典 + 持久化 |
| `removeUserDict` | 删除自建词典 | 删除文件 + 更新索引 |
| `getUserDictList` | 刷新自建列表 | 返回当前用户词典 |

### 侧边栏文件结构

```
webview/
├── panel.html    三 Tab HTML + 编辑覆层 + toast
├── panel.js      交互逻辑（状态管理/消息处理/渲染函数）
└── panel.css     样式（VS Code CSS 变量适配暗色/亮色主题）
```

### AI 判定数据流

```
用户点击编辑覆层"AI 判定 ✨"
  → panel.js: 设 loading，post({ type: 'aiJudge', word })
  → sidePanel.ts: handleMessage → aiJudge.judgePos(word, providers)
    → 查找 isPrimary provider → fetch(provider.apiUrl) → OpenAI 兼容 API
  → post { type: 'aiJudgeResult', word, pos, providerName }
  → panel.js: 重置按钮 → 自动选中 POS 标签 → grid + toast
```

---

## 八、接下来该做什么

### 验证与打磨（马上做）

1. **AI 判定功能验证**：配置 API Key 后点击"AI 判定 ✨"，确认返回词性正确、自动选中标签
2. **词典编辑验证**：增删改词典词条，确认持久化正常
3. **导出/导入验证**：导出词典 JSON → 再导入，确认格式兼容
4. **去掉调试 log**：各模块中的 `console.log` 在发布前移除
5. **大文件边界测试**：2000 行以上文件的可见区域渲染验证

### Phase 2c — 词典社区 + 自建词典（已实现）
- 社区下载：社区 Tab 浏览 API 列表 → 安装 → 显示在安装 Tab
- 社区上传：通过"上传"按钮提交词典（需 Token）
- 管理后审：/admin 路径，管理员密码（环境变量 ADMIN_PASSWORD）
- 自建词典：标注 Tab 保存词汇 → 自建 Tab 管理（见 §四 问题4）

### Phase 3（多平台 + 社区服务端）

- ChatParticipant（VS Code 内置 AI 聊天集成）
- MCP 工具（Cursor / Windsurf）
- JetBrains 插件（复用 `highlightEngine/` 逻辑层）
- dictionary.adhdgofly.online 服务端实现
- `@adhdgofly/dict-validator` 共享校验 npm 包


---

## 九、词典启用/禁用方案（已修复）

**此 Bug 已在当前版本中修复。** 方案采用 `disabledDicts` 黑名单（原 §九 的方案一），手动逐行修正了条件判断逻辑：

- `getDict()` 中：`if (!this._disabledDicts.has(builtinId))` → 不在禁用列表 → 加载
- `getDict()` 中：`if (this._disabledDicts.has(id)) continue` → 在禁用列表 → 跳过
- `sidePanel.ts` toggle 中：勾选 → 移出黑名单；取消 → 加入黑名单

关键区别：空数组 `[]` 在 `disabledDicts` 方案中表示"不禁用任何词典"（全部启用），这是符合直觉的行为。无需特殊处理空数组边界情况。