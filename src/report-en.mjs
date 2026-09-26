const icon = (ok) => ok ? '✅' : '❌';

function shortAsset(asset) {
  const suffix = asset.htmlFallback ? ' (returned HTML; possible bad route or SPA fallback)' : '';
  return `${asset.kind} ${asset.status ?? 'no response'} ${asset.url}${suffix}`;
}

function browserIssueLine(item) {
  if ('status' in item) return `${item.resourceType || 'resource'} HTTP ${item.status} ${item.url}`;
  return `${item.resourceType || 'resource'} ${item.errorText || 'request failed'} ${item.url}`;
}

export function toEnglishReport(result) {
  const lines = ['', '🩺 ProdDoctor production check', `Target: ${result.target}`, `Result: ${result.ok ? '✅ PASS' : '❌ FAIL'}`, ''];

  lines.push(`${icon(result.dns.ok)} DNS: ${result.dns.ok ? result.dns.addresses.map(x => x.address).join(', ') : result.dns.error || 'failed'} (${result.dns.elapsedMs}ms)`);
  const statusExpectation = result.page.expectedStatus === null ? '' : `, expected ${result.page.expectedStatus}`;
  lines.push(`${icon(result.page.ok)} Page: ${result.page.status ?? 'no response'}${statusExpectation}, ${result.page.elapsedMs}ms, ${result.page.attempts} attempt(s)`);
  if (result.page.finalUrl) lines.push(`   Final URL: ${result.page.finalUrl}`);
  if (result.page.expected) lines.push(`${icon(result.page.expectedOk)} Page content: ${result.page.expectedOk ? 'found' : 'missing'} “${result.page.expected}”`);

  if (result.page.blockedByChallenge) lines.push(`❌ Cloudflare: likely Challenge / WAF block (${result.page.challengeMatches.join(', ')})`);
  else if (result.page.cfRay) lines.push(`✅ Cloudflare: CF-Ray ${result.page.cfRay}`);

  if (result.tls.checked) {
    const days = result.tls.daysRemaining === null ? '' : `, about ${result.tls.daysRemaining} day(s) remaining`;
    lines.push(`${icon(result.tls.ok)} TLS: ${result.tls.authorized ? 'certificate chain valid' : result.tls.authorizationError || 'validation failed'}${days}`);
  } else lines.push('➖ TLS: not checked (target is not HTTPS)');

  if (result.assets.checked) {
    lines.push(`${icon(result.assets.ok)} Assets: checked ${result.assets.count} same-origin JS/CSS, ${result.assets.failedCount} failed`);
    for (const asset of result.assets.failed.slice(0, 5)) lines.push(`   - ${shortAsset(asset)}`);
    if (result.assets.failed.length > 5) lines.push(`   - ${result.assets.failed.length - 5} more failed asset(s) not expanded`);
  } else lines.push(`➖ Assets: not checked (${result.assets.reason || 'disabled'})`);

  if (result.browser.checked) {
    lines.push(`${icon(result.browser.ok)} Browser: ${result.browser.mainStatus ?? 'no response'} · ${result.browser.title || 'untitled'} · ${result.browser.profile || 'desktop'} ${result.browser.viewport?.width ?? '?'}×${result.browser.viewport?.height ?? '?'}`);
    lines.push(`   Visible text: ${result.browser.textLength ?? 0} characters`);
    if (result.browser.renderedExpect) lines.push(`   Rendered text: ${result.browser.renderedExpectOk ? '✅ found' : '❌ missing'} “${result.browser.renderedExpect}”`);
    lines.push(`   Uncaught JS errors: ${result.browser.pageErrors.length}; console errors: ${result.browser.consoleErrors.length}`);
    lines.push(`   Critical same-origin request failures: ${result.browser.criticalRequestFailures.length}; critical same-origin 4xx/5xx: ${result.browser.criticalBadResponses.length}`);
    for (const item of result.browser.criticalRequestFailures.slice(0, 3)) lines.push(`   - ${browserIssueLine(item)}`);
    for (const item of result.browser.criticalBadResponses.slice(0, 3)) lines.push(`   - ${browserIssueLine(item)}`);
    for (const message of result.browser.pageErrors.slice(0, 3)) lines.push(`   - pageerror: ${message}`);
    if (result.browser.screenshotPath) lines.push(`   Screenshot: ${result.browser.screenshotPath}`);
    if (result.browser.tracePath) lines.push(`   Trace: ${result.browser.tracePath}`);
  } else lines.push('➖ Browser: disabled');

  lines.push(`${result.auxiliary.robots.ok ? '✅' : '⚠️'} robots.txt: HTTP ${result.auxiliary.robots.status ?? 'no response'}`);
  lines.push(`${result.auxiliary.sitemap.ok ? '✅' : '⚠️'} sitemap.xml: HTTP ${result.auxiliary.sitemap.status ?? 'no response'}`);
  lines.push(`🛡️ Security headers: ${result.page.security.score}/100`);
  if (result.page.security.present.length) lines.push(`   Present: ${result.page.security.present.join(', ')}`);
  if (result.page.security.missing.length) lines.push(`   Missing: ${result.page.security.missing.join(', ')}`);

  if (result.failures.length) {
    lines.push('', 'Blocking issues:');
    for (const item of result.failures) lines.push(`- ${item}`);
  }
  if (result.warnings.length) {
    lines.push('', 'Warnings:');
    for (const item of result.warnings) lines.push(`- ${item}`);
  }

  lines.push('', result.ok ? 'Check complete: primary production checks passed.' : 'Check failed. Use the blocking issues above to continue debugging.');
  return lines.join('\n');
}

