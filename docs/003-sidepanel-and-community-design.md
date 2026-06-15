# ADHDGoFly Highlight — Phase 2 设计：侧边栏面板 + 词典社区

> 本文档覆盖四个主题：
> 1. WebviewView 侧边栏的完整 UI 设计（借鉴 dict-app UX）
> 2. 词典编辑（新增/修改/删除）+ 导出功能设计
> 3. AI 词性判定：独立配置 vs 接入 IDE 内置模型
> 4. 词典社区（dictionary.adhdgofly.online）上传/下载/防护设计

---

## 一、WebviewView 侧边栏整体结构

### 1.1 面板布局

侧边栏分三个 Tab，互相切换：

```
┌──────────────────────────────────────────────────────┐
│  ADHDGoFly  [标注] [词典] [设置]          [≡]        │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Tab: 标注视图（默认）                                │
│  ─────────────────────────────────────────────────  │
│  当前文件：README.md  |  EN+ZH  |  606 词           │
│                                                      │
│  The [det] quick [adj] brown [adj] fox [n]           │
│  jumps [v] over [prep] the [det] lazy [adj] dog [n]  │
│                                                      │
│  ────────── 词性统计 ──────────                      │
│  名词 n  ████████ 212    动词 v  ████ 98             │
│  形容词  ████ 89         副词    ██ 45               │
│                                                      │
│  Tab: 词典管理                                        │
│  ─────────────────────────────────────────────────  │
│  [见第二节]                                          │
│                                                      │
│  Tab: 设置                                            │
│  ─────────────────────────────────────────────────  │
│  [见第三节]                                          │
└──────────────────────────────────────────────────────┘
```

### 1.2 标注视图功能

- **实时同步**：监听 `onDidChangeActiveTextEditor` + `onDidChangeTextDocument`，侧边栏自动更新
- **点击词条**：点击任意被标注的词，弹出小浮层显示词条详情（词性、词典来源），可直接从浮层跳转到编辑
- **词性统计条**：底部展示当前文档各词性数量分布（可折叠）
- **筛选按钮**：顶部行展示 `[n] [v] [adj] [adv]` 快速筛选按钮，点击可只高亮某一词性（同步影响编辑区 Decoration）
- **导出当前文档词汇**：把当前文档出现的所有已匹配词汇导出为 JSON 词典文件

### 1.3 Webview ↔ Extension Host 通信

WebviewView 里是普通 HTML/JS，不能直接调用 VS Code API，通过 `postMessage` 双向通信：

```
Extension Host                    Webview (HTML)
──────────────                    ──────────────
applyDecorations 完成
  → webview.postMessage({         → window.addEventListener('message')
      type: 'annotationResult',     处理并渲染标注结果
      words: DecoratedWord[],
      stats: PosStats,
      fileName: string,
    })

用户点击"编辑词条"
                                  → vscode.postMessage({
                                      type: 'editWord',
                                      word: 'fox',
                                      lang: 'en',
                                    })
  → webview.onDidReceiveMessage
    → 打开编辑面板 / 更新词典

用户点击"导出词典"
                                  → vscode.postMessage({
                                      type: 'exportDict',
                                      lang: 'en',
                                      name: 'my-dict',
                                    })
  → 调用 DictionaryManager
  → 写文件 / 调用 vscode.window.showSaveDialog
```

---

## 二、词典管理 Tab（借鉴 dict-app DictDetailModal）

### 2.1 列表视图

与 dict-app `DictDetailModal` 的列表模式对应：

