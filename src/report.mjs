const icon = (ok) => ok ? '✅' : '❌';

export function normalizeLanguage(value = 'en') {
  return value === 'zh-CN' ? 'zh-CN' : 'en';
}

function translateBrowserDiagnostic(text) {
  const rules = [
    [/^浏览器导航没有收到主文档响应$/, 'Browser navigation did not receive a main-document response'],
    [/^浏览器主文档返回 HTTP (\d+)$/, 'Browser main document returned HTTP $1'],
    [/^页面运行时出现 (\d+) 个未捕获 JavaScript 异常$/, 'The page raised $1 uncaught JavaScript error(s) at runtime'],
    [/^浏览器中有 (\d+) 个关键同源请求失败$/, 'The browser saw $1 critical same-origin request failure(s)'],
    [/^浏览器中有 (\d+) 个关键同源资源返回 4xx\/5xx$/, 'The browser saw $1 critical same-origin resource(s) return 4xx/5xx'],
    [/^浏览器渲染后的页面未包含指定文本$/, 'Rendered browser text did not contain the expected value'],
    [/^浏览器 Console 出现 (\d+) 条 error$/, 'Browser console reported $1 error(s)'],
    [/^浏览器 Console 出现 (\d+) 条 error（当前仅提示）$/, 'Browser console reported $1 error(s) (warning only)'],
    [/^页面渲染后 body 可见文本为空$/, 'Visible body text is empty after rendering'],
    [/^截图保存失败：(.*)$/, 'Failed to save screenshot: $1'],
    [/^Trace 保存失败：(.*)$/, 'Failed to save trace: $1'],
    [/^浏览器检查无法完成$/, 'Browser check could not complete']
  ];
  for (const [pattern, replacement] of rules) {
    if (pattern.test(text)) return text.replace(pattern, replacement);
  }
  return text;
}

export function localizeDiagnostic(text, language = 'en') {
  const lang = normalizeLanguage(language);
  const value = String(text ?? '');
  if (lang === 'zh-CN' || !value) return value;

  if (value.startsWith('浏览器：')) {
    return `Browser: ${translateBrowserDiagnostic(value.slice('浏览器：'.length))}`;
  }

  const rules = [
    [/^入口 URL 不是 HTTPS。$/, 'Entry URL is not HTTPS.'],
    [/^最终跳转到了其他 Origin：(.*)$/, 'Final redirect moved to another origin: $1'],
    [/^缺少常见安全响应头：(.*)$/, 'Missing common security headers: $1'],
    [/^未检测到可正常访问的 robots\.txt。$/, 'No accessible robots.txt was detected.'],
    [/^未检测到可正常访问的 sitemap\.xml。$/, 'No accessible sitemap.xml was detected.'],
    [/^TLS 证书将在 (\d+) 天内到期$/, 'TLS certificate expires within $1 day(s)'],
    [/^静态资源检查达到上限 (\d+) 个，页面可能还有更多资源未检查。$/, 'Static-asset check reached the limit of $1; additional assets may remain unchecked.'],
    [/^DNS 解析失败$/, 'DNS resolution failed'],
    [/^疑似被 Cloudflare Challenge \/ WAF 阻断$/, 'Likely blocked by Cloudflare Challenge / WAF'],
    [/^HTTP 状态异常：(\d+)$/, 'Unexpected HTTP status: $1'],
    [/^HTTP 状态不符合预期：实际 (\d+)，预期 (\d+)$/, 'HTTP status mismatch: got $1, expected $2'],
    [/^页面未包含指定关键字$/, 'Page did not contain the expected text'],
    [/^请求失败：(.*)$/, 'Request failed: $1'],
    [/^生产页面检查失败$/, 'Production page check failed'],
    [/^TLS 证书校验失败：(.*)$/, 'TLS certificate validation failed: $1'],
    [/^TLS 证书检查失败$/, 'TLS certificate check failed'],
    [/^发现 (\d+) 个不可用或返回异常内容的同源 JS\/CSS 资源$/, 'Found $1 unavailable or invalid same-origin JS/CSS asset(s)'],
    [/^浏览器检查失败：(.*)$/, 'Browser check failed: $1'],
    [/^浏览器检查无法完成$/, 'Browser check could not complete'],
    [/^未启用静态资源检查$/, 'Static asset checks disabled'],
    [/^生产页面没有可分析的响应正文$/, 'Production page has no response body to analyze'],
    [/^页面 Content-Type 不是 HTML：(.*)$/, 'Page Content-Type is not HTML: $1'],
    [/^未启用浏览器检查$/, 'Browser checks disabled']
  ];
  for (const [pattern, replacement] of rules) {
    if (pattern.test(value)) return value.replace(pattern, replacement);
  }

  return translateBrowserDiagnostic(value);
}

