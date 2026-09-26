const icon = (ok) => ok ? '✅' : '❌';

function shortAsset(asset) {
  const suffix = asset.htmlFallback ? '（返回了 HTML，可能是错误路由或 SPA fallback）' : '';
  return `${asset.kind} ${asset.status ?? '无响应'} ${asset.url}${suffix}`;
}

function browserIssueLine(item) {
  if ('status' in item) {
    return `${item.resourceType || 'resource'} HTTP ${item.status} ${item.url}`;
  }
  return `${item.resourceType || 'resource'} ${item.errorText || 'request failed'} ${item.url}`;
}

export function toChineseReport(result) {
  const lines = [];
  lines.push('');
  lines.push('🩺 ProdDoctor 生产环境体检');
  lines.push(`目标：${result.target}`);
  lines.push(`结果：${result.ok ? '✅ 通过' : '❌ 未通过'}`);
  lines.push('');

  lines.push(`${icon(result.dns.ok)} DNS：${result.dns.ok ? result.dns.addresses.map(x => x.address).join(', ') : result.dns.error || '失败'} (${result.dns.elapsedMs}ms)`);

  const statusExpectation = result.page.expectedStatus === null
    ? ''
    : `，预期 ${result.page.expectedStatus}`;
  lines.push(`${icon(result.page.ok)} 页面：${result.page.status ?? '无响应'}${statusExpectation}，${result.page.elapsedMs}ms，尝试 ${result.page.attempts} 次`);

  if (result.page.finalUrl) lines.push(`   最终地址：${result.page.finalUrl}`);

  if (result.page.expected) {
    lines.push(`${icon(result.page.expectedOk)} 页面内容：${result.page.expectedOk ? '已找到' : '未找到'} “${result.page.expected}”`);
  }

  if (result.page.blockedByChallenge) {
    lines.push(`❌ Cloudflare：疑似 Challenge / WAF 阻断 (${result.page.challengeMatches.join(', ')})`);
  } else if (result.page.cfRay) {
    lines.push(`✅ Cloudflare：检测到 CF-Ray ${result.page.cfRay}`);
  }

  if (result.tls.checked) {
    const days = result.tls.daysRemaining === null ? '' : `，剩余约 ${result.tls.daysRemaining} 天`;
    lines.push(`${icon(result.tls.ok)} TLS：${result.tls.authorized ? '证书链校验通过' : result.tls.authorizationError || '校验失败'}${days}`);
  } else {
    lines.push('➖ TLS：未检查（目标不是 HTTPS）');
  }

  if (result.assets.checked) {
    lines.push(`${icon(result.assets.ok)} 静态资源：检查 ${result.assets.count} 个同源 JS/CSS，失败 ${result.assets.failedCount} 个`);
    for (const asset of result.assets.failed.slice(0, 5)) {
      lines.push(`   - ${shortAsset(asset)}`);
    }
    if (result.assets.failed.length > 5) {
      lines.push(`   - 还有 ${result.assets.failed.length - 5} 个失败资源未在终端展开`);
    }
  } else {
    lines.push(`➖ 静态资源：未检查（${result.assets.reason || '未启用'}）`);
  }

  if (result.browser.checked) {
    lines.push(`${icon(result.browser.ok)} 浏览器：${result.browser.mainStatus ?? '无响应'} · ${result.browser.title || '无标题'} · ${result.browser.profile || 'desktop'} ${result.browser.viewport?.width ?? '?'}×${result.browser.viewport?.height ?? '?'}`);
    lines.push(`   可见文本：${result.browser.textLength ?? 0} 字符`);
    if (result.browser.renderedExpect) {
      lines.push(`   渲染文本：${result.browser.renderedExpectOk ? '✅ 已找到' : '❌ 未找到'} “${result.browser.renderedExpect}”`);
    }
    lines.push(`   JS 未捕获异常：${result.browser.pageErrors.length}；Console error：${result.browser.consoleErrors.length}`);
    lines.push(`   关键同源请求失败：${result.browser.criticalRequestFailures.length}；关键同源 4xx/5xx：${result.browser.criticalBadResponses.length}`);

    for (const item of result.browser.criticalRequestFailures.slice(0, 3)) {
      lines.push(`   - ${browserIssueLine(item)}`);
    }
    for (const item of result.browser.criticalBadResponses.slice(0, 3)) {
      lines.push(`   - ${browserIssueLine(item)}`);
    }
    for (const message of result.browser.pageErrors.slice(0, 3)) {
      lines.push(`   - pageerror: ${message}`);
    }
    if (result.browser.screenshotPath) {
      lines.push(`   截图：${result.browser.screenshotPath}`);
    }
    if (result.browser.tracePath) {
      lines.push(`   Trace：${result.browser.tracePath}`);
    }
  } else {
    lines.push('➖ 浏览器：未启用');
  }

  lines.push(`${result.auxiliary.robots.ok ? '✅' : '⚠️'} robots.txt：HTTP ${result.auxiliary.robots.status ?? '无响应'}`);
  lines.push(`${result.auxiliary.sitemap.ok ? '✅' : '⚠️'} sitemap.xml：HTTP ${result.auxiliary.sitemap.status ?? '无响应'}`);

  lines.push(`🛡️ 安全响应头：${result.page.security.score}/100`);
  if (result.page.security.present.length) lines.push(`   已有：${result.page.security.present.join('、')}`);
  if (result.page.security.missing.length) lines.push(`   缺少：${result.page.security.missing.join('、')}`);

  if (result.failures.length) {
    lines.push('');
    lines.push('阻断问题：');
    for (const item of result.failures) lines.push(`- ${item}`);
  }

  if (result.warnings.length) {
    lines.push('');
    lines.push('提示：');
    for (const item of result.warnings) lines.push(`- ${item}`);
  }

  lines.push('');
  lines.push(result.ok
    ? '检查完成：主要生产环境检查通过。'
    : '检查未通过，请根据上方阻断问题继续排查。'
  );

  return lines.join('\n');
}

