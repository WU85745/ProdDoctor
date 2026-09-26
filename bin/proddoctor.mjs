#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { runChecks } from '../src/checker.mjs';
import { toChineseReport, toEnglishReport, toEnglishMarkdownSummary, toEnglishText, toMarkdownSummary } from '../src/report.mjs';
import { toHtmlReport } from '../src/html-report.mjs';

function usage(language = 'en') {
  if (language === 'zh-CN') {
    console.log(`ProdDoctor v1.4.1

用法：
  proddoctor <URL> [选项]

基础检查：
  --expect <文本>              要求原始 HTML 包含指定文本
  --status <状态码>            要求最终 HTTP 状态精确匹配，例如 200
  --timeout <毫秒>             单次 HTTP 请求超时，默认 15000
  --max-body-bytes <字节>      响应正文大小上限，默认 0
  --retries <次数>             失败后的重试次数，默认 1
  --no-assets                  不检查同源 JS/CSS 静态资源
  --max-assets <数量>          最多检查的静态资源数量，默认 20
  --tls-warn-days <天>         TLS 证书进入该剩余天数时给出提示，默认 14
  --lang <语言>                en 或 zh-CN，默认 en

浏览器检查：
  --browser                    使用 Playwright + Chromium
  --browser-expect <文本>      要求渲染后的可见文本包含指定内容
  --browser-timeout <毫秒>     浏览器导航超时，默认 30000
  --browser-settle <毫秒>      DOMContentLoaded 后额外等待，默认 750
  --browser-fail-console       Console error 也作为阻断问题
  --browser-profile <类型>     desktop 或 mobile
  --browser-screenshot <路径>  保存整页截图
  --browser-trace <模式>       off / on-failure / always
  --browser-trace-path <路径>  Trace ZIP 保存路径

输出：
  --json                       输出 JSON（语言无关）
  --json-file <路径>           保存 JSON 报告
  --html-report <路径>         保存本地化 HTML 报告
  --help                       显示帮助
  --version                    显示版本
`);
    return;
  }

  console.log(`ProdDoctor v1.4.1

Usage:
  proddoctor <URL> [options]

Core checks:
  --expect <text>              Require raw HTML to contain text
  --status <code>              Require an exact final HTTP status, e.g. 200
  --timeout <ms>               HTTP request timeout, default 15000
  --max-body-bytes <bytes>     Response body limit, default 0 (unlimited)
  --retries <count>            Retries after the first failed attempt, default 1
  --no-assets                  Skip same-origin JS/CSS checks
  --max-assets <count>         Maximum static assets to check, default 20
  --tls-warn-days <days>       Warn when TLS expiry is within this many days, default 14
  --lang <language>            en or zh-CN, default en

Browser checks:
  --browser                    Run Playwright + Chromium validation
  --browser-expect <text>      Require rendered visible text
  --browser-timeout <ms>       Browser navigation timeout, default 30000
  --browser-settle <ms>        Extra wait after DOMContentLoaded, default 750
  --browser-fail-console       Treat console errors as blocking
  --browser-profile <type>     desktop or mobile
  --browser-screenshot <path>  Save a full-page screenshot
  --browser-trace <mode>       off / on-failure / always
  --browser-trace-path <path>  Save Playwright Trace ZIP

Output:
  --json                       Print language-neutral JSON
  --json-file <path>           Save JSON report
  --html-report <path>         Save localized HTML report
  --help                       Show help
  --version                    Show version
`);
}
const args = process.argv.slice(2);
const langIndex = args.indexOf('--lang');
const language = langIndex === -1 ? (process.env.PRODDOCTOR_LANGUAGE || 'en') : args[langIndex + 1];
if (!['en', 'zh-CN'].includes(language)) {
  console.error('ProdDoctor startup failed: --lang must be en or zh-CN');
  process.exit(2);
}
if (args.length === 1 && ['--version', '-V'].includes(args[0])) {
  const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  console.log(pkg.version);
  process.exit(0);
}
if (!args.length || args.includes('--help') || args.includes('-h')) {
  usage(language);
  process.exit(args.length ? 0 : 1);
}

const url = args[0];

function value(name, fallback = null, { allowEmpty = false } = {}) {
  const i = args.indexOf(name);
  if (i === -1) return fallback;

  const next = args[i + 1];
  if (next === undefined || next.startsWith('--')) {
    throw new Error(`${name} 缺少值`);
  }
  if (!allowEmpty && next.length === 0) {
    throw new Error(`${name} 不能为空`);
  }
  return next;
}

