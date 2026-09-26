#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { runChecks } from '../src/checker.mjs';
import { localizeResult, normalizeLanguage, toChineseReport, toEnglishReport, toMarkdownSummary } from '../src/report.mjs';
import { toHtmlReport } from '../src/html-report.mjs';

const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
const CLI_BANNER = 'ProdDoctor v2.1.0';

function earlyLanguage(args) {
  const i = args.indexOf('--lang');
  if (i === -1) return 'en';
  return args[i + 1] === 'zh-CN' ? 'zh-CN' : 'en';
}

function usage(language = 'en') {
  if (normalizeLanguage(language) === 'zh-CN') {
    console.log(`${CLI_BANNER}

用法：
  proddoctor <URL> [选项]

基础检查：
  --expect <文本>              要求原始 HTML 包含指定文本
  --status <状态码>            要求最终 HTTP 状态精确匹配，例如 200
  --timeout <毫秒>             单次 HTTP 请求超时，默认 15000
  --max-body-bytes <字节>      响应正文大小上限，默认 0（保持兼容，不限大小）
  --retries <次数>             失败后的重试次数，默认 1
  --no-assets                  不检查同源 JS/CSS 静态资源
  --max-assets <数量>          最多检查的静态资源数量，默认 20
  --tls-warn-days <天>         TLS 证书进入该剩余天数时给出提示，默认 14

浏览器检查：
  --browser                    使用 Playwright + Chromium 执行真实浏览器检查
  --browser-expect <文本>      要求浏览器渲染后的可见文本包含指定内容
  --browser-timeout <毫秒>     浏览器导航超时，默认 30000
  --browser-settle <毫秒>      DOMContentLoaded 后额外等待时间，默认 750
  --browser-fail-console       Console error 也作为阻断问题
  --browser-profile <类型>     desktop 或 mobile，默认 desktop
  --browser-screenshot <路径>  保存整页截图
  --browser-trace <模式>       off / on-failure / always，默认 off
  --browser-trace-path <路径>  Trace ZIP 保存路径

输出：
  --lang <语言>                输出语言：en 或 zh-CN，默认 en
  --json                       输出 JSON
  --json-file <路径>           保存 JSON 报告
  --html-report <路径>         保存独立 HTML 报告
  --help                       显示帮助
  --version                    显示版本

示例：
  proddoctor https://example.com
  proddoctor https://example.com --lang zh-CN
  proddoctor https://example.com --expect "Example Domain" --status 200
  proddoctor https://example.com --browser --browser-expect "Example Domain"
  proddoctor https://example.com --html-report ./report.html --json-file ./report.json
`);
    return;
  }

  console.log(`${CLI_BANNER}

Usage:
  proddoctor <URL> [options]

Core checks:
  --expect <text>               Require raw HTML to contain text
  --status <code>               Require an exact final HTTP status, e.g. 200
  --timeout <ms>                Per-request timeout, default 15000
  --max-body-bytes <bytes>      Response-body limit, default 0 (unlimited for compatibility)
  --retries <count>             Retries after the first failed attempt, default 1
  --no-assets                   Skip same-origin JS/CSS checks
  --max-assets <count>          Maximum static assets to check, default 20
  --tls-warn-days <days>        Warn when TLS expires within this many days, default 14

Browser checks:
  --browser                     Run real Chromium validation with Playwright
  --browser-expect <text>       Require rendered visible text to contain a value
  --browser-timeout <ms>        Browser navigation timeout, default 30000
  --browser-settle <ms>         Extra wait after DOMContentLoaded, default 750
  --browser-fail-console        Treat console errors as blocking
  --browser-profile <type>      desktop or mobile, default desktop
  --browser-screenshot <path>   Save a full-page screenshot
  --browser-trace <mode>        off / on-failure / always, default off
  --browser-trace-path <path>   Save Playwright Trace ZIP

Output:
  --lang <language>             Output language: en or zh-CN, default en
  --json                        Print JSON
  --json-file <path>            Save JSON report
  --html-report <path>          Save standalone HTML report
  --help                        Show help
  --version                     Show version

Examples:
  proddoctor https://example.com
  proddoctor https://example.com --lang zh-CN
  proddoctor https://example.com --expect "Example Domain" --status 200
  proddoctor https://example.com --browser --browser-expect "Example Domain"
  proddoctor https://example.com --html-report ./report.html --json-file ./report.json
`);
}

const args = process.argv.slice(2);
const fallbackLanguage = earlyLanguage(args);

if (args.length === 1 && ['--version', '-V'].includes(args[0])) {
  console.log(pkg.version);
  process.exit(0);
}
if (!args.length || args.includes('--help') || args.includes('-h')) {
  usage(fallbackLanguage);
  process.exit(args.length ? 0 : 1);
}

const url = args[0];

