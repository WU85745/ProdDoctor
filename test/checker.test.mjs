import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { classifyResponse, runChecks } from '../src/checker.mjs';
import { extractStaticAssets } from '../src/assets.mjs';

function startServer(handler) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  return once(server, 'listening').then(() => server);
}

test('200 页面里仅出现 challenge-platform 字符串不应被误判为阻断', () => {
  const result = classifyResponse({
    status: 200,
    body: '<html>HELLO<script src="/cdn-cgi/challenge-platform/x"></script></html>',
    expected: 'HELLO'
  });
  assert.equal(result.ok, true);
  assert.equal(result.blockedByChallenge, false);
});

test('403 Cloudflare challenge 应被识别', () => {
  const result = classifyResponse({
    status: 403,
    body: '<title>Just a moment...</title><script src="/cdn-cgi/challenge-platform/x"></script>'
  });
  assert.equal(result.ok, false);
  assert.equal(result.blockedByChallenge, true);
});

test('关键字缺失应失败', () => {
  const result = classifyResponse({
    status: 200,
    body: '<h1>Wrong</h1>',
    expected: 'Expected'
  });
  assert.equal(result.ok, false);
  assert.equal(result.expectedOk, false);
});

test('不设置 expect 时，正常 200 页面应通过', () => {
  const result = classifyResponse({
    status: 200,
    body: '<h1>Any page</h1>',
    expected: ''
  });
  assert.equal(result.ok, true);
  assert.equal(result.expectedOk, true);
});

test('可精确要求最终 HTTP 状态码', () => {
  const ok = classifyResponse({
    status: 201,
    body: 'created',
    expectedStatus: 201
  });
  const bad = classifyResponse({
    status: 201,
    body: 'created',
    expectedStatus: 200
  });
  assert.equal(ok.ok, true);
  assert.equal(bad.ok, false);
  assert.equal(bad.statusOk, false);
});

test('只提取同源 script 和 stylesheet', () => {
  const assets = extractStaticAssets(
    `<html>
      <script src="/app.js"></script>
      <script src="https://cdn.example.net/third.js"></script>
      <link href="/style.css" rel="stylesheet">
      <img src="/image.png">
    </html>`,
    'https://example.com/page',
    20
  );

  assert.deepEqual(assets, [
    { kind: 'script', url: 'https://example.com/app.js' },
    { kind: 'style', url: 'https://example.com/style.css' }
  ]);
});

test('静态资源 URL 中的 HTML entity 会正确还原', () => {
  const assets = extractStaticAssets(
    '<script src="/app.js?v=1&amp;lang=zh"></script>',
    'https://example.com/',
    20
  );
  assert.equal(assets[0].url, 'https://example.com/app.js?v=1&lang=zh');
});
test('maxAssets 为 0 时不检查静态资源', () => {
  const assets = extractStaticAssets(
    '<script src="/app.js"></script>',
    'https://example.com/',
    0
  );
  assert.deepEqual(assets, []);
});

test('runChecks 拒绝非 HTTP/HTTPS 协议', async () => {
  await assert.rejects(
    () => runChecks('ftp://example.com'),
    /仅支持 http:\/\/ 或 https:\/\//
  );
});

test('可以检查本地页面、同源 JS/CSS 和辅助文件', async (t) => {
  const server = await startServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('Content-Type', 'text/plain');
      return res.end('User-agent: *\nAllow: /');
    }
    if (req.url === '/sitemap.xml') {
      res.setHeader('Content-Type', 'application/xml');
      return res.end('<?xml version="1.0"?><urlset></urlset>');
    }
    if (req.url === '/app.js') {
      res.setHeader('Content-Type', 'text/javascript');
      return res.end('console.log("ok")');
    }
    if (req.url === '/style.css') {
      res.setHeader('Content-Type', 'text/css');
      return res.end('body{}');
    }

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(`<html>
      <head><link rel="stylesheet" href="/style.css"></head>
      <body><h1>ProdDoctor test marker</h1><script src="/app.js"></script></body>
    </html>`);
  });

  t.after(() => server.close());
  const { port } = server.address();

  const result = await runChecks(`http://127.0.0.1:${port}`, {
    expected: 'ProdDoctor test marker',
    retries: 0,
    timeoutMs: 2000
  });

  assert.equal(result.ok, true);
  assert.equal(result.dns.ok, true);
  assert.equal(result.page.status, 200);
  assert.equal(result.auxiliary.robots.ok, true);
  assert.equal(result.auxiliary.sitemap.ok, true);
  assert.equal(result.tls.checked, false);
  assert.equal(result.assets.checked, true);
  assert.equal(result.assets.count, 2);
  assert.equal(result.assets.failedCount, 0);
  assert.equal(result.browser.checked, false);
  assert.equal(result.browser.ok, true);
});

test('同源 JS 404 会让生产检查失败', async (t) => {
  const server = await startServer((req, res) => {
    if (req.url === '/robots.txt' || req.url === '/sitemap.xml') {
      return res.end('ok');
    }
    if (req.url === '/missing.js') {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain');
      return res.end('missing');
    }

    res.setHeader('Content-Type', 'text/html');
    res.end('<html><body><script src="/missing.js"></script></body></html>');
  });

  t.after(() => server.close());
  const { port } = server.address();

  const result = await runChecks(`http://127.0.0.1:${port}`, {
    retries: 0,
    timeoutMs: 2000
  });

  assert.equal(result.ok, false);
  assert.equal(result.assets.failedCount, 1);
  assert.match(result.failures.join('\n'), /同源 JS\/CSS/);
});

test('JS 资源返回 HTML 会被识别为异常路由', async (t) => {
  const server = await startServer((req, res) => {
    if (req.url === '/robots.txt' || req.url === '/sitemap.xml') {
      return res.end('ok');
    }
    if (req.url === '/app.js') {
      res.setHeader('Content-Type', 'text/html');
      return res.end('<html>SPA fallback</html>');
    }

    res.setHeader('Content-Type', 'text/html');
    res.end('<html><body><script src="/app.js"></script></body></html>');
  });

  t.after(() => server.close());
  const { port } = server.address();

  const result = await runChecks(`http://127.0.0.1:${port}`, {
    retries: 0,
    timeoutMs: 2000
  });

  assert.equal(result.ok, false);
  assert.equal(result.assets.failed[0].htmlFallback, true);
});

test('expectedStatus 不匹配会失败', async (t) => {
  const server = await startServer((req, res) => {
    if (req.url === '/robots.txt' || req.url === '/sitemap.xml') {
      return res.end('ok');
    }
    res.statusCode = 201;
    res.setHeader('Content-Type', 'text/html');
    res.end('<h1>Created</h1>');
  });

  t.after(() => server.close());
  const { port } = server.address();

  const result = await runChecks(`http://127.0.0.1:${port}`, {
    expectedStatus: 200,
    checkAssets: false,
    retries: 0,
    timeoutMs: 2000
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /预期 200/);
});


test('请求无响应且配置 expect 时应优先报告请求失败', async () => {
  const server = await startServer((_req, res) => res.end('temporary'));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));

  const result = await runChecks(`http://127.0.0.1:${port}/unreachable`, {
    expected: 'NEVER_PRESENT',
    checkAssets: false,
    retries: 0,
    timeoutMs: 500
  });

  assert.equal(result.ok, false);
  assert.equal(result.page.status, null);
  assert.ok(result.page.error);
  assert.match(result.failures.join('\n'), /请求失败：/);
  assert.doesNotMatch(result.failures.join('\n'), /页面未包含指定关键字/);
});