```
┌─ 词典管理 ─────────────────────── [+ 导入] ─┐
│                                              │
│  内置词典                                    │
│  ┌──────────────────────────────────────┐   │
│  │ EN  English         147,406 词  [查看][导出] │
│  │ ZH  中文(简体)      349,172 词  [查看][导出] │
│  └──────────────────────────────────────┘   │
│                                              │
│  社区词典（已安装）                           │
│  ┌──────────────────────────────────────┐   │
│  │ FR  法语基础 v2       8,420 词  [查看][导出][×] │
│  └──────────────────────────────────────┘   │
│                                              │
│  本地自定义词典                               │
│  ┌──────────────────────────────────────┐   │
│  │ EN  my-notes-dict    236 词  [查看][导出][×] │
│  └──────────────────────────────────────┘   │
│                                              │
│  [浏览社区词典]                              │
└──────────────────────────────────────────────┘
```

每行操作：
- **查看**：进入词条列表（详情视图）
- **导出**：生成带 meta 的 JSON 文件（格式见 2.4）
- **×**：删除（内置词典不可删，仅社区/自定义可删）

### 2.2 词条详情视图（借鉴 dict-app 的词条列表）

```
┌─ EN - English ──────────────────── [← 返回] ─┐
│                                               │
│  [搜索...] [25][50][100]  共 147,406 词  [+新增] │
│  ─────────────────────────────────────────── │
│  able      adj                [编辑][×]       │
│  about     adv adj            [编辑][×]       │
│  abstract  v adj n            [编辑][×]       │
│  ...                                          │
│  ─────────────────────────────────────────── │
│  ◀ ... 1 2 [3] 4 5 ... ▶    第 3 / 2948 页   │
└───────────────────────────────────────────────┘
```

功能与 dict-app 一致：
- 分页（25/50/100 每页）
- 实时搜索过滤
- 编辑：弹出词性选择覆层（12 种词性按钮，多选）
- 删除：标记 `deleted: true`（逻辑删除，合并时跳过）
- 新增：输入词汇 + 选词性

### 2.3 词性选择覆层（借鉴 dict-app editOverlay）

```
┌─ 编辑词性：fox ──────────────────────────┐
│                                           │
│  [n 名词] [v 动词] [adj 形容词]           │
│  [adv 副词] [prep 介词] [conj 连词]       │
│  [pron 代词] [num 数词] [mw 量词]         │
│  [interj 叹词] [part 助词] [aux 助动词]  │
│                                           │
│  已选：n × adj ×                         │
│                                           │
│  [保存]  [取消]  [AI 判定 ✨]             │
└───────────────────────────────────────────┘
```

"AI 判定"按钮是可选增量功能（见第三节）。

### 2.4 导出格式（与 dict-app 完全兼容）

```json
{
  "version": "1.0",
  "lastUpdated": "2026-06-11",
  "language": "en",
  "source": "adhdgofly-ide-ext",
  "name": "my-notes-dict",
  "wordCount": 236,
  "words": {
    "refactor": { "pos": ["v"] },
    "scaffold":  { "pos": ["n", "v"] },
    "idempotent": { "pos": ["adj"] }
  }
}
```

导出入口：
1. 词典列表行 → [导出] 按钮 → 导出该词典（含用户编辑）
2. 标注视图 → [导出当前文档词汇] → 仅导出本文档出现的已匹配词汇
3. VS Code 命令面板 → `ADHDGoFly: Export Dictionary`

---

## 三、AI 词性判定设计

### 3.1 问题背景

dict-app 已有 AI 词性判定功能：用户输入词汇，调用配置的 AI Provider（OpenAI 兼容 API），返回词性标注建议。IDE 扩展里复现这个功能有两条路：

**路线 A：独立 AI 配置（复现 dict-app 方案）**
- 用户在侧边栏"设置"Tab 里配置自己的 API Key + 模型
- 与 dict-app 的 SettingsModal 逻辑一致
- 优点：完全自主，不依赖 IDE
- 缺点：用户需要二次配置，可能已经在 IDE 里配置过一次了

