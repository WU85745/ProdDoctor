import dns from 'node:dns/promises';
import { performance } from 'node:perf_hooks';
import { checkStaticAssets } from './assets.mjs';
import { inspectTls } from './tls.mjs';
import { runBrowserCheck, skippedBrowser } from './browser.mjs';

export const challengeMarkers = [
  'just a moment',
  '/cdn-cgi/challenge-platform',
  'cf-chl-',
  'enable javascript and cookies to continue',
  'attention required! | cloudflare'
];

export function classifyResponse({ status, body = '', expected = '', expectedStatus = null }) {
  const lower = String(body).toLowerCase();
  const challengeMatches = challengeMarkers.filter((marker) => lower.includes(marker));
  const blockedByChallenge = challengeMatches.length > 0 && [403, 429, 503].includes(status);
  const statusOk = expectedStatus === null
    ? status >= 200 && status < 400
    : status === expectedStatus;
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

  return {
    present,
    missing,
    score: Math.round((present.length / wanted.length) * 100)
  };
}

async function fetchOnce(url, {
  timeoutMs,
  maxBodyBytes = 0,
  expected = '',
  expectedStatus = null,
  method = 'GET'
} = {}) {
  const started = performance.now();

  try {
    const response = await fetch(url, {
      method,
      redirect: 'follow',
      headers: {
        'user-agent': 'ProdDoctor/1.4.1 (+https://github.com/lucaswenbo/ProdDoctor)',
        accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'cache-control': 'no-cache'
      },
      signal: AbortSignal.timeout(timeoutMs)
    });

    const body = method === 'HEAD' ? '' : await readBody(response, maxBodyBytes);
    const elapsedMs = Math.round(performance.now() - started);
    const verdict = classifyResponse({
      status: response.status,
      body,
      expected,
      expectedStatus
    });

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
      statusOk: verdict.statusOk,
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
      statusOk: false,
      blockedByChallenge: false,
      challengeMatches: [],
      error: error?.message || String(error),
      security: { present: [], missing: [], score: 0 },
      body: ''
    };
  }
}

async function readBody(response, maxBytes) {
  if (!maxBytes || !response.body) return response.text();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error(`Response body exceeds max_body_bytes (${maxBytes})`);
      }
      chunks.push(decoder.decode(value, {stream: true}));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } finally {
    reader.releaseLock();
  }
}

