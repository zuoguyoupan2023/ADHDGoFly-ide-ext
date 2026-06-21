# adhdgofly-ide-ext

Automatically highlights nouns, verbs, and adjectives in any text — so you can grasp the key points of an article at a glance without reading every word.

Read faster, understand deeper. Instantly distinguish actions from objects, descriptions from details. Designed for language learners, non-native readers, and anyone who wants to absorb written content more efficiently.

Works in markdown, plain text, and code comments across VS Code, Cursor, Windsurf, Kiro, and Trae. Whether you're studying a foreign language, reviewing technical docs, or navigating a codebase — ADHDGoFly helps you focus on what matters.

对文章中的名词、动词、形容词自动着色，一眼看清重点，不用逐字阅读。

更快阅读，更深理解。一眼看出谁是动作、谁是对象、谁是修饰。适合语言学习者、非母语阅读者和所有希望高效吸收信息的人。

无论你在学外语、读技术文档还是浏览代码，ADHDGoFly 帮你抓住重点。兼容 Markdown、纯文本和代码注释，支持 VS Code / Cursor / Windsurf / Kiro / Trae。

[English](#features) | [中文](#功能)

---

## Features

- **Auto-highlight** — open a `.md` / `.txt` file and see POS-colored words appear within 1 second
- **Markdown preview** — highlights carry over to the rendered preview (`Ctrl+Shift+V`), same colors as the editor
- **Dark / Light theme** — both editor and preview automatically switch between optimized color palettes when you change your IDE theme
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
- **Markdown 预览** — 渲染预览（`Ctrl+Shift+V`）中同样生效，颜色与编辑器一致
- **深色/浅色适配** — 切换 IDE 主题时编辑器和预览自动切换优化色板
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
│   ├── matcher.ts         POS → color class mapping
│   ├── lemmatizer.ts      English inflection handling
│   ├── language.ts        Language detection helpers
│   └── index.ts           Process orchestrator
├── preview/               Markdown preview script (browser bundle)
│   └── highlighter.ts     DOM walker + segmentation + theme-aware coloring
├── dictionary/            Data layer
│   └── manager.ts         Multi-layer dict load/merge/edit/persist
├── vscode/                VS Code platform adapter
│   ├── decorator.ts       Decoration API (dual-palette dark/light)
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
