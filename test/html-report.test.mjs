import test from 'node:test';
import assert from 'node:assert/strict';
import { toHtmlReport } from '../src/html-report.mjs';

function sampleResult() {
  return {
    ok: false,
    version: '1.5.0',
    target: 'https://example.com/?q=<script>',
    checkedAt: '2026-09-25T00:00:00.000Z',
    dns: {
      ok: true,
      addresses: [{ address: '93.184.216.34', family: 4 }]
    },
    page: {
      ok: true,
      status: 200,
      elapsedMs: 120,
      blockedByChallenge: false
    },
    tls: {
      checked: true,
      ok: true,
      authorized: true,
      daysRemaining: 60
    },
    assets: {
      checked: true,
      ok: true,
      count: 2,
      failedCount: 0
    },
    browser: {
      checked: true,
      ok: false,
      profile: 'mobile',
      viewport: { width: 390, height: 844 },
      mainStatus: 200,
      screenshotPath: '/tmp/browser.png',
      tracePath: '/tmp/trace.zip',
      pageErrors: ['TypeError: bad <value>'],
      consoleErrors: [],
      criticalRequestFailures: [],
      criticalBadResponses: []
    },
    auxiliary: {
      robots: { ok: true, status: 200 },
      sitemap: { ok: false, status: 404 }
    },
    failures: ['浏览器：页面运行时出现异常'],
    warnings: ['未检测到 sitemap.xml']
  };
}

test('HTML report 包含关键证据链接和浏览器 profile', () => {
  const html = toHtmlReport(sampleResult(), { reportPath: '/tmp/reports/report.html', language: 'en' });

  assert.match(html, /ProdDoctor Production Report/);
  assert.match(html, /mobile/);
  assert.match(html, /390×844/);
  assert.match(html, /\.\.\/browser\.png/);
  assert.match(html, /\.\.\/trace\.zip/);
});

test('HTML report 会转义来自目标站点和错误信息的 HTML', () => {
  const html = toHtmlReport(sampleResult());

  assert.equal(html.includes('<script>'), false);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /bad &lt;value&gt;/);
});
