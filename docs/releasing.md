# ProdDoctor 发布流程

本文件给仓库维护者使用。ProdDoctor 从 v1.4.0 之后使用 Release Please 管理版本、Release PR、Git tag 和 GitHub Release。

## 一次性 GitHub 设置

仓库需要允许 GitHub Actions 创建 Pull Request。

在 GitHub 网页打开：

```text
Settings
→ Actions
→ General
→ Workflow permissions
```

建议：

- 允许 workflow 获得所需的 write permissions。
- 打开 **Allow GitHub Actions to create and approve pull requests**。

ProdDoctor 的 release workflow 会显式申请：

- `contents: write`
- `issues: write`
- `pull-requests: write`
- `statuses: write`

如果仓库或组织级策略禁止这些权限，自动发布 workflow 会失败，需要先调整 GitHub 设置。

## 日常开发规则

普通代码修改不要手动改版本号，也不要手动创建 tag。

PR 标题使用 Conventional Commits：

```text
fix: handle redirect edge case
feat: add multi-url production checks
docs: clarify browser evidence
chore: update maintenance docs
```

Breaking change 必须明确写成：

```text
feat!: enable stricter validation by default
```

或者在 commit body 中加入：

```text
BREAKING CHANGE: ...
```

### 版本映射

- `fix:` / `perf:` → patch，例如 `1.4.0 → 1.4.1`
- `feat:` → minor，例如 `1.4.x → 1.5.0`
- `!:` 或 `BREAKING CHANGE:` → major，例如 `1.x → 2.0.0`
- `docs:` / `chore:` / `test:` / `ci:` 本身不应该为了“凑版本”强制发布

## 自动 Release PR 会做什么

当 conventional commit 合并到 `main` 后：

1. Release Please 根据从上一个具体版本 tag 之后的提交计算下一版本。
2. 自动创建或更新一个 **Draft Release PR**。
3. Release PR 先保持 Draft，防止未经验证直接发布。
4. workflow 从 Release PR 分支读取 `package.json` 里的新版本。
5. 自动同步：
   - README version badge
   - README 中用户复制的 `@vX.Y.Z`
   - examples 中的具体版本 tag
   - CLI 显示版本
   - HTTP / asset User-Agent
   - JSON report version
   - test fixture
   - browser smoke 的版本断言
6. 运行版本策略检查。
7. 运行 `npm run check`。
8. 运行轻量 GitHub Action smoke。
9. 运行真实 Chromium smoke。
10. 全部通过后，workflow 才把 Release PR 从 Draft 改成 Ready，并留言：
    `Automated release gate passed`

此时维护者只需要检查版本号和 CHANGELOG 是否符合预期，然后点 **Merge**。

## 自动版本保险

Release PR 还有一层独立版本策略：

- patch 只能是当前 patch + 1
- minor 只能是当前 minor + 1，并把 patch 归零
- major 只能是当前 major + 1，并把 minor/patch 归零
- `feat:` 不允许只发 patch
- breaking change 不允许只发 patch/minor
- 没有 releasable commit 时拒绝自动发布
- `.release-please-manifest.json` 与 `package.json` 必须一致

所以例如：

```text
当前：1.4.0
只有 fix:
提议：2.0.0
```

会直接被 release gate 拒绝。

## 合并 Release PR 后

Release Please 在 Release PR 合并后的下一次 `main` push 中自动：

1. 创建不可移动的具体版本 tag，例如 `v1.4.1`
2. 创建对应 GitHub Release
3. 把 Release PR 标记为已发布

ProdDoctor 还会自动更新浮动 major tag：

```text
v1 → 当前最新的 1.x release commit
```

例如：

```text
v1.4.0 发布：v1 → v1.4.0
v1.4.1 发布：v1 → v1.4.1
v1.5.0 发布：v1 → v1.5.0
```

具体版本 tag 永远不移动：

```text
v1.4.0  固定
v1.4.1  固定
v1.5.0  固定
v1       可移动
```

## 不要做的事

- 不要手动修改已经发布的具体版本 tag。
- 不要 force-update `v1.4.0`、`v1.4.1` 等具体 tag。
- 不要为了普通 bug 手动改成新的 major。
- 不要直接在 `main` 手改多个版本号。
- 不要跳过 Draft Release PR 的自动 gate。
- 不要把 `@main` 当用户生产默认引用。

## 手动发布备用方案

只有自动发布系统故障时才使用。

假设当前准备发布 `vX.Y.Z`，先确认目标 commit 和 CI：

```bash
npm run check
git rev-parse HEAD
```

然后：

```bash
git tag -a vX.Y.Z <commit-sha> -m "ProdDoctor vX.Y.Z"
git push origin vX.Y.Z
```

再从 GitHub Releases 页面创建对应 Release。

如果需要手动更新浮动 major tag：

```bash
git tag -fa vX <commit-sha> -m "ProdDoctor vX"
git push origin refs/tags/vX --force
```

其中只有 `vX` 浮动 tag 可以移动，`vX.Y.Z` 不允许移动。

## 发布前最终人工检查

Release PR 自动变为 Ready 后，只检查这几件事：

1. 版本号是否符合预期。
2. CHANGELOG 是否准确。
3. Release PR 中没有意外的大范围文件修改。
4. 自动留言显示 release gate 全部通过。
5. 再点 Merge。

正常情况下，不再需要手动创建 tag、复制 Release notes 或同步 README 版本。
