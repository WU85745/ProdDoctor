import dns from 'node:dns/promises';
import { performance } from 'node:perf_hooks';

export const challengeMarkers = [
  'just a moment',
  '/cdn-cgi/challenge-platform',
  'cf-chl-',
  'enable javascript and cookies to continue',
  'attention required! | cloudflare'
];

export function classifyResponse({ status, body = '', expected = '' }) {
  const lower = String(body).toLowerCase();
  const challengeMatches = challengeMarkers.filter((marker) => lower.includes(marker));
  const blockedByChallenge = challengeMatches.length > 0 && [403, 429, 503].includes(status);
  const statusOk = status >= 200 && status < 400;
  const expectedOk = expected ? String(body).includes(expected) : true;
  return {
    ok: statusOk && expectedOk && !blockedByChallenge,
    statusOk,
    expectedOk,
    blockedByChallenge,
    challengeMatches
  };
}

function headerGrade(headers) {
  const present = [];
  const missing = [];
  const wanted = [
    ['strict-transport-security', 'HSTS'],
    ['content-security-policy', 'CSP'],
    ['x-content-type-options', 'X-Content-Type-Options'],
    ['referrer-policy', 'Referrer-Policy'],
    ['permissions-policy', 'Permissions-Policy']
  ];
  for (const [key, label] of wanted) {
    if (headers.get(key)) present.push(label);
    else missing.push(label);
  }
  return { present, missing, score: Math.round((present.length / wanted.length) * 100) };
}

async function fetchOnce(url, { timeoutMs, expected = '', method = 'GET' } = {}) {
  const started = performance.now();
  try {
    const response = await fetch(url, {
      method,
      redirect: 'follow',
      headers: {
        'user-agent': 'ProdDoctor/0.1 (+https://github.com/WU85745/ProdDoctor)',
        accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'cache-control': 'no-cache'
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
    const elapsedMs = Math.round(performance.now() - started);
    const body = method === 'HEAD' ? '' : await response.text();
    const verdict = classifyResponse({ status: response.status, body, expected });
    return {
      ok: verdict.ok,
      status: response.status,
      statusText: response.statusText,
      finalUrl: response.url,
      elapsedMs,
      contentType: response.headers.get('content-type'),
      server: response.headers.get('server'),
      cfRay: response.headers.get('cf-ray'),
      cacheStatus: response.headers.get('cf-cache-status'),
      expectedOk: verdict.expectedOk,
      blockedByChallenge: verdict.blockedByChallenge,
      challengeMatches: verdict.challengeMatches,
      security: headerGrade(response.headers),
      body
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      finalUrl: null,
      elapsedMs: Math.round(performance.now() - started),
      expectedOk: expected ? false : true,
      blockedByChallenge: false,
      challengeMatches: [],
      error: error?.message || String(error),
      security: { present: [], missing: [], score: 0 },
      body: ''
    };
  }
}

async function retryFetch(url, options) {
  const attempts = [];
  for (let i = 0; i <= options.retries; i += 1) {
    const result = await fetchOnce(url, options);
    attempts.push(result);
    if (result.ok) return { ...result, attempts: attempts.length };
    if (i < options.retries) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return { ...attempts.at(-1), attempts: attempts.length };
}

async function checkAuxiliary(origin, pathname, timeoutMs) {
  const url = new URL(pathname, origin).href;
  const result = await fetchOnce(url, { timeoutMs, expected: '' });
  return {
    url,
    ok: result.status === 200,
    status: result.status,
    elapsedMs: result.elapsedMs,
    error: result.error || null
  };
}

export async function runChecks(rawUrl, options = {}) {
  const target = new URL(rawUrl.includes('://') ? rawUrl : `https://${rawUrl}`);
  const timeoutMs = options.timeoutMs ?? 15000;
  const retries = options.retries ?? 1;
  const expected = options.expected ?? '';

  let dnsResult;
  const dnsStarted = performance.now();
  try {
    const addresses = await dns.lookup(target.hostname, { all: true });
    dnsResult = {
      ok: addresses.length > 0,
      addresses: addresses.map(({ address, family }) => ({ address, family })),
      elapsedMs: Math.round(performance.now() - dnsStarted)
    };
  } catch (error) {
    dnsResult = {
      ok: false,
      addresses: [],
      elapsedMs: Math.round(performance.now() - dnsStarted),
      error: error?.message || String(error)
    };
  }

  const page = await retryFetch(target.href, { timeoutMs, retries, expected });
  const origin = target.origin;
  const [robots, sitemap] = await Promise.all([
    checkAuxiliary(origin, '/robots.txt', timeoutMs),
    checkAuxiliary(origin, '/sitemap.xml', timeoutMs)
  ]);

  const warnings = [];
  if (target.protocol !== 'https:') warnings.push('目标不是 HTTPS。');
  if (page.finalUrl && new URL(page.finalUrl).origin !== target.origin) {
    warnings.push(`最终跳转到了其他 Origin：${new URL(page.finalUrl).origin}`);
  }
  if (page.security.missing.length) {
    warnings.push(`缺少常见安全响应头：${page.security.missing.join('、')}`);
  }
  if (!robots.ok) warnings.push('未检测到可正常访问的 robots.txt。');
  if (!sitemap.ok) warnings.push('未检测到可正常访问的 sitemap.xml。');

  const failures = [];
  if (!dnsResult.ok) failures.push('DNS 解析失败');
  if (!page.ok) {
    if (page.blockedByChallenge) failures.push('疑似被 Cloudflare Challenge / WAF 阻断');
    else if (page.status !== null && !(page.status >= 200 && page.status < 400)) failures.push(`HTTP 状态异常：${page.status}`);
    else if (!page.expectedOk) failures.push('页面未包含指定关键字');
    else failures.push(page.error ? `请求失败：${page.error}` : '生产页面检查失败');
  }

  return {
    tool: 'ProdDoctor',
    version: '0.1.0',
    checkedAt: new Date().toISOString(),
    target: target.href,
    hostname: target.hostname,
    dns: dnsResult,
    page: {
      ok: page.ok,
      status: page.status,
      statusText: page.statusText || null,
      finalUrl: page.finalUrl,
      elapsedMs: page.elapsedMs,
      attempts: page.attempts,
      contentType: page.contentType || null,
      server: page.server || null,
      cfRay: page.cfRay || null,
      cacheStatus: page.cacheStatus || null,
      expected: expected || null,
      expectedOk: page.expectedOk,
      blockedByChallenge: page.blockedByChallenge,
      challengeMatches: page.challengeMatches,
      security: page.security,
      error: page.error || null
    },
    auxiliary: { robots, sitemap },
    warnings,
    failures,
    ok: failures.length === 0
  };
}
