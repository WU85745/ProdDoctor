import test from 'node:test';
import assert from 'node:assert/strict';
import { localizeDiagnostic, toChineseReport, toEnglishReport, toMarkdownSummary } from '../src/report.mjs';
import { toHtmlReport } from '../src/html-report.mjs';

function sampleResult() {
  return {
    ok: false,
    version: '1.4.1',
    target: 'https://example.com/',
    checkedAt: '2026-09-26T00:00:00.000Z',
    dns: { ok: true, addresses: [{ address: '93.184.216.34' }], elapsedMs: 12 },
    page: {
      ok: false,
      status: 403,
      expectedStatus: null,
      expected: '',
      expectedOk: true,
      elapsedMs: 120,
      attempts: 1,
      finalUrl: 'https://example.com/',
      blockedByChallenge: true,
      challengeMatches: ['just a moment'],
      cfRay: null,
      security: { score: 60, present: ['X-Content-Type-Options'], missing: ['Content-Security-Policy'] }
    },
    tls: { checked: true, ok: true, authorized: true, authorizationError: null, daysRemaining: 30 },
    assets: { checked: true, ok: true, count: 2, failedCount: 0, failed: [], reason: null },
    browser: {
      checked: false,
      ok: true,
      mainStatus: null,
      title: '',
      profile: 'desktop',
      viewport: { width: 1440, height: 900 },
      textLength: 0,
      renderedExpect: '',
      renderedExpectOk: true,
      pageErrors: [],
      consoleErrors: [],
      criticalRequestFailures: [],
      criticalBadResponses: [],
      screenshotPath: null,
      tracePath: null
    },
    auxiliary: {
      robots: { ok: false, status: 404 },
      sitemap: { ok: true, status: 200 }
    },
    failures: ['疑似被 Cloudflare Challenge / WAF 阻断'],
    warnings: ['缺少常见安全响应头：Content-Security-Policy']
  };
}

test('English text report localizes built-in diagnostics', () => {
  const report = toEnglishReport(sampleResult());

  assert.match(report, /ProdDoctor production check/);
  assert.match(report, /Likely blocked by Cloudflare Challenge \/ WAF/);
  assert.match(report, /Missing common security headers/);
  assert.doesNotMatch(report, /阻断问题|缺少常见安全响应头/);
});

test('Chinese text report remains available', () => {
  const report = toChineseReport(sampleResult());

  assert.match(report, /ProdDoctor 生产环境体检/);
  assert.match(report, /疑似被 Cloudflare Challenge \/ WAF 阻断/);
  assert.match(report, /阻断问题/);
});

test('Markdown summary supports English and Chinese', () => {
  const english = toMarkdownSummary(sampleResult(), { language: 'en' });
  const chinese = toMarkdownSummary(sampleResult(), { language: 'zh-CN' });

  assert.match(english, /Production page/);
  assert.match(english, /Blocking issues/);
  assert.match(chinese, /生产页面/);
  assert.match(chinese, /阻断问题/);
});

test('HTML report defaults to English and can render Chinese', () => {
  const english = toHtmlReport(sampleResult(), { language: 'en' });
  const chinese = toHtmlReport(sampleResult(), { language: 'zh-CN' });

  assert.match(english, /<html lang="en">/);
  assert.match(english, /ProdDoctor Production Report/);
  assert.match(english, /Likely blocked by Cloudflare Challenge \/ WAF/);
  assert.match(chinese, /<html lang="zh-CN">/);
  assert.match(chinese, /ProdDoctor 生产报告/);
});

test('diagnostic localizer preserves unknown messages', () => {
  assert.equal(localizeDiagnostic('custom third-party warning', 'en'), 'custom third-party warning');
});
