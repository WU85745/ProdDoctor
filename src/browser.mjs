import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

async function loadPlaywright() {
  const explicitDir = process.env.PRODDOCTOR_PLAYWRIGHT_DIR;
  if (explicitDir) {
    const require = createRequire(`${explicitDir}/package.json`);
    return require('playwright');
  }

  try {
    return await import('playwright');
  } catch {
    throw new Error(
      '浏览器检查需要 Playwright。GitHub Action 会自动安装；本地使用请先运行 npm install --no-save playwright && npx playwright install chromium'
    );
  }
}

function isSameOrigin(url, origin) {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function compactMessage(value, max = 500) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function contextOptions(profile) {
  if (profile === 'mobile') {
    return {
      ignoreHTTPSErrors: false,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3
    };
  }

  return {
    ignoreHTTPSErrors: false,
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1
  };
}

async function stopTrace(context, { traceMode, tracePath, shouldKeep }) {
  if (!context || traceMode === 'off') {
    return { path: null, error: null };
  }

  try {
    if (shouldKeep && tracePath) {
      const resolved = path.resolve(tracePath);
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await context.tracing.stop({ path: resolved });
      return { path: resolved, error: null };
    }

    await context.tracing.stop();
    return { path: null, error: null };
  } catch (error) {
    return { path: null, error: compactMessage(error?.message || error) };
  }
}

export async function runBrowserCheck(rawUrl, options = {}) {
  const target = new URL(rawUrl);
  const timeoutMs = options.timeoutMs ?? 30000;
  const renderedExpect = options.renderedExpect ?? '';
  const failConsoleErrors = options.failConsoleErrors ?? false;
  const screenshotPath = options.screenshotPath ?? null;
  const settleMs = options.settleMs ?? 750;
  const profile = options.profile ?? 'desktop';
  const traceMode = options.traceMode ?? 'off';
  const tracePath = options.tracePath ?? null;

  if (!['desktop', 'mobile'].includes(profile)) {
    throw new Error('浏览器 profile 只支持 desktop 或 mobile');
  }
  if (!['off', 'on-failure', 'always'].includes(traceMode)) {
    throw new Error('browser trace 只支持 off、on-failure 或 always');
  }

  const pageErrors = [];
  const consoleErrors = [];
  const requestFailures = [];
  const badResponses = [];

  let browser;
  let context;
  let traceStarted = false;
  let traceSavedPath = null;
  let traceError = null;

  try {
    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({ headless: true });

    const ctxOptions = contextOptions(profile);
    context = await browser.newContext(ctxOptions);

    if (traceMode !== 'off') {
      await context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: false
      });
      traceStarted = true;
    }

    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);

    page.on('pageerror', (error) => {
      pageErrors.push(compactMessage(error?.message || error));
    });

    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(compactMessage(message.text()));
      }
    });

    page.on('requestfailed', (request) => {
      requestFailures.push({
        url: request.url(),
        resourceType: request.resourceType(),
        errorText: compactMessage(request.failure()?.errorText || 'request failed')
      });
    });

    page.on('response', (response) => {
      if (response.status() < 400) return;
      badResponses.push({
        url: response.url(),
        status: response.status(),
        resourceType: response.request().resourceType()
      });
    });

    const response = await page.goto(target.href, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs
    });

    if (settleMs > 0) {
      await page.waitForTimeout(settleMs);
    }

    const finalUrl = page.url();
    const finalOrigin = new URL(finalUrl).origin;
    const finalRequestFailures = requestFailures.filter((item) => isSameOrigin(item.url, finalOrigin));
    const finalBadResponses = badResponses.filter((item) => isSameOrigin(item.url, finalOrigin));

    const criticalTypes = new Set(['document', 'script', 'stylesheet']);
    const criticalRequestFailures = finalRequestFailures.filter((item) => criticalTypes.has(item.resourceType));
    const criticalBadResponses = finalBadResponses.filter((item) => criticalTypes.has(item.resourceType));

    const title = await page.title();
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const textLength = bodyText.trim().length;
    const renderedExpectOk = renderedExpect ? bodyText.includes(renderedExpect) : true;

    const failures = [];

    if (!response) {
      failures.push('浏览器导航没有收到主文档响应');
    } else if (response.status() >= 400) {
      failures.push(`浏览器主文档返回 HTTP ${response.status()}`);
    }

    if (pageErrors.length) {
      failures.push(`页面运行时出现 ${pageErrors.length} 个未捕获 JavaScript 异常`);
    }

    if (criticalRequestFailures.length) {
      failures.push(`浏览器中有 ${criticalRequestFailures.length} 个关键同源请求失败`);
    }

    if (criticalBadResponses.length) {
      failures.push(`浏览器中有 ${criticalBadResponses.length} 个关键同源资源返回 4xx/5xx`);
    }

    if (!renderedExpectOk) {
      failures.push('浏览器渲染后的页面未包含指定文本');
    }

    if (failConsoleErrors && consoleErrors.length) {
      failures.push(`浏览器 Console 出现 ${consoleErrors.length} 条 error`);
    }

    const warnings = [];
    if (!failConsoleErrors && consoleErrors.length) {
      warnings.push(`浏览器 Console 出现 ${consoleErrors.length} 条 error（当前仅提示）`);
    }
    if (textLength === 0) {
      warnings.push('页面渲染后 body 可见文本为空');
    }

    let savedScreenshot = null;
    let screenshotError = null;
    if (screenshotPath) {
      try {
        const resolved = path.resolve(screenshotPath);
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        await page.screenshot({ path: resolved, fullPage: true });
        savedScreenshot = resolved;
      } catch (error) {
        screenshotError = compactMessage(error?.message || error);
        warnings.push(`截图保存失败：${screenshotError}`);
      }
    }

    if (traceStarted) {
      const keepTrace = traceMode === 'always'
        || (traceMode === 'on-failure' && (failures.length > 0 || options.retainTrace));
      const traceResult = await stopTrace(context, {
        traceMode,
        tracePath,
        shouldKeep: keepTrace
      });
      traceSavedPath = traceResult.path;
      traceError = traceResult.error;
      traceStarted = false;

      if (traceError) {
        warnings.push(`Trace 保存失败：${traceError}`);
      }
    }

    await context.close();
    context = null;

    return {
      checked: true,
      ok: failures.length === 0,
      profile,
      viewport: ctxOptions.viewport,
      finalUrl,
      mainStatus: response?.status() ?? null,
      title,
      textLength,
      renderedExpect: renderedExpect || null,
      renderedExpectOk,
      pageErrors,
      consoleErrors,
      requestFailures: finalRequestFailures,
      badResponses: finalBadResponses,
      criticalRequestFailures,
      criticalBadResponses,
      screenshotPath: savedScreenshot,
      screenshotError,
      traceMode,
      tracePath: traceSavedPath,
      traceError,
      failures,
      warnings,
      error: null
    };
  } catch (error) {
    const warnings = [];

    if (traceStarted && context) {
      const traceResult = await stopTrace(context, {
        traceMode,
        tracePath,
        shouldKeep: true
      });
      traceSavedPath = traceResult.path;
      traceError = traceResult.error;
      traceStarted = false;
      if (traceError) warnings.push(`Trace 保存失败：${traceError}`);
    }

    return {
      checked: true,
      ok: false,
      profile,
      viewport: contextOptions(profile).viewport,
      finalUrl: null,
      mainStatus: null,
      title: null,
      textLength: null,
      renderedExpect: renderedExpect || null,
      renderedExpectOk: renderedExpect ? false : true,
      pageErrors,
      consoleErrors,
      requestFailures,
      badResponses,
      criticalRequestFailures: [],
      criticalBadResponses: [],
      screenshotPath: null,
      screenshotError: null,
      traceMode,
      tracePath: traceSavedPath,
      traceError,
      failures: ['浏览器检查无法完成'],
      warnings,
      error: error?.message || String(error)
    };
  } finally {
    if (context) {
      if (traceStarted) {
        await stopTrace(context, {
          traceMode,
          tracePath,
          shouldKeep: true
        }).catch(() => {});
      }
      await context.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

export function skippedBrowser(reason = '未启用浏览器检查') {
  return {
    checked: false,
    ok: true,
    reason,
    profile: null,
    viewport: null,
    finalUrl: null,
    mainStatus: null,
    title: null,
    textLength: null,
    renderedExpect: null,
    renderedExpectOk: true,
    pageErrors: [],
    consoleErrors: [],
    requestFailures: [],
    badResponses: [],
    criticalRequestFailures: [],
    criticalBadResponses: [],
    screenshotPath: null,
    screenshotError: null,
    traceMode: 'off',
    tracePath: null,
    traceError: null,
    failures: [],
    warnings: [],
    error: null
  };
}