export function localizeResult(result, language = 'en') {
  const lang = normalizeLanguage(language);
  if (lang === 'zh-CN') return result;

  const localizeList = (items = []) => items.map((item) => localizeDiagnostic(item, lang));

  return {
    ...result,
    failures: localizeList(result.failures),
    warnings: localizeList(result.warnings),
    tls: {
      ...result.tls,
      warning: result.tls?.warning ? localizeDiagnostic(result.tls.warning, lang) : result.tls?.warning
    },
    assets: {
      ...result.assets,
      reason: result.assets?.reason ? localizeDiagnostic(result.assets.reason, lang) : result.assets?.reason
    },
    browser: {
      ...result.browser,
      reason: result.browser?.reason ? localizeDiagnostic(result.browser.reason, lang) : result.browser?.reason,
      failures: localizeList(result.browser?.failures),
      warnings: localizeList(result.browser?.warnings)
    }
  };
}

export function likelyCause(result, language = 'en') {
  if (!result || result.ok) return null;

  const zh = normalizeLanguage(language) === 'zh-CN';
  const page = result.page || {};

  if (page.blockedByChallenge) {
    return zh
      ? 'Cloudflare Challenge / WAF 正在阻断真实生产请求。'
      : 'Cloudflare Challenge / WAF is blocking the real production request.';
  }

  if (!result.dns?.ok && page.status == null) {
    return zh
      ? 'DNS 解析失败，ProdDoctor 无法正常到达生产域名。'
      : 'DNS resolution failed, so ProdDoctor could not reach the production hostname normally.';
  }

  if (result.tls?.checked && !result.tls.ok) {
    return zh
      ? 'TLS 证书校验失败，HTTPS 连接无法被正常验证。'
      : 'TLS certificate validation failed, so the HTTPS connection could not be verified.';
  }

  if (!page.ok && page.status != null && page.statusOk === false) {
    if (page.expectedStatus != null) {
      return zh
        ? `生产端点返回 HTTP ${page.status}，而预期是 ${page.expectedStatus}。`
        : `The production endpoint returned HTTP ${page.status}, but ${page.expectedStatus} was expected.`;
    }
    return zh
      ? `生产端点返回了异常的 HTTP ${page.status}。`
      : `The production endpoint returned an unexpected HTTP ${page.status}.`;
  }

  if (!page.ok && page.expected && !page.expectedOk) {
    return zh
      ? '生产页面可以响应，但返回的内容不是预期版本或页面。'
      : 'The production page responded, but its content did not match the expected page or version.';
  }

  if (!page.ok && page.error) {
    return zh
      ? '生产请求在获得有效响应前失败。'
      : 'The production request failed before a valid response was received.';
  }

  if (result.assets?.checked && !result.assets.ok) {
    return zh
      ? '生产页面已返回，但至少一个关键同源 JS/CSS 资源不可用或内容异常。'
      : 'The production page responded, but at least one critical same-origin JS/CSS asset is unavailable or invalid.';
  }

  if (result.browser?.checked && !result.browser.ok) {
    return zh
      ? '服务器响应已到达浏览器，但真实 Chromium 运行时检查失败。'
      : 'The server response reached the browser, but the real Chromium runtime check failed.';
  }

  if (!result.dns?.ok) {
    return zh
      ? 'ProdDoctor 的 DNS 检查失败。'
      : 'ProdDoctor\'s DNS check failed.';
  }

  return null;
}

