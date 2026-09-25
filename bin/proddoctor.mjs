#!/usr/bin/env node
import fs from 'node:fs/promises';
import { runChecks } from '../src/checker.mjs';
import { toChineseReport, toMarkdownSummary } from '../src/report.mjs';

function usage() {
  console.log(`ProdDoctor v0.2.0

用法：
  proddoctor <URL> [选项]

选项：
  --expect <文本>          要求页面包含指定文本
  --status <状态码>        要求最终 HTTP 状态精确匹配，例如 200
  --timeout <毫秒>        单次请求超时，默认 15000
  --retries <次数>        失败后的重试次数，默认 1
  --no-assets             不检查同源 JS/CSS 静态资源
  --max-assets <数量>     最多检查的静态资源数量，默认 20
  --tls-warn-days <天>    TLS 证书进入该剩余天数时给出提示，默认 14
  --json                  输出 JSON
  --json-file <路径>      额外保存 JSON 报告
  --help                  显示帮助

示例：
  proddoctor https://example.com
  proddoctor https://example.com --expect "Example Domain"
  proddoctor https://example.com --status 200 --retries 2
  proddoctor https://example.com --no-assets
`);
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help') || args.includes('-h')) {
  usage();
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

try {
  const parsedUrl = new URL(url.includes('://') ? url : `https://${url}`);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('URL 仅支持 http:// 或 https://');
  }

  const timeoutMs = Number(value('--timeout', '15000'));
  const retries = Number(value('--retries', '1'));
  const maxAssets = Number(value('--max-assets', '20'));
  const tlsWarnDays = Number(value('--tls-warn-days', '14'));
  const rawStatus = value('--status', null);
  const expectedStatus = rawStatus === null ? null : Number(rawStatus);
  const expected = value('--expect', '', { allowEmpty: true });
  const checkAssets = !args.includes('--no-assets');

  if (!Number.isFinite(timeoutMs) || timeoutMs < 100) {
    throw new Error('--timeout 必须是 >= 100 的数字');
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

  const result = await runChecks(parsedUrl.href, {
    expected,
    expectedStatus,
    timeoutMs,
    retries,
    checkAssets,
    maxAssets,
    tlsWarnDays
  });

  const jsonFile = value('--json-file', process.env.PRODDOCTOR_JSON_FILE || null);
  if (jsonFile) {
    await fs.writeFile(jsonFile, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${toMarkdownSummary(result)}\n`, 'utf8');
  }

  if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else console.log(toChineseReport(result));

  if (!result.ok) process.exitCode = 1;
} catch (error) {
  console.error(`ProdDoctor 启动失败：${error?.message || error}`);
  process.exitCode = 2;
}
