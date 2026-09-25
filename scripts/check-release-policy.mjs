import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

function parseVersion(value) {
  const match = String(value).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`无效 SemVer：${value}`);
  return { raw: value, major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function bumpType(from, to) {
  if (to.major === from.major + 1 && to.minor === 0 && to.patch === 0) return 'major';
  if (to.major === from.major && to.minor === from.minor + 1 && to.patch === 0) return 'minor';
  if (to.major === from.major && to.minor === from.minor && to.patch === from.patch + 1) return 'patch';
  throw new Error(`不允许的版本跳跃：${from.raw} -> ${to.raw}。自动发布只允许单步 major/minor/patch。`);
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('.release-please-manifest.json', 'utf8'));
const proposed = parseVersion(pkg.version);

if (manifest['.'] !== pkg.version) {
  throw new Error(`manifest 与 package.json 版本不一致：${manifest['.']} != ${pkg.version}`);
}

const allTags = execFileSync('git', ['tag', '--list'], { encoding: 'utf8' })
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag));

if (!allTags.length) {
  throw new Error('找不到已发布的不可变版本 tag，无法验证版本升级。');
}

allTags.sort((a, b) => {
  const av = parseVersion(a.slice(1));
  const bv = parseVersion(b.slice(1));
  return bv.major - av.major || bv.minor - av.minor || bv.patch - av.patch;
});

const latestTag = allTags[0];
const current = parseVersion(latestTag.slice(1));
const actualBump = bumpType(current, proposed);

const log = execFileSync(
  'git',
  ['log', `${latestTag}..HEAD`, '--format=%s%n%b%x00'],
  { encoding: 'utf8' }
);

const commits = log
  .split('\x00')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .filter((entry) => !/^chore\(main\): release\b/m.test(entry))
  .filter((entry) => !/^chore: sync release version references\b/m.test(entry));

const hasBreaking = commits.some((entry) =>
  /^[a-z]+(?:\([^)]+\))?!:/m.test(entry) ||
  /^BREAKING CHANGE:/m.test(entry)
);
const hasFeature = commits.some((entry) => /^feat(?:\([^)]+\))?:/m.test(entry));
const hasPatch = commits.some((entry) => /^(?:fix|perf)(?:\([^)]+\))?:/m.test(entry));

let expectedBump = null;
if (hasBreaking) expectedBump = 'major';
else if (hasFeature) expectedBump = 'minor';
else if (hasPatch) expectedBump = 'patch';

if (!expectedBump) {
  throw new Error('Release PR 中没有发现 feat/fix/perf 或 BREAKING CHANGE，拒绝自动发布。');
}

if (actualBump !== expectedBump) {
  throw new Error(
    `版本策略不匹配：从 ${current.raw} 到 ${proposed.raw} 是 ${actualBump}，但提交内容要求 ${expectedBump}。`
  );
}

console.log(`release policy ok: ${current.raw} -> ${proposed.raw} (${actualBump})`);
