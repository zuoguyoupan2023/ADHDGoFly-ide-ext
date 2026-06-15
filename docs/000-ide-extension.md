# IDE 词典着色扩展 — ADHDGoFly Highlight

> **本文档是 IDE 扩展的完整规划**。该扩展作为 dict-app/adhdgoflyplugin 的并行独立项目，核心复用其词典数据和高亮逻辑，在主流 IDE 中为编辑器文本提供词性标注着色，并探索 AI 聊天面板的标注能力。

---

## 一、项目定位与生态

### 1.1 三项目关系

```
┌────────────────────────────────────────────────────────────────────┐
│                    ADHDGoFly 生态体系                              │
│                                                                    │
│  dict-app (桌面词典工具)          adhdgoflyplugin (浏览器扩展)      │
│  ┌───────────────────────┐       ┌──────────────────────────┐      │
│  │ Tauri 2.x 桌面应用    │       │ 浏览器侧内容词性标注      │      │
│  │ Rust 分词/Cache       │       │ 网页文本分词/着色         │      │
│  │ 工作区管理            │       │ 词典匹配                  │      │
│  │ 批量文件处理          │       └──────────────────────────┘      │
│  └───────┬───────────────┘                                         │
│          │ 共享词典 JSON                                          │
│          ▼                                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  adhdgofly-highlight (IDE 扩展) — 本文档规划对象              │  │
│  │                                                               │  │
│  │  运行环境：VS Code Extension Host / JetBrains Plugin Runtime   │  │
│  │  API 限制：不可访问 DOM、不可注入脚本到其他扩展的 webview      │  │
│  │  核心能力：Decoration API（编辑器区） / MCP 工具（聊天区）    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

**关键区分**：

| 维度 | dict-app | adhdgoflyplugin (浏览器) | adhdgofly-highlight (IDE) |
|------|----------|------------------------|--------------------------|
| **运行环境** | Tauri + Vite (WebView) | 浏览器 Content Script | VS Code Extension Host |
| **DOM 访问** | 完整（自有组件树） | 完整（任意网页） | **受限**（仅编辑器 Decoration API） |
| **分词执行** | Rust (Tauri IPC) | 前端 JavaScript | 前端 TypeScript (Embedded) |
| **词典来源** | 本地文件 + 社区下载 | 内置 + 用户导入 | 内置 (en/zh) + 社区下载 (dictionary.adhdgofly.online) + 本地导入 |
| **高亮方式** | HTML `<span>` + CSS | HTML `<span>` + CSS | VS Code `DecorationType` |
| **AI 聊天融合** | 不涉及 | 不涉及 | **待调研**（不同 IDE 策略不同） |

### 1.2 IDE 环境特殊性

IDE 扩展与桌面应用/浏览器扩展最大的区别在于**渲染环境**：

```
桌面 App:    开发者完全控制 UI 渲染树
             ↓
浏览器扩展:  Content Script 可访问 DOM，用 <span> 直接着色
             ↓
IDE 扩展:    不能直接操作编辑器 DOM
           只能通过 Extension API 进行"声明式"装饰
           ─ Decorations 是 overlay 层，不改变底层文本
           ─ 聊天面板是封闭 Webview，不可注入
