import test from 'node:test';
import assert from 'node:assert/strict';
import { toEnglishText } from '../src/report.mjs';

test('localizes core production diagnostics to English', () => {
  assert.equal(toEnglishText('DNS 解析失败'), 'DNS resolution failed');
  assert.equal(
    toEnglishText('HTTP 状态不符合预期：实际 503，预期 200'),
    'HTTP status mismatch: got 503, expected 200'
  );
  assert.equal(
    toEnglishText('浏览器 Console 出现 2 条 error（当前仅提示）'),
    'Browser console produced 2 error(s) (warning only)'
  );
});

test('keeps already-English diagnostics unchanged', () => {
  assert.equal(
    toEnglishText('Response body exceeds max_body_bytes (1024)'),
    'Response body exceeds max_body_bytes (1024)'
  );
});