**路线 B：接入 IDE 内置 AI 模型**
- VS Code 1.90+ 提供了 `vscode.lm`（Language Model API），扩展可以调用用户已经配置好的 AI（GitHub Copilot、Claude 等）
- Cursor / Windsurf / Kiro 也有类似能力（通过 MCP 或私有 API）
- 优点：零配置，直接复用用户现有 AI 订阅
- 缺点：依赖 IDE 版本，API 仍在 proposed 阶段（需要声明权限）

### 3.2 推荐方案：增量叠加

两条路线不互斥，按阶段叠加：

```
Phase 2a：路线 A（独立配置）
  实现成本低，行为可预测，先上线
  ─ 设置 Tab 里配置 Provider（name / api_url / api_key / model）
  ─ 调用方式：fetch POST 到 OpenAI 兼容接口
  ─ Prompt 模板：
    "请判断英文单词 "{word}" 的词性，
     从以下选项中选择（可多选）：
     n(名词) v(动词) adj(形容词) adv(副词) prep(介词) conj(连词)
     pron(代词) num(数词) aux(助动词) interj(叹词) part(助词) mw(量词)
     仅返回 JSON：{"pos": ["n", "v"]}"

Phase 2b：路线 B（IDE 内置模型）
  在 Phase 2a 基础上叠加，不替换
  ─ 检测 vscode.lm API 是否可用（版本检测 + try/catch）
  ─ 可用时在 AI 判定按钮旁显示 "使用 IDE 模型" 选项
  ─ 不可用时静默降级到路线 A（或禁用按钮）
```

### 3.3 VS Code Language Model API 用法（路线 B 参考）

```typescript
// src/vscode/aiJudge.ts
import * as vscode from 'vscode'

export async function judgePosByIDEModel(word: string): Promise<string[] | null> {
  // vscode.lm 在 VS Code 1.90+ 才有，且需要 GitHub Copilot 等扩展
  if (!('lm' in vscode)) return null

  try {
    const models = await (vscode as any).lm.selectChatModels({ vendor: 'copilot' })
    if (!models || models.length === 0) return null

    const model = models[0]
    const messages = [
      (vscode as any).LanguageModelChatMessage.User(
        `判断英文单词 "${word}" 的词性，从 n/v/adj/adv/prep/conj/pron/num/aux/interj/part/mw 中选择。
         仅返回 JSON，例如：{"pos":["n","v"]}`
      )
    ]

    const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token)
    let text = ''
    for await (const chunk of response.text) text += chunk

    const match = text.match(/\{[^}]+\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0])
    return Array.isArray(parsed.pos) ? parsed.pos : null
  } catch {
    return null
  }
}
```

### 3.4 设置 Tab UI

```
┌─ 设置 ─────────────────────────────────────────┐
│                                                 │
│  高亮设置                                        │
│  ─────────────────────────────────────────────  │
│  启用高亮        [●]                             │
│  最小词长        [2]                             │
│  标注样式        [background ▼]                  │
│  词性过滤        [n][v][adj][adv][其他]           │
│                                                 │
│  AI 词性判定                                     │
│  ─────────────────────────────────────────────  │
│  使用 IDE 内置模型  [●]（若可用）                  │
│                                                 │
│  自定义 AI Provider（IDE 模型不可用时使用）        │
│  ┌─ OpenAI ──────────────────────────── [▼] ─┐  │
│  │ API URL   [https://api.openai.com/v1    ]  │  │
│  │ API Key   [sk-...                       ]  │  │
│  │ 模型      [gpt-4o-mini                  ]  │  │
│  │ [测试连接]                                  │  │
│  └────────────────────────────────────────────┘  │
│                                                 │
│  词典社区                                        │
│  ─────────────────────────────────────────────  │
│  社区地址  [https://dictionary.adhdgofly.online]  │
│  用户 Token [                               ]   │
│  （上传词典时需要，下载不需要）                    │
└──────────────────────────────────────────────────┘
```

---

## 四、词典社区（dictionary.adhdgofly.online）

### 4.1 社区需要提供的能力

IDE 扩展（和未来的 dict-app）都需要与社区交互，社区 API 分两个方向：

