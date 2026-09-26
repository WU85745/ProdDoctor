import path from 'node:path';
import { localizeDiagnostic, normalizeLanguage } from './report.mjs';

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

function list(items, emptyLabel) {
  if (!items?.length) return `<p class="muted">${esc(emptyLabel)}</p>`;
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
  const language = normalizeLanguage(options.language || 'en');
  const zh = language === 'zh-CN';
  const browser = result.browser;
  const screenshotName = relativeEvidenceLink(browser?.screenshotPath, options.reportPath);
  const traceName = relativeEvidenceLink(browser?.tracePath, options.reportPath);
  const noResponse = zh ? '无响应' : 'no response';
  const empty = zh ? '无' : 'None';

  const rows = [
    row('DNS', result.dns.ok, result.dns.ok
      ? result.dns.addresses.map((item) => item.address).join(', ')
      : result.dns.error || (zh ? '失败' : 'failed')),
    row(zh ? '生产页面' : 'Production page', result.page.ok, `HTTP ${result.page.status ?? noResponse} · ${result.page.elapsedMs}ms`),
    row('Cloudflare/WAF', !result.page.blockedByChallenge, result.page.blockedByChallenge ? (zh ? '检测到疑似挑战页' : 'Likely challenge/WAF block detected') : (zh ? '未发现典型阻断' : 'No typical block detected')),
    row('TLS', !result.tls.checked || result.tls.ok, result.tls.checked
      ? `${result.tls.authorized ? (zh ? '证书链正常' : 'Certificate chain valid') : result.tls.authorizationError || (zh ? '异常' : 'invalid')} · ${result.tls.daysRemaining ?? '?'} ${zh ? '天' : 'day(s)'}`
      : (zh ? '未检查' : 'Not checked')),
    row(zh ? '同源 JS/CSS' : 'Same-origin JS/CSS', !result.assets.checked || result.assets.ok, result.assets.checked
      ? (zh ? `${result.assets.count} 个，失败 ${result.assets.failedCount} 个` : `${result.assets.count} checked, ${result.assets.failedCount} failed`)
      : localizeDiagnostic(result.assets.reason || (zh ? '未启用静态资源检查' : 'Static asset checks disabled'), language)),
    row(zh ? '浏览器' : 'Browser', !browser.checked || browser.ok, browser.checked
      ? `${browser.profile} · HTTP ${browser.mainStatus ?? noResponse} · ${browser.viewport?.width ?? '?'}×${browser.viewport?.height ?? '?'}`
      : (zh ? '未启用' : 'Disabled')),
    row('robots.txt', result.auxiliary.robots.ok, `HTTP ${result.auxiliary.robots.status ?? noResponse}`, !result.auxiliary.robots.ok),
    row('sitemap.xml', result.auxiliary.sitemap.ok, `HTTP ${result.auxiliary.sitemap.status ?? noResponse}`, !result.auxiliary.sitemap.ok)
  ].join('');

  const browserEvidence = browser.checked
    ? `
      <section>
        <h2>${zh ? '浏览器证据' : 'Browser evidence'}</h2>
        <div class="grid">
          <div class="card"><strong>Profile</strong><span>${esc(browser.profile)}</span></div>
          <div class="card"><strong>Viewport</strong><span>${esc(`${browser.viewport?.width ?? '?'}×${browser.viewport?.height ?? '?'}`)}</span></div>
          <div class="card"><strong>Page errors</strong><span>${browser.pageErrors.length}</span></div>
          <div class="card"><strong>Console errors</strong><span>${browser.consoleErrors.length}</span></div>
          <div class="card"><strong>Critical request failures</strong><span>${browser.criticalRequestFailures.length}</span></div>
          <div class="card"><strong>Critical 4xx/5xx</strong><span>${browser.criticalBadResponses.length}</span></div>
        </div>

        ${screenshotName ? `
          <h3>${zh ? '页面截图' : 'Page screenshot'}</h3>
          <p><a href="./${esc(screenshotName)}">${esc(screenshotName)}</a></p>
          <img class="screenshot" src="./${esc(screenshotName)}" alt="ProdDoctor browser screenshot">
        ` : ''}

        ${traceName ? `
          <h3>Playwright Trace</h3>
          <p><a href="./${esc(traceName)}">${esc(traceName)}</a></p>
        ` : ''}

        <h3>${zh ? '未捕获 JavaScript 异常' : 'Uncaught JavaScript errors'}</h3>
        ${list(browser.pageErrors, empty)}

        <h3>Console errors</h3>
        ${list(browser.consoleErrors, empty)}

        <h3>${zh ? '关键同源请求失败' : 'Critical same-origin request failures'}</h3>
        ${list(browser.criticalRequestFailures.map((item) => `${item.resourceType}: ${item.url} · ${item.errorText}`), empty)}

        <h3>${zh ? '关键同源 4xx/5xx' : 'Critical same-origin 4xx/5xx'}</h3>
        ${list(browser.criticalBadResponses.map((item) => `HTTP ${item.status}: ${item.resourceType} ${item.url}`), empty)}
      </section>
    `
    : '';

  const localizedFailures = result.failures.map((item) => localizeDiagnostic(item, language));
  const localizedWarnings = result.warnings.map((item) => localizeDiagnostic(item, language));

  return `<!doctype html>
<html lang="${zh ? 'zh-CN' : 'en'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${zh ? 'ProdDoctor 生产报告' : 'ProdDoctor Production Report'}</title>
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
    <h1>${zh ? 'ProdDoctor 生产报告' : 'ProdDoctor Production Report'}</h1>
    <p class="subtitle">${esc(result.target)} · ${esc(result.checkedAt)}</p>

    <div class="summary">
      <strong class="${result.ok ? 'ok-text' : 'bad-text'}">${result.ok ? 'PASS' : 'FAIL'}</strong>
      <div class="muted">ProdDoctor v${esc(result.version)}</div>
    </div>

    <section>
      <h2>${zh ? '检查结果' : 'Check results'}</h2>
      <table>
        <thead><tr><th>${zh ? '检查项' : 'Check'}</th><th>${zh ? '状态' : 'Status'}</th><th>${zh ? '详情' : 'Details'}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>

    ${browserEvidence}

    <section>
      <h2>${zh ? '阻断问题' : 'Blocking issues'}</h2>
      ${list(localizedFailures, empty)}
    </section>

    <section>
      <h2>${zh ? '提示' : 'Warnings'}</h2>
      ${list(localizedWarnings, empty)}
    </section>
  </main>
</body>
</html>`;
}
