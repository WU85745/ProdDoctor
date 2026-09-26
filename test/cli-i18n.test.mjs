import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const cli = path.join(root, 'bin', 'proddoctor.mjs');

test('CLI help defaults to English', () => {
  const result = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /Output language: en or zh-CN, default en/);
  assert.doesNotMatch(result.stdout, /用法：/);
});

test('CLI help supports Chinese opt-in', () => {
  const result = spawnSync(process.execPath, [cli, '--lang', 'zh-CN', '--help'], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /用法：/);
  assert.match(result.stdout, /输出语言：en 或 zh-CN，默认 en/);
});
