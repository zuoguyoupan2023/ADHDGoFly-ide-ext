# ADHDGoFly 词典 JSON 格式规范

> 本文档定义了 ADHDGoFly 生态（dict-app、adhdgofly-ide-ext、adhdgoflyplugin 等）通用的词典 JSON 格式。所有项目应遵循此格式以保证互操作性。

---

## 一、核心格式

### 1.1 最小必含字段

所有 ADHDGoFly 词典 JSON 文件**至少**包含以下字段：

```json
{
  "version": "1.0",
  "lastUpdated": "2026-06-12",
  "words": {
    "hello": { "pos": ["interj"] },
    "world": { "pos": ["n"] }
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `version` | string | ✅ | 词典格式版本号（semver） |
| `lastUpdated` | string | ✅ | 最后更新日期，格式 `YYYY-MM-DD` 或 RFC3339 |
| `words` | object | ✅ | 词条映射表，key=小写词形，value=词性对象 |

### 1.2 词条格式

`words` 中的每条记录：

```json
"word": { "pos": ["n", "v"] }
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `pos` | string[] | ✅ | 词性列表，多词性用数组表示。词性代码见下方 |

### 1.3 词性代码表

| 代码 | 全称 | 说明 |
|------|------|------|
| `n` | noun | 名词 |
| `v` | verb | 动词 |
| `adj` / `a` | adjective | 形容词（两者都可用，建议统一用 `adj`） |
| `adv` | adverb | 副词 |
| `prep` | preposition | 介词 |
| `conj` | conjunction | 连词 |
| `pron` | pronoun | 代词 |
| `num` | numeral | 数词 |
| `mw` | measure word | 量词 |
| `interj` | interjection | 叹词 |
| `part` | particle | 助词 |
| `aux` | auxiliary | 助动词 |
| `det` | determiner | 限定词 |
| `other` | other | 其他 |

---

## 二、dict-app 输出格式（额外字段）

dict-app 在导出词典时，在核心格式基础上增加了以下字段和关联文件：

### 2.1 导出 JSON

```json
{
  "version": "1.0",
  "lastUpdated": "2026-06-12T10:00:00+08:00",
  "words": {
    "example": { "pos": ["n"] }
  }
}
```

由 `json_exporter.rs` 生成 (`src-tauri/src/json_exporter.rs:63-71`)：

```rust
let export_obj = serde_json::json!({
    "version": output.version,
    "lastUpdated": output.last_updated,
    "words": output.words.iter().map(|(word, entry)| {
        (word.clone(), serde_json::json!({ "pos": entry.pos }))
    }).collect::<HashMap<_, _>>()
});
```

### 2.2 内部存储结构（`OutputDict`）

dict-app 内部使用的 Rust struct（`dict_comparator.rs:25-29`）：

```rust
pub struct OutputDict {
    pub version: String,         // "1.0"
    pub last_updated: String,    // RFC3339
    pub words: HashMap<String, WordEntry>,
}

pub struct WordEntry {
    pub pos: Vec<String>,
}
```

### 2.3 Changelog 文件

dict-app 导出词典时会**自动生成 changelog**，文件名为 `{字典名}.changelog.json`，与字典文件放在同级目录：

```json
{
  "exported_at": "2026-06-12T10:00:00+08:00",
  "based_on_version": "1.0",
  "stats": {
    "total_words": 1000,
    "added_count": 50,
    "removed_count": 10,
    "modified_count": 20,
    "unchanged_count": 920
  },
  "added": [
    { "word": "newword", "pos": ["n"], "source": "", "frequency": 0 }
  ],
  "removed": [
    { "word": "oldword", "pos": ["v"], "reason": "" }
  ],
  "modified": [
    { "word": "changed", "old_pos": ["n"], "new_pos": ["n","v"], "reason": "" }
  ]
}
```

---

## 三、带 Meta 信息的扩展格式（0000 版本）

来自 `documents/github/0000/` 的词典在此之上增加了 `meta` 字段：

