# ADHDGoFlY

POS-based vocabulary highlighting for VS Code, Cursor, Windsurf, Kiro, and Trae. Automatically highlights nouns, verbs, adjectives, and adverbs in markdown, plain text, and code comments.

> **Screenshots**: *TODO — add screenshot after testing*

## Features

- **Auto-highlight** — open a `.md` / `.txt` file and see POS-colored words appear within 1 second
- **Multi-language** — English (noun green, verb red, adjective purple) and Chinese (BMM segmentation)
- **Mixed-language text** — handles `我想用chatgpt` and `- ❌ 不支持 streaming` without language classification
- **Code file support** — highlights natural language inside code comments and strings only (JS/TS/Python/Go/HTML)
- **Side panel** — real-time word frequency list with POS stats, sortable by frequency/alpha/POS
- **Dictionary management** — built-in en/zh dictionaries; install community dictionaries; create your own from annotations
- **Self-built dictionaries** — save any document's vocabulary as a reusable dictionary with toggle on/off
- **AI POS judging** — configure any OpenAI-compatible API to auto-suggest POS tags for unknown words
- **POS filter** — toggle noun/verb/adjective chips to filter the annotation list and editor highlights simultaneously

## Quick Start

Install from VS Code Marketplace, or:

```bash
vsce package --no-yarn
# VS Code → Extensions → ... → Install from VSIX
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

## Development

```bash
npm install
npm run compile
# Press F5 to launch extension development host
npm test              # Run unit tests (18 tests)
```

## Dictionary Format

See [`docs/006-dict-format.md`](docs/006-dict-format.md) for the shared JSON schema used across all ADHDGoFly projects.

## Architecture

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

## Related Projects

- [dict-app](https://github.com/adhdgofly/dict-app) — Desktop dictionary tool (Tauri)
- [adhdgoflyplugin](https://github.com/adhdgofly/adhdgoflyplugin) — Browser extension
- [dictionary.adhdgofly.online](https://dictionary.adhdgofly.online) — Community dictionary service
