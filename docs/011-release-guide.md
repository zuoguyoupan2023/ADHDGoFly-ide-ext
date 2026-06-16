# adhdgofly-ide-ext — 发布指南

> 本文档详细说明将 adhdgofly-ide-ext 发布到各平台的全流程。
>
> 扩展 ID: `ADHDGoFly.adhdgofly-ide-ext` | 发布者: `ADHDGoFly`
>
> Marketplace: https://marketplace.visualstudio.com/items?itemName=ADHDGoFly.adhdgofly-ide-ext
>
> 前置文档: `007-publish-prep.md`（发布前检查清单）

---

## 一、你需要什么

### 1.1 必备工具

| 工具 | 用途 | 安装方式 |
|------|------|---------|
| `vsce` | 打包 + 发布到 VS Code Marketplace | `npm install -g @vscode/vsce` |
| `ovsx` | 发布到 Open VSX（可选） | 由 `npx ovsx` 自动下载，无需全局安装 |

### 1.2 需要注册的账号

| 平台 | 注册方式 | 是否必需 |
|------|---------|---------|
| **VS Code Marketplace** | Microsoft 账户（可关联 GitHub）| **必需**（主要分发渠道）|
| **Open VSX** | GitHub 账户 OAuth | 可选（VSCodium / Gitpod 用户，非必须）|
| **GitHub** | 已有 | 用于 Release 托管 .vsix |

### 1.3 需要获取的 Token

