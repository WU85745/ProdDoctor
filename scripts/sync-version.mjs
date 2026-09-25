import fs from 'node:fs';

const mode = process.argv.includes('--write') ? 'write' : 'check';
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = pkg.version;

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`package.json version 不是稳定 SemVer：${version}`);
}

const [major, minor, patch] = version.split('.').map(Number);
const nextPatch = `${major}.${minor}.${patch + 1}`;

function updateFile(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);

  if (before === after) return false;

  if (mode === 'write') {
    fs.writeFileSync(path, after);
    console.log(`updated ${path}`);
    return true;
  }

  console.error(`版本引用未同步：${path}`);
  return true;
}

function replaceRequired(text, pattern, replacement, label) {
  if (!pattern.test(text)) {
    throw new Error(`找不到需要同步的版本位置：${label}`);
  }
  pattern.lastIndex = 0;
  return text.replace(pattern, replacement);
}

let changed = false;

changed ||= updateFile('README.md', (input) => {
  let text = input;

  text = replaceRequired(
    text,
    /version-v\d+\.\d+\.\d+-2563eb/,
    `version-v${version}-2563eb`,
    'README badge'
  );

  text = replaceRequired(
    text,
    /当前对外稳定版本为 \*\*v\d+\.\d+\.\d+\*\*/,
    `当前对外稳定版本为 **v${version}**`,
    'README 当前版本'
  );

  text = text.replace(
    /WU85745\/ProdDoctor@v\d+\.\d+\.\d+/g,
    `WU85745/ProdDoctor@v${version}`
  );

  text = replaceRequired(
    text,
    /具体版本 tag（例如 `v\d+\.\d+\.\d+`）发布后禁止移动；补丁修复应发布新的 patch 版本，例如 `v\d+\.\d+\.\d+`。/,
    `具体版本 tag（例如 \`v${version}\`）发布后禁止移动；补丁修复应发布新的 patch 版本，例如 \`v${nextPatch}\`。`,
    'README tag 规则'
  );

  text = replaceRequired(
    text,
    /发布 `v\d+\.\d+\.\d+` 后，可以从 GitHub \*\*Releases \/ v\d+\.\d+\.\d+ tag 页面\*\*/,
    `发布 \`v${version}\` 后，可以从 GitHub **Releases / v${version} tag 页面**`,
    'README SHA 获取说明'
  );

  text = replaceRequired(
    text,
    /git rev-list -n 1 v\d+\.\d+\.\d+/,
    `git rev-list -n 1 v${version}`,
    'README rev-list'
  );

  text = replaceRequired(
    text,
    /> v\d+\.\d+\.\d+ 默认仍保持轻量 HTTP 检查/,
    `> v${version} 默认仍保持轻量 HTTP 检查`,
    'README 模式说明'
  );

  text = replaceRequired(
    text,
    /v\d+\.\d+\.\d+ 会把浏览器证据集中放在一个 Artifact 中/,
    `v${version} 会把浏览器证据集中放在一个 Artifact 中`,
    'README Evidence 版本'
  );

  return text;
});

for (const path of ['examples/production-check.yml', 'examples/browser-check.yml']) {
  changed ||= updateFile(path, (input) =>
    input
      .replace(/v\d+\.\d+\.\d+/g, `v${version}`)
      .replace(/WU85745\/ProdDoctor@v\d+\.\d+\.\d+/g, `WU85745/ProdDoctor@v${version}`)
  );
}

changed ||= updateFile('bin/proddoctor.mjs', (input) =>
  replaceRequired(
    input,
    /ProdDoctor v\d+\.\d+\.\d+/,
    `ProdDoctor v${version}`,
    'CLI 版本'
  )
);

changed ||= updateFile('src/checker.mjs', (input) => {
  let text = input;
  text = replaceRequired(
    text,
    /ProdDoctor\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/WU85745\/ProdDoctor\)/,
    `ProdDoctor/${version} (+https://github.com/WU85745/ProdDoctor)`,
    'HTTP User-Agent'
  );
  text = replaceRequired(
    text,
    /version: '\d+\.\d+\.\d+'/,
    `version: '${version}'`,
    'JSON report version'
  );
  return text;
});

changed ||= updateFile('src/assets.mjs', (input) =>
  replaceRequired(
    input,
    /ProdDoctor\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/WU85745\/ProdDoctor\)/,
    `ProdDoctor/${version} (+https://github.com/WU85745/ProdDoctor)`,
    'asset User-Agent'
  )
);

changed ||= updateFile('test/html-report.test.mjs', (input) =>
  replaceRequired(
    input,
    /version: '\d+\.\d+\.\d+'/,
    `version: '${version}'`,
    'HTML report fixture version'
  )
);

changed ||= updateFile('.github/workflows/browser-smoke.yml', (input) =>
  replaceRequired(
    input,
    /"version": "\d+\.\d+\.\d+"/,
    `"version": "${version}"`,
    'browser smoke report version'
  )
);

if (mode === 'check' && changed) {
  console.error('运行 npm run release:sync 同步版本引用。');
  process.exit(1);
}

if (!changed) {
  console.log(`version references are synced at ${version}`);
}