function shortAsset(asset, language) {
  const lang = normalizeLanguage(language);
  const suffix = asset.htmlFallback
    ? (lang === 'zh-CN' ? '（返回了 HTML，可能是错误路由或 SPA fallback）' : ' (returned HTML; possible bad route or SPA fallback)')
    : '';
  const noResponse = lang === 'zh-CN' ? '无响应' : 'no response';
  return `${asset.kind} ${asset.status ?? noResponse} ${asset.url}${suffix}`;
}

function browserIssueLine(item, language) {
  const lang = normalizeLanguage(language);
  if ('status' in item) {
    return `${item.resourceType || 'resource'} HTTP ${item.status} ${item.url}`;
  }
  const failed = lang === 'zh-CN' ? '请求失败' : 'request failed';
  return `${item.resourceType || 'resource'} ${item.errorText || failed} ${item.url}`;
}

function toTextReport(result, language) {
  const lang = normalizeLanguage(language);
  const zh = lang === 'zh-CN';
  const colon = zh ? '：' : ': ';
  const comma = zh ? '，' : ', ';
  const semicolon = zh ? '；' : '; ';
  const quote = (value) => zh ? `“${value}”` : `"${value}"`;
  const lines = [];

  lines.push('');
  lines.push(zh ? '🩺 ProdDoctor 生产环境体检' : '🩺 ProdDoctor production check');
  lines.push(`${zh ? '目标' : 'Target'}${colon}${result.target}`);
  lines.push(`${zh ? '结果' : 'Result'}${colon}${result.ok ? (zh ? '✅ 通过' : '✅ PASS') : (zh ? '❌ 未通过' : '❌ FAIL')}`);
  const cause = likelyCause(result, lang);
  if (cause) lines.push(`${zh ? '可能原因' : 'Likely cause'}${colon}${cause}`);
  lines.push('');

  const dnsFail = zh ? '失败' : 'failed';
  lines.push(`${icon(result.dns.ok)} DNS${colon}${result.dns.ok ? result.dns.addresses.map(x => x.address).join(', ') : result.dns.error || dnsFail} (${result.dns.elapsedMs}ms)`);

  const statusExpectation = result.page.expectedStatus === null
    ? ''
    : (zh ? `，预期 ${result.page.expectedStatus}` : `, expected ${result.page.expectedStatus}`);
  const noResponse = zh ? '无响应' : 'no response';
  const pageAttempts = zh ? `尝试 ${result.page.attempts} 次` : `${result.page.attempts} attempt(s)`;
  lines.push(`${icon(result.page.ok)} ${zh ? '页面' : 'Page'}${colon}${result.page.status ?? noResponse}${statusExpectation}${comma}${result.page.elapsedMs}ms${comma}${pageAttempts}`);

  if (result.page.finalUrl) lines.push(`   ${zh ? '最终地址' : 'Final URL'}${colon}${result.page.finalUrl}`);

  if (result.page.expected) {
    lines.push(`${icon(result.page.expectedOk)} ${zh ? '页面内容' : 'Page content'}${colon}${result.page.expectedOk ? (zh ? '已找到' : 'found') : (zh ? '未找到' : 'not found')} ${quote(result.page.expected)}`);
  }

  if (result.page.blockedByChallenge) {
    lines.push(`❌ Cloudflare${colon}${zh ? '疑似 Challenge / WAF 阻断' : 'likely Challenge / WAF block'} (${result.page.challengeMatches.join(', ')})`);
  } else if (result.page.cfRay) {
    lines.push(`✅ Cloudflare${colon}${zh ? '检测到 CF-Ray' : 'CF-Ray detected'} ${result.page.cfRay}`);
  }

  if (result.tls.checked) {
    const days = result.tls.daysRemaining === null
      ? ''
      : (zh ? `，剩余约 ${result.tls.daysRemaining} 天` : `, about ${result.tls.daysRemaining} day(s) remaining`);
    lines.push(`${icon(result.tls.ok)} TLS${colon}${result.tls.authorized ? (zh ? '证书链校验通过' : 'certificate chain valid') : result.tls.authorizationError || (zh ? '校验失败' : 'validation failed')}${days}`);
  } else {
    lines.push(zh ? '➖ TLS：未检查（目标不是 HTTPS）' : '➖ TLS: not checked (target is not HTTPS)');
  }

  if (result.assets.checked) {
    lines.push(`${icon(result.assets.ok)} ${zh ? '静态资源' : 'Static assets'}${colon}${zh ? `检查 ${result.assets.count} 个同源 JS/CSS，失败 ${result.assets.failedCount} 个` : `checked ${result.assets.count} same-origin JS/CSS asset(s), ${result.assets.failedCount} failed`}`);
    for (const asset of result.assets.failed.slice(0, 5)) {
      lines.push(`   - ${shortAsset(asset, lang)}`);
    }
    if (result.assets.failed.length > 5) {
      lines.push(zh
        ? `   - 还有 ${result.assets.failed.length - 5} 个失败资源未在终端展开`
        : `   - ${result.assets.failed.length - 5} more failed asset(s) omitted from terminal output`);
    }
  } else {
    const reason = localizeDiagnostic(result.assets.reason || (zh ? '未启用静态资源检查' : 'Static asset checks disabled'), lang);
    lines.push(`➖ ${zh ? '静态资源' : 'Static assets'}${colon}${zh ? '未检查' : 'not checked'} (${reason})`);
  }

  if (result.browser.checked) {
    lines.push(`${icon(result.browser.ok)} ${zh ? '浏览器' : 'Browser'}${colon}${result.browser.mainStatus ?? noResponse} · ${result.browser.title || (zh ? '无标题' : 'untitled')} · ${result.browser.profile || 'desktop'} ${result.browser.viewport?.width ?? '?'}×${result.browser.viewport?.height ?? '?'}`);
    lines.push(`   ${zh ? '可见文本' : 'Visible text'}${colon}${result.browser.textLength ?? 0} ${zh ? '字符' : 'characters'}`);
    if (result.browser.renderedExpect) {
      lines.push(`   ${zh ? '渲染文本' : 'Rendered text'}${colon}${result.browser.renderedExpectOk ? (zh ? '✅ 已找到' : '✅ found') : (zh ? '❌ 未找到' : '❌ not found')} ${quote(result.browser.renderedExpect)}`);
    }
    lines.push(`   ${zh ? 'JS 未捕获异常' : 'Uncaught JS errors'}${colon}${result.browser.pageErrors.length}${semicolon}Console errors${colon}${result.browser.consoleErrors.length}`);
    lines.push(`   ${zh ? '关键同源请求失败' : 'Critical same-origin request failures'}${colon}${result.browser.criticalRequestFailures.length}${semicolon}${zh ? '关键同源 4xx/5xx' : 'Critical same-origin 4xx/5xx'}${colon}${result.browser.criticalBadResponses.length}`);

    for (const item of result.browser.criticalRequestFailures.slice(0, 3)) lines.push(`   - ${browserIssueLine(item, lang)}`);
    for (const item of result.browser.criticalBadResponses.slice(0, 3)) lines.push(`   - ${browserIssueLine(item, lang)}`);
    for (const message of result.browser.pageErrors.slice(0, 3)) lines.push(`   - pageerror: ${message}`);
    if (result.browser.screenshotPath) lines.push(`   ${zh ? '截图' : 'Screenshot'}${colon}${result.browser.screenshotPath}`);
    if (result.browser.tracePath) lines.push(`   Trace${colon}${result.browser.tracePath}`);
  } else {
    lines.push(zh ? '➖ 浏览器：未启用' : '➖ Browser: disabled');
  }

  lines.push(`${result.auxiliary.robots.ok ? '✅' : '⚠️'} robots.txt${colon}HTTP ${result.auxiliary.robots.status ?? noResponse}`);
  lines.push(`${result.auxiliary.sitemap.ok ? '✅' : '⚠️'} sitemap.xml${colon}HTTP ${result.auxiliary.sitemap.status ?? noResponse}`);

  lines.push(`🛡️ ${zh ? '安全响应头' : 'Security headers'}${colon}${result.page.security.score}/100`);
  if (result.page.security.present.length) lines.push(`   ${zh ? '已有' : 'Present'}${colon}${result.page.security.present.join(zh ? '、' : ', ')}`);
  if (result.page.security.missing.length) lines.push(`   ${zh ? '缺少' : 'Missing'}${colon}${result.page.security.missing.join(zh ? '、' : ', ')}`);

  if (result.failures.length) {
    lines.push('');
    lines.push(zh ? '阻断问题：' : 'Blocking issues:');
    for (const item of result.failures) lines.push(`- ${localizeDiagnostic(item, lang)}`);
  }

  if (result.warnings.length) {
    lines.push('');
    lines.push(zh ? '提示：' : 'Warnings:');
    for (const item of result.warnings) lines.push(`- ${localizeDiagnostic(item, lang)}`);
  }

  lines.push('');
  lines.push(result.ok
    ? (zh ? '检查完成：主要生产环境检查通过。' : 'Check complete: primary production checks passed.')
    : (zh ? '检查未通过，请根据上方阻断问题继续排查。' : 'Check failed. Use the blocking issues above to continue debugging.')
  );

  return lines.join('\n');
}