```

这意味着 IDE 扩展不能简单复用 dict-app 的 `preview.js` 着色逻辑，而需要：
1. 保留**分词引擎**（`segmenter.js` BMM 算法 → 移植为 TypeScript）
2. 保留**词典数据**（JSON 格式完全兼容）
3. 重写**渲染层**（`<span>` → `TextEditorDecorationType`）
4. 为聊天面板设计**独立策略**（MCP 工具 / WebviewView）

---

## 二、IDE 三区分析

一个典型的编程 IDE（VS Code / Cursor / Trae / Windsurf / JetBrains）可抽象为三个核心区域，每个区域的高亮策略完全不同：

```
┌──────────────────────────────────────────────────────────────┐
│  [文件列表]  │              [代码编辑区]       │ [AI 聊天]   │
│  (左侧)      │  (中间 - 主战场)                │ (右侧)      │
│              │                                  │             │
│  src/        │  import { ref } from 'vue'       │ ┌───────┐  │
│  ├─ utils/   │                                  │ │ User:  │  │
│  │  ├─ a.ts  │  const hello = 'world'  ← 名词   │ │ 帮我   │  │
│  │  └─ b.ts  │  const run = () => {}    ← 动词   │ │ 优化   │  │
│  ├─ ...      │                                  │ │ 这段   │  │
│  │           │  // TODO: fix this  ← adj         │ │ 代码   │  │
│  README.md   │                                  │ ├───────┤  │
│              │  # Project Title  ← 名词          │ │ AI:    │  │
│              │  ## Description  ← 名词           │ │ 可以   │  │
│              │                                  │ │ 这样   │  │
│              │                                  │ │ 优化   │  │
│              │                                  │ └───────┘  │
└──────────────────────────────────────────────────────────────┘
```

### 2.1 左侧：文件列表（File Tree / Explorer）

| IDE | API 访问 | 可高亮？ |
|-----|---------|---------|
| VS Code | `window.createTreeView` + `TreeItem` | 仅自定义树可用 Decoration |
| Cursor | 同 VS Code | 同 VS Code |
| JetBrains | `ProjectView` 不可外部修改 | ❌ |
| 所有 | 原生文件树不支持扩展 decoration | ❌ |

**结论**：文件列表无法被扩展着色。放弃此区域。

### 2.2 中间：代码编辑区（主战场）

这是扩展的核心战场。支持两种类型的文件：

```
主战场文件类型：
┌────────────────────────────────────┐
│  Markdown / 纯文本（非编程人员主力） │ ← 整篇内容可标注
│  例：README.md、docs/*.md、日记    │
│  策略：全文词性着色                │
├────────────────────────────────────┤
│  代码文件（含注释的编程语言文件）    │ ← 仅注释/字符串可标注
│  例：app.ts、index.jsx、main.go    │
│  策略：跳过代码 Token，仅着色注释   │
├────────────────────────────────────┤
│  混合文件（MD 中含代码块）          │ ← 代码块跳过
│  例：README.md 含 ```python ...``` │
│  策略：解析代码块边界，仅标注正文    │
└────────────────────────────────────┘
```

**API 方案（VS Code）**：

```typescript
// 核心 API：TextEditorDecorationType + setDecorations()
const nounDeco = window.createTextEditorDecorationType({
  backgroundColor: 'rgba(34,197,94,0.15)',
  border: '1px solid rgba(34,197,94,0.3)',
  borderRadius: '2px',
})

// 应用
editor.setDecorations(nounDeco, ranges)  // ranges: vscode.Range[]
```

**与其他高亮的冲突分析**（详见 §六）：

| 冲突类型 | 风险 | 缓解方案 |
|---------|------|---------|
| TextMate 语法高亮 | 低 | 仅用 `backgroundColor` + `border`，不改 `color` |
| Semantic Token 高亮 | 低 | 同上 |
| 其他扩展 Decoration | 中 | 使用半透明背景，多个背景会叠加 |
| 内置语法高亮 | 低 | 独立层，互不覆盖 |

### 2.3 右侧：AI 聊天面板 ~~（探索区）~~ **[废弃 2026-06]**

~~这是最大的挑战。不同 IDE 的聊天面板实现不同，且所有平台的聊天面板都不支持扩展直接注入高亮。~~

> **[废弃原因]** 所有 IDE 的聊天面板都是封闭 Webview，VS Code Extension API 没有提供向聊天面板注入装饰/DOM 的能力。WebviewView 侧边栏（已实现）是更务实的方案——在三 Tab 标注视图中可以完全自定义渲染着色，比试图往聊天面板里注入更可控。ChatParticipant / MCP 工具虽能输出标注文本，但只能以纯文本或 markdown 格式呈现，无法达到"着色"效果。保留 MCP 工具作为 Cursor/Windsurf 的扩展接入方式，去掉"聊天面板着色"的预期。

#### 2.3.1 ~~各 IDE 聊天面板调研结果~~ **[废弃]**

~~| IDE | 底层技术 | 对扩展开放？ | MCP 支持 | 可行方案 |~~
|-----|---------|------------|---------|---------|
| **VS Code** | 内置 Webview | ❌ 封闭 | ✅ 支持 ChatParticipant | ChatParticipant 的 markdown 输出（有限格式化） |
| **Cursor** | 自研 Webview | ❌ 封闭 | ✅ MCP 工具注册 | MCP 工具返回标注文本 |
| **Trae** | 自研 Webview | ❌ 封闭 | 未知 | 待跟踪 API 更新 |
| **Windsurf** | 自研 Webview | ❌ 封闭 | ✅ MCP 支持 | MCP 工具返回标注文本 |
| **Kiro (AWS)** | VS Code fork | ❌ 封闭 | ✅ 支持 MCP（Powers） | 同 VS Code ChatParticipant 方案；Kiro 是 VS Code fork，Extension API 兼容 |
| **Trae** | 自研 Webview | ❌ 封闭 | ✅ 支持 MCP | MCP 工具返回标注文本（官方文档已确认 MCP 支持） |
| **CodeBuddy** | VS Code Ext | ❌ 封闭 | N/A | 自身是扩展，不可被其他扩展修改 |
| **Qodo (Codium)** | VS Code Ext | ❌ 封闭 | N/A | 同 CodeBuddy |

**关键发现**：所有 IDE 的 AI 聊天面板都是**封闭的 Webview**，VS Code Extension API **没有**提供向聊天面板注入装饰/DOM 的能力。

#### ~~2.3.2 可行方案对比~~ **[废弃]**

~~| 方案 | 可行性 | 体验 | 实现成本 |
|------|--------|------|---------|
| **A. ChatParticipant markdown 输出** | ✅ VS Code 原生 | 中：文本格式，无法着色 | 低 |
| **B. MCP 工具注册** | ✅ Cursor/Windsurf | 中：AI 主动调用，返回标注 | 中 |
| **C. WebviewView 侧边栏** | ✅ 所有 IDE | 高：完全自定义渲染 | 高 |
| **D. 内容复制到侧边栏** | ✅ 所有 IDE | 低：需手动操作 | 低 |~~

**实际方案**：WebviewView 侧边栏（已实现）。三 Tab（标注/词典/设置）中标注视图已支持完整着色渲染，替代了 Chat 面板着色的需求。

#### ~~2.3.3 ChatParticipant 方案（VS Code 原生）~~ **[废弃]**

> ~~VS Code Chat 视图~~ 聊天面板无法着色，ChatParticipant 最多输出纯 markdown。已由 WebviewView 侧边栏替代。代码保留在 `src/vscode/chatParticipant.ts` 但未激活。

```
VS Code Chat 视图
┌────────────────────────────────┐
│  ADHDGoFly Chat Participant    │
│  ────────────────────────────  │
│  用户: 分析这段英文 md 的词汇   │
│                              │
│  ADHDGoFly:                   │
│  **The** [det] **quick** [adj]│
│  **brown** [adj] **fox** [n]  │
│  **jumps** [v] **over** [prep]│
│  **the** [det] **lazy** [adj] │
│  **dog** [n]                  │
│                              │
│  [Analyze Selection]          │
└────────────────────────────────┘
```

注册实现：

```typescript
// extension.ts
import { chat, ChatParticipant, ChatRequest, ChatResponseStream } from 'vscode'

export function activate(context: ExtensionContext) {
  const participant = chat.createChatParticipant('adhdgofly.annotate', handler)

  participant.iconPath = Uri.joinPath(context.extensionUri, 'icon.png')

  // 注册变量解析器（支持 #selection）
  participant.variableResolver = {
    resolve: (name: string) => {
      if (name === 'selection') {
        const editor = window.activeTextEditor
        return editor?.document.getText(editor.selection) || ''
      }
      return ''
    }
  }
}

// 聊天请求处理
async function handler(
  request: ChatRequest,
  stream: ChatResponseStream,
  token: CancellationToken
) {
  const text = request.prompt
  // 分词 + 匹配
  const segments = segmentText(text, detectLanguage(text), getDictionary('en'))
  const annotated = segments
    .map(s => s.is_in_dict
      ? `**${s.word}** [${s.pos}]`
      : s.word
    )
    .join(' ')

  stream.markdown(annotated)
}
```

**局限**：
- 只能输出 markdown（**加粗**、链接、代码块）
- 无法对 chat 中的文本进行内联着色（没有 Decoration API for chat）
- 用户需要主动提到 ADHDGoFly 才会触发

#### 2.3.4 WebviewView 侧边栏方案 ✅ **[已实现]**

已创建一个独立的 WebviewView 面板，提供完整的自定义渲染：

```
VS Code 侧边栏
┌──────────────┬──────────────────┐
│ ADHDGoFly   │  编辑器内容       │
│ ─────────── │                  │
│ [自动标注]   │  import { ref }  │
│              │  from 'vue'      │
│ The quick    │                  │
│ brown fox   │  const hello =   │
│ jumps over  │  'world'         │
│ the lazy    │                  │
│ dog.        │                  │
│              │                  │
│ ─ 标注 ──── │                  │
│ the → det   │                  │
│ quick → adj │                  │
│ brown → adj │                  │
│ fox  → n    │                  │
└──────────────┴──────────────────┘
```

```typescript
// 注册 WebviewView
window.registerWebviewViewProvider('adhdgofly.sidePanel', {
  resolveWebviewView(webviewView) {
    webviewView.webview.html = `<!DOCTYPE html>
      <html>
        <head>
          <style>/* 自定义高亮 CSS */</style>
        </head>
        <body>
          <div id="annotated-text"></div>
          <script>/* 渲染分词结果 */</script>
        </body>
      </html>`
  }
})
```