**下载方向（公开，无需登录）**：
```
GET  /api/dicts                    获取词典目录（分页、语言筛选）
GET  /api/dicts/:id                获取单个词典元信息
GET  /api/dicts/:id/download       下载词典 JSON
GET  /api/dicts/:id/checksum       获取 SHA256 校验值
```

**上传方向（需要 Token）**：
```
POST /api/auth/register            注册账号（邮箱 + 密码）
POST /api/auth/token               获取 API Token
POST /api/dicts                    上传新词典
PATCH /api/dicts/:id               更新词典版本
DELETE /api/dicts/:id              删除自己的词典
```

### 4.2 上传词典流程（IDE 扩展侧）

```
用户在词典管理 Tab 点击 [上传到社区]
  ↓
检查设置 Tab 是否配置了社区 Token
  ├─ 未配置 → 提示"请先在设置中配置社区 Token"，跳转到设置 Tab
  └─ 已配置 ↓
填写上传表单：
  - 词典名称（必填）
  - 语言（必填，自动检测）
  - 描述（选填）
  - 版本号（自动从 1.0.0 开始）
  - 可见性（公开 / 私有）
  ↓
校验格式（词条数 > 0，格式符合 schema）
  ↓
POST /api/dicts（携带 JSON 文件 + 元信息）
  ↓
社区返回 dict ID → 展示 "上传成功，词典 ID: xxx"
```

### 4.3 社区接受的词典来源

社区需要接受两个来源的词典，格式一致但来源字段不同：

| 来源 | source 字段 | 特点 |
|------|------------|------|
| IDE 扩展上传 | `adhdgofly-ide-ext` | 用户在编辑器里积累的词汇 |
| dict-app 导出上传 | `adhdgofly-dict-app` | 桌面应用里处理文档积累的词汇 |
| 社区手工上传 | `community-upload` | 用户直接通过网页上传 |

通用格式（已在 2.4 定义），社区额外存储：
```json
{
  "id": "en-coding-terms-v1",
  "uploadedBy": "user-id-xxx",
  "source": "adhdgofly-ide-ext",
  "uploadedAt": "2026-06-11T12:00:00Z",
  "downloads": 142,
  "reports": 0,
  "status": "approved"
}
```

### 4.4 社区防护措施

#### 上传阶段（服务器端校验）

| 防护项 | 说明 |
|--------|------|
| **账号门槛** | 上传需要邮箱验证账号，降低匿名滥用 |
| **文件大小限制** | 单个词典 JSON 不超过 20MB（约 50 万词条） |
| **词条数限制** | 单个词典词条数上限 500,000 |
| **词条格式校验** | 服务器严格校验 JSON schema，拒绝 `words` 字段以外的任意嵌套对象 |
| **词性值白名单** | `pos` 数组只接受预定义的 12 种词性标签，其他值拒绝 |
| **词汇字符过滤** | key 只允许 Unicode 字母、数字、连字符、撇号，拒绝 HTML/脚本注入字符 |
| **内容扫描** | 批量扫描词汇 key 是否包含常见恶意词汇列表（仇恨、违禁内容） |
| **上传频率限制** | 同一账号每天最多上传 10 个词典，每分钟最多 2 次 API 调用 |
| **哈希去重** | 计算词典内容哈希，拒绝与已有词典完全相同的重复上传 |

#### 审核阶段

| 策略 | 说明 |
|------|------|
| **自动审核** | 词条数 < 10,000 的词典通过自动校验后直接发布 |
| **人工审核队列** | 词条数 ≥ 10,000 的词典进入人工审核队列（48h 内处理） |
| **举报机制** | 每个词典页面有 "举报" 按钮，3 次举报自动下线等待人工复查 |
| **信誉系统** | 活跃贡献者（下载量 > 100、举报 0 次）获得"信任用户"标记，可跳过人工审核 |

