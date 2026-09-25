// Deterministic policy tests, not real Chromium tests (those run in browser-smoke).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runBrowserCheck } from '../src/browser.mjs';

for (const scenario of [
  {name: 'successful browser drops on-failure trace', mode: 'on-failure', retain: false, text: 'Ready', expect: 'Ready', keep: false},
  {name: 'upstream HTTP/TLS/assets failure retains trace', mode: 'on-failure', retain: true, text: 'Ready', expect: 'Ready', keep: true},
  {name: 'rendered text assertion failure retains trace', mode: 'on-failure', retain: false, text: 'Wrong', expect: 'Ready', keep: true},
  {name: 'always mode retains trace on success', mode: 'always', retain: false, text: 'Ready', expect: 'Ready', keep: true},
  {name: 'off mode never records trace', mode: 'off', retain: true, text: 'Ready', expect: 'Ready', keep: false},
  {name: 'navigation exception retains on-failure trace', mode: 'on-failure', retain: false, text: '', expect: '', keep: true, error: true}
]) {
  test(scenario.name, async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proddoctor-browser-policy-'));
    const original = process.env.PRODDOCTOR_PLAYWRIGHT_DIR;
    t.after(() => {
      if (original === undefined) delete process.env.PRODDOCTOR_PLAYWRIGHT_DIR;
      else process.env.PRODDOCTOR_PLAYWRIGHT_DIR = original;
      fs.rmSync(dir, {recursive: true, force: true});
    });
    const moduleDir = path.join(dir, 'node_modules/playwright');
    fs.mkdirSync(moduleDir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    fs.writeFileSync(path.join(moduleDir, 'index.js'), `
      const fs = require('node:fs');
      exports.chromium = { launch: async () => ({
        newContext: async () => ({
          tracing: { start: async () => {}, stop: async (opts) => {
            if (opts?.path) fs.writeFileSync(opts.path, 'mock trace');
          }},
          newPage: async () => ({
            on() {}, setDefaultTimeout() {}, setDefaultNavigationTimeout() {},
            goto: async () => { ${scenario.error ? "throw new Error('navigation failed')" : 'return {status: () => 200}'} },
            waitForTimeout: async () => {}, url: () => 'https://example.com/',
            title: async () => 'Test', locator: () => ({innerText: async () => ${JSON.stringify(scenario.text)}})
          }),
          close: async () => {}
        }),
        close: async () => {}
      })};
    `);
    process.env.PRODDOCTOR_PLAYWRIGHT_DIR = dir;
    const tracePath = path.join(dir, 'trace.zip');
    const result = await runBrowserCheck('https://example.com/', {
      traceMode: scenario.mode, tracePath, retainTrace: scenario.retain,
      renderedExpect: scenario.expect, settleMs: 0
    });
    assert.equal(Boolean(result.tracePath), scenario.keep);
    assert.equal(fs.existsSync(tracePath), scenario.keep);
    assert.equal(result.ok, !scenario.error && scenario.text.includes(scenario.expect));
  });
}
