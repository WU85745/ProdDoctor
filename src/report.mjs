const icon = (ok) => ok ? '✅' : '❌';

export function toChineseReport(result) {
  const lines = [];
  lines.push('');
  lines.push('🩺 ProdDoctor 生产环境体检');
  lines.push(`目标：${result.target}`);
  lines.push(`结果：${result.ok ? '✅ 通过' : '❌ 未通过'}`);
  lines.push('');
  lines.push(`${icon(result.dns.ok)} DNS：${result.dns.ok ? result.dns.addresses.map(x => x.address).join(', ') : result.dns.error || '失败'} (${result.dns.elapsedMs}ms)`);
  lines.push(`${icon(result.page.ok)} 页面：${result.page.status ?? '无响应'}，${result.page.elapsedMs}ms，尝试 ${result.page.attempts} 次`);
  if (result.page.finalUrl) lines.push(`   最终地址：${result.page.finalUrl}`);
  if (result.page.expected) lines.push(`${icon(result.page.expectedOk)} 关键字：${result.page.expectedOk ? '已找到' : '未找到'} “${result.page.expected}”`);
  if (result.page.blockedByChallenge) lines.push(`❌ Cloudflare：疑似挑战页/WAF 阻断 (${result.page.challengeMatches.join(', ')})`);
  else if (result.page.cfRay) lines.push(`✅ Cloudflare：请求已到达边缘节点，CF-Ray ${result.page.cfRay}`);
  lines.push(`${icon(result.auxiliary.robots.ok)} robots.txt：HTTP ${result.auxiliary.robots.status ?? '无响应'}`);
  lines.push(`${icon(result.auxiliary.sitemap.ok)} sitemap.xml：HTTP ${result.auxiliary.sitemap.status ?? '无响应'}`);
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
  lines.push(result.ok ? '生产环境真的活着。CI 这次没有骗你。' : 'CI 可能是绿的，但生产环境还需要治疗。');
  return lines.join('\n');
}

export function toMarkdownSummary(result) {
  const rows = [
    ['DNS', result.dns.ok ? '✅' : '❌', result.dns.ok ? result.dns.addresses.map(x => x.address).join(', ') : result.dns.error || '失败'],
    ['生产页面', result.page.ok ? '✅' : '❌', `HTTP ${result.page.status ?? '无响应'} · ${result.page.elapsedMs}ms`],
    ['页面关键字', result.page.expected ? (result.page.expectedOk ? '✅' : '❌') : '➖', result.page.expected || '未配置'],
    ['Cloudflare 阻断', result.page.blockedByChallenge ? '❌' : '✅', result.page.blockedByChallenge ? result.page.challengeMatches.join(', ') : '未发现'],
    ['robots.txt', result.auxiliary.robots.ok ? '✅' : '⚠️', `HTTP ${result.auxiliary.robots.status ?? '无响应'}`],
    ['sitemap.xml', result.auxiliary.sitemap.ok ? '✅' : '⚠️', `HTTP ${result.auxiliary.sitemap.status ?? '无响应'}`],
    ['安全响应头', 'ℹ️', `${result.page.security.score}/100`]
  ];
  return [
    `## 🩺 ProdDoctor：${result.ok ? '✅ 生产环境通过' : '❌ 生产环境未通过'}`,
    '',
    `目标：\`${result.target}\``,
    '',
    '| 检查项 | 状态 | 详情 |',
    '|---|---:|---|',
    ...rows.map(([name, status, detail]) => `| ${name} | ${status} | ${String(detail).replace(/\|/g, '\\|')} |`),
    '',
    ...(result.failures.length ? ['### 阻断问题', ...result.failures.map(x => `- ${x}`), ''] : []),
    ...(result.warnings.length ? ['### 提示', ...result.warnings.map(x => `- ${x}`), ''] : [])
  ].join('\n');
}
