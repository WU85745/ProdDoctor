const title = process.env.PR_TITLE || '';

const conventional = /^(?:feat|fix|perf|refactor|docs|test|build|ci|chore|revert)(?:\([^)]+\))?!?: .+/;

if (!conventional.test(title)) {
  console.error('PR 标题必须使用 Conventional Commits 格式。');
  console.error('示例：fix: handle redirect edge case');
  console.error('示例：feat: add multi-url checks');
  console.error('Breaking 示例：feat!: enable a stricter default');
  console.error(`当前标题：${title}`);
  process.exit(1);
}

console.log(`PR title ok: ${title}`);
