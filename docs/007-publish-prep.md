# ADHDGoFly Highlight — 发布前优化方案

> 目标：确保扩展在各 IDE（VS Code / Cursor / Windsurf / Kiro / Trae）上有良好的用户体验，避免"发布太烂"。
>
> 当前版本: 0.2.0 | 发布时间窗口: 建议完成下表后进入 1.0.0

---

## 一、多语言支持（i18n）

### 1.1 现状

扩展的**所有**用户界面元素硬编码为中文：

| 位置 | 语言 | 问题 |
|------|------|------|
| `webview/panel.html` | 中文 | 标注、词典、设置、社区、自建等 |
| `webview/panel.js` | 中文 | Toast 消息、提示文字、确认弹窗 |
| VS Code 设置描述 | 英文 | `package.json` 的 `description` 字段 |
| 命令名称 | 英文 | `adhdgofly.enable`, `adhdgofly.disable` |
| `README.md` | 英文 | 需扩增 |

### 1.2 建议方案：最小化 i18n（不引入框架）

在 `webview/` 下创建 `i18n.js`：

```javascript
// webview/i18n.js
const i18n = {
  zh: {
    tabAnnotation: '标注',
    tabDicts: '词典',
    tabSettings: '设置',
    dictInstalled: '安装',
    dictBuiltin: '内置',
    dictCommunity: '社区',
    dictUser: '自建',
    // ... 所有 UI 文本
  },
  en: {
    tabAnnotation: 'Annotation',
    tabDicts: 'Dictionaries',
    tabSettings: 'Settings',
    dictInstalled: 'Installed',
    dictBuiltin: 'Built-in',
    dictCommunity: 'Community',
    dictUser: 'Self-built',
  }
}

function t(key) { return i18n[state.lang]?.[key] ?? i18n['en'][key] ?? key }
```

- 自动检测 VS Code 语言环境：`navigator.language` 或从 config 读取
- 所有 HTML 模板中 `escHtml(t('tabAnnotation'))` 替代硬编码文本
- 不引入 npm 依赖，纯 JS object，~2KB
- 状态存储在 `state.lang`，通过 config 传递 `adhdgofly.locale`

### 1.3 哪些需要翻译

| 优先级 | 内容 | 当前语言 |
|--------|------|---------|
| P0 | 侧边栏 Tab 标签 | 中文 |
| P0 | 词典列表来源徽章提示文字 | 中文 |
| P0 | 空状态提示（"打开一个 .md 文件…"） | 中文 |
| P0 | 弹窗提示（"确定删除…" "没有词汇可保存"） | 中文 |
| P1 | Toast 消息（"已保存" "导入失败"） | 中文 |
| P1 | 编辑覆层标题（"编辑词性" "新增词汇"） | 中文 |
| P1 | 设置标签（"启用高亮" "标注模式" "最小词长"） | 中文 |
| P1 | 词性名称（"名词" "动词" "形容词"） | 中文 |
| P2 | 社区词典卡片描述 | 中文 |
| P2 | 上传弹窗 | 中文 |

### 1.4 检测语言

```javascript
// 优先使用 VS Code 配置的语言
function detectLang() {
  const htmlLang = document.documentElement.lang  // VS Code 注入
  if (htmlLang?.startsWith('zh')) return 'zh'
  return 'en'
}
```

VS Code 的 Webview 会自动在 `<html>` 上设置 `lang` 属性。也可以用扩展配置覆盖。

---

## 二、UI 优化

### 2.1 扩展图标

当前缺失（`icon.png` 不存在）。需要：
- 256x256 PNG
- 简单可识别：字母 "A" 或 调色板 + A 的组合
- 用 AI 生成或用 Figma 快速制作

### 2.2 当前 UI 问题

| 问题 | 位置 | 建议 |
|------|------|------|
| 词性 chips 点击无过渡动画 | `#pos-chips` | 已有 `transition` CSS，检查是否生效 |
| 空状态缺少插图 | `#freq-empty` | 加简单的 SVG 图标（无外部依赖） |
| 侧边栏初始加载白屏 | 整个 webview | 加 loading spinner（CSS only） |
| 词典详情返回按钮位置不直观 | `#btn-back-to-list` | 移到左上角，加箭头图标 |
| 设置 Tab 排版拥挤 | `#tab-settings` | 增加 section 间距，加分隔线 |
| 编辑覆层在大屏上太窄 | `.overlay-panel` | `max-width: 320px` → `400px` |
| 无品牌色 | 整体 | 定义 `--brand-color` CSS 变量 |

### 2.3 视觉改进清单

#### P0（发布必须）
- [ ] 添加扩展图标 `icon.png`（256x256）
- [ ] 截图两张（一个英文文档 + 一个中文文档）用于 Marketplace
- [ ] 更新 `README.md` 含截图 + 功能说明

#### P1（强烈推荐）
- [ ] 空状态优化：用 CSS 绘制简单示意图标替代纯文字
- [ ] 加载状态：词典列表加载时显示 pulse 动画替代"加载中..."
- [ ] 设置 Tab 分组更清晰：加视觉分隔和 section 描述
- [ ] 词性统计栏固定高度，避免内容跳动