```json
{
  "meta": {
    "id": "en-preset",
    "name": "EN",
    "displayName": {
      "zh": "英文词典",
      "en": "English Dictionary"
    },
    "language": "en",
    "type": "preset",
    "domain": "general",
    "description": {
      "zh": "内置英文词典，包含常用英文词汇及其词性标注",
      "en": "Built-in English dictionary with common English vocabulary and part-of-speech tags"
    },
    "license": {
      "type": "WordNet License",
      "source": "Wordnet",
      "url": "",
      "attribution": "Princeton WordNet"
    }
  },
  "version": "1.0",
  "lastUpdated": "2026-04-07",
  "words": { ... }
}
```

### 3.1 meta 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `meta.id` | string | ✅ | 唯一标识符（如 `en-preset`, `zh-preset`） |
| `meta.name` | string | ✅ | 简短名称 |
| `meta.displayName` | object | ✅ | 多语言显示名（key=语言代码, value=名称） |
| `meta.language` | string | ✅ | 词典语言代码（`en`, `zh`, `fr` 等） |
| `meta.type` | string | ✅ | 词典类型：`preset` / `community` / `user` |
| `meta.domain` | string | 可选 | 领域标签（`general`, `technical`, `medical` 等） |
| `meta.description` | object | 可选 | 多语言描述（key=语言代码, value=描述） |
| `meta.license` | object | 可选 | 许可信息 |
| `meta.license.type` | string | 可选 | 许可证类型 |
| `meta.license.source` | string | 可选 | 数据来源 |
| `meta.license.url` | string | 可选 | 来源链接 |
| `meta.license.attribution` | string | 可选 | 版权归属 |

### 3.2 兼容性说明

`meta` 字段是 **可选的扩展**。所有 ADHDGoFly 项目的词典加载器必须：
1. **忽略额外字段**：加载时只读 `words`，不因存在 `meta` 而报错
2. **不依赖 `meta`**：核心功能不因 `meta` 缺失而失效
3. **保留 `meta`**：如果文件有 `meta`，导出/保存时不应删除它

### 3.3 各项目使用情况

| 项目 | meta 字段处理 |
|------|-------------|
| dict-app (Rust) | `serde_json::Value` 解析后 `.get("words")`，`meta` 被自动忽略 |
| ide-ext (TS) | `normalizeDictionary()` 只读 `raw.words`，`meta` 被忽略 |
| adhdgoflyplugin (JS) | 预期同上 |

---

## 四、IDE 扩展（adhdgofly-ide-ext）的词典加载

### 4.1 加载流程

`loader.ts` 的 `normalizeDictionary()` 将原始 JSON 转为内部使用的 `DictMap`：

```typescript
export function normalizeDictionary(raw: RawDictionary): DictMap {
  const result: DictMap = {}
  for (const [word, entry] of Object.entries(raw.words)) {
    result[word.toLowerCase()] = { pos: entry.pos }
  }
  return result
}
```

### 4.2 多层合并优先级

```
内置词典 (builtin)   →  VSIX 静态资源，最低优先级
社区词典 (community)  →  dictionary.adhdgofly.online 下载
自建词典 (user)      →  从标注 Tab 保存或导入
用户编辑 (userEdits)  →  手动修改/删除的词条，最高优先级
```

由 `dictionary/merger.ts` 的 `mergeDicts()` 逐层合并，后加载的覆盖先加载的。

---

## 五、格式约定与最佳实践

### 5.1 词形规范

- **key 使用小写**：`Hello` → `hello`，`RUN` → `run`
- **中文词按原始词形**：不降级处理（中文无大小写）
- **多词性用数组**：`"pos": ["n", "v"]`，不要用逗号分隔的字符串

### 5.2 文件命名

```
{语言代码}_word.json        // 内置词典，如 EN_word.json, ZH_word.json
{名称}.json                 // 导出/用户词典，如 my-vocab.json
```

### 5.3 编码

- 统一使用 **UTF-8** 编码
- 不要包含 BOM

---

## 六、版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0 | 2026-06-12 | 初始规范，基于 dict-app OutputDict + 0000 meta 扩展 |
