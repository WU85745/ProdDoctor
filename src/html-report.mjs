import path from 'node:path';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function statusClass(ok, warning = false) {
  if (warning) return 'warn';
  return ok ? 'ok' : 'bad';
}

function row(label, status, detail, warning = false) {
  return `
    <tr>
      <td>${esc(label)}</td>
      <td><span class="pill ${statusClass(status, warning)}">${warning ? 'WARN' : status ? 'PASS' : 'FAIL'}</span></td>
      <td>${esc(detail)}</td>
    </tr>`;
}

function list(items) {
  if (!items?.length) return '<p class="muted">无</p>';
  return `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;
}

function relativeEvidenceLink(filePath, reportPath) {
  if (!filePath) return null;
  if (!reportPath) return path.basename(filePath);

  const reportDir = path.dirname(path.resolve(reportPath));
  const relative = path.relative(reportDir, path.resolve(filePath)) || path.basename(filePath);
  return relative.split(path.sep).join('/');
}

export function toHtmlReport(result, options = {}) {
  const browser = result.browser;
  const screenshotName = relativeEvidenceLink(browser?.screenshotPath, options.reportPath);
  const traceName = relativeEvidenceLink(browser?.tracePath, options.reportPath);

  const rows = [
    row('DNS', result.dns.ok, result.dns.ok
      ? result.dns.addresses.map((item) => item.address).join(', ')
      : result.dns.error || '失败'),
    row('生产页面', result.page.ok, `HTTP ${result.page.status ?? '无响应'} · ${result.page.elapsedMs}ms`),
    row('Cloudflare/WAF', !result.page.blockedByChallenge, result.page.blockedByChallenge ? '检测到疑似挑战页' : '未发现典型阻断'),
    row('TLS', !result.tls.checked || result.tls.ok, result.tls.checked
      ? `${result.tls.authorized ? '证书链正常' : result.tls.authorizationError || '异常'} · ${result.tls.daysRemaining ?? '?'} 天`
      : '未检查'),
    row('同源 JS/CSS', !result.assets.checked || result.assets.ok, result.assets.checked
      ? `${result.assets.count} 个，失败 ${result.assets.failedCount} 个`
      : result.assets.reason || '未启用'),
    row('浏览器', !browser.checked || browser.ok, browser.checked
      ? `${browser.profile} · HTTP ${browser.mainStatus ?? '无响应'} · ${browser.viewport?.width ?? '?'}×${browser.viewport?.height ?? '?'}`
      : '未启用'),
    row('robots.txt', result.auxiliary.robots.ok, `HTTP ${result.auxiliary.robots.status ?? '无响应'}`, !result.auxiliary.robots.ok),
    row('sitemap.xml', result.auxiliary.sitemap.ok, `HTTP ${result.auxiliary.sitemap.status ?? '无响应'}`, !result.auxiliary.sitemap.ok)
  ].join('');

  const browserEvidence = browser.checked
    ? `
      <section>
        <h2>浏览器证据</h2>
        <div class="grid">
          <div class="card"><strong>Profile</strong><span>${esc(browser.profile)}</span></div>
          <div class="card"><strong>Viewport</strong><span>${esc(`${browser.viewport?.width ?? '?'}×${browser.viewport?.height ?? '?'}`)}</span></div>
          <div class="card"><strong>Page errors</strong><span>${browser.pageErrors.length}</span></div>
          <div class="card"><strong>Console errors</strong><span>${browser.consoleErrors.length}</span></div>
          <div class="card"><strong>Critical request failures</strong><span>${browser.criticalRequestFailures.length}</span></div>
          <div class="card"><strong>Critical 4xx/5xx</strong><span>${browser.criticalBadResponses.length}</span></div>
        </div>

        ${screenshotName ? `
          <h3>页面截图</h3>
          <p><a href="./${esc(screenshotName)}">${esc(screenshotName)}</a></p>
          <img class="screenshot" src="./${esc(screenshotName)}" alt="ProdDoctor browser screenshot">
        ` : ''}

        ${traceName ? `
          <h3>Playwright Trace</h3>
          <p><a href="./${esc(traceName)}">${esc(traceName)}</a></p>
        ` : ''}

        <h3>未捕获 JavaScript 异常</h3>
        ${list(browser.pageErrors)}

        <h3>Console error</h3>
        ${list(browser.consoleErrors)}

        <h3>关键同源请求失败</h3>
        ${list(browser.criticalRequestFailures.map((item) => `${item.resourceType}: ${item.url} · ${item.errorText}`))}

        <h3>关键同源 4xx/5xx</h3>
        ${list(browser.criticalBadResponses.map((item) => `HTTP ${item.status}: ${item.resourceType} ${item.url}`))}
      </section>
    `
    : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ProdDoctor Report</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0b0d10; color: #f4f6f8; }
    main { max-width: 1080px; margin: 0 auto; padding: 40px 20px 72px; }
    h1 { margin-bottom: 8px; }
    h2 { margin-top: 36px; }
    h3 { margin-top: 24px; }
    .subtitle,.muted { color: #a8b0bb; }
    .summary { padding: 18px 20px; border: 1px solid #2b3139; border-radius: 14px; margin: 24px 0; background: #11151a; }
    .summary strong { font-size: 20px; }
    .ok-text { color: #5ee28c; }
    .bad-text { color: #ff7070; }
    table { width: 100%; border-collapse: collapse; background: #11151a; border-radius: 14px; overflow: hidden; }
    th, td { text-align: left; padding: 13px 14px; border-bottom: 1px solid #262c34; vertical-align: top; }
    th { color: #a8b0bb; font-weight: 600; }
    .pill { font-size: 12px; font-weight: 700; padding: 3px 8px; border-radius: 999px; }
    .pill.ok { background: #163b26; color: #7df0a7; }
    .pill.bad { background: #481d1d; color: #ff9797; }
    .pill.warn { background: #463816; color: #ffd66e; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); gap: 12px; }
    .card { border: 1px solid #2b3139; border-radius: 12px; padding: 14px; background: #11151a; display:flex; flex-direction:column; gap:8px; }
    .card span { font-size: 20px; }
    a { color: #7eb8ff; }
    code { background: #1b2129; padding: 2px 5px; border-radius: 5px; }
    ul { padding-left: 22px; }
    li { margin: 6px 0; overflow-wrap: anywhere; }
    .screenshot { max-width: 100%; border-radius: 12px; border: 1px solid #2b3139; background: white; }
  </style>
</head>
<body>
  <main>
    <h1>ProdDoctor Production Report</h1>
    <p class="subtitle">${esc(result.target)} · ${esc(result.checkedAt)}</p>

    <div class="summary">
      <strong class="${result.ok ? 'ok-text' : 'bad-text'}">${result.ok ? 'PASS' : 'FAIL'}</strong>
      <div class="muted">ProdDoctor v${esc(result.version)}</div>
    </div>

    <section>
      <h2>检查结果</h2>
      <table>
        <thead><tr><th>检查项</th><th>状态</th><th>详情</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>

    ${browserEvidence}

    <section>
      <h2>阻断问题</h2>
      ${list(result.failures)}
    </section>

    <section>
      <h2>提示</h2>
      ${list(result.warnings)}
    </section>
  </main>
</body>
</html>`;
}
