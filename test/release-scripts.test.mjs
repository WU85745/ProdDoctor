import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const script = name => path.join(root, 'scripts', name);
function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proddoctor-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('version sync updates all public refs after owner rename and is idempotent', t => {
  const dir = temporary(t);
  for (const entry of ['README.md', 'README.zh-CN.md', 'package.json', '.release-please-manifest.json', 'bin', 'src', 'test', 'examples', '.github']) {
    fs.cpSync(path.join(root, entry), path.join(dir, entry), { recursive: true });
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json')));
  const workflowsDir = path.join(dir, '.github/workflows');
  const workflowsBefore = Object.fromEntries(fs.readdirSync(workflowsDir).map(file => [
    file, fs.readFileSync(path.join(workflowsDir, file), 'utf8')
  ]));
  pkg.version = '8.2.7';
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
  for (const file of ['README.md', 'README.zh-CN.md', 'src/checker.mjs', 'src/assets.mjs']) {
    const full = path.join(dir, file);
    fs.writeFileSync(full, fs.readFileSync(full, 'utf8').replaceAll('lucaswenbo/ProdDoctor', 'future-owner/ProdDoctor'));
  }
  const invoke = mode => spawnSync(process.execPath, [script('sync-version.mjs'), mode], {cwd: dir, encoding: 'utf8'});
  assert.equal(invoke('--check').status, 1);
  assert.equal(invoke('--write').status, 0);
  assert.equal(invoke('--check').status, 0);
  assert.match(invoke('--write').stdout, /synced at 8.2.7/);
  const workflowsAfter = Object.fromEntries(fs.readdirSync(workflowsDir).map(file => [
    file, fs.readFileSync(path.join(workflowsDir, file), 'utf8')
  ]));
  assert.deepEqual(workflowsAfter, workflowsBefore, 'Version sync must not modify workflow files');
  const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
  const chineseReadme = fs.readFileSync(path.join(dir, 'README.zh-CN.md'), 'utf8');
  for (const [label, content] of [['English README', readme], ['Chinese README', chineseReadme]]) {
    const refs = [...content.matchAll(/@v(\d+\.\d+\.\d+)/g)].map(m => m[1]);
    assert.ok(refs.length > 5, `${label} has too few version refs`);
    assert.ok(refs.every(v => v === '8.2.7'), `${label}: ${refs.join(',')}`);
    assert.match(content, /future-owner\/ProdDoctor@v8\.2\.7/);
  }
  assert.match(fs.readFileSync(path.join(dir, 'src/checker.mjs'), 'utf8'), /ProdDoctor\/8\.2\.7/);
});

for (const [name, report, succeeds] of [
  ['current package version', {version: JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version}, true],
  ['wrong version', {version: '999.0.0'}, false],
  ['missing version', {}, false]
]) {
  test('evidence version check: ' + name, t => {
    const dir = temporary(t);
    const reportPath = path.join(dir, 'report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report));
    const result = spawnSync(process.execPath, [script('verify-report-version.mjs'), reportPath], {cwd: dir, encoding: 'utf8'});
    assert.equal(result.status === 0, succeeds, result.stdout + result.stderr);
  });
}

for (const [message, version, expected] of [
  ['fix: regression', '1.4.1', 0],
  ['feat: new option', '1.5.0', 0],
  ['feat: new option', '1.4.1', 1],
  ['fix!: stricter default', '2.0.0', 0],
  ['fix: compatibility\n\nBREAKING-CHANGE: removed option', '2.0.0', 0],
  ['fix!: stricter default', '1.4.1', 1],
  ['fix: patch', '1.4.2', 1],
  ['docs: wording only', '1.4.1', 1]
]) {
  test('release policy: ' + message.split('\n')[0] + ' -> ' + version, t => {
    const dir = temporary(t);
    const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
    git('init', '-b', 'main');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.invalid');
    git('commit', '--allow-empty', '-m', 'chore: baseline');
    git('tag', 'v1.4.0');
    git('commit', '--allow-empty', '-m', message);
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({version}));
    fs.writeFileSync(path.join(dir, '.release-please-manifest.json'), JSON.stringify({'.': version}));
    const result = spawnSync(process.execPath, [script('check-release-policy.mjs')], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status === 0 ? 0 : 1, expected, result.stdout + result.stderr);
  });
}