async function writeTextFile(filePath, content) {
  const full = path.resolve(filePath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

try {
  const valueFlags = new Set([
    '--expect', '--status', '--timeout', '--max-body-bytes', '--retries', '--max-assets', '--tls-warn-days',
    '--browser-expect', '--browser-timeout', '--browser-settle', '--browser-profile',
    '--browser-screenshot', '--browser-trace', '--browser-trace-path', '--json-file', '--html-report', '--lang'
  ]);
  const booleanFlags = new Set(['--no-assets', '--browser', '--browser-fail-console', '--json']);
  if (url.startsWith('-')) throw new Error('请先提供 URL；--version 用于显示版本');
  const seenFlags = new Set();
  for (let i = 1; i < args.length; i++) {
    const flag = args[i];
    if (!valueFlags.has(flag) && !booleanFlags.has(flag)) throw new Error(`未知参数：${flag}`);
    if (seenFlags.has(flag)) throw new Error(`重复参数：${flag}`);
    seenFlags.add(flag);
    if (valueFlags.has(flag)) {
      value(flag, null, { allowEmpty: ['--expect', '--browser-expect'].includes(flag) });
      i++;
    }
  }
  const parsedUrl = new URL(url.includes('://') ? url : `https://${url}`);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('URL 仅支持 http:// 或 https://');
  }

  const timeoutMs = Number(value('--timeout', '15000'));
  const maxBodyBytes = Number(value('--max-body-bytes', '0'));
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 0) throw new Error('--max-body-bytes 必须是非负安全整数');
  const retries = Number(value('--retries', '1'));
  const maxAssets = Number(value('--max-assets', '20'));
  const tlsWarnDays = Number(value('--tls-warn-days', '14'));
  const rawStatus = value('--status', null);
  const expectedStatus = rawStatus === null ? null : Number(rawStatus);
  const expected = value('--expect', '', { allowEmpty: true });
  const checkAssets = !args.includes('--no-assets');

  const browserEnabled = args.includes('--browser');
  const browserRenderedExpect = value('--browser-expect', '', { allowEmpty: true });
  const browserTimeoutMs = Number(value('--browser-timeout', '30000'));
  const browserSettleMs = Number(value('--browser-settle', '750'));
  const browserFailConsoleErrors = args.includes('--browser-fail-console');
  const browserProfile = value('--browser-profile', 'desktop');
  const browserScreenshotPath = value('--browser-screenshot', null);
  const browserTraceMode = value('--browser-trace', 'off');
  const browserTracePath = value('--browser-trace-path', null);

  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 2147483647) {
    throw new Error('--timeout 必须是 100 到 2147483647 的整数');
  }
  if (!Number.isInteger(retries) || retries < 0 || retries > 10) {
    throw new Error('--retries 必须是 0 到 10 的整数');
  }
  if (!Number.isInteger(maxAssets) || maxAssets < 0 || maxAssets > 100) {
    throw new Error('--max-assets 必须是 0 到 100 的整数');
  }
  if (!Number.isInteger(tlsWarnDays) || tlsWarnDays < 0 || tlsWarnDays > 3650) {
    throw new Error('--tls-warn-days 必须是 0 到 3650 的整数');
  }
  if (expectedStatus !== null && (!Number.isInteger(expectedStatus) || expectedStatus < 100 || expectedStatus > 599)) {
    throw new Error('--status 必须是 100 到 599 的整数');
  }
  if (!Number.isInteger(browserTimeoutMs) || browserTimeoutMs < 1000 || browserTimeoutMs > 300000) {
    throw new Error('--browser-timeout 必须是 1000 到 300000 的整数');
  }
  if (!Number.isInteger(browserSettleMs) || browserSettleMs < 0 || browserSettleMs > 60000) {
    throw new Error('--browser-settle 必须是 0 到 60000 的整数');
  }
  if (!['desktop', 'mobile'].includes(browserProfile)) {
    throw new Error('--browser-profile 只支持 desktop 或 mobile');
  }
  if (!['off', 'on-failure', 'always'].includes(browserTraceMode)) {
    throw new Error('--browser-trace 只支持 off、on-failure 或 always');
  }
  if (browserTraceMode !== 'off' && !browserTracePath) {
    throw new Error('启用 --browser-trace 时必须同时提供 --browser-trace-path');
  }
  if (!browserEnabled && (
    browserRenderedExpect ||
    browserFailConsoleErrors ||
    browserScreenshotPath ||
    browserTraceMode !== 'off' ||
    browserTracePath ||
    browserProfile !== 'desktop'
  )) {
    throw new Error('浏览器专用参数需要同时启用 --browser');
  }

  const result = await runChecks(parsedUrl.href, {
    expected,
    expectedStatus,
    timeoutMs,
    maxBodyBytes,
    retries,
    checkAssets,
    maxAssets,
    tlsWarnDays,
    browserEnabled,
    browserRenderedExpect,
    browserTimeoutMs,
    browserSettleMs,
    browserFailConsoleErrors,
    browserProfile,
    browserScreenshotPath,
    browserTraceMode,
    browserTracePath
  });

  const jsonFile = value('--json-file', process.env.PRODDOCTOR_JSON_FILE || null);
  if (jsonFile) {
    await writeTextFile(jsonFile, `${JSON.stringify(result, null, 2)}\n`);
  }

  const htmlReport = value('--html-report', process.env.PRODDOCTOR_HTML_REPORT || null);
  if (htmlReport) {
    await writeTextFile(htmlReport, toHtmlReport(result, { reportPath: htmlReport, language }));
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    const summary = language === 'en' ? toEnglishMarkdownSummary(result) : toMarkdownSummary(result);
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`, 'utf8');
  }

  if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else console.log(language === 'en' ? toEnglishReport(result) : toChineseReport(result));

  if (!result.ok) process.exitCode = 1;
} catch (error) {
  const message = error?.message || error;
  console.error(language === 'en' ? `ProdDoctor startup failed: ${toEnglishText(message)}` : `ProdDoctor 启动失败：${message}`);
  process.exitCode = 2;
}