**优势**：
- 完全控制渲染
- 可用 dict-app 的同款着色 CSS
- 支持点击交互、词性切换等

**局限**：
- 与聊天面板分离，不是原生集成
- 需要用户主动侧边栏切换

#### 2.3.5 MCP 工具方案（Cursor / Windsurf）— **[保留]** 作为扩展集成方式，非着色方案

> MCP 工具不实现"着色"，但作为 AI 聊天直接调用词典能力的入口有价值。保留此设计供 Cursor/Windsurf 集成使用。

```
Cursor / Windsurf Chat 中用户输入:
  "标注这段文本的词汇"

AI 调用 adhdgofly MCP 工具:
  ┌─ MCP Call ──────────────────────┐
  │ annotate_vocabulary({           │
  │   text: "The quick brown fox",  │
  │   lang: "en"                    │
  │ })                              │
  └─────────────────────────────────┘

AI 回复中嵌入标注结果:
  "这段文本的词性标注如下:
   - **The** [det]
   - **quick** [adj]
   - **brown** [adj]
   - **fox** [n]"
```

**MCP 服务器注册**：

```json
// .cursor/mcp.json
{
  "mcpServers": {
    "adhdgofly": {
      "command": "node",
      "args": ["${workspaceFolder}/.cursor/mcp-server.js"],
      "env": {}
    }
  }
}
```

**MCP 工具实现**：

```typescript
// mcp-server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const server = new Server({
  name: 'adhdgofly',
  version: '1.0.0',
}, {
  capabilities: { tools: {} }
})

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: 'annotate_vocabulary',
    description: 'Analyze English text and return POS annotations for each word',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        lang: { type: 'string', enum: ['en','zh','fr','es','ru','ja'] }
      }
    }
  }]
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'annotate_vocabulary') {
    const { text, lang } = request.params.arguments
    const segments = segmentText(text, lang || 'en', dictionary)
    const result = segments
      .filter(s => s.is_in_dict)
      .map(s => `${s.word} [${s.pos}]`)
      .join('\n')
    return { content: [{ type: 'text', text: result }] }
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
```

---

## 三、架构设计

### 3.0 模块化设计原则

你熟悉 Vue/React 的组件化思路——IDE 扩展同样可以按职责拆分模块，避免单文件膨胀。核心原则：

```
网站开发类比 → IDE 扩展对应概念：

  main.ts（Vue 入口）     →  extension.ts（只做注册和生命周期）
  组件（UI + 逻辑混合）   →  拆分为独立层，UI 与逻辑分离
  store（状态管理）       →  config.ts（扩展设置状态）
  service 层             →  highlightEngine/（纯逻辑，不依赖 VS Code）
  platform adapter       →  vscode/（所有 VS Code API 调用集中在这里）
  UI 组件（.vue 文件）    →  webview/（侧边栏的 HTML/CSS/JS 模板）
```

**最关键的分层原则**：`highlightEngine/` 内部**一行 `vscode` 的 import 都不能有**。分词、匹配、词形还原是纯计算逻辑，这样做的好处：

1. **可以用 Vitest 直接测试**，不需要启动完整 VS Code Extension Host
2. **未来移植到 JetBrains** 只需换 `vscode/` 适配层，逻辑层原封不动
3. **调试更容易**，逻辑 bug 和平台 bug 不会混在一起

这和你做网站时把 API 请求抽到 `service/`、不直接在组件里 fetch 是同一个道理。

### 3.1 目录结构