export function toMarkdownSummary(result) {
  const tlsDetail = result.tls.checked
    ? `${result.tls.authorized ? '证书链正常' : result.tls.authorizationError || '校验失败'}${result.tls.daysRemaining === null ? '' : ` · ${result.tls.daysRemaining} 天`}`
    : '未检查';

  const assetDetail = result.assets.checked
    ? `${result.assets.count} 个 · 失败 ${result.assets.failedCount} 个`
    : result.assets.reason || '未启用';

  const browserDetail = result.browser.checked
    ? `${result.browser.profile || 'desktop'} ${result.browser.viewport?.width ?? '?'}×${result.browser.viewport?.height ?? '?'} · HTTP ${result.browser.mainStatus ?? '无响应'} · pageerror ${result.browser.pageErrors.length} · console error ${result.browser.consoleErrors.length}`
    : '未启用';

  const rows = [
    ['DNS', result.dns.ok ? '✅' : '❌', result.dns.ok ? result.dns.addresses.map(x => x.address).join(', ') : result.dns.error || '失败'],
    ['生产页面', result.page.ok ? '✅' : '❌', `HTTP ${result.page.status ?? '无响应'} · ${result.page.elapsedMs}ms`],
    ['页面内容', result.page.expected ? (result.page.expectedOk ? '✅' : '❌') : '➖', result.page.expected || '未配置'],
    ['Cloudflare 阻断', result.page.blockedByChallenge ? '❌' : '✅', result.page.blockedByChallenge ? result.page.challengeMatches.join(', ') : '未发现'],
    ['TLS', result.tls.checked ? (result.tls.ok ? '✅' : '❌') : '➖', tlsDetail],
    ['同源 JS/CSS', result.assets.checked ? (result.assets.ok ? '✅' : '❌') : '➖', assetDetail],
    ['浏览器', result.browser.checked ? (result.browser.ok ? '✅' : '❌') : '➖', browserDetail],
    ['robots.txt', result.auxiliary.robots.ok ? '✅' : '⚠️', `HTTP ${result.auxiliary.robots.status ?? '无响应'}`],
    ['sitemap.xml', result.auxiliary.sitemap.ok ? '✅' : '⚠️', `HTTP ${result.auxiliary.sitemap.status ?? '无响应'}`],
    ['安全响应头', 'ℹ️', `${result.page.security.score}/100`]
  ];

  const failedAssets = result.assets.checked && result.assets.failed.length
    ? [
        '### 失败的同源 JS/CSS',
        ...result.assets.failed.slice(0, 10).map((asset) => `- \`${asset.status ?? '无响应'}\` ${asset.url}${asset.htmlFallback ? '（返回 HTML）' : ''}`),
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
        '### 浏览器详情',
        ...result.browser.pageErrors.slice(0, 10).map((message) => `- pageerror: ${message}`),
        ...result.browser.consoleErrors.slice(0, 10).map((message) => `- console error: ${message}`),
        ...result.browser.criticalRequestFailures.slice(0, 10).map((item) => `- request failed: ${item.resourceType} ${item.url} · ${item.errorText}`),
        ...result.browser.criticalBadResponses.slice(0, 10).map((item) => `- HTTP ${item.status}: ${item.resourceType} ${item.url}`),
        ''
      ]
    : [];

  return [
    `## 🩺 ProdDoctor：${result.ok ? '✅ 生产环境通过' : '❌ 生产环境未通过'}`,
    '',
    `目标：\`${result.target}\``,
    '',
    '| 检查项 | 状态 | 详情 |',
    '|---|---:|---|',
    ...rows.map(([name, status, detail]) => `| ${name} | ${status} | ${String(detail).replace(/\|/g, '\\|')} |`),
    '',
    ...failedAssets,
    ...browserDetails,
    ...(result.browser.screenshotPath ? [`浏览器截图：\`${result.browser.screenshotPath}\``, ''] : []),
    ...(result.browser.tracePath ? [`Playwright Trace：\`${result.browser.tracePath}\``, ''] : []),
    ...(result.failures.length ? ['### 阻断问题', ...result.failures.map(x => `- ${x}`), ''] : []),
    ...(result.warnings.length ? ['### 提示', ...result.warnings.map(x => `- ${x}`), ''] : [])
  ].join('\n');
}


