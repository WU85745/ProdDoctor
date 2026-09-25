#!/usr/bin/env node
import fs from 'node:fs/promises';
import { runChecks } from '../src/checker.mjs';
import { toChineseReport, toMarkdownSummary } from '../src/report.mjs';

function usage() {
  console.log(`ProdDoctor v0.1.0

用法：
  proddoctor <URL> [选项]

选项：
  --expect <文本>     要求页面包含指定文本
  --timeout <毫秒>   单次请求超时，默认 15000
  --retries <次数>   失败后的重试次数，默认 1
  --json              输出 JSON
  --json-file <路径>  额外保存 JSON 报告
  --help              显示帮助

示例：
  proddoctor https://example.com
  proddoctor https://example.com --expect "Example Domain" --retries 2
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
  const expected = value('--expect', '', { allowEmpty: true });

  if (!Number.isFinite(timeoutMs) || timeoutMs < 100) {
    throw new Error('--timeout 必须是 >= 100 的数字');
  }
  if (!Number.isInteger(retries) || retries < 0 || retries > 10) {
    throw new Error('--retries 必须是 0 到 10 的整数');
  }

  const result = await runChecks(parsedUrl.href, {
    expected,
    timeoutMs,
    retries
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