```
adhdgofly-highlight/
├── package.json                    # VS Code 扩展清单（含 activationEvents、contributes.configuration）
├── tsconfig.json
├── vitest.config.ts
├── .vscodeignore
├── README.md
│
├── src/
│   ├── extension.ts                # 激活入口 — 只做注册/注销，不含业务逻辑
│   │                               # 相当于 Vue 的 main.ts
│   │
│   ├── highlightEngine/            # ★ 纯逻辑层（零 vscode 依赖，可独立测试）
│   │   ├── index.ts                #   调度入口，流程协调
│   │   ├── segmenter.ts            #   BMM 分词（移植自 dict-app）
│   │   ├── language.ts             #   语言检测 + 混排段落分析
│   │   ├── matcher.ts              #   词典匹配 → 词性标注
│   │   ├── lemmatizer.ts           #   词形还原（英语；其他语言精确匹配）
│   │   └── types.ts                #   Segment / DecoratedWord 等核心类型
│   │
│   ├── vscode/                     # VS Code 平台适配层（所有 vscode.* 调用在此）
│   │   ├── decorator.ts            #   Decoration API：创建/更新/清除 DecorationType
│   │   ├── textMate.ts             #   注释/字符串范围检测（代码文件过滤）
│   │   ├── config.ts               #   配置读写（workspace settings）
│   │   ├── activationGuard.ts      #   激活时机 + 文件大小限制守卫
│   │   ├── chatParticipant.ts      #   [废弃] ChatParticipant（聊天面板无法着色）
│   │   └── sidePanel.ts            #   WebviewView 侧边栏（已实现）
│   │
│   ├── cursor/                     # Cursor 专用（Phase 2）
│   │   └── mcpServer.ts            #   MCP 工具服务器（stdio）
│   │
│   ├── dictionary/                 # 词典数据层
│   │   ├── loader.ts               #   加载内置词典（VSIX 静态资源）
│   │   ├── downloader.ts           #   从社区 API 下载词典（Phase 2）
│   │   ├── merger.ts               #   四层词典合并（内置→社区→用户自定义）
│   │   └── types.ts                #   DictEntry / Dictionary / DictMeta 类型
│   │
│   ├── utils/                      # 通用工具（无 vscode 依赖）
│   │   ├── debounce.ts             #   防抖
│   │   └── stopwords.ts            #   各语言编程关键词过滤集合
│   │
│   └── test/
│       ├── segmenter.test.ts       #   分词单元测试
│       ├── matcher.test.ts         #   词典匹配单元测试
│       ├── lemmatizer.test.ts      #   词形还原边界测试
│       ├── language.test.ts        #   语言检测 + 混排测试
│       ├── decorator.test.ts       #   Decoration 范围生成测试
│       └── textMate.test.ts        #   注释范围检测测试
│
├── webview/                        # 侧边栏 UI 层（Phase 2）
│   ├── panel.html                  #   WebviewView 模板
│   ├── panel.css                   #   词性颜色 CSS（与 dict-app variables.css 一致）
│   └── panel.js                    #   渲染逻辑（接收 postMessage，渲染标注结果）
│
├── dictionaries/                   # 词典数据（VSIX 静态资源）
│   ├── en.json                     #   ★ 内置：英语（从 dict-app 复制，独立维护）
│   ├── zh.json                     #   ★ 内置：中文（从 dict-app 复制，独立维护）
│   └── README.md                   #   其他语言通过社区 dictionary.adhdgofly.online 安装
│
└── .github/workflows/
    └── ci.yml                      # CI/CD（lint + test + build + size-check）
```

**webview/ 与 src/ 分离的原因**：Webview 里的资源必须通过 `webview.asWebviewUri()` 转换路径，不能直接 import TypeScript 模块。把 HTML/CSS/JS 放在独立目录，避免和 Extension Host 侧的 TypeScript 源码混淆。

### 3.2 激活时机设计

`activationEvents` 决定扩展何时被加载，直接影响 VS Code 启动性能。**按需激活**是原则。

```json
// package.json 中的 activationEvents
{
  "activationEvents": [
    "onLanguage:markdown",
    "onLanguage:plaintext",
    "onLanguage:javascript",
    "onLanguage:typescript",
    "onLanguage:javascriptreact",
    "onLanguage:typescriptreact",
    "onLanguage:python",
    "onLanguage:go",
    "onLanguage:html",
    "onCommand:adhdgofly.enable",
    "onCommand:adhdgofly.annotateSelection"
  ]
}
```

**策略说明**：
- 使用 `onLanguage:xxx` 而非 `*`（全局激活）或 `onStartupFinished`
- 用户只打开了一个 Python 文件，扩展才激活——不影响打开 JSON/配置文件时的启动速度
- `onCommand` 保证用户手动执行命令时也能激活

```typescript
// vscode/activationGuard.ts
// 负责运行时的"是否应该处理这个文档"判断，与激活时机分开管理
export function shouldProcessDocument(doc: TextDocument): boolean {
  const SUPPORTED_LANGUAGES = new Set([
    'markdown', 'plaintext', 'html',
    'javascript', 'typescript', 'javascriptreact', 'typescriptreact',
    'python', 'go',
  ])
  return SUPPORTED_LANGUAGES.has(doc.languageId)
}
```

### 3.3 高亮引擎数据流

```
onDidChangeTextDocument / onDidChangeActiveTextEditor
  ↓ debounce(300ms)
  ↓ activationGuard.shouldProcessDocument() → 不支持的文件类型直接返回
  ↓ 文件行数 > 2000 行 → 切换为 visibleRanges 模式（仅处理可见区域）
检测文档语言（document.languageId + 内容检测）
  ↓
混排语言处理（language.ts）：
  ─ 对文档分段检测，每个自然段独立判断语言
  ─ 返回 LanguageSegment[]: { range, lang }
  ─ 同一文档可有多个不同语言段（如中英混排 README）
  ↓
判断文件类型策略：
  ├─ markdown / plaintext → 全文分词（每段按检测到的语言处理）
  ├─ 代码文件 (js/ts/py/go) → 提取注释/字符串范围后，仅这些范围内分词
  └─ md 含代码块 → 解析 fenced code block，仅代码块外正文分词
  ↓
BMM 分词（segmenter.ts — 移植自 dict-app src-vue/utils/segmenter.js）
  ─ 正向最大匹配（BMM）
  ─ 空格分隔语言（en/fr/es/ru）：按空格/标点 split
  ─ CJK 语言（zh/ja）：按字符前向匹配
  ↓
词形还原（lemmatizer.ts）— 仅英语，其他语言跳过此步
  ─ Phase 1 范围：英语常见后缀规则（s/es/ed/ing/ly/er/est/tion）
  ─ 规则有例外（如 "ring" 不能还原为 "r"），通过黑名单排除
  ─ 法语/西班牙语/俄语变形复杂，Phase 1 精确匹配，Phase 3 再扩展词形还原
  ↓
词典匹配（matcher.ts）
  ─ 按语言加载对应词典（Map<string, string> — word → posString）
  ─ 返回 DecoratedWord[]: { word, range: Range, pos, colorClass }
  ↓
范围过滤（仅代码文件）
  ─ 用 TextMate scope / 正则判断注释/字符串范围
  ─ 剔除不在这些范围内的 match
  ─ 剔除编程语言关键词（stopwords.ts）
  ↓
最小词长过滤（config.minWordLength，默认 2）
  ─ 过滤掉单字母词如 "a"、"I"（可配置）
  ↓
Decoration 生成（decorator.ts）
  ─ 按词性分 5 个 DecorationType：n / v / adj / adv / other
  ─ editor.setDecorations(posNDeco, nRanges)
  ─ editor.setDecorations(posVDeco, vRanges)
  ─ ...
  ↓
编辑器渲染（overlay 层，不影响底层文本）
```

