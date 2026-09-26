function getAttribute(tag, name) {
  // Require attribute boundaries: data-src is not src; accept valid unquoted values.
  const pattern = /\s+([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of tag.matchAll(pattern)) {
    if (match[1].toLowerCase() === name.toLowerCase()) {
      return match[2] ?? match[3] ?? match[4] ?? '';
    }
  }
  return null;
}

function decodeHtmlAttribute(value) {
  return String(value)
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (entity, hex, dec) => {
      const code = parseInt(hex || dec, hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '\uFFFD';
    })
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

export function extractStaticAssets(html, pageUrl, maxAssets = 20) {
  if (maxAssets <= 0) return [];

  const page = new URL(pageUrl);
  const markup = String(html || '').replace(/<!--[\s\S]*?-->/g, '');
  const baseTag = markup.match(/<base\b[^>]*>/i)?.[0];
  let base = page;
  try { if (baseTag) base = new URL(decodeHtmlAttribute(getAttribute(baseTag, 'href') || ''), page); } catch {}
  const found = [];

  for (const match of markup.matchAll(/<script\b[^>]*>/gi)) {
    const src = getAttribute(match[0], 'src');
    if (src) found.push({ kind: 'script', rawUrl: decodeHtmlAttribute(src) });
  }

  for (const match of markup.matchAll(/<link\b[^>]*>/gi)) {
    const rel = getAttribute(match[0], 'rel') || '';
    const href = getAttribute(match[0], 'href');

    if (href && rel.toLowerCase().split(/\s+/).includes('stylesheet')) {
      found.push({ kind: 'style', rawUrl: decodeHtmlAttribute(href) });
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
    if (resolved.origin !== page.origin) continue;

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

  try {
    const response = await fetch(asset.url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent': 'ProdDoctor/1.5.0 (+https://github.com/lucaswenbo/ProdDoctor)',
        'cache-control': 'no-cache',
        range: 'bytes=0-0'
      },
      signal: AbortSignal.timeout(timeoutMs)
    });

    const status = response.status;
    const finalUrl = response.url;
    const contentType = response.headers.get('content-type') || '';
    const statusOk = status >= 200 && status < 400;
    const htmlFallback = statusOk
      && contentType.toLowerCase().includes('text/html')
      && ['script', 'style'].includes(asset.kind);
    const mime = contentType.split(';')[0].trim().toLowerCase();
    const expectedMime = asset.kind === 'style'
      ? mime === 'text/css'
      : /^(?:text|application)\/(?:x-)?(?:java|ecma)script$/.test(mime);
    // Keep existing pass/fail semantics; MIME checks are advisory in this patch.
    const warning = statusOk && !htmlFallback && !expectedMime
      ? `Unexpected ${asset.kind} Content-Type: ${mime || '(missing)'} (${asset.url})`
      : null;

    if (response.body) {
      await response.body.cancel();
    }

    return {
      ...asset,
      ok: statusOk && !htmlFallback,
      status,
      finalUrl,
      method: 'GET',
      contentType: contentType || null,
      htmlFallback,
      warning,
      elapsedMs: Math.round(performance.now() - started),
      error: null
    };
  } catch (error) {
    return {
      ...asset,
      ok: false,
      status: null,
      finalUrl: null,
      method: 'GET',
      contentType: null,
      htmlFallback: false,
      elapsedMs: Math.round(performance.now() - started),
      error: error?.message || String(error)
    };
  }
}

export async function checkStaticAssets({
  html,
  pageUrl,
  timeoutMs = 15000,
  maxAssets = 20
}) {
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
