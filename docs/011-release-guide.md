# ADHDGoFly Highlight — 发布指南

> 本文档详细说明将 ADHDGoFly Highlight 发布到各平台的全流程。
>
> 扩展 ID: `adhdgofly.adhdgofly-highlight` | 发布者: `adhdgofly`
>
> 前置文档: `007-publish-prep.md`（发布前检查清单）
>
> **现状: v1.0.0 已打包就绪 ✅** — 见 §十一 完成状态

---

## 一、你需要什么

### 1.1 必备工具

| 工具 | 用途 | 安装方式 |
|------|------|---------|
| `vsce` | 打包 + 发布到 VS Code Marketplace | `npm install -g @vscode/vsce` |
| `ovsx` | 发布到 Open VSX | 由 `npx ovsx` 自动下载，无需全局安装 |

### 1.2 需要注册的账号

| 平台 | 注册方式 | 是否必需 |
|------|---------|---------|
| **VS Code Marketplace** | Microsoft 账户（可关联 GitHub）| **必需**（主要分发渠道）|
| **Open VSX** | GitHub 账户 OAuth | 推荐（覆盖 VSCodium / Gitpod / 中国用户）|
| **GitHub** | 已有 | 用于 Release 托管 .vsix |

### 1.3 需要获取的 Token