### 3.4 词性着色方案

与 dict-app 保持语义一致，但使用 `DecorationType` + 半透明 `backgroundColor`：

| 词性 | DictApp CSS | IDE Decoration 颜色 | 词性颜色类 |
|------|------------|---------------------|-----------|
| 名词 (n) | `--ok-color` | `rgba(34,197,94,0.15)` + 绿边框 | `pos-n` |
| 动词 (v) | `--err-color` | `rgba(239,68,68,0.15)` + 红边框 | `pos-v` |
| 形容词 (adj/a) | `--primary-t` | `rgba(59,130,246,0.15)` + 蓝边框 | `pos-adj` |
| 副词 (adv) | `--primary-t` | `rgba(99,102,241,0.15)` + 靛蓝边框 | `pos-adv` |
| 其他 | `--text-muted` | `rgba(156,163,175,0.12)` + 灰边框 | `pos-other` |

---

## 四、高亮冲突与代码文件策略

### 4.1 渲染层级

VS Code 编辑器渲染管线有三层，**独立叠加**：

```
Z 序（后 → 前）:
  1. TextMate Grammar（语法高亮） — 基础文本颜色
  2. Semantic Tokens（语义令牌）  — 可选，可能覆盖 #1
  3. Decorations（装饰层）       — 本文扩展所在层
     ├─ backgroundColor（背景色） → 与语法高亮不冲突
     ├─ border → 不冲突
     └─ color（文本色） → 会覆盖语法高亮颜色 ← 避免使用！
```

**关键原则**：Decoration 的 `color` 属性会覆盖 TextMate 分配的文本色，但 `backgroundColor` 和 `border` 不会。因此 **避免使用 `color`**，仅用 `backgroundColor` + `border`。

### 4.2 与其他扩展的冲突

| 冲突场景 | 表现 | 缓解 |
|---------|------|------|
| 两扩展同时设 `backgroundColor` | 两个背景叠加（可能变深） | 半透明背景（alpha 0.15），叠加后只是略深 |
| 两扩展同时设 `color` | 后调用的覆盖前者 | ADHDGoFly 不使用 `color`，此冲突不涉及 |
| 扩展修改同一 range 的 `border` | 可能重叠 | 用 `borderCollapse` 策略 |

### 4.3 代码文件（.js/.ts/.py/.go）的智能范围过滤

**核心问题**：代码文件中的关键词（`function`、`const`、`return`）不应该被标注为"名词/动词"。只有**注释**和**字符串字面量**中的自然语言文本才适合标注。

**方案：TextMate Scope 检测 + 编程关键词过滤**

```typescript
// 策略 1：仅高亮注释/字符串范围
async function getCommentRanges(document: TextDocument): Promise<Range[]> {
  const ranges: Range[] = []

  // 使用 VS Code 的语法分析命令获取语义令牌
  const tokens = await commands.executeCommand<SemanticTokens>(
    'vscode.executeDocumentRangeSemanticTokens',
    document.uri,
    new Range(0, 0, document.lineCount, 0)
  )

  // 或使用正则匹配常见注释格式
  const text = document.getText()
  const patterns = [
    /\/\/.*$/gm,                    // 单行注释 //
    /\/\*[\s\S]*?\*\//g,           // 多行注释 /* */
    /'''[\s\S]*?'''/g,             // Python 多行字符串
    /"""[\s\S]*?"""/g,             // Python docstring
    /#.*$/gm,                      // Python/Ruby 单行注释
    /<!--[\s\S]*?-->/g,            // HTML 注释
    /`[^`]*`/g,                    // 内联代码块 (反引号)
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      const startPos = document.positionAt(match.index)
      const endPos = document.positionAt(match.index + match[0].length)
      ranges.push(new Range(startPos, endPos))
    }
  }

  return ranges
}
```

**策略 2：编程关键词过滤（stopwords）**

```typescript
// stopwords.ts
const JS_KEYWORDS = new Set([
  'function', 'const', 'let', 'var', 'return', 'if', 'else',
  'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'import', 'export', 'default', 'from', 'async', 'await',
  'class', 'extends', 'implements', 'interface', 'type',
  'new', 'this', 'super', 'delete', 'typeof', 'instanceof',
  'try', 'catch', 'finally', 'throw', 'yield', 'of', 'in',
  'true', 'false', 'null', 'undefined', 'void',
])

const PY_KEYWORDS = new Set([
  'def', 'class', 'return', 'import', 'from', 'if', 'elif',
  'else', 'for', 'while', 'break', 'continue', 'try', 'except',
  'finally', 'with', 'as', 'pass', 'yield', 'lambda', 'raise',
  'True', 'False', 'None', 'and', 'or', 'not', 'in', 'is',
])

const GO_KEYWORDS = new Set([
  'func', 'return', 'if', 'else', 'for', 'range', 'switch',
  'case', 'default', 'break', 'continue', 'go', 'defer', 'select',
  'type', 'struct', 'interface', 'map', 'chan', 'nil', 'true', 'false',
  'var', 'const', 'package', 'import',
])

