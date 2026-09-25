# Changelog

## 1.4.0

- Add desktop and mobile browser profiles.
- Add Playwright Trace recording with `off`, `on-failure`, and `always` modes.
- Add standalone HTML Production Reports.
- Bundle browser screenshot, JSON report, HTML report, and Trace into one evidence artifact.
- Keep Trace retention failure-oriented by default to reduce artifact noise.
- Add regression tests for HTML escaping and report evidence links.
- Expand browser smoke tests to verify mobile mode and all generated evidence files.

## 0.3.0

- Add optional Playwright + Chromium browser validation.
- Detect uncaught JavaScript page errors.
- Track same-origin critical document, script and stylesheet failures in the browser.
- Track same-origin critical 4xx/5xx browser responses.
- Add rendered-text assertions with `browser_expect`.
- Record Console errors and optionally fail on them.
- Capture full-page screenshots and upload them as GitHub Actions artifacts.
- Keep browser mode opt-in so the default HTTP checks remain lightweight.
- Install Playwright in an isolated runner temp directory instead of modifying the user's project dependencies.
- Add a real Chromium smoke-test workflow.

## 0.2.0

- Add TLS certificate-chain and expiry checks.
- Check same-origin JavaScript and stylesheet assets after the main page loads.
- Detect JS/CSS URLs that incorrectly return HTML.
- Add optional exact final HTTP status validation.
- Add GitHub Action inputs for asset checks and TLS warning thresholds.
- Extend JSON and GitHub Actions summaries with TLS and asset results.
- Expand regression and Action smoke tests.

## 0.1.0

- Initial public release.
- DNS, HTTP, redirects, expected-content checks and Cloudflare Challenge/WAF detection.
- GitHub Action, CLI, JSON output and Job Summary support.