const EN_EXACT = new Map([
  ['DNS 解析失败', 'DNS resolution failed'],
  ['疑似被 Cloudflare Challenge / WAF 阻断', 'Likely blocked by Cloudflare Challenge / WAF'],
  ['页面未包含指定关键字', 'Page did not contain the expected text'],
  ['生产页面检查失败', 'Production page check failed'],
  ['TLS 证书检查失败', 'TLS certificate check failed'],
  ['浏览器导航没有收到主文档响应', 'Browser navigation received no main-document response'],
  ['浏览器渲染后的页面未包含指定文本', 'Rendered page did not contain the expected text'],
  ['页面渲染后 body 可见文本为空', 'Rendered body contains no visible text'],
  ['浏览器检查无法完成', 'Browser check could not complete'],
  ['未启用静态资源检查', 'Static asset checks disabled'],
  ['生产页面没有可分析的响应正文', 'Production page has no response body to inspect'],
  ['未启用浏览器检查', 'Browser checks disabled'],
]);

export function toEnglishText(value) {
  let text = String(value ?? '');
  for (const [zh, en] of EN_EXACT) text = text.replaceAll(zh, en);

  const replacements = [
    [/ProdDoctor 生产环境体检/g, 'ProdDoctor production check'],
    [/目标：/g, 'Target: '],
    [/结果：/g, 'Result: '],
    [/✅ 通过/g, '✅ PASS'],
    [/❌ 未通过/g, '❌ FAIL'],
    [/页面：/g, 'Page: '],
    [/无响应/g, 'no response'],
    [/预期 (\d+)/g, 'expected $1'],
    [/尝试 (\d+) 次/g, '$1 attempt(s)'],
    [/最终地址：/g, 'Final URL: '],
    [/页面内容：/g, 'Expected text: '],
    [/已找到/g, 'found'],
    [/未找到/g, 'not found'],
    [/疑似 Challenge \/ WAF 阻断/g, 'likely Challenge / WAF block'],
    [/检测到 CF-Ray/g, 'CF-Ray detected'],
    [/TLS：/g, 'TLS: '],
    [/证书链校验通过/g, 'certificate chain valid'],
    [/校验失败/g, 'validation failed'],
    [/剩余约 (\d+) 天/g, 'about $1 days remaining'],
    [/未检查（目标不是 HTTPS）/g, 'not checked (target is not HTTPS)'],
    [/静态资源：/g, 'Assets: '],
    [/检查 (\d+) 个同源 JS\/CSS，失败 (\d+) 个/g, 'checked $1 same-origin JS/CSS asset(s), $2 failed'],
    [/还有 (\d+) 个失败资源未在终端展开/g, '$1 more failed asset(s) not shown'],
    [/未检查（/g, 'not checked ('],
    [/未启用/g, 'disabled'],
    [/浏览器：/g, 'Browser: '],
    [/无标题/g, 'untitled'],
    [/可见文本：(\d+) 字符/g, 'Visible text: $1 characters'],
    [/渲染文本：/g, 'Rendered text: '],
    [/JS 未捕获异常：(\d+)；Console error：(\d+)/g, 'Uncaught JS errors: $1; console errors: $2'],
    [/关键同源请求失败：(\d+)；关键同源 4xx\/5xx：(\d+)/g, 'Critical same-origin request failures: $1; critical same-origin 4xx/5xx: $2'],
    [/截图：/g, 'Screenshot: '],
    [/安全响应头：/g, 'Security headers: '],
    [/已有：/g, 'Present: '],
    [/缺少：/g, 'Missing: '],
    [/阻断问题：/g, 'Blocking issues:'],
    [/提示：/g, 'Warnings:'],
    [/检查完成：主要生产环境检查通过。/g, 'Check complete: main production checks passed.'],
    [/检查未通过，请根据上方阻断问题继续排查。/g, 'Check failed. Investigate the blocking issues above.'],
    [/返回了 HTML，可能是错误路由或 SPA fallback/g, 'returned HTML; possible wrong route or SPA fallback'],
    [/入口 URL 不是 HTTPS。/g, 'Entry URL is not HTTPS.'],
    [/最终跳转到了其他 Origin：/g, 'Final redirect moved to another origin: '],
    [/缺少常见安全响应头：/g, 'Missing common security headers: '],
    [/未检测到可正常访问的 robots\.txt。/g, 'No accessible robots.txt detected.'],
    [/未检测到可正常访问的 sitemap\.xml。/g, 'No accessible sitemap.xml detected.'],
    [/静态资源检查达到上限 (\d+) 个，页面可能还有更多资源未检查。/g, 'Asset check reached the $1-item limit; more page assets may remain unchecked.'],
    [/HTTP 状态异常：/g, 'Unexpected HTTP status: '],
    [/HTTP 状态不符合预期：实际 (\d+)，预期 (\d+)/g, 'HTTP status mismatch: got $1, expected $2'],
    [/请求失败：/g, 'Request failed: '],
    [/TLS 证书校验失败：/g, 'TLS certificate validation failed: '],
    [/发现 (\d+) 个不可用或返回异常内容的同源 JS\/CSS 资源/g, 'Found $1 unavailable or invalid same-origin JS/CSS asset(s)'],
    [/浏览器检查失败：/g, 'Browser check failed: '],
    [/浏览器主文档返回 HTTP (\d+)/g, 'Browser main document returned HTTP $1'],
    [/页面运行时出现 (\d+) 个未捕获 JavaScript 异常/g, 'Page runtime produced $1 uncaught JavaScript error(s)'],
    [/浏览器中有 (\d+) 个关键同源请求失败/g, 'Browser saw $1 critical same-origin request failure(s)'],
    [/浏览器中有 (\d+) 个关键同源资源返回 4xx\/5xx/g, 'Browser saw $1 critical same-origin resource(s) return 4xx/5xx'],
    [/浏览器 Console 出现 (\d+) 条 error（当前仅提示）/g, 'Browser console produced $1 error(s) (warning only)'],
    [/浏览器 Console 出现 (\d+) 条 error/g, 'Browser console produced $1 error(s)'],
    [/截图保存失败：/g, 'Screenshot save failed: '],
    [/Trace 保存失败：/g, 'Trace save failed: '],
    [/页面 Content-Type 不是 HTML：/g, 'Page Content-Type is not HTML: '],
    [/（返回 HTML）/g, ' (returned HTML)'],
    [/未配置/g, 'not configured'],
    [/未发现/g, 'not detected'],
    [/证书链正常/g, 'certificate chain valid'],
    [/异常/g, 'error'],
    [/(\d+) 天/g, '$1 days'],
    [/(\d+) 个 · 失败 (\d+) 个/g, '$1 item(s) · $2 failed'],
    [/生产页面/g, 'Production page'],
    [/页面内容/g, 'Expected text'],
    [/Cloudflare 阻断/g, 'Cloudflare block'],
    [/同源 JS\/CSS/g, 'Same-origin JS/CSS'],
    [/安全响应头/g, 'Security headers'],
    [/失败的同源 JS\/CSS/g, 'Failed same-origin JS/CSS'],
    [/浏览器详情/g, 'Browser details'],
    [/生产环境通过/g, 'production passed'],
    [/生产环境未通过/g, 'production failed'],
    [/检查项/g, 'Check'],
    [/状态/g, 'Status'],
    [/详情/g, 'Details'],
    [/检查结果/g, 'Check results'],
    [/浏览器证据/g, 'Browser evidence'],
    [/页面截图/g, 'Page screenshot'],
    [/未捕获 JavaScript 异常/g, 'Uncaught JavaScript errors'],
    [/关键同源请求失败/g, 'Critical same-origin request failures'],
    [/关键同源 4xx\/5xx/g, 'Critical same-origin 4xx/5xx'],
    [/阻断问题/g, 'Blocking issues'],
    [/提示/g, 'Warnings'],
    [/检测到疑似挑战页/g, 'Likely challenge page detected'],
    [/未发现典型阻断/g, 'No typical block detected'],
    [/未检查/g, 'Not checked'],
    [/无/g, 'None']
  ];
  for (const [pattern, replacement] of replacements) text = text.replace(pattern, replacement);
  return text.replaceAll('，', ', ').replaceAll('；', '; ').replaceAll('：', ': ').replaceAll('（', ' (').replaceAll('）', ')');
}

export function toEnglishReport(result) {
  return toEnglishText(toChineseReport(result));
}

export function toEnglishMarkdownSummary(result) {
  return toEnglishText(toMarkdownSummary(result));
}