export function toChineseReport(result) {
  return toTextReport(result, 'zh-CN');
}

export function toEnglishReport(result) {
  return toTextReport(result, 'en');
}

export function toMarkdownSummary(result, options = {}) {
  const lang = normalizeLanguage(options.language || 'en');
  const zh = lang === 'zh-CN';
  const noResponse = zh ? '无响应' : 'no response';
  const notChecked = zh ? '未检查' : 'not checked';
  const disabled = zh ? '未启用' : 'disabled';

  const tlsDetail = result.tls.checked
    ? `${result.tls.authorized ? (zh ? '证书链正常' : 'certificate chain valid') : result.tls.authorizationError || (zh ? '校验失败' : 'validation failed')}${result.tls.daysRemaining === null ? '' : (zh ? ` · ${result.tls.daysRemaining} 天` : ` · ${result.tls.daysRemaining} day(s)`)}`
    : notChecked;

  const assetDetail = result.assets.checked
    ? (zh ? `${result.assets.count} 个 · 失败 ${result.assets.failedCount} 个` : `${result.assets.count} checked · ${result.assets.failedCount} failed`)
    : result.assets.reason || disabled;

  const browserDetail = result.browser.checked
    ? `${result.browser.profile || 'desktop'} ${result.browser.viewport?.width ?? '?'}×${result.browser.viewport?.height ?? '?'} · HTTP ${result.browser.mainStatus ?? noResponse} · pageerror ${result.browser.pageErrors.length} · console error ${result.browser.consoleErrors.length}`
    : disabled;

  const rows = [
    ['DNS', result.dns.ok ? '✅' : '❌', result.dns.ok ? result.dns.addresses.map(x => x.address).join(', ') : result.dns.error || (zh ? '失败' : 'failed')],
    [zh ? '生产页面' : 'Production page', result.page.ok ? '✅' : '❌', `HTTP ${result.page.status ?? noResponse} · ${result.page.elapsedMs}ms`],
    [zh ? '页面内容' : 'Page content', result.page.expected ? (result.page.expectedOk ? '✅' : '❌') : '➖', result.page.expected || (zh ? '未配置' : 'not configured')],
    [zh ? 'Cloudflare 阻断' : 'Cloudflare block', result.page.blockedByChallenge ? '❌' : '✅', result.page.blockedByChallenge ? result.page.challengeMatches.join(', ') : (zh ? '未发现' : 'not detected')],
    ['TLS', result.tls.checked ? (result.tls.ok ? '✅' : '❌') : '➖', tlsDetail],
    [zh ? '同源 JS/CSS' : 'Same-origin JS/CSS', result.assets.checked ? (result.assets.ok ? '✅' : '❌') : '➖', assetDetail],
    [zh ? '浏览器' : 'Browser', result.browser.checked ? (result.browser.ok ? '✅' : '❌') : '➖', browserDetail],
    ['robots.txt', result.auxiliary.robots.ok ? '✅' : '⚠️', `HTTP ${result.auxiliary.robots.status ?? noResponse}`],
    ['sitemap.xml', result.auxiliary.sitemap.ok ? '✅' : '⚠️', `HTTP ${result.auxiliary.sitemap.status ?? noResponse}`],
    [zh ? '安全响应头' : 'Security headers', 'ℹ️', `${result.page.security.score}/100`]
  ];

  const failedAssets = result.assets.checked && result.assets.failed.length
    ? [
        zh ? '### 失败的同源 JS/CSS' : '### Failed same-origin JS/CSS',
        ...result.assets.failed.slice(0, 10).map((asset) => `- \`${asset.status ?? noResponse}\` ${asset.url}${asset.htmlFallback ? (zh ? '（返回 HTML）' : ' (returned HTML)') : ''}`),
        ''
      ]
    : [];

  const browserDetails = result.browser.checked && (
    result.browser.pageErrors.length ||
    result.browser.consoleErrors.length ||
    result.browser.criticalRequestFailures.length ||
    result.browser.criticalBadResponses.length
  )
    ? [
        zh ? '### 浏览器详情' : '### Browser details',
        ...result.browser.pageErrors.slice(0, 10).map((message) => `- pageerror: ${message}`),
        ...result.browser.consoleErrors.slice(0, 10).map((message) => `- console error: ${message}`),
        ...result.browser.criticalRequestFailures.slice(0, 10).map((item) => `- request failed: ${item.resourceType} ${item.url} · ${item.errorText}`),
        ...result.browser.criticalBadResponses.slice(0, 10).map((item) => `- HTTP ${item.status}: ${item.resourceType} ${item.url}`),
        ''
      ]
    : [];

  return [
    `## 🩺 ProdDoctor: ${result.ok ? (zh ? '✅ 生产环境通过' : '✅ production passed') : (zh ? '❌ 生产环境未通过' : '❌ production failed')}`,
    '',
    `${zh ? '目标：' : 'Target: '}\`${result.target}\``,
    '',
    ...(likelyCause(result, lang) ? [`**${zh ? '可能原因' : 'Likely cause'}:** ${likelyCause(result, lang)}`, ''] : []),
    zh ? '| 检查项 | 状态 | 详情 |' : '| Check | Status | Details |',
    '|---|---:|---|',
    ...rows.map(([name, status, detail]) => `| ${name} | ${status} | ${String(detail).replace(/\|/g, '\\\|')} |`),
    '',
    ...failedAssets,
    ...browserDetails,
    ...(result.browser.screenshotPath ? [`${zh ? '浏览器截图：' : 'Browser screenshot: '}\`${result.browser.screenshotPath}\``, ''] : []),
    ...(result.browser.tracePath ? [`${zh ? 'Playwright Trace：' : 'Playwright Trace: '}\`${result.browser.tracePath}\``, ''] : []),
    ...(result.failures.length ? [zh ? '### 阻断问题' : '### Blocking issues', ...result.failures.map(x => `- ${localizeDiagnostic(x, lang)}`), ''] : []),
    ...(result.warnings.length ? [zh ? '### 提示' : '### Warnings', ...result.warnings.map(x => `- ${localizeDiagnostic(x, lang)}`), ''] : [])
  ].join('\n');
}
