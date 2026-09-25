# ProdDoctor 发布检查清单

本文件给仓库维护者使用，不是最终用户的 Action 配置示例。

## 版本规则

ProdDoctor 使用 SemVer：

- patch：向后兼容的修复，例如 `1.4.0 → 1.4.1`
- minor：向后兼容的新功能，例如 `1.4.x → 1.5.0`
- major：会破坏已有 Workflow 行为的变更，例如 `1.x → 2.0.0`

以下变化如果会改变已有用户 Workflow 的行为，应视为 breaking change，并升主版本：

- 已有 input 改名或被移除
- 参数语义发生不兼容变化
- 默认值变化导致已有配置行为改变
- 默认失败条件变严，导致原本通过的流水线在升级后开始失败

新增可选 input、新增默认只 warning 的检查、或显式 opt-in 的新阻断能力，可以在保持向后兼容时使用 minor 版本。

## Tag 规则

- 具体版本 tag，例如 `v1.4.0`，一旦发布禁止移动、禁止 force-update。
- 已发布版本需要修复时，创建新的 patch，例如 `v1.4.1`。
- 可以维护浮动 major tag `v1`，指向当前 1.x 最新稳定版本。
- `v1` 是唯一允许随新 1.x 发布移动的版本引用之一；最终用户文档默认仍使用具体版本 tag。
- 严格生产环境推荐使用具体版本 tag 对应的完整 commit SHA。

## 每次发布前

1. 确认 `package.json`、README version badge、CHANGELOG 当前版本一致。
2. 确认所有给最终用户复制的示例只指向准备发布的具体 tag，不使用 `@main`。
3. 确认内部 smoke tests 仍使用当前 checkout 的本地 Action，避免测试旧发布版本。
4. 运行：

```bash
npm run check
```

5. 确认 GitHub Actions 全绿：
   - Test ProdDoctor
   - Smoke test GitHub Action
   - Browser smoke test
6. 检查 CHANGELOG 对应版本段，确认新增、变更和 breaking change 都有记录。
7. 如果变更会破坏已有 Workflow 行为，确认版本号已经按 SemVer 升主版本。

## 发布 v1.4.0

先确保发布准备 PR 已经合并到 `main`，并且本地 `main` 是最新状态：

```bash
git switch main
git pull --ff-only
npm run check
```

创建 annotated tag：

```bash
git tag -a v1.4.0 -m "ProdDoctor v1.4.0"
git push origin v1.4.0
```

确认该 tag 对应的完整 commit SHA：

```bash
git rev-list -n 1 v1.4.0
```

不要对 `v1.4.0` 执行 `git tag -f` 或 force-push。

## 创建 GitHub Release

可以在 GitHub 的 Releases 页面选择已有 `v1.4.0` tag 创建 Release，正文复制 CHANGELOG 中 `[1.4.0]` 对应内容。

如果使用 GitHub CLI，可以先从 CHANGELOG 提取该版本正文：

```bash
awk '/^## \\[1\\.4\\.0\\]/{flag=1; next} /^## \\[/{if(flag) exit} flag' CHANGELOG.md > /tmp/proddoctor-v1.4.0-notes.md
```

检查临时文件内容后创建 Release：

```bash
gh release create v1.4.0 \
  --title "ProdDoctor v1.4.0" \
  --notes-file /tmp/proddoctor-v1.4.0-notes.md
```

## 可选：更新浮动 v1 tag

`v1` 可以指向当前 1.x 最新发布。发布 v1.4.0 后，如果决定维护这个浮动 tag：

```bash
git tag -fa v1 v1.4.0 -m "ProdDoctor v1"
git push origin refs/tags/v1 --force
```

未来发布 `v1.4.1` 或 `v1.5.0` 时，可以移动 `v1`，但不要移动旧的具体版本 tag。

## 发布后

1. 确认 GitHub tag 页面存在 `vX.Y.Z`。
2. 确认 GitHub Release 已创建。
3. 确认 README 和 examples 的用户示例只引用已发布的具体 tag。
4. 从 tag 页面或以下命令获取完整 SHA：

```bash
git rev-list -n 1 vX.Y.Z
```

5. 生产用户应优先使用：

```yaml
uses: WU85745/ProdDoctor@<commit-sha>
```

6. 不移动已经发布的具体版本 tag。