export function toEnglishMarkdownSummary(result) {
  const tlsDetail = result.tls.checked
    ? `${result.tls.authorized ? 'certificate chain valid' : result.tls.authorizationError || 'validation failed'}${result.tls.daysRemaining === null ? '' : ` · ${result.tls.daysRemaining} days`}`
    : 'not checked';
  const assetDetail = result.assets.checked ? `${result.assets.count} checked · ${result.assets.failedCount} failed` : result.assets.reason || 'disabled';
  const browserDetail = result.browser.checked
    ? `${result.browser.profile || 'desktop'} ${result.browser.viewport?.width ?? '?'}×${result.browser.viewport?.height ?? '?'} · HTTP ${result.browser.mainStatus ?? 'no response'} · pageerror ${result.browser.pageErrors.length} · console error ${result.browser.consoleErrors.length}`
    : 'disabled';

  const rows = [
    ['DNS', result.dns.ok ? '✅' : '❌', result.dns.ok ? result.dns.addresses.map(x => x.address).join(', ') : result.dns.error || 'failed'],
    ['Production page', result.page.ok ? '✅' : '❌', `HTTP ${result.page.status ?? 'no response'} · ${result.page.elapsedMs}ms`],
    ['Expected content', result.page.expected ? (result.page.expectedOk ? '✅' : '❌') : '➖', result.page.expected || 'not configured'],
    ['Cloudflare block', result.page.blockedByChallenge ? '❌' : '✅', result.page.blockedByChallenge ? result.page.challengeMatches.join(', ') : 'not detected'],
    ['TLS', result.tls.checked ? (result.tls.ok ? '✅' : '❌') : '➖', tlsDetail],
    ['Same-origin JS/CSS', result.assets.checked ? (result.assets.ok ? '✅' : '❌') : '➖', assetDetail],
    ['Browser', result.browser.checked ? (result.browser.ok ? '✅' : '❌') : '➖', browserDetail],
    ['robots.txt', result.auxiliary.robots.ok ? '✅' : '⚠️', `HTTP ${result.auxiliary.robots.status ?? 'no response'}`],
    ['sitemap.xml', result.auxiliary.sitemap.ok ? '✅' : '⚠️', `HTTP ${result.auxiliary.sitemap.status ?? 'no response'}`],
    ['Security headers', 'ℹ️', `${result.page.security.score}/100`]
  ];

  return [
    `## 🩺 ProdDoctor: ${result.ok ? '✅ production passed' : '❌ production failed'}`,
    '',
    `Target: \`${result.target}\``,
    '',
    '| Check | Status | Details |',
    '|---|---:|---|',
    ...rows.map(([name, status, detail]) => `| ${name} | ${status} | ${String(detail).replace(/\|/g, '\\|')} |`),
    '',
    ...(result.failures.length ? ['### Blocking issues', ...result.failures.map(x => `- ${x}`), ''] : []),
    ...(result.warnings.length ? ['### Warnings', ...result.warnings.map(x => `- ${x}`), ''] : [])
  ].join('\n');
}