| Token | 用途 | 获取地址 |
|-------|------|---------|
| **VS Code PAT**（Personal Access Token）| `vsce login` + `vsce publish` | 需通过 Azure DevOps (dev.azure.com) 生成 → Personal Access Tokens → 勾选 Marketplace(Manage) |
| **Open VSX Token** | `ovsx publish`（可选） | [Open VSX 发布页](https://open-vsx.org/user-settings/tokens) |

---

## 二、注册发布者（第一次必做）

### 2.1 VS Code Marketplace — 创建 Publisher

1. 访问 [VS Code Marketplace 管理页](https://marketplace.visualstudio.com/manage)
2. 使用 **Microsoft 账户** 登录
3. 登录后 → 输入 Publisher 名称 → **`ADHDGoFly`**
   - 注意：publisher 名称必须与 `package.json` 的 `publisher` 字段完全一致（含大小写）
   - 扩展 ID 格式为 `publisher.extensionName`
4. 创建成功后，进入 Publisher 设置页面

### 2.2 VS Code Marketplace — 生成 PAT

> **注意**: PAT 不在 Marketplace 网页生成，需去 Azure DevOps：
> https://dev.azure.com/ → 右上角头像 → Personal access tokens → + New Token
> → 选 All accessible organizations → 勾选 Marketplace(Manage)

1. 生成后复制保存 Token
2. 本地执行登录：

```bash
vsce login ADHDGoFly
# 提示输入 PAT，粘贴后回车
# 成功输出：Personal Access Token for publisher 'ADHDGoFly' saved.
```

### 2.3 Open VSX — 注册与生成 Token（可选）

1. 访问 [Open VSX](https://open-vsx.org)
2. 用 **GitHub 账户** 直接登录
3. 进入 [User Settings → Tokens](https://open-vsx.org/user-settings/tokens)
4. 创建新 Token，复制保存

---

## 三、版本号管理

### 3.1 版本号规范（SemVer）

| 类型 | 示例 | 触发场景 |
|------|------|---------|
| `patch` | `1.0.0` → `1.0.1` | 小 bug 修复 |
| `minor` | `1.0.0` → `1.1.0` | 新功能（向后兼容）|
| `major` | `1.0.0` → `2.0.0` | 重大变更 |

### 3.2 更新版本号

```bash
# 手动编辑 package.json 的 version 字段
# 或使用 vsce:
vsce version patch
vsce version minor
vsce version major
```

---

## 四、打包 VSIX

### 4.1 打包前确认

- [x] `package.json` 的 `version` 已更新 → `1.0.0`
- [x] `.vscodeignore` 配置正确（已排除 `.claude/`、`scripts/`、`**/*.bak`）
- [ ] 内置词典文件未被排除（确认 `dictionaries/` 存在）
- [x] 已运行 `npm run build && vsce package --no-yarn` 通过

### 4.2 执行打包

```bash
cd adhdgofly-ide-ext
npm run build
vsce package --no-yarn
```

输出示例：
```
DONE  Packaged: adhdgofly-ide-ext-1.0.0.vsix (2.54 MB, 38 files)
```

### 4.3 检查打包内容

```bash
unzip -l adhdgofly-ide-ext-*.vsix | less
```

### 4.4 本地安装测试

```bash
code --install-extension adhdgofly-ide-ext-*.vsix
```

---

## 五、发布到 VS Code Marketplace

### 5.1 发布命令

```bash
# 方式一（推荐）：上传网页 → 发布渠道
# 或 CLI：
vsce publish 1.0.0
```

### 5.2 发布流程

```bash
# 1. 确认已登录
vsce verify-pat

# 2. 发布
vsce publish 1.0.0

# 或通过网页上传 .vsix 文件
```

### 5.3 常见错误

| 错误 | 原因 | 解决 |
|------|------|------|
| `Failed Request: Unauthorized (401)` | PAT 过期或无效 | 重新生成 PAT，重新 `vsce login` |
| `Extension id already exists` | 版本已发布 | 升级版本号再发布 |
| `Missing publisher name` | `package.json` 无 publisher | 确认 `"publisher": "ADHDGoFly"` |
| 网页上传报 `Value cannot be null. Parameter name: v1` | 网页解析器问题 | 改用 `vsce publish` CLI |

### 5.4 Marketplace 展示

- **图标**: `icon.svg`（已有）
- **截图**: 英文文档 + 中文文档高亮效果
- **描述**: 自动从 `README.md` 读取

---

## 六、发布到 Open VSX（可选 — 当前跳过）

> Open VSX 主要用于 VSCodium / Gitpod 等非 VS Code IDE。
> **当前状态: 暂不发布**（需要注册 Eclipse 基金会账号，后续再做）

### 6.1 手动发布（将来需要时执行）

```bash
npx ovsx publish adhdgofly-ide-ext-*.vsix --pat <your-open-vsx-token>
```

### 6.2 GitHub Actions 自动化（可选）

见 [官方文档](https://github.com/marketplace/actions/publish-vs-code-extension)。

---

## 七、发布到 GitHub Releases

```bash
VERSION="v$(node -e "console.log(require('./package.json').version)")"
git tag -a "$VERSION" -m "Release $VERSION"
git push origin "$VERSION"
gh release create "$VERSION" \
  adhdgofly-ide-ext-*.vsix \
  --title "adhdgofly-ide-ext $VERSION"
```

---

## 八、发布后验证

### 8.1 Marketplace

- [x] 页面可正常访问 → https://marketplace.visualstudio.com/items?itemName=ADHDGoFly.adhdgofly-ide-ext
- [ ] 扩展信息（描述、截图）显示完整
- [ ] 在 VS Code 中搜索并安装成功
- [ ] 在 Kiro / Cursor 等兼容 IDE 中可搜索到（需等待搜索索引同步，通常 24-48h）

### 8.2 GitHub Release

- [ ] Release 包含 .vsix 下载
- [ ] tag 和版本号一致

### 8.3 Open VSX

- [ ] _暂缓_

---

## 九、常见问题

### Kiro 搜不到扩展？

扩展刚上传到 Marketplace 时状态为 `verifying`，通过验证后才正式上线。
上线后 VS Code 可立即搜索到，但其他兼容 IDE（Kiro / Cursor / Windsurf）的搜索索引同步有延迟（24-48 小时）。
**临时解决方案**: 直接下载 .vsix 文件，在 Kiro 中通过 "Install from VSIX" 安装。

---

**相关文档：**
- `007-publish-prep.md` — 发布前检查清单
- `000-ide-extension.md` — 项目主规划