export function isProgrammingKeyword(word: string, langId: string): boolean {
  const lower = word.toLowerCase()

  switch (langId) {
    case 'javascript': case 'typescript': case 'javascriptreact':
    case 'typescriptreact': return JS_KEYWORDS.has(lower)
    case 'python': return PY_KEYWORDS.has(lower)
    case 'go': return GO_KEYWORDS.has(lower)
    default: return false
  }
}
```

### 4.4 策略矩阵

| 文件类型 | languageId | 策略 |
|---------|-----------|------|
| Markdown | `markdown` | 全文标注（跳过 fenced code block） |
| 纯文本 | `plaintext` | 全文标注 |
| HTML | `html` | 仅标注 `<body>` 内可见文本 |
| JavaScript/TypeScript | `javascript`, `typescript` | 仅注释/字符串范围内标注 + 跳过关键词 |
| Python | `python` | 仅注释/#docstring 范围内标注 + 跳过关键词 |
| Go | `go` | 仅注释范围内标注 + 跳过关键词 |
| JSON/YAML/TOML | 配置类 | 跳过（不标注） |

### 4.5 主题兼容

两种方案：

**方案 A：使用 VS Code ThemeColor（推荐初期）**

```typescript
const nounDeco = window.createTextEditorDecorationType({
  backgroundColor: new ThemeColor('editorWarning.background'),
  border: '1px solid',
  borderColor: new ThemeColor('editorWarning.foreground'),
  borderRadius: '2px',
})
```

- 自动适配亮/暗/高对比主题
- 但是颜色和词性的对应关系不够直观

**方案 B：硬编码半透明颜色（推荐后期）**

```typescript
function getPosDecoration(color: string): DecorationRenderOptions {
  const isDark = window.activeColorTheme.kind === ColorThemeKind.Dark
                    || ColorThemeKind.HighContrast
  return {
    backgroundColor: isDark ? `${color}26` : `${color}1A`,  // alpha: 15% / 10%
    border: `1px solid ${isDark ? `${color}4D` : `${color}40`}`,  // alpha: 30% / 25%
    borderRadius: '2px',
  }
}
```

- 颜色与词性的对应关系与 dict-app 一致
- 需要监听 `onDidChangeActiveColorTheme` 重建 DecorationType

---

## 五、开发计划

### 5.1 Phase 1：VS Code 编辑器着色 MVP（2-3 周）

**目标**：最简可行产品，打开 Markdown/纯文本文件自动着色

**任务清单**：

1. **项目脚手架**
   - `package.json`（VS Code 扩展清单）
   - TypeScript 编译配置
   - Vitest 测试配置
   - ESLint

2. **高亮引擎核心**（移植自 dict-app）
   - `segmenter.ts`：BMM 分词算法（从 `src-vue/utils/segmenter.js` 移植）
   - `language.ts`：语言检测（从 `src-vue/utils/language.js` 移植）
   - `matcher.ts`：词典匹配
   - `types.ts`：Segment / DecoratedWord 类型

3. **词典加载**
   - `loader.ts`：从 VSIX 静态资源读取内置词典（**仅 en + zh**，直接从 dict-app 复制 JSON，独立维护）
   - 其余语言（fr/es/ru/ja）通过词典社区按需下载，不打包进 VSIX

4. **Decoration 渲染**
   - `decorator.ts`：5 种 DecorationType 创建 + 更新
   - 监听 `onDidChangeTextDocument`（防抖 300ms）
   - 监听 `onDidChangeActiveTextEditor`

5. **代码文件智能过滤**
   - `textMate.ts`：注释/字符串范围检测（正则方案）
   - `stopwords.ts`：编程语言关键词黑名单
   - 策略分派：markdown/plaintext vs 代码文件

6. **设置项（Phase 1 需全部定好接口）**

   在 `package.json` 的 `contributes.configuration` 中声明，`config.ts` 读写：

   ```json
   {
     "adhdgofly.enabled": {
       "type": "boolean", "default": true,
       "description": "启用/禁用词性着色"
     },
     "adhdgofly.languages": {
       "type": "array", "default": ["en", "zh"],
       "description": "启用的词典语言列表"
     },
     "adhdgofly.minWordLength": {
       "type": "number", "default": 2,
       "description": "最短标注词长度（过滤 'a'、'I' 等单字母词）"
     },
     "adhdgofly.highlightInComments": {
       "type": "boolean", "default": true,
       "description": "是否在代码文件的注释/字符串中标注"
     },
     "adhdgofly.decorationStyle": {
       "type": "string", "default": "background",
       "enum": ["background", "underline", "border"],
       "description": "标注样式：背景色 / 下划线 / 边框"
     },
     "adhdgofly.posFilter": {
       "type": "array",
       "default": ["n", "v", "adj", "adv", "other"],
       "description": "显示哪些词性的标注，可关掉不需要的词性"
     }
   }
   ```

   > **为什么 Phase 1 就要定好**：VS Code 扩展的 `contributes.configuration` 一旦发布就是公开 API，用户的设置文件会存 key 名。Phase 2 再改 key 名会 breaking change。

7. **单元测试**
   - 覆盖分词、匹配、装饰范围生成

8. **发布准备**
   - README + 截图
   - `.vscodeignore`（排除 `src/test/`、`node_modules/`、`webview/` 源文件仅保留编译后产物）
   - CI 配置（见下方 §5.4）

### 5.2 Phase 2：WebviewView 侧边栏 + 词典管理 + AI 判定（已完成）

**目标**：WebviewView 侧边栏完整渲染（标注/词典/设置三 Tab），AI 词性判定，词典导入导出

> ~~Phase 2 原先包含 ChatParticipant 和 MCP 工具。ChatParticipant 方案已废弃（聊天面板无法着色），由 WebviewView 替代。MCP 工具作为 Cursor/Windsurf 集成入口保留。~~

**已实现内容**：

1. **WebviewView 侧边栏**（`sidePanel.ts` + `webview/panel.{html,js,css}`）
   - 三 Tab：标注视图 / 词典管理 / 设置
   - 实时同步当前编辑器标注结果
   - 词性统计 + 频率排序 / 搜索
   - 词条编辑覆层（新增/编辑词性/删除）

2. **词典管理**
   - 词典列表 → 详情（分页/搜索）→ 编辑/新增/删除
   - 导出 JSON（dict-app 兼容格式）
   - 导入外部 JSON 词典

3. **AI 词性判定**（`aiJudge.ts`）
   - 多 AI Provider 可配置（主用选择）
   - OpenAI 兼容 API
   - 自动选中返回词性

4. **词典社区**（`dictionary/downloader.ts` + `vscode/dictCommunity.ts`，待实现）

   通过 `dictionary.adhdgofly.online` API 实现词典的浏览、安装和管理：

   ```
   下载来源: dictionary.adhdgofly.online/api/dicts（社区词典 API）
   存储位置: globalStorageUri/community-dicts/{id}.json（跨工作区共享）
   离线处理: API 不可达时已安装词典正常工作，仅禁用"浏览/安装"功能
   完整性校验: 下载后比对 SHA256（API 随词典提供 checksum）
   本地导入: 支持从文件导入符合格式的 JSON（dict-app 导出兼容）
   输入安全: 下载文件大小上限 10MB，词条数上限 100,000 条
   ```

### 5.4 CI/CD 流程

`.github/workflows/ci.yml` 包含两条流水线：

**PR 检查（每次 push/PR 触发）**：

```yaml
jobs:
  check:
    steps:
      - run: npm ci
      - run: npm run lint          # ESLint
      - run: npm run typecheck     # tsc --noEmit
      - run: npm run test          # Vitest（单元测试）
      - run: npm run build         # esbuild 打包
      - name: VSIX size check
        run: |
          npx vsce package --no-yarn
          SIZE=$(du -k *.vsix | cut -f1)
          echo "VSIX size: ${SIZE}KB"
          [ "$SIZE" -lt 5120 ] || (echo "VSIX > 5MB, check dictionaries!" && exit 1)
