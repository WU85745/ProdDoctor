import test from 'node:test';
import assert from 'node:assert/strict';
import { likelyCause, localizeDiagnostic, localizeResult, toChineseReport, toEnglishReport, toMarkdownSummary } from '../src/report.mjs';
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

test('Markdown summary defaults to English and still supports Chinese', () => {
  const english = toMarkdownSummary(sampleResult());
  const chinese = toMarkdownSummary(sampleResult(), { language: 'zh-CN' });

  assert.match(english, /Production page/);
  assert.match(english, /Blocking issues/);
  assert.doesNotMatch(english, /生产页面|阻断问题/);
  assert.match(chinese, /生产页面/);
  assert.match(chinese, /阻断问题/);
});

test('HTML report defaults to English and can render Chinese', () => {
  const english = toHtmlReport(sampleResult());
  const chinese = toHtmlReport(sampleResult(), { language: 'zh-CN' });

  assert.match(english, /<html lang="en">/);
  assert.match(english, /ProdDoctor Production Report/);
  assert.match(english, /Likely blocked by Cloudflare Challenge \/ WAF/);
  assert.match(chinese, /<html lang="zh-CN">/);
  assert.match(chinese, /ProdDoctor 生产报告/);
});

test('English text report uses English punctuation for its own labels', () => {
  const report = toEnglishReport(sampleResult());

  assert.match(report, /Target: https:\/\/example\.com\//);
  assert.match(report, /Result: ❌ FAIL/);
  assert.doesNotMatch(report, /Target：|Result：|Page：|，|；/);
});

test('diagnostic localizer covers browser fallback and skipped asset reasons', () => {
  assert.equal(localizeDiagnostic('浏览器：浏览器检查无法完成', 'en'), 'Browser: Browser check could not complete');
  assert.equal(localizeDiagnostic('生产页面没有可分析的响应正文', 'en'), 'Production page has no response body to analyze');
  assert.equal(localizeDiagnostic('页面 Content-Type 不是 HTML：application/json', 'en'), 'Page Content-Type is not HTML: application/json');
});

test('JSON diagnostics default to English when localized', () => {
  const localized = localizeResult(sampleResult());

  assert.deepEqual(localized.failures, ['Likely blocked by Cloudflare Challenge / WAF']);
  assert.deepEqual(localized.warnings, ['Missing common security headers: Content-Security-Policy']);
});

test('Chinese JSON diagnostics remain unchanged when requested', () => {
  const original = sampleResult();
  const localized = localizeResult(original, 'zh-CN');

  assert.equal(localized, original);
});

test('diagnostic localizer preserves unknown messages', () => {
  assert.equal(localizeDiagnostic('custom third-party warning', 'en'), 'custom third-party warning');
});


test('failure reports include one human-readable likely cause without claiming build status', () => {
  const result = sampleResult();
  const english = toEnglishReport(result);
  const chinese = toChineseReport(result);
  const markdown = toMarkdownSummary(result);
  const html = toHtmlReport(result);

  assert.equal(likelyCause(result), 'Cloudflare Challenge / WAF is blocking the real production request.');
  assert.equal(likelyCause(result, 'zh-CN'), 'Cloudflare Challenge / WAF 正在阻断真实生产请求。');
  assert.match(english, /Likely cause: Cloudflare Challenge \/ WAF is blocking the real production request\./);
  assert.match(chinese, /可能原因：Cloudflare Challenge \/ WAF 正在阻断真实生产请求。/);
  assert.match(markdown, /\*\*Likely cause:\*\* Cloudflare Challenge \/ WAF is blocking the real production request\./);
  assert.match(html, /<p>Likely cause: Cloudflare Challenge \/ WAF is blocking the real production request\.<\/p>/);
  assert.doesNotMatch(english, /build (passed|failed|healthy)/i);
});

test('successful reports do not invent a likely cause', () => {
  const result = sampleResult();
  result.ok = true;
  result.page.ok = true;
  result.page.blockedByChallenge = false;
  result.failures = [];

  assert.equal(likelyCause(result), null);
  assert.doesNotMatch(toEnglishReport(result), /Likely cause:/);
});


test('request errors take priority over expected-content mismatch in likely cause', () => {
  const result = sampleResult();
  result.page.blockedByChallenge = false;
  result.page.status = null;
  result.page.statusOk = false;
  result.page.expected = 'NEVER_PRESENT';
  result.page.expectedOk = false;
  result.page.error = 'fetch failed';
  result.failures = ['请求失败：fetch failed'];

  assert.equal(likelyCause(result), 'The production request failed before a valid response was received.');
  assert.equal(likelyCause(result, 'zh-CN'), '生产请求在获得有效响应前失败。');
  assert.doesNotMatch(toEnglishReport(result), /content did not match/i);
});
