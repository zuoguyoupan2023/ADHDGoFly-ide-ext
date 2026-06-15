# 自建词典（User-Created Dictionary）设计

> 用户在 ide-ext 中通过处理结果保存的词典，标记为"自建"来源，在本地列表中显示"自"徽章，支持启用/禁用、查看、导出、上传到社区。

---

## 一、背景

目前 ide-ext 有三种词典来源：

| 来源 | 徽章 | 说明 |
|------|------|------|
| 内置 | 内 | VSIX 打包的 en/zh 基础词典 |
| 社区 | 社 | 从 `dictionary.adhdgofly.online` 安装的词典 |
| 自建 | 自 | 用户自行创建的词典（本文档定义） |

自建词典的**数据来源**：
1. **工作区保存**：用户在 dict-app 中处理文件后，将结果保存为词典（已有 `exportDict` 逻辑）
2. **文件导入**：从本地 JSON 文件导入（已有 `importDictFile` 逻辑），但导入后该为"自建"来源而非"用户编辑"
3. **直接创建**：在 ide-ext 内直接在本地创建新词典（新增功能）

## 二、现有基础

当前 `manager.ts` 已有 `userAddedDicts`，但只用于导入文件，且不区分"导入"和"自建"。需要拆分：

```typescript
// 当前：导入的词典
private userAddedDicts: Map<string, DictMap> = new Map()

// 新增：自建词典（从工作区保存、或直接在 ide-ext 内创建）
private userCreatedDicts: Map<string, { name: string; lang: string; data: DictMap }> = new Map()
```

## 三、自建词典的创建途径

### 3.1 从当前标注词汇保存为词典

用户在 ide-ext 的标注视图中点击"导出当前文档词汇" → 保存为 JSON 文件。扩展这个流程，增加"保存为词典"选项：

```
标注视图 → 词汇列表 → "保存为词典" 按钮
  ├─ 命名弹窗：输入词典名称
  ├─ 确认后 → 将当前所有标注词汇（去重）写入 userCreatedDicts
  ├─ 存储在 globalStorageUri/user-created-dicts/{name}.json
  └─ 刷新本地列表，显示"自"徽章
```

### 3.2 从本地 JSON 文件导入为自建词典

当前 `importDictFile` 将导入数据存为 `userAddedDicts`（用户编辑层）。改为：

```
导入 JSON → 格式校验
  ├─ 如果 JSON 有 name/version/source 等 meta → 作为自建词典存入 userCreatedDicts
  └─ 如果是简单的词条数据 → 作为用户编辑层存入 userAddedDicts
```

### 3.3 直接在 ide-ext 中创建空词典

```
本地列表 → "+ 新增词典" 按钮
  ├─ 输入名称 + 选择语言
  ├─ 创建空 DictMap → 存入 userCreatedDicts
  ├─ 用户后续通过 AI 判定或手动编辑添加词条
  └─ 显示在本地列表
```

## 四、存储方案

```
globalStorageUri/
├── user-edits.json                     # 用户编辑（已实现）
├── community-index.json                # 社区词典索引（已实现）
├── community-dicts/                    # 社区词典数据（已实现）
│   ├── zh-20251124-renleixue.json
│   └── ...
└── user-created-dicts/                 # 自建词典（新增）
    ├── index.json                      # 元数据索引
    ├── my-law-notes.json               # 词典数据
    └── medical-terms.json
```

`user-created-dicts/index.json` 格式：

```json
[
  {
    "id": "my-law-notes-1712345678",
    "name": "法律阅读笔记",
    "lang": "en",
    "wordCount": 234,
    "createdAt": "2026-06-11T10:00:00Z",
    "updatedAt": "2026-06-11T10:00:00Z"
  }
]
```

## 五、UI 改动

### 5.1 本地列表

```
┌─ 内 EN │ English (内置)         │ 147,406 词 │ [●] [查看] [导出]
├─ 社 ZH │ zh-20251124-人类学      │ 14,246 词  │ [●] [查看] [导出]
├─ 自 EN │ 法律阅读笔记            │ 234 词     │ [●] [查看] [导出] [上传社区]
└─ 自 ZH │ 医学词汇收集            │ 89 词      │ [●] [查看] [导出] [上传社区]
```

- 自建词典额外显示"上传社区"按钮
- 自建词典支持删除（×按钮）

### 5.2 社区上传

点击自建词典的"上传社区" → 调用 `api.uploadDict()` → 存入 `dictionary.adhdgofly.online` → 管理员审核 → 上线。

## 六、在分词高亮中的使用

自建词典在 `getDict()` 中的合并优先级：

```
内置 (最低) → 社区 → 自建 → 用户编辑 (最高)
```

当前 `getDict()` 的合并逻辑已支持多层，只需将 `userCreatedDicts` 作为新的一层插入：

```typescript
getDict(lang: string): DictMap | null {
  const builtin = this.builtins.get(lang)
  // 合并社区词典（仅启用的）
  let community: DictMap | undefined
  for (const [id, { meta, data }] of this.communityDicts) {
    if (meta.lang !== lang) continue
    if (this._enabledDicts.size > 0 && !this._enabledDicts.has(id)) continue
    if (!community) community = { ...data }
    else community = mergeDicts(community, data)
  }
  // 合并自建词典
  let userCreated: DictMap | undefined
  for (const [id, uc] of this.userCreatedDicts) {
    if (uc.lang !== lang) continue
    if (this._enabledDicts.size > 0 && !this._enabledDicts.has(id)) continue
    if (!userCreated) userCreated = { ...uc.data }
    else userCreated = mergeDicts(userCreated, uc.data)
  }
  // 合并（低→高）：内置 → 社区 → 自建 → 用户编辑
  const base = mergeDicts(builtin, community, userCreated) // ← 新增 userCreated 层
  // … 应用 edits
}
```

## 七、自建词典的上传

自建词典上传到社区与 ide-ext 中已有的上传逻辑完全一致：

```typescript
// sidePanel.ts 已有 uploadCommunityDict 处理
case 'uploadCommunityDict': {
  const { name, lang } = msg
  // 从 userCreatedDicts 或 getDict() 导出词条
  // 调用 api.uploadDict(name, lang, words)
}
```

自建词典上传后进入审核流程，审核通过后在社区可见。其他用户可以安装。

## 八、文件变更清单

| 文件 | 改动 |
|------|------|
| `manager.ts` | 新增 `userCreatedDicts` 存储 + 持久化 + 增删改方法；`getDict` 新增自建层 |
| `sidePanel.ts` | 新增 `case 'saveAsDict'` / `case 'deleteUserDict'` / 修改 `uploadCommunityDict` 支持自建词典 |
| `panel.html` | 本地列表新增"新增词典"按钮 |
| `panel.js` | 本地列表渲染自建词典 + 上传社区按钮 + 删除按钮 |
| `panel.css` | 无新增样式（复用现有 badge-user） |