function value(name, fallback = null, { allowEmpty = false } = {}) {
  const i = args.indexOf(name);
  if (i === -1) return fallback;

  const next = args[i + 1];
  if (next === undefined || next.startsWith('--')) {
    throw new Error(fallbackLanguage === 'zh-CN' ? `${name} 缺少值` : `${name} requires a value`);
  }
  if (!allowEmpty && next.length === 0) {
    throw new Error(fallbackLanguage === 'zh-CN' ? `${name} 不能为空` : `${name} cannot be empty`);
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
  if (url.startsWith('-')) throw new Error(fallbackLanguage === 'zh-CN' ? '请先提供 URL；--version 用于显示版本' : 'Provide a URL first; use --version to display the version');

  const seenFlags = new Set();
  for (let i = 1; i < args.length; i++) {
    const flag = args[i];
    if (!valueFlags.has(flag) && !booleanFlags.has(flag)) {
      throw new Error(fallbackLanguage === 'zh-CN' ? `未知参数：${flag}` : `Unknown option: ${flag}`);
    }
    if (seenFlags.has(flag)) {
      throw new Error(fallbackLanguage === 'zh-CN' ? `重复参数：${flag}` : `Duplicate option: ${flag}`);
    }
    seenFlags.add(flag);
    if (valueFlags.has(flag)) {
      value(flag, null, { allowEmpty: ['--expect', '--browser-expect'].includes(flag) });
      i++;
    }
  }

  const language = value('--lang', 'en');
  if (!['en', 'zh-CN'].includes(language)) {
    throw new Error(fallbackLanguage === 'zh-CN' ? '--lang 只支持 en 或 zh-CN' : '--lang supports only en or zh-CN');
  }

  const zh = language === 'zh-CN';
  const parsedUrl = new URL(url.includes('://') ? url : `https://${url}`);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(zh ? 'URL 仅支持 http:// 或 https://' : 'URL must use http:// or https://');
  }

  const timeoutMs = Number(value('--timeout', '15000'));
  const maxBodyBytes = Number(value('--max-body-bytes', '0'));
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 0) throw new Error(zh ? '--max-body-bytes 必须是非负安全整数' : '--max-body-bytes must be a non-negative safe integer');
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
    throw new Error(zh ? '--timeout 必须是 100 到 2147483647 的整数' : '--timeout must be an integer from 100 to 2147483647');
  }
  if (!Number.isInteger(retries) || retries < 0 || retries > 10) {
    throw new Error(zh ? '--retries 必须是 0 到 10 的整数' : '--retries must be an integer from 0 to 10');
  }
  if (!Number.isInteger(maxAssets) || maxAssets < 0 || maxAssets > 100) {
    throw new Error(zh ? '--max-assets 必须是 0 到 100 的整数' : '--max-assets must be an integer from 0 to 100');
  }
  if (!Number.isInteger(tlsWarnDays) || tlsWarnDays < 0 || tlsWarnDays > 3650) {
    throw new Error(zh ? '--tls-warn-days 必须是 0 到 3650 的整数' : '--tls-warn-days must be an integer from 0 to 3650');
  }
  if (expectedStatus !== null && (!Number.isInteger(expectedStatus) || expectedStatus < 100 || expectedStatus > 599)) {
    throw new Error(zh ? '--status 必须是 100 到 599 的整数' : '--status must be an integer from 100 to 599');
  }
  if (!Number.isInteger(browserTimeoutMs) || browserTimeoutMs < 1000 || browserTimeoutMs > 300000) {
    throw new Error(zh ? '--browser-timeout 必须是 1000 到 300000 的整数' : '--browser-timeout must be an integer from 1000 to 300000');
  }
  if (!Number.isInteger(browserSettleMs) || browserSettleMs < 0 || browserSettleMs > 60000) {
    throw new Error(zh ? '--browser-settle 必须是 0 到 60000 的整数' : '--browser-settle must be an integer from 0 to 60000');
  }
  if (!['desktop', 'mobile'].includes(browserProfile)) {
    throw new Error(zh ? '--browser-profile 只支持 desktop 或 mobile' : '--browser-profile supports only desktop or mobile');
  }
  if (!['off', 'on-failure', 'always'].includes(browserTraceMode)) {
    throw new Error(zh ? '--browser-trace 只支持 off、on-failure 或 always' : '--browser-trace supports only off, on-failure, or always');
  }
  if (browserTraceMode !== 'off' && !browserTracePath) {
    throw new Error(zh ? '启用 --browser-trace 时必须同时提供 --browser-trace-path' : '--browser-trace requires --browser-trace-path when enabled');
  }
  if (!browserEnabled && (
    browserRenderedExpect ||
    browserFailConsoleErrors ||
    browserScreenshotPath ||
    browserTraceMode !== 'off' ||
    browserTracePath ||
    browserProfile !== 'desktop'
  )) {
    throw new Error(zh ? '浏览器专用参数需要同时启用 --browser' : 'Browser-only options require --browser');
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

  const localizedJsonResult = localizeResult(result, language);

  const jsonFile = value('--json-file', process.env.PRODDOCTOR_JSON_FILE || null);
  if (jsonFile) {
    await writeTextFile(jsonFile, `${JSON.stringify(localizedJsonResult, null, 2)}\n`);
  }

  const htmlReport = value('--html-report', process.env.PRODDOCTOR_HTML_REPORT || null);
  if (htmlReport) {
    await writeTextFile(htmlReport, toHtmlReport(result, { reportPath: htmlReport, language }));
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${toMarkdownSummary(result, { language })}\n`, 'utf8');
  }

  if (args.includes('--json')) console.log(JSON.stringify(localizedJsonResult, null, 2));
  else console.log(language === 'zh-CN' ? toChineseReport(result) : toEnglishReport(result));

  if (!result.ok) process.exitCode = 1;
} catch (error) {
  const language = earlyLanguage(args);
  console.error(language === 'zh-CN'
    ? `ProdDoctor 启动失败：${error?.message || error}`
    : `ProdDoctor failed to start: ${error?.message || error}`);
  process.exitCode = 2;
}
