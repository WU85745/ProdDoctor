import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { spawnSync, spawn } from 'node:child_process';
import { extractStaticAssets } from '../src/assets.mjs';
import { runChecks } from '../src/checker.mjs';
import { readFileSync } from 'node:fs';

const cli = new URL('../bin/proddoctor.mjs', import.meta.url).pathname;
test('CLI --version matches package.json without network', () => {
  const result = spawnSync(process.execPath, [cli, '--version'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version);
});

for (const args of [
  ['https://example.com', '--statuz', '200'],
  ['https://example.com', '--status'],
  ['https://example.com', '--status', '200', '--status', '404'],
  ['https://example.com', '--timeout', '100.5'],
  ['https://example.com', '--json-file'],
  ['https://example.com', '--max-body-bytes', '-1'],
  ['--bad-option']
]) {
  test('CLI rejects invalid arguments before requests: ' + args.join(' '), () => {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.equal(result.stdout, '');
  });
}

test('asset parser handles quoted/unquoted attributes without data-src false positives', () => {
  const assets = extractStaticAssets(
    '<script data-src="/lazy.js" src=/app.js></script><link rel=stylesheet href=/app.css>',
    'https://example.com/'
  );
  assert.deepEqual(assets.map(x => x.url), ['https://example.com/app.js', 'https://example.com/app.css']);
  assert.deepEqual(extractStaticAssets('<script data-src="/lazy.js"></script>', 'https://example.com'), []);
});

test('optional response body limit fails clearly, unlimited default remains compatible', async t => {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end('<p>' + 'x'.repeat(4096) + '</p>');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const url = 'http://127.0.0.1:' + server.address().port;
  const limited = await runChecks(url, {retries: 0, maxBodyBytes: 100});
  assert.equal(limited.ok, false);
  assert.match(limited.page.error, /exceeds max_body_bytes/);
  const legacy = await runChecks(url, {retries: 0});
  assert.equal(legacy.ok, true);
});

test('asset parser honors base href, ignores comments and decodes numeric entities', () => {
  const assets = extractStaticAssets(
    '<base href="/static/"><!-- <script src="/missing.js"></script> --><script src="app.js?a=1&#38;b=2"></script>',
    'https://example.com/page'
  );
  assert.deepEqual(assets, [{kind: 'script', url: 'https://example.com/static/app.js?a=1&b=2'}]);
  assert.deepEqual(extractStaticAssets('<base href="https://cdn.example.com/"><script src=app.js></script>', 'https://example.com'), []);
});

test('unexpected MIME is visible but does not introduce a breaking default failure', async t => {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/app.js' ? 'image/png' : 'text/html');
    res.end(req.url === '/app.js' ? 'not JavaScript' : '<script src=/app.js></script>');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const url = 'http://127.0.0.1:' + server.address().port;
  const result = await runChecks(url, { retries: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.assets.count, 1);
  assert.match(result.warnings.join('\n'), /Unexpected script Content-Type: image\/png/);

  // Actual CLI happy path, including the optional empty expect value.
  const child = spawn(process.execPath, [cli, url, '--expect', '', '--status', '200', '--json']);
  let output = '';
  child.stdout.on('data', chunk => output += chunk);
  const [code] = await once(child, 'close');
  assert.equal(code, 0);
  assert.equal(JSON.parse(output).ok, true);
});
