# Changelog

## 1.0.2 (2026-06-21)

### Added / 新增
- **词性筛选即时开关** — 侧面板点击 名/动/形/其他 按钮，编辑器高亮即时显隐（不重新分词），预览同步取消/恢复着色
- **Markdown 预览高亮** — 在 Markdown 渲染预览（`Ctrl+Shift+V`）中自动对名词/动词/形容词着色，与编辑器内高亮一致
  - 中英文全量词典内嵌（~7.8MB），首次打开即生效
  - 使用 `segmentMixed` 逐字符调度，支持中英混排文本
  - MutationObserver 监听内容变更，编辑时自动重扫
  - 自动跳过 `<pre>` / `<code>` 代码区域
- **深色/浅色双主题** — 编辑器 + 预览统一使用双调色板，切换 IDE 主题时颜色自动适配
  - 深色：绿 `#4ade80` / 红 `#f87171` / 紫 `#a78bfa` / 灰 `#9ca3af`
  - 浅色：绿 `#059669` / 红 `#dc2626` / 紫 `#7c3aed` / 灰 `#6b7280`
- 词典构建工具 `scripts/build-preview.mjs`，使用 esbuild 打包浏览器兼容 bundle

### Changed / 变更
- 词典格式重构：从 `word → 颜色值` 改为 `word → POS 代号`，运行时按主题解析，体积缩减 28%

### Fixed / 修复
- Regenerated extension icon from `logo.svg` to ensure the logo appears correctly in VS Code marketplace (从 `logo.svg` 重新生成扩展图标，确保市场图标正确显示)
- 侧面板语言跟随系统/IDE 语言设置，中文环境默认显示中文界面（修复部分 IDE 始终显示英文的问题）

## 1.0.1 (2026-06-17)

### Added / 新增
- Bilingual README with Chinese and English documentation (中英文双语 README)
- Marketplace extension icon (top-level `icon` field in package.json)
- CHANGELOG tracking

### Fixed / 修复
- Corrected repository URL from `burenweiye` to `zuoguyoupan2023` (修正仓库链接)
- Updated related projects links to point to published browser extensions (Edge/Chrome Web Store) (更新相关项目链接为已发布的浏览器扩展)

### Changed / 变更
- Unified naming to `adhdgofly-ide-ext` across all code and docs (统一名称为 `adhdgofly-ide-ext`)
- Updated README to remove unreleased project references (移除未发布项目的引用)
