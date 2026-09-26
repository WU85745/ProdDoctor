import test from 'node:test';
import assert from 'node:assert/strict';
import { toEnglishReport, toEnglishMarkdownSummary } from '../src/report-en.mjs';
import { toEnglishHtmlReport } from '../src/html-report-en.mjs';

const result = {
  version: '1.4.1',
  checkedAt: '2026-09-26T00:00:00.000Z',
  target: 'https://example.com/',
  ok: true,
  dns: { ok: true, addresses: [{ address: '93.184.216.34' }], elapsedMs: 4 },
  page: {
    ok: true, status: 200, expectedStatus: null, elapsedMs: 123, attempts: 1,
    finalUrl: 'https://example.com/', expected: 'Example', expectedOk: true,
    blockedByChallenge: false, challengeMatches: [], cfRay: null,
    security: { score: 60, present: ['HSTS'], missing: ['CSP'] }
  },
  tls: { checked: true, ok: true, authorized: true, authorizationError: null, daysRemaining: 90 },
  assets: { checked: true, ok: true, count: 2, failedCount: 0, failed: [], reason: null },
  browser: {
    checked: false, ok: true, profile: null, viewport: null, mainStatus: null, title: null,
    textLength: null, renderedExpect: null, renderedExpectOk: true, pageErrors: [],
    consoleErrors: [], criticalRequestFailures: [], criticalBadResponses: [],
    screenshotPath: null, tracePath: null
  },
  auxiliary: { robots: { ok: true, status: 200 }, sitemap: { ok: true, status: 200 } },
  failures: [],
  warnings: []
};

test('English terminal report uses English labels', () => {
  const output = toEnglishReport(result);
  assert.match(output, /ProdDoctor production check/);
  assert.match(output, /Result: ✅ PASS/);
  assert.match(output, /Security headers: 60\/100/);
});

test('English GitHub summary uses English table labels', () => {
  const output = toEnglishMarkdownSummary(result);
  assert.match(output, /Production page/);
  assert.match(output, /Expected content/);
});

test('English HTML report declares English and English headings', () => {
  const output = toEnglishHtmlReport(result);
  assert.match(output, /<html lang="en">/);
  assert.match(output, /<h2>Check results<\/h2>/);
  assert.match(output, /<h2>Blocking issues<\/h2>/);
});