async function retryFetch(url, options) {
  const attempts = [];

  for (let i = 0; i <= options.retries; i += 1) {
    const result = await fetchOnce(url, options);
    attempts.push(result);

    if (result.ok) return { ...result, attempts: attempts.length };

    if (i < options.retries) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return { ...attempts.at(-1), attempts: attempts.length };
}

async function checkAuxiliary(origin, pathname, timeoutMs, maxBodyBytes) {
  const url = new URL(pathname, origin).href;
  const result = await fetchOnce(url, {
    timeoutMs,
    maxBodyBytes,
    expected: '',
    expectedStatus: null
  });

  return {
    url,
    ok: result.status === 200,
    status: result.status,
    elapsedMs: result.elapsedMs,
    error: result.error || null
  };
}

function skippedAssets(reason) {
  return {
    checked: false,
    reason,
    count: 0,
    ok: true,
    failedCount: 0,
    failed: [],
    results: []
  };
}

export async function runChecks(rawUrl, options = {}) {
  const target = new URL(rawUrl.includes('://') ? rawUrl : `https://${rawUrl}`);

  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Error('URL 仅支持 http:// 或 https://');
  }

  const timeoutMs = options.timeoutMs ?? 15000;
  // Opt in to bounded response reads without tightening existing default behavior.
  const maxBodyBytes = options.maxBodyBytes ?? 0;
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 0) {
    throw new Error('maxBodyBytes 必须是非负安全整数');
  }
  const retries = options.retries ?? 1;
  const expected = options.expected ?? '';
  const expectedStatus = options.expectedStatus ?? null;
  const checkAssets = options.checkAssets ?? true;
  const maxAssets = options.maxAssets ?? 20;
  const tlsWarnDays = options.tlsWarnDays ?? 14;
  const browserEnabled = options.browserEnabled ?? false;
  const browserTimeoutMs = options.browserTimeoutMs ?? 30000;
  const browserRenderedExpect = options.browserRenderedExpect ?? '';
  const browserFailConsoleErrors = options.browserFailConsoleErrors ?? false;
  const browserScreenshotPath = options.browserScreenshotPath ?? null;
  const browserSettleMs = options.browserSettleMs ?? 750;
  const browserProfile = options.browserProfile ?? 'desktop';
  const browserTraceMode = options.browserTraceMode ?? 'off';
  const browserTracePath = options.browserTracePath ?? null;

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

  const page = await retryFetch(target.href, {
    timeoutMs,
    maxBodyBytes,
    retries,
    expected,
    expectedStatus
  });

  const finalUrl = page.finalUrl || target.href;
  const finalOrigin = new URL(finalUrl).origin;

  const [robots, sitemap, tls] = await Promise.all([
    checkAuxiliary(finalOrigin, '/robots.txt', timeoutMs, maxBodyBytes),
    checkAuxiliary(finalOrigin, '/sitemap.xml', timeoutMs, maxBodyBytes),
    inspectTls(finalUrl, { timeoutMs, warnDays: tlsWarnDays })
  ]);

  let assets = skippedAssets('未启用静态资源检查');
  if (checkAssets) {
    const contentType = (page.contentType || '').toLowerCase();
    if (!page.body) {
      assets = skippedAssets('生产页面没有可分析的响应正文');
    } else if (contentType && !contentType.includes('html')) {
      assets = skippedAssets(`页面 Content-Type 不是 HTML：${page.contentType}`);
    } else {
      assets = await checkStaticAssets({
        html: page.body,
        pageUrl: finalUrl,
        timeoutMs,
        maxAssets
      });
    }
  }

  let browser = skippedBrowser();
  if (browserEnabled) {
    browser = await runBrowserCheck(finalUrl, {
      timeoutMs: browserTimeoutMs,
      renderedExpect: browserRenderedExpect,
      failConsoleErrors: browserFailConsoleErrors,
      screenshotPath: browserScreenshotPath,
      settleMs: browserSettleMs,
      profile: browserProfile,
      traceMode: browserTraceMode,
      tracePath: browserTracePath,
      retainTrace: !dnsResult.ok || !page.ok || !tls.ok || !assets.ok
    });
  }

  const warnings = [];
  for (const asset of assets.results) {
    if (asset.warning) warnings.push(asset.warning);
  }

  if (target.protocol !== 'https:') {
    warnings.push('入口 URL 不是 HTTPS。');
  }

  if (page.finalUrl && new URL(page.finalUrl).origin !== target.origin) {
    warnings.push(`最终跳转到了其他 Origin：${new URL(page.finalUrl).origin}`);
  }

  if (page.security.missing.length) {
    warnings.push(`缺少常见安全响应头：${page.security.missing.join('、')}`);
  }

  if (!robots.ok) warnings.push('未检测到可正常访问的 robots.txt。');
  if (!sitemap.ok) warnings.push('未检测到可正常访问的 sitemap.xml。');

  if (tls.warning) warnings.push(tls.warning);

  if (assets.checked && maxAssets > 0 && assets.count === maxAssets) {
    warnings.push(`静态资源检查达到上限 ${maxAssets} 个，页面可能还有更多资源未检查。`);
  }

  if (browser.checked) {
    for (const warning of browser.warnings) {
      warnings.push(`浏览器：${warning}`);
    }
  }

  const failures = [];

  if (!dnsResult.ok) failures.push('DNS 解析失败');

  if (!page.ok) {
    if (page.blockedByChallenge) {
      failures.push('疑似被 Cloudflare Challenge / WAF 阻断');
    } else if (page.status !== null && !page.statusOk) {
      failures.push(expectedStatus === null
        ? `HTTP 状态异常：${page.status}`
        : `HTTP 状态不符合预期：实际 ${page.status}，预期 ${expectedStatus}`
      );
    } else if (!page.expectedOk) {
      failures.push('页面未包含指定关键字');
    } else {
      failures.push(page.error ? `请求失败：${page.error}` : '生产页面检查失败');
    }
  }

  if (tls.checked && !tls.ok) {
    failures.push(tls.authorizationError
      ? `TLS 证书校验失败：${tls.authorizationError}`
      : 'TLS 证书检查失败'
    );
  }

  if (assets.checked && !assets.ok) {
    failures.push(`发现 ${assets.failedCount} 个不可用或返回异常内容的同源 JS/CSS 资源`);
  }

  if (browser.checked && !browser.ok) {
    if (browser.error) failures.push(`浏览器检查失败：${browser.error}`);
    for (const failure of browser.failures) {
      failures.push(`浏览器：${failure}`);
    }
  }

  return {
    tool: 'ProdDoctor',
    version: '1.4.1',
    checkedAt: new Date().toISOString(),
    target: target.href,
    hostname: target.hostname,
    dns: dnsResult,
    page: {
      ok: page.ok,
      status: page.status,
      statusText: page.statusText || null,
      statusOk: page.statusOk,
      expectedStatus,
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
    tls,
    assets,
    browser,
    auxiliary: { robots, sitemap },
    warnings,
    failures,
    ok: failures.length === 0
  };
}