```

**发布（tag push `v*` 触发）**：

```yaml
jobs:
  publish:
    steps:
      - run: npm ci && npm run build
      - run: npx vsce publish --pat ${{ secrets.VSCE_TOKEN }}
      - run: npx ovsx publish *.vsix --pat ${{ secrets.OVSX_TOKEN }}
      - name: Upload VSIX to GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: "*.vsix"
```

**关键说明**：
- VSIX 大小卡 5MB 上限（词典体积的安全线）
- 发布到 VS Code Marketplace + Open VSX 两个渠道同步
- `VSCE_TOKEN` / `OVSX_TOKEN` 存 GitHub Actions Secrets，不进代码库

### 5.5 Phase 3：多平台 + 词典同步（3-4 周）

**目标**：JetBrains 支持 + dict-app 生态打通

**任务清单**：

1. **JetBrains 插件**
   - Kotlin + Gradle 项目脚手架
   - 移植高亮引擎核心为 Kotlin 或 WASM（`highlightEngine/` 零 vscode 依赖，便于此时复用）
   - `RangeHighlighter` API 适配
   - 词性颜色配置

2. **dict-app 词典同步**
   - 监听 `~/.dict-app/exports/` 目录
   - 自动加载新导出词典

3. **词形还原扩展**
   - 法语/西班牙语变形规则（Phase 1 这两种语言精确匹配，此阶段扩展）
   - 考虑引入轻量级 stemmer 库（如 `natural` npm 包的对应语言模块）

4. **性能优化**
   - 大型文件（> 5000 行）分段处理
   - 词典懒加载
   - 增量更新（只重新分词变化的行）

---

## 六、词典数据格式与来源生态

### 6.1 词典 JSON 格式（与 dict-app 共享）

```typescript
// dictionary/types.ts — 与 dict-app 共用类型
interface DictEntry {
  word: string
  pos?: string[]       // 词性列表，如 ["v", "n"]
  frequency?: number
  source?: string
}

type Dictionary = Record<string, DictEntry>

// 分词结果（与 dict-app segmenter.js 输出一致）
interface Segment {
  word: string
  start: number
  is_in_dict: boolean
  pos?: string       // 逗号分隔，如 "v,n"
  end?: number
}

// 装饰数据
interface DecoratedWord {
  word: string
  range: vscode.Range
  pos: string
  colorClass: 'pos-n' | 'pos-v' | 'pos-adj' | 'pos-adv' | 'pos-other'
}
```

格式约定：
- 键为小写词形（英文）或原始词（中文）
- 值为词性字符串，多词性用逗号分隔，如 `"v,n"`
- 整个文件是一个扁平的 `Record<string, string>` 对象，便于 `Map` 直接加载

### 6.2 词典来源体系（四层）

```
┌─────────────────────────────────────────────────────────────────┐
│                    词典来源优先级（高 → 低）                      │
│                                                                 │
│  ① 用户本地自定义词典（最高优先级）                              │
│     来源 A：用户手动编辑（插件内编辑器）                         │
│     来源 B：从 dict-app 导出的 JSON 文件导入                     │
│     存储：globalStorageUri/user-dicts/                          │
│                                                                 │
│  ② 词典社区下载词典（dictionary.adhdgofly.online）               │
│     通过 API 浏览/搜索/安装社区贡献词典                          │
│     存储：globalStorageUri/community-dicts/                     │
│                                                                 │
│  ③ 内置词典（VSIX 静态资源，随扩展安装）                         │
│     en.json（英语）+ zh.json（中文）                            │
│     直接从 dict-app/dictionaries/ 复制，独立维护，不引用原文件   │
│                                                                 │
│  ④ 降级（无词典时）：仅显示文本，不标注                          │
└─────────────────────────────────────────────────────────────────┘
```

合并逻辑（`dictionary/merger.ts`）：
- 加载顺序：③ 内置 → ② 社区 → ① 用户自定义
- 后加载的覆盖先加载的（用户自定义最终生效）
- 用户标记"删除"的词条在合并后移除

### 6.3 内置词典（来源 ③）

**en.json + zh.json** 直接从 `dict-app/dictionaries/` 复制到本项目 `dictionaries/` 目录，**不通过路径引用**，作为独立副本维护。

理由：
- 避免两个项目产生文件系统耦合
- dict-app 更新词典时，IDE 扩展可以选择性地同步（人工 review 后复制），而不是自动跟随
- VSIX 打包时需要词典文件在项目内部

未来同步方式：dict-app 导出新版词典 → 手动或脚本复制到本项目 → 走 CI 发布新版本。

### 6.4 词典社区（来源 ②）— `dictionary.adhdgofly.online`

**规划中的 API 接口**（域名 `dictionary.adhdgofly.online`）：

```
GET  /api/dicts              → 获取社区词典目录列表
GET  /api/dicts/:id          → 获取单个词典元信息（名称、语言、词条数、作者、版本）
GET  /api/dicts/:id/download → 下载词典 JSON 文件
GET  /api/dicts/:id/checksum → 获取 SHA256 校验值
```

词典元信息结构：

```json
{
  "id": "fr-basic-v2",
  "name": "法语基础词典 v2",
  "lang": "fr",
  "wordCount": 8420,
  "author": "community",
  "version": "2.1.0",
  "sha256": "abc123...",
  "downloadUrl": "https://dictionary.adhdgofly.online/api/dicts/fr-basic-v2/download"
}
```

插件内交互流程（`vscode/dictManager.ts`，Phase 2 实现）：

```
用户打开词典管理面板
  ↓