#### P2（可选）
- [ ] 暗色/亮色主题适配验证（用 VS Code 提供的 CSS 变量已完成大部分）
- [ ] 编辑覆层增加 ESC 关闭快捷键
- [ ] 搜索结果高亮（输入搜索词时匹配文字加粗）
- [ ] 删除确认弹窗美化（VS Code 原生 confirm() 样式不一致）

### 2.4 主题兼容

当前使用的 VS Code CSS 变量清单：

```css
var(--vscode-font-family)
var(--vscode-font-size)
var(--vscode-foreground)
var(--vscode-sideBar-background)
var(--vscode-sideBarSectionHeader-border)
var(--vscode-descriptionForeground)
var(--vscode-focusBorder)
var(--vscode-list-hoverBackground)
var(--vscode-input-background)
var(--vscode-input-foreground)
var(--vscode-input-border)
var(--vscode-button-background)
var(--vscode-button-foreground)
var(--vscode-button-hoverBackground)
var(--vscode-button-border)
var(--vscode-editorHoverWidget-background)
var(--vscode-editorHoverWidget-border)
var(--vscode-editorInfo-foreground)
```

所有颜色已使用 VS Code CSS 变量，亮/暗主题自适应已有。需验证高对比度主题（High Contrast）。

---

## 三、发布前检查清单

### 3.1 代码清理

- [ ] 移除所有 `console.log` 调试日志（尤其是 `[adhdgofly:engine]` `[adhdgofly:manager]` 等日志前缀）
- [ ] 检查 `.vscodeignore` 排除所有不需要打包的文件
- [ ] 确认 `package.json` 中的 `version` 已更新（当前 `0.2.0` → `1.0.0`）

### 3.2 功能验证

| 场景 | 验证方法 |
|------|---------|
| 打开 .md 文件自动高亮 | F5 → 打开任意 .md → 1s 内出现着色 |
| 混排中文+英文段落 | 打开含 `我想用chatgpt` 的 .md → 中英文都标注 |
| 取消词性 chip | 取消 n → 编辑器内名词高亮消失 |
| 词典开关 | 关闭 builtin-zh → 中文段落不高亮 |
| 自建词典 | 保存标注 → 自建 Tab 可见 → 可开关 |
| 代码文件 | 打开 .ts 文件 → 仅注释/字符串内高亮 |
| 大文件性能 | 打开 >2000 行文件 → 不卡顿 |
| 配置变更 | 切换 decorationStyle → 立即生效 |

### 3.3 多 IDE 兼容

| IDE | 测试重点 |
|-----|---------|
| VS Code | 完整功能 |
| Cursor | MCP 工具 + decorations |
| Windsurf | decorations |
| Kiro | decorations（fork 兼容） |
| Trae | decorations |

### 3.4 词典数据

- [ ] 确认内置词典 meta 信息正确（`dictionaries/` 中的文件）
- [ ] 确认社区词典 API 可访问（`dictionary.adhdgofly.online`）
- [ ] 确认词典文件在 VSIX 中（检查 `.vscodeignore` 未排除 `dictionaries/`）

---

## 四、发布步骤

### 4.1 打包 VSIX

```bash
cd adhdgofly-ide-ext
npm run build                    # 编译 TypeScript
vsce package --no-yarn           # 生成 .vsix 文件 (~13MB)
# 检查 size: du -sh *.vsix
```

### 4.2 发布到 VS Code Marketplace

需要先创建 Publisher：

```bash
# 如果未登录
vsce login adhdgofly              # 需要 Personal Access Token

# 发布
vsce publish                      # 自动 bump version
# 或指定版本
vsce publish 1.0.0                # 从当前版本发布 1.0.0
```

第一次需要去 [VS Code Marketplace](https://marketplace.visualstudio.com/manage) 创建 Publisher `adhdgofly`，获取 Personal Access Token（PAT）。

### 4.3 发布到 Open VSX

```bash
npx ovsx publish *.vsix --pat <token>
```

### 4.4 发布到 GitHub Releases

```bash
# 创建 tag
git tag v1.0.0
git push origin v1.0.0
# 上传 .vsix 到 GitHub Releases 页面
```

---

## 五、后续规划

### 5.1 短期（v1.0 → v1.2）

- [ ] i18n 中英文双语（§一）
- [ ] UI 打磨（§二）
- [ ] 图标 + 截图 + README 完善

### 5.2 中期（v1.2 → v2.0）

- [ ] ChatParticipant（VS Code AI Chat 集成）
- [ ] MCP 工具（Cursor / Windsurf）
- [ ] 词典社区功能完善（上传/审核/搜索）

### 5.3 长期（v2.0+）

- [ ] JetBrains 插件
- [ ] 词形还原扩展（法语/西班牙语）
- [ ] 与 dict-app 的词典同步机制

---

**相关文档：**
- `000-ide-extension.md` — 项目主规划
- `001-implementation-summary.md` — 实现总结
- `006-dict-format.md` — 词典格式规范
