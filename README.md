# adhdgofly-ide-ext

POS-based vocabulary highlighting for VS Code, Cursor, Windsurf, Kiro, and Trae. Automatically highlights nouns, verbs, adjectives, and adverbs in markdown, plain text, and code comments.

基于词性（POS）标注的 IDE 词汇着色扩展，兼容 VS Code / Cursor / Windsurf / Kiro / Trae。自动将名词、动词、形容词、副词以不同颜色高亮显示。

[English](#features) | [中文](#功能)

---

## Features

- **Auto-highlight** — open a `.md` / `.txt` file and see POS-colored words appear within 1 second
- **Multi-language** — English (noun green, verb red, adjective purple) and Chinese (BMM segmentation)
- **Mixed-language text** — correctly handles mixed Chinese/English text like `我想用chatgpt` without language classification
- **Code file support** — highlights natural language inside code comments and strings only (JS/TS/Python/Go/HTML)
- **Side panel** — real-time word frequency list with POS stats, sortable by frequency/alpha/POS
- **Dictionary management** — built-in en/zh dictionaries; install community dictionaries; create your own from annotations
- **Self-built dictionaries** — save any document's vocabulary as a reusable dictionary with toggle on/off
- **AI POS judging** — configure any OpenAI-compatible API to auto-suggest POS tags for unknown words
- **POS filter** — toggle noun/verb/adjective chips to filter the annotation list and editor highlights simultaneously
- **Code block / inline code filtering** — code fence and backtick content is automatically excluded from highlighting
- **Emoji-safe** — emoji characters are properly skipped without offset misalignment

## Quick Start

Install from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=ADHDGoFly.adhdgofly-ide-ext), or:

```bash
code --install-extension adhdgofly-ide-ext-1.0.0.vsix
```

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `adhdgofly.enabled` | `true` | Enable/disable highlighting |
| `adhdgofly.languages` | `["en", "zh"]` | Active dictionary languages |
| `adhdgofly.minWordLength` | `2` | Minimum word length to annotate |
| `adhdgofly.highlightInComments` | `true` | Highlight inside code comments |
| `adhdgofly.decorationStyle` | `"color"` | Visual style: text color or background box |
| `adhdgofly.highlightFontSize` | `1.0` | Highlight intensity (maps to font-weight: 0.8–1.5) |
| `adhdgofly.posFilter` | all | Which POS categories to show |
| `adhdgofly.disabledDicts` | `[]` | Dictionary IDs to disable |
| `adhdgofly.aiEnabled` | `true` | Enable AI POS judging |

---

## 功能

- **自动高亮** — 打开 `.md` / `.txt` 文件，1 秒内自动完成分词和着色
- **多语言支持** — 英文（名词绿、动词红、形容词紫）和中文（BMM 分词）
- **中英混排** — 正确支持 `我想用chatgpt` 这类中英混合文本，无需语言分类
- **代码文件** — 仅在注释和字符串内标注，不影响代码语法高亮（支持 JS/TS/Python/Go/HTML）
- **侧边面板** — 实时词频统计、词性分布、可排序词汇列表
- **词典管理** — 内置英汉词典，可安装社区词典、导入自定义词典
- **自建词典** — 将标注词汇一键保存为自建词典，可开关复用
- **AI 词性判定** — 接入兼容 OpenAI 的 API，对未收录词汇自动建议词性
- **词性筛选** — 通过 Chips 开关词性类别，编辑器和列表同步过滤
- **代码块过滤** — 围栏代码块和行内代码内容自动排除，不参与标注
- **Emoji 安全** — emoji 字符正确处理，不会导致偏移错位

## 快速开始

从 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=ADHDGoFly.adhdgofly-ide-ext) 安装，或：

```bash
code --install-extension adhdgofly-ide-ext-1.0.0.vsix
```

## 配置项

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| `adhdgofly.enabled` | `true` | 启用/禁用高亮 |
| `adhdgofly.languages` | `["en", "zh"]` | 启用的词典语言 |
| `adhdgofly.minWordLength` | `2` | 最小标注词长 |
| `adhdgofly.highlightInComments` | `true` | 在代码注释内标注 |
| `adhdgofly.decorationStyle` | `"color"` | 高亮样式：文字变色 / 色框 |
| `adhdgofly.highlightFontSize` | `1.0` | 高亮强度 (0.8–1.5) |
| `adhdgofly.posFilter` | all | 显示的词性类别 |
| `adhdgofly.disabledDicts` | `[]` | 禁用的词典 ID |
| `adhdgofly.aiEnabled` | `true` | 启用 AI 词性判定 |

---

## Related Projects / 相关项目

- **adhdgoflyplugin** (浏览器扩展 / Browser extension)
  - [Microsoft Edge Addons](https://microsoftedge.microsoft.com/addons/detail/adhdgofly-%E7%82%B9%E4%BA%AE%E4%BD%A0%E7%9A%84%E8%A7%86%E9%87%8E-edge/odleggjpbedagojaljdopcgolkcibljh)
  - [Google Chrome Web Store](https://chromewebstore.google.com/detail/adhdgofly-%E7%82%B9%E4%BA%AE%E4%BD%A0%E7%9A%84%E8%A7%86%E9%87%8E-chrome/bdpadkojpehfdepjjadmpjeieiddeodl)

## Architecture / 架构

```
src/
├── extension.ts           Entry point (lifecycle)
├── highlightEngine/       Pure logic (zero vscode imports)
│   ├── segmenter.ts       BMM + character-dispatch segmentation
│   ├── matcher.ts         POS → color mapping
│   ├── lemmatizer.ts      English inflection handling
│   ├── language.ts        Language detection helpers
│   └── index.ts           Process orchestrator
├── dictionary/            Data layer
│   └── manager.ts         Multi-layer dict load/merge/edit/persist
├── vscode/                VS Code platform adapter
│   ├── decorator.ts       Decoration API
│   ├── sidePanel.ts       WebviewView panel
│   └── config.ts          Settings
└── webview/               Side panel UI
    ├── panel.html
    ├── panel.js
    ├── panel.css
    └── i18n.js             Bilingual (zh/en) translation
```

## License / 许可证

MIT
