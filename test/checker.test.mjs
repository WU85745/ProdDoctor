import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { classifyResponse, runChecks } from '../src/checker.mjs';

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

test('runChecks 拒绝非 HTTP/HTTPS 协议', async () => {
  await assert.rejects(
    () => runChecks('ftp://example.com'),
    /仅支持 http:\/\/ 或 https:\/\//
  );
});

test('可以检查本地真实 HTTP 服务', async (t) => {
  const server = http.createServer((req, res) => {
    if (req.url === '/robots.txt') return res.end('User-agent: *\nAllow: /');
    if (req.url === '/sitemap.xml') return res.end('<?xml version="1.0"?><urlset></urlset>');
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end('<h1>ProdDoctor test marker</h1>');
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
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
});
