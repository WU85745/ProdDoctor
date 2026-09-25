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
    lines.push(`${icon(result.browser.ok)} 浏览器：${result.browser.mainStatus ?? '无响应'} · ${result.browser.title || '无标题'}`);
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
    ? `HTTP ${result.browser.mainStatus ?? '无响应'} · pageerror ${result.browser.pageErrors.length} · console error ${result.browser.consoleErrors.length}`
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
    ...(result.failures.length ? ['### 阻断问题', ...result.failures.map(x => `- ${x}`), ''] : []),
    ...(result.warnings.length ? ['### 提示', ...result.warnings.map(x => `- ${x}`), ''] : [])
  ].join('\n');
}
