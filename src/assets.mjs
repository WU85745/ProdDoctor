function getAttribute(tag, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i');
  return tag.match(pattern)?.[1] || null;
}

export function extractStaticAssets(html, pageUrl, maxAssets = 20) {
  const base = new URL(pageUrl);
  const found = [];

  for (const match of String(html || '').matchAll(/<script\b[^>]*>/gi)) {
    const src = getAttribute(match[0], 'src');
    if (src) found.push({ kind: 'script', rawUrl: src });
  }

  for (const match of String(html || '').matchAll(/<link\b[^>]*>/gi)) {
    const rel = getAttribute(match[0], 'rel') || '';
    const href = getAttribute(match[0], 'href');
    if (href && rel.toLowerCase().split(/\s+/).includes('stylesheet')) {
      found.push({ kind: 'style', rawUrl: href });
    }
  }

  const seen = new Set();
  const assets = [];
  for (const item of found) {
    if (/^(?:data|blob|javascript):/i.test(item.rawUrl)) continue;
    let resolved;
    try {
      resolved = new URL(item.rawUrl, base);
    } catch {
      continue;
    }
    if (!['http:', 'https:'].includes(resolved.protocol)) continue;
    if (resolved.origin !== base.origin) continue;
    resolved.hash = '';
    const key = `${item.kind}:${resolved.href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    assets.push({ kind: item.kind, url: resolved.href });
    if (assets.length >= maxAssets) break;
  }
  return assets;
}

async function requestAsset(asset, timeoutMs) {
  const started = performance.now();
  let response;
  let method = 'HEAD';

  try {
    response = await fetch(asset.url, {
      method,
      redirect: 'follow',
      headers: {
        'user-agent': 'ProdDoctor/0.2 (+https://github.com/WU85745/ProdDoctor)',
        'cache-control': 'no-cache'
      },
      signal: AbortSignal.timeout(timeoutMs)
    });

    if ([405, 501].includes(response.status)) {
      method = 'GET';
      response = await fetch(asset.url, {
        method,
        redirect: 'follow',
        headers: {
          'user-agent': 'ProdDoctor/0.2 (+https://github.com/WU85745/ProdDoctor)',
          'cache-control': 'no-cache',
          range: 'bytes=0-0'
        },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (response.body) await response.body.cancel();
    }

    const statusOk = response.status >= 200 && response.status < 400;
    const contentType = response.headers.get('content-type') || '';
    const htmlFallback = statusOk
      && contentType.toLowerCase().includes('text/html')
      && ['script', 'style'].includes(asset.kind);

    return {
      ...asset,
      ok: statusOk && !htmlFallback,
      status: response.status,
      finalUrl: response.url,
      method,
      contentType: contentType || null,
      htmlFallback,
      elapsedMs: Math.round(performance.now() - started),
      error: null
    };
  } catch (error) {
    return {
      ...asset,
      ok: false,
      status: null,
      finalUrl: null,
      method,
      contentType: null,
      htmlFallback: false,
      elapsedMs: Math.round(performance.now() - started),
      error: error?.message || String(error)
    };
  }
}

export async function checkStaticAssets({ html, pageUrl, timeoutMs = 15000, maxAssets = 20 }) {
  const assets = extractStaticAssets(html, pageUrl, maxAssets);
  const results = [];

  for (const asset of assets) {
    results.push(await requestAsset(asset, timeoutMs));
  }

  const failed = results.filter((item) => !item.ok);
  return {
    checked: true,
    count: results.length,
    ok: failed.length === 0,
    failedCount: failed.length,
    failed,
    results
  };
}