GET /api/dicts → 展示词典列表（语言、名称、词条数、已安装标记）
  ↓
用户点击安装
  ↓
下载 JSON → 校验 SHA256 → 存入 globalStorageUri/community-dicts/{id}.json
  ↓
merger.ts 重新合并 → 立即生效，无需重启
  ↓
"词典 fr-basic-v2 已安装，8420 个词条" Toast 通知
```

离线处理：API 不可达时，已安装的词典正常使用，不影响现有功能。

### 6.5 本地自定义词典（来源 ①）

两种导入方式：

**方式 A：从 dict-app 导出导入**

dict-app 支持将用户编辑的词典导出为 JSON，格式与内置词典完全一致。用户可以：

```
dict-app 导出 → 得到 my-custom-en.json
  ↓
IDE 扩展词典管理面板 → "从文件导入"
  ↓
读取并校验格式 → 存入 globalStorageUri/user-dicts/
  ↓
merger.ts 合并（最高优先级）
```

**方式 B：直接在插件内编辑**

Phase 2 提供简单的词条编辑界面：
- 添加新词条（词 + 词性）
- 修改已有词条的词性
- 标记删除某个词条（从所有词典中屏蔽该词）

编辑结果保存为 `globalStorageUri/user-dicts/edits.json`，格式：

```json
{
  "en": {
    "refactor": { "pos": "v", "deleted": false },
    "foo": { "deleted": true }
  }
}
```

**方式 C：从本地 JSON 文件直接加载**（开放给高级用户）

用户也可以手动将任意符合格式的 JSON 文件放置到 `globalStorageUri/user-dicts/` 目录，扩展启动时自动扫描并加载。格式要求与内置词典相同。

### 6.6 与 dict-app 的关系澄清

| 维度 | 关系 |
|------|------|
| 词典 JSON 格式 | 完全相同，互相兼容 |
| 内置词典文件 | **复制**（独立副本），不引用 dict-app 路径 |
| 词典社区 | 共享同一个 `dictionary.adhdgofly.online`（dict-app 也可对接） |
| 用户自定义词典 | 可互相导入导出（通过文件），但存储路径各自独立 |
| 代码 | **零耦合**，IDE 扩展不 `import` dict-app 的任何模块 |

---

## 七、发布与更新

### 7.1 发布渠道

| 渠道 | 目标用户 | 发布方式 |
|------|---------|---------|
| VS Code Marketplace | VS Code 用户 | `vsce publish` |
| Open VSX | VSCodium / 开源 VS Code | `ovsx publish` |
| GitHub Releases | Cursor / Windsurf 用户 | 手动下载 VSIX |
| JetBrains Marketplace | IntelliJ / WebStorm 用户 | 待 Phase 3 |

### 7.2 版本策略

```
Phase 1 — Editor Highlight:  0.1.0 → 0.9.x (迭代完善)
Phase 2 — Chat + Side Panel: 1.0.0 → 1.x
Phase 3 — JetBrains + Sync:  2.0.0 → 2.x
```

### 7.3 更新内容

- 内置词典（en/zh）更新：跟随 Patch 版本发布，从 dict-app 人工同步后复制
- 社区词典更新：由 `dictionary.adhdgofly.online` 独立维护版本，插件内可检查并更新已安装词典
- 用户自定义词典：存储在 `globalStorageUri`，不依赖扩展版本，扩展升级后自动保留

---

## 八、风险评估

| 风险 | 影响 | 概率 | 缓解 |
|------|------|------|------|
| VS Code Decoration API 范围限制 | 大文件大量 decoration 卡顿 | 中 | 文件 > 2000 行切换 visibleRanges 模式；单次 Decoration 数量上限 5000 个（超出截断并 Toast 提示） |
| IDE 版本更新导致 API 不兼容 | Chat 功能失效 | 低 | 关注 changelog，维护兼容层 |
| AI 聊天面板永远不支持注入 | 核心功能受限 | 高 | 已备 WebviewView + MCP 方案 |
| 词典版权问题 | 法律风险 | 低 | 仅使用自有创作词典 |
| JetBrains API 完全不同 | 额外开发成本 | 中 | 独立 repos，`highlightEngine/` 零 vscode 依赖保证逻辑层可复用 |
| 词典体积影响 VSIX 大小 | 安装包过大 | 低 | VSIX 仅内置 en + zh，其余按需下载；CI 卡 5MB 上限 |
| MCP 工具输入过大 | 服务卡死/内存溢出 | 低 | `text` 参数上限 10,000 字符，超出截断并返回警告；处理超时 5s |
| 词形还原规则误匹配 | 标注错误（如 "ring" 被误标） | 中 | Phase 1 仅英语词形还原，维护黑名单；其他语言精确匹配 |

---

## 九、IDE 三区高亮总结

| 区域 | 可高亮？ | 技术方案 | 实现难度 | 用户体验 |
|------|---------|---------|---------|---------|
| 左侧文件树 | ❌ | 无 API | — | — |
| 中间编辑区 | ✅ | `TextEditorDecorationType` + `setDecorations()` | 中 | 自动着色，无需用户操作 |
| 右侧聊天面板 | ⚠️ 有限 | ChatParticipant markdown / WEBVIEWVIEW / MCP | 高 | 需主动触发或切换面板 |

---

**相关文档：**
- `002-dict-app-plan.md` — 旧版 IDE 插件调研（§4）
- `009-dict-app-dataflow.md` — 分词/匹配数据流
- `010-dict-app-vue-architecture.md` — DictApp 架构参考
- `src-vue/utils/segmenter.js` — BMM 分词算法源码
- `src-vue/utils/language.js` — 语言检测源码
- `src-vue/assets/styles/variables.css` — 词性颜色定义
- **`000-ide-extension.md`** ← 本文档