| Token | 用途 | 获取地址 |
|-------|------|---------|
| **VS Code PAT**（Personal Access Token）| `vsce login` + `vsce publish` | [VS Code Marketplace 管理页](https://marketplace.visualstudio.com/manage) |
| **Open VSX Token** | `ovsx publish` | [Open VSX 发布页](https://open-vsx.org/user-settings/tokens) |

---

## 二、注册发布者（第一次必做）

### 2.1 VS Code Marketplace — 创建 Publisher

1. 访问 [VS Code Marketplace 管理页](https://marketplace.visualstudio.com/manage)
2. 使用 **Microsoft 账户** 登录
   - 如果你的 GitHub 账户绑定了 Microsoft 账户，可以直接用 GitHub 身份登录
   - 如果没有绑定，可以在登录页面选择"使用 Microsoft 账户登录"→ 用你的邮箱创建
3. 登录后 → 输入 Publisher 名称 → **`adhdgofly`**
   - 注意：publisher 名称全局唯一，一旦创建不可更改
   - 扩展 ID 格式为 `publisher.extensionName`，即 `adhdgofly.adhdgofly-highlight`
4. 创建成功后，进入 Publisher 设置页面

### 2.2 VS Code Marketplace — 生成 PAT

1. 在 Publisher 设置页面，找到 **Personal Access Token** 部分
2. 点击 **Create Token** / **新建令牌**
3. 设置 Token 名称（如 `adhdgofly-publish`）
4. 选择有效期（建议 30-90 天，到期后需重新生成）
5. 权限范围选择 **All accessible organizations**（默认即可）
6. 创建成功后，**立即复制并保存 Token**（页面关闭后不再显示）
7. 本地执行登录：

```bash
vsce login adhdgofly
# 提示输入 PAT，粘贴后回车
# 成功输出：Personal Access Token for publisher 'adhdgofly' saved.
```

Token 会保存在 `~/.vsce/personal-access-tokens.json`。

### 2.3 Open VSX — 注册与生成 Token

1. 访问 [Open VSX](https://open-vsx.org)
2. 用 **GitHub 账户** 直接登录（支持 GitHub OAuth）
3. 进入 [User Settings → Tokens](https://open-vsx.org/user-settings/tokens)
4. 创建新 Token，复制保存

> Open VSX 用 GitHub 账号直接登录，不需要单独创建 publisher。发布时扩展会自动关联到你的 GitHub 身份。

---

## 三、版本号管理

### 3.1 版本号规范（SemVer）

扩展版本号遵循 `major.minor.patch`：

| 类型 | 示例 | 触发场景 |
|------|------|---------|
| `patch` | `0.2.0` → `0.2.1` | 小 bug 修复 |
| `minor` | `0.2.0` → `0.3.0` | 新功能（向后兼容）|
| `major` | `0.2.0` → `1.0.0` | 重大变更 / 正式发布 |

### 3.2 更新版本号

每次发布前，更新 `package.json`：

```bash
# 手动编辑 package.json 的 version 字段
# 或使用 vsce:
vsce version patch   # 0.2.0 → 0.2.1
vsce version minor   # 0.2.0 → 0.3.0
vsce version major   # 0.2.0 → 1.0.0
```

---

## 四、打包 VSIX

### 4.1 打包前确认

- [x] `package.json` 的 `version` 已更新 → `1.0.0`
- [x] `.vscodeignore` 配置正确 — 已排除 `docs/`、`src/`、`node_modules/`、`.claude/`、`scripts/`、`**/*.bak`
- [ ] 内置词典文件未被排除（检查 `dictionaries/` 路径在 `.vscodeignore` 中无匹配）
- [x] 已运行 `npm run build && vsce package --no-yarn` 确认无编译错误

### 4.2 执行打包

```bash
cd adhdgofly-ide-ext
npm run build                    # 编译 TypeScript
vsce package --no-yarn          # 生成 .vsix
```

输出示例：

```
DONE  Packaged: adhdgofly-highlight-1.0.0.vsix (2.54 MB, 38 files)
```

### 4.3 检查打包内容

```bash
# 查看 .vsix 中的文件列表
unzip -l adhdgofly-highlight-*.vsix | less

# 确认关键文件都在:
#   LICENSE.txt (已包含)
#   extension.js (已编译)
#   webview/panel.html
#   webview/panel.js
#   webview/panel.css
#   webview/i18n.js
#   webview/icons.js
#   dictionaries/*.json        (确认 .bak 备份文件已被排除)
#   package.json
```

> **提示**: 检查 `.vscodeignore` 是否误排除了必要文件。当前配置排除了以下非必需内容：
> - `.claude/**` — Claude AI 辅助配置
> - `scripts/**` — Python 工具脚本
> - `docs/**` — 项目文档
> - `src/**` — TypeScript 源码（已编译为 `out/`）
> - `**/*.bak` — 词典备份文件（~13MB 冗余）

### 4.4 本地安装测试

```bash
code --install-extension adhdgofly-highlight-*.vsix
# 然后重启 VS Code，验证功能正常
```

---

## 五、发布到 VS Code Marketplace

### 5.1 发布命令

```bash
# 方式一：自动发布（bump patch 版本 + 发布）
vsce publish

# 方式二：指定版本发布
vsce publish 1.0.0

# 方式三：只发布不 bump
vsce publish --no-verify
```

### 5.2 发布流程

```bash
# 1. 确认已登录
vsce verify-pat

# 2. 确保代码已提交
git status
git diff --stat

# 3. 指定版本发布
vsce publish 0.3.0

# 4. 成功后会返回 Marketplace 链接
# Marketplace: https://marketplace.visualstudio.com/items?itemName=adhdgofly.adhdgofly-highlight
```

### 5.3 常见错误

| 错误 | 原因 | 解决 |
|------|------|------|
| `Failed Request: Unauthorized (401)` | PAT 过期或无效 | 重新生成 PAT，重新 `vsce login` |
| `Extension id 'adhdgofly.adhdgofly-highlight' already exists` | 版本已发布 | 升级版本号再发布 |
| `Missing publisher name` | `package.json` 无 publisher | 确认 `"publisher": "adhdgofly"` |
| `Repository URI is not available` | `package.json` 缺少 repository | 添加 `"repository"` 字段 |

### 5.4 Marketplace 展示信息

发布后需要补充的展示内容（在 Marketplace 管理页面设置）：

- **图标**: `icon.png` 或 `icon.svg`（已有 `icon.svg`）
- **Banner 图片**: 1280×640 横幅
- **截图**: 至少 2 张（英文文档 + 中文文档标注效果展示）
- **Markdown 描述**: 自动从 `README.md` 读取

---

## 六、发布到 Open VSX

### 6.1 手动发布

```bash
npx ovsx publish adhdgofly-highlight-*.vsix --pat <your-open-vsx-token>
```

### 6.2 自动化发布（GitHub Actions）

在 GitHub 仓库中创建 `.github/workflows/publish.yml`：

```yaml
name: Publish Extension

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci
      - run: npm run build

      # 发布到 VS Code Marketplace
      - name: Publish to VS Code Marketplace
        run: npx vsce publish --no-verify
        env:
          VSCE_PAT: ${{ secrets.VSCE_PAT }}

      # 发布到 Open VSX
      - name: Publish to Open VSX
        run: npx ovsx publish --pat ${{ OVSX_TOKEN }}
        env:
          OVSX_TOKEN: ${{ secrets.OVSX_TOKEN }}
```

需要将以下 secrets 添加到 GitHub 仓库：

| Secret | 值 |
|--------|-----|
| `VSCE_PAT` | VS Code Marketplace PAT |
| `OVSX_TOKEN` | Open VSX Token |

---

## 七、发布到 GitHub Releases

```bash
# 1. 创建 tag
VERSION="v$(node -e "console.log(require('./package.json').version)")"
git tag -a "$VERSION" -m "Release $VERSION"
git push origin "$VERSION"

# 2. 打包 .vsix
vsce package --no-yarn

# 3. 在 GitHub 网页上:
#    - 进入仓库 → Releases → Create Release
#    - 选择 tag
#    - 上传 .vsix 文件
#    - 填写更新说明
```

### 或使用 GitHub CLI：

```bash
gh release create "$VERSION" \
  adhdgofly-highlight-*.vsix \
  --title "ADHDGoFly Highlight $VERSION" \
  --notes "### 更新内容

- xxx
- xxx"
```

---

## 八、完整的发布流程（从 0 到 1）

### 首次发布（当前完成状态）

```
1. 注册账号（待完成 ⬜）
   ├── VS Code: 用 Microsoft 账户登录 marketplace.visualstudio.com/manage
   ├── 创建 publisher "adhdgofly"
   ├── 生成 PAT 并保存
   └── Open VSX: 用 GitHub 登录 open-vsx.org，生成 Token

2. 本地配置（已完成 ✅）
   ├── npm install -g @vscode/vsce
   ├── 版本已设为 1.0.0
   ├── .vscodeignore 已优化（排除 .claude/ scripts/ .bak）
   ├── LICENSE 已添加
   └── repository 字段已补充

3. 打包与发布（打包已完成 ✅）
   ├── npm run build                  →  ✅ 编译成功
   ├── vsce package --no-yarn        →  ✅ VSIX 已生成（2.54 MB）
   ├── 本地安装测试 .vsix             →  ⬜ 待安装验证
   ├── vsce login adhdgofly          →  ⬜ 需要先注册 Publisher
   ├── vsce publish 1.0.0            →  ⬜ 需要先 login
   └── npx ovsx publish *.vsix --pat →  ⬜ 需要先获取 Token

4. 后续
   ├── git remote add origin <url>  →  ⬜ 需要先创建 GitHub 仓库
   ├── git push -u origin main      →  ⬜
   ├── git tag v1.0.0 && git push origin v1.0.0
   ├── gh release create v1.0.0 *.vsix --title "..."
   └── 在 Marketplace 管理页添加截图和描述
```

### 常规更新发布

```
1. 更新 version（package.json）
2. npm run build
3. vsce package --no-yarn
4. vsce publish        # 自动 bump patch
5. npx ovsx publish *.vsix --pat <token>
6. git tag 并 push
7. gh release create
```

---

## 九、更新 README 与 Marketplace 展示

发布后需要确保以下内容已更新：

### README.md 模板要求

```
# ADHDGoFly Highlight

POS-based vocabulary highlighting extension for VS Code and compatible IDEs.

## Features

- [截图 1：英文文档高亮效果]
- [截图 2：中文文档高亮效果]

## Requirements

- VS Code ^1.85.0

## Extension Settings

- `adhdgofly.enabled` — 启用/禁用
- `adhdgofly.languages` — 词典语言
- `adhdgofly.minWordLength` — 最小词长
- `adhdgofly.decorationStyle` — 高亮样式
- `adhdgofly.locale` — UI 语言

## Known Issues

...
```

### Marketplace 元数据

在 `package.json` 中补充（已完成 ✅，需要你确认/修改 GitHub URL）：

```json
{
  "icon": "icon.svg",
  "galleryBanner": {
    "color": "#1e1e1e",
    "theme": "dark"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/<你的用户名>/adhdgofly-ide-ext"   ← 需修改
  },
  "homepage": "https://github.com/<你的用户名>/adhdgofly-ide-ext",
  "bugs": {
    "url": "https://github.com/<你的用户名>/adhdgofly-ide-ext/issues"
  },
  "license": "MIT",
  "keywords": ["vocabulary", "highlight", "language-learning", "annotation"]
}
```

---

## 十、发布后验证

### 10.1 基础检查

- [ ] Marketplace 页面可正常访问
- [ ] 扩展信息（描述、截图、图标）正确显示
- [ ] 在 VS Code 中搜索并安装扩展成功
- [ ] 安装后功能正常

### 10.2 GitHub Release

- [ ] Release 页面包含 .vsix 下载链接
- [ ] tag 和版本号一致
- [ ] Release notes 描述了主要变更

### 10.3 Open VSX

- [ ] open-vsx.org 上扩展可搜索到
- [ ] 在 VSCodium 中安装测试通过

---

## 十一、v1.0.0 当前完成状态

### 已完成 ✅

- [x] 项目从 dict-app 拆分为独立仓库（`~/Documents/GitHub/adhdgofly-ide-ext/`）
- [x] git 仓库已初始化（`main` 分支，3 commits）
- [x] `package.json` 版本升级到 `1.0.0`
- [x] 补充 `repository` 字段和 `license` 字段
- [x] `.vscodeignore` 优化（排除 `.claude/`、`scripts/`、`docs/`、`**/*.bak`）
- [x] `LICENSE` 文件已添加（MIT）
- [x] VSIX 已打包成功（2.54 MB, 38 files）

### 待完成 ⬜

**§ 注册与 Token**
- [ ] 访问 [VS Code Marketplace 管理页](https://marketplace.visualstudio.com/manage)
- [ ] 用 Microsoft 账户登录，创建 publisher `adhdgofly`
- [ ] 生成 PAT，保存
- [ ] 访问 [Open VSX](https://open-vsx.org)，用 GitHub 登录
- [ ] 生成 Open VSX Token，保存

**§ 本地配置**
- [ ] 执行 `vsce login adhdgofly`，输入 PAT
- [ ] 用 `code --install-extension` 安装 `.vsix` 验证功能

**§ 发布**
- [ ] 创建 GitHub 仓库并 push
- [ ] 执行 `vsce publish 1.0.0` 发布到 Marketplace
- [ ] 执行 `npx ovsx publish *.vsix --pat <token>` 发布到 Open VSX
- [ ] 打 tag 并创建 GitHub Release

**§ 展示**
- [ ] 在 Marketplace 管理页上传截图（英文 + 中文文档高亮效果）
- [ ] 补充 `galleryBanner` 和 `homepage` 字段

---

**相关文档：**
- `007-publish-prep.md` — 发布前检查清单（i18n / UI 优化 / 功能验证）
- `000-ide-extension.md` — 项目主规划