#### 下载阶段（客户端校验）

| 防护项 | 说明 |
|--------|------|
| **SHA256 校验** | 下载后比对服务端提供的 checksum，文件被篡改则拒绝安装 |
| **大小二次校验** | 本地校验解压后文件不超过 30MB |
| **JSON schema 校验** | 即使通过了服务端，客户端也再次校验格式，防止服务端被攻破 |
| **词性白名单再校验** | 客户端过滤掉任何不在白名单的 pos 值（不中断，只忽略） |
| **沙箱加载** | 词典只影响标注结果，不执行任何代码，不访问文件系统 |

#### dict-app 的同等防护

dict-app 未来接入社区时，客户端侧的防护策略与 IDE 扩展完全一致（共享同一套 `DictValidator` 逻辑），可以作为独立 npm 包 `@adhdgofly/dict-validator` 维护，两端共同引用。

---

## 五、实现文件规划（Phase 2 新增）

```
src/
├── vscode/
│   ├── sidePanel.ts           WebviewView 注册 + postMessage 协议
│   ├── dictManager.ts         社区 API 调用（下载/上传）
│   └── aiJudge.ts             AI 词性判定（IDE 模型 + 独立配置双路线）
│
webview/
├── panel.html                 侧边栏 HTML 模板
├── panel.css                  词性颜色 CSS（与 dict-app variables.css 一致）
└── panel.js                   Tab 切换、词条列表渲染、postMessage 收发
```

### postMessage 协议完整定义

**Extension → Webview**：
```typescript
type ExtToWebview =
  | { type: 'annotationResult'; words: DecoratedWord[]; stats: PosStats; fileName: string }
  | { type: 'dictList'; dicts: DictInfo[] }
  | { type: 'dictDetail'; lang: string; entries: DictEntry[]; total: number; page: number }
  | { type: 'aiJudgeResult'; word: string; pos: string[] }
  | { type: 'communityList'; dicts: CommunityDictMeta[] }
  | { type: 'config'; config: ExtensionConfig }
  | { type: 'toast'; message: string; level: 'info' | 'warn' | 'error' }
```

**Webview → Extension**：
```typescript
type WebviewToExt =
  | { type: 'ready' }
  | { type: 'editWord'; lang: string; word: string; pos: string[] }
  | { type: 'deleteWord'; lang: string; word: string }
  | { type: 'addWord'; lang: string; word: string; pos: string[] }
  | { type: 'exportDict'; lang: string; name: string }
  | { type: 'exportCurrentDoc' }
  | { type: 'importDictFile' }
  | { type: 'communityDownload'; dictId: string }
  | { type: 'communityUpload'; lang: string; name: string; description: string }
  | { type: 'aiJudge'; word: string }
  | { type: 'updateConfig'; key: string; value: unknown }
  | { type: 'posFilterChange'; filter: string[] }
```

---

## 六、开发顺序建议

```
Phase 2a（4-5 天）
  1. webview/ 基础框架：HTML 骨架 + Tab 切换 + postMessage 收发测试
  2. 标注视图：渲染 DecoratedWord[]，词性统计
  3. 词典列表视图：展示内置词典列表
  4. 词条详情 + 编辑覆层：借鉴 dict-app DictDetailModal，分页/搜索/编辑/新增/删除
  5. 导出功能：带 meta 的 JSON 文件生成

Phase 2b（3-4 天）
  6. AI 判定 - 独立配置路线：设置 Tab + OpenAI 兼容 API 调用
  7. AI 判定 - IDE 内置模型：vscode.lm 检测 + 降级逻辑

Phase 2c（3-4 天）
  8. 社区下载：dictManager.ts + 社区浏览 UI + 安装流程
  9. 社区上传：上传表单 + Token 配置 + 客户端校验

Phase 3（社区端）
  10. dictionary.adhdgofly.online API 服务端实现
  11. @adhdgofly/dict-validator 共享校验包
```
