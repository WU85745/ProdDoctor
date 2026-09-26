# ProdDoctor

<p align="center">
  <strong>English</strong> · <a href="./README.zh-CN.md">简体中文</a>
</p>

[![Test ProdDoctor](https://github.com/lucaswenbo/ProdDoctor/actions/workflows/test.yml/badge.svg)](https://github.com/lucaswenbo/ProdDoctor/actions/workflows/test.yml)
[![Smoke test GitHub Action](https://github.com/lucaswenbo/ProdDoctor/actions/workflows/action-smoke.yml/badge.svg)](https://github.com/lucaswenbo/ProdDoctor/actions/workflows/action-smoke.yml)
[![Browser smoke test](https://github.com/lucaswenbo/ProdDoctor/actions/workflows/browser-smoke.yml/badge.svg)](https://github.com/lucaswenbo/ProdDoctor/actions/workflows/browser-smoke.yml)
![Version](https://img.shields.io/badge/version-v2.0.0-2563eb)
![License](https://img.shields.io/badge/license-MIT-16a34a)

<p align="center">
  <img src=".github/assets/proddoctor-hero.svg" alt="ProdDoctor - post-deploy production validation" width="100%">
</p>

**Your deploy passed. But does production actually work?**

```text
CI / build          ✅
Deploy command      ✅
Platform URL        ✅
Real production     ❌
```

ProdDoctor checks the site your users actually reach after deployment, then helps narrow down **where production broke**.

It validates DNS, HTTP, TLS, expected page content, same-origin assets, Cloudflare/WAF behavior, and optional real Chromium runtime behavior. When something fails, it can preserve evidence such as failed requests, screenshots, Playwright traces, and HTML/JSON reports.

> **Green CI proves your pipeline finished. ProdDoctor checks whether the production experience actually works.**

## 30-second setup

This is a **GitHub Actions step**, not a terminal command. Put it in the repository of the website you want to validate, inside a workflow such as `.github/workflows/production-check.yml` under a job's `steps:`.

```yaml
- uses: lucaswenbo/ProdDoctor@v2.0.0
  with:
    url: https://example.com
    expect: My Website
```

No Cloudflare API token is required, and you do not need to modify your deployment platform configuration.

Human-readable output defaults to **English**. Use `language: zh-CN` only when you want Chinese output.

### A typical production failure

<p align="center">
  <img src=".github/assets/proddoctor-demo.svg" alt="ProdDoctor detects a real production-domain failure after CI passes" width="100%">
</p>

In the example above, the build, deployment, and platform URL all pass, but the real production domain returns a Cloudflare 403. ProdDoctor does not report only a generic failure: DNS is healthy, HTTP fails with 403, and Cloudflare Challenge / WAF is flagged as the likely failure layer. It then keeps report evidence for debugging before users have to report the outage first.

## Why this is different from a normal uptime check

A normal health check can tell you that a URL returned `200`. ProdDoctor is aimed at the awkward failures that happen **after a deployment looks successful**:

- the custom domain reaches the wrong route or Worker
- a Cloudflare/WAF rule blocks the production path
- HTML returns `200`, but a JS/CSS asset is broken
- the server response is healthy, but Chromium hits a runtime error
- the page is the wrong version even though the status code is successful

The goal is not only to say **red or green**. It is to leave enough evidence to make the next debugging step obvious.

## What ProdDoctor checks

- DNS resolution
- Real production URL and final HTTP status
- Expected page text, catching “HTTP 200 but wrong page” failures
- Final URL after redirects
- Common Cloudflare Challenge / WAF blocking patterns
- TLS certificate chain and remaining lifetime
- Same-origin JavaScript and CSS availability
- JS/CSS routes that incorrectly return HTML
- Optional Playwright + Chromium browser validation
- Uncaught JavaScript errors
- Critical same-origin browser request failures
- Rendered-text assertions with `browser_expect`
- Full-page screenshots
- Playwright Trace
- Unified evidence artifacts
- Standalone HTML and JSON production reports
- Desktop and mobile browser presets
- `CF-Ray`, `CF-Cache-Status`, and server response metadata
- `robots.txt` and `sitemap.xml`
- Common security response headers
- Request timing, retries, and JSON output
- GitHub Actions Job Summary

> v2.0.0 keeps lightweight HTTP validation as the default. Enable browser mode only when you need real Chromium execution, mobile evidence, screenshots, traces, or rendered-page assertions.

---

# Method 1: GitHub Actions

This is the recommended way to use ProdDoctor. Run it after deployment so the workflow validates the real production domain.

## Step 1: Open your project repository

For example:

```text
your-name/your-website
```

## Step 2: Create a workflow file

Create:

```text
.github/workflows/production-check.yml
```

## Step 3: Add the workflow

```yaml
name: Check production website

on:
  workflow_dispatch:

jobs:
  check:
    runs-on: ubuntu-latest

    steps:
      - uses: lucaswenbo/ProdDoctor@v2.0.0
        with:
          url: https://example.com
```

Replace `https://example.com` with your real production URL.

## Step 4: Commit the file

Open **Actions**, select **Check production website**, and click **Run workflow**.

ProdDoctor will access your production site directly from the GitHub-hosted runner.

## Step 5: Read the result

A successful run stays green and ProdDoctor writes a summary to the GitHub Actions Job Summary.

Human-readable output defaults to English. A typical successful result looks like:

```text
🩺 ProdDoctor production check
Target：https://example.com/
Result：✅ PASS

✅ DNS：93.184.216.34
✅ Page：200，143ms，1 attempt(s)
⚠️ robots.txt：HTTP 404
✅ sitemap.xml：HTTP 200
🛡️ Security headers：60/100
```

---

# Recommended: verify the page is actually the expected version

HTTP 200 alone is not enough. A wrong Worker, stale cache, or incorrect route may still return a successful response.

Use `expect` to require a known string in the server-returned HTML:

```yaml
name: Check production website

on:
  workflow_dispatch:

jobs:
  check:
    runs-on: ubuntu-latest

    steps:
      - uses: lucaswenbo/ProdDoctor@v2.0.0
        with:
          url: https://example.com
          expect: My Website
```

If the page returns HTTP 200 but does not contain `My Website`, the check fails.

### Notes about `expect`

`expect` currently:

- Is case-sensitive
- Does not support regular expressions
- Checks the raw HTML returned by the server
- Does not see text generated later by client-side JavaScript

For React/Vue-style applications, choose stable server HTML such as a title, meta value, version marker, or another static string. For rendered text, use `browser_expect`.

---

# Recommended: validate immediately after deployment

ProdDoctor works best directly after your deployment step:

```yaml
name: Deploy and verify

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262

      # Your existing build and deployment steps:
      # - run: npm ci
      # - run: npm run build
      # - run: your-deploy-command

      - name: Verify real production domain
        uses: lucaswenbo/ProdDoctor@v2.0.0
        with:
          url: https://example.com
          expect: My Website
          retries: 2
          timeout: 15000
```

The workflow remains successful only if the real production address passes validation.

---

# Browser mode: catch pages that return 200 but are actually broken

Some failures only appear after JavaScript runs:

```text
HTML              ✅ 200
app.js            ✅ 200
TLS               ✅
Browser render    ❌ white screen
pageerror         ❌ Cannot read properties of undefined
```

Enable browser mode:

```yaml
- uses: lucaswenbo/ProdDoctor@v2.0.0
  with:
    url: https://example.com
    browser: true
```

The GitHub Action installs Playwright and Chromium in a temporary runner directory. It does not modify your project dependencies.

Browser mode currently checks:

- Main document navigation in Chromium
- Uncaught JavaScript `pageerror`
- Same-origin document/script/stylesheet request failures
- Same-origin critical 4xx/5xx responses
- Page title
- Rendered visible-text length
- Optional `browser_expect`
- Console errors
- Full-page screenshot

### Check rendered text

```yaml
with:
  url: https://example.com
  browser: true
  browser_expect: Dashboard
```

The difference:

- `expect` checks raw server HTML
- `browser_expect` checks visible text after Chromium renders the page

### Console errors are warnings by default

Many sites produce non-critical console errors from third-party scripts or compatibility quirks. By default, ProdDoctor records console errors without failing the workflow.

To make any console error blocking:

```yaml
with:
  url: https://example.com
  browser: true
  browser_fail_console: true
```

Uncaught JavaScript `pageerror` remains blocking.

### Evidence Artifact

v2.0.0 stores browser evidence in an isolated artifact:

```text
proddoctor-evidence-<job>-<unique-id>/
├── browser.png
├── report.html
├── report.json
└── trace.zip        # depends on browser_trace
```

- `browser.png`: full-page screenshot
- `report.html`: human-readable production report
- `report.json`: machine-readable report
- `trace.zip`: Playwright Trace for page loading, DOM snapshots, and network activity

Artifacts are retained for 7 days by default.

Each invocation gets its own temporary directory and unique artifact name, so repeated calls and matrix jobs do not overwrite one another.

If a later step needs the evidence files, assign the Action an `id`, then read:

```text
steps.doctor.outputs.evidence_dir
steps.doctor.outputs.evidence_name
```

### Desktop / mobile profiles

Default desktop viewport:

```yaml
browser_profile: desktop
```

```text
1440 × 900
```

Mobile preset:

```yaml
with:
  url: https://example.com
  browser: true
  browser_profile: mobile
```

```text
390 × 844
touch enabled
mobile viewport enabled
```

This is useful for production failures that only appear on smaller screens or touch/mobile layouts.

### Playwright Trace

`browser_trace` supports:

| Value | Behavior |
|---|---|
| `off` | Do not record a trace |
| `on-failure` | Default; keep the trace only when the browser check fails |
| `always` | Keep a trace for every run |

Recommended:

```yaml
browser_trace: on-failure
```

To retain every trace:

```yaml
browser_trace: always
```

### Production Report

Browser mode generates:

```text
report.html
report.json
```

The HTML report includes:

- Overall PASS / FAIL
- DNS
- HTTP
- Cloudflare / WAF
- TLS
- Same-origin JS/CSS
- Browser profile and viewport
- `pageerror`
- Console errors
- Critical network failures
- Screenshot link
- Trace link
- Failures and warnings

Disable report generation with:

```yaml
upload_report: false
```

### Why is browser mode not enabled by default?

Launching Chromium adds runtime and resource cost.

ProdDoctor intentionally keeps two layers:

```text
Default
DNS + HTTP + TLS + JS/CSS + Cloudflare
        ↓
Deeper validation when needed
Playwright + Chromium
```

Static sites stay lightweight, while frontend applications can opt into real browser validation.

---

# Version and stability

The current public stable release is **v2.0.0**.

- For normal evaluation and first-time integration, use `lucaswenbo/ProdDoctor@v2.0.0`.
- For production gates, pin the Action to the **full commit SHA** behind the release tag.
- `@main` tracks current development and may change at any time. It is not recommended for production gating.
- Concrete release tags such as `v2.0.0` are immutable after publication. Fixes should be released as a new patch, for example `v2.0.1`.
- A floating major tag such as `v1` may point to the latest stable 1.x release, but it moves and is therefore not appropriate for environments that require strict reproducibility.
- Features may still evolve quickly. Check [CHANGELOG.md](CHANGELOG.md) before upgrading.

## How to pin a version

| Reference | Best for | Stability |
|---|---|---|
| `lucaswenbo/ProdDoctor@main` | Development, experimentation, latest code | Moves with `main`; not recommended for production gates |
| `lucaswenbo/ProdDoctor@v2.0.0` | Recommended starting point | Concrete release tag; immutable by project policy |
| `lucaswenbo/ProdDoctor@<commit-sha>` | Production and reproducible CI | Most stable; pins one exact commit |

For production:

```yaml
- uses: lucaswenbo/ProdDoctor@<commit-sha>
  with:
    url: https://example.com
```

Do not copy `<commit-sha>` literally. Open the GitHub Release or tag page for `v2.0.0`, follow it to the corresponding commit, and copy the full SHA. If you have the tag locally, you can also run:

```bash
git rev-list -n 1 v2.0.0
```

Then replace the placeholder in your workflow.


# Compatibility policy

ProdDoctor follows SemVer and tries to keep existing workflows behaving as originally configured.

- Existing Action inputs are additive. They are not casually renamed or repurposed.
- A default-value change, stricter failure condition, or incompatible parameter-semantic change that breaks existing workflow behavior is treated as a **breaking change** and requires a major version bump.
- New checks should preferably begin as warnings or explicit opt-ins.
- Boolean inputs accept only `true` or `false`.
- Review [CHANGELOG.md](CHANGELOG.md) before upgrading, especially `Changed` and breaking-change notes.

---

# Inputs

| Input | Required | Default | Purpose |
|---|---|---|---|
| `url` | Yes | None | Production URL to validate |
| `language` | No | `en` | Human-readable output language: `en` or `zh-CN` |
| `expect` | No | Empty | Raw HTML must contain this text |
| `status` | No | Empty | Final HTTP status must exactly match |
| `retries` | No | Action: `2`; CLI: `1` | Additional retries after failure |
| `timeout` | No | `15000` | HTTP request timeout in milliseconds |
| `max_body_bytes` | No | `0` | Maximum response body size; 0 preserves unlimited legacy behavior. For untrusted targets, consider `5242880` (5 MiB) |
| `check_assets` | No | `true` | Validate same-origin JS/CSS |
| `max_assets` | No | `20` | Maximum number of same-origin JS/CSS assets |
| `tls_warn_days` | No | `14` | Warn when the certificate has this many days remaining |
| `browser` | No | `false` | Enable Playwright + Chromium |
| `browser_expect` | No | Empty | Rendered visible text must contain this value |
| `browser_timeout` | No | `30000` | Browser navigation timeout in milliseconds |
| `browser_settle` | No | `750` | Extra wait after DOMContentLoaded |
| `browser_fail_console` | No | `false` | Treat console errors as blocking |
| `browser_profile` | No | `desktop` | `desktop` or `mobile` |
| `browser_trace` | No | `on-failure` | `off`, `on-failure`, or `always` |
| `upload_screenshot` | No | `true` | Save a full-page screenshot |
| `upload_report` | No | `true` | Generate HTML + JSON reports |

### How retries are counted

```yaml
retries: 2
```

means:

1. Initial request
2. One retry if it fails
3. One final retry if it still fails

Maximum: 3 attempts.

This helps when a CDN or edge deployment needs a short propagation window.

---

# Method 2: run locally

The default HTTP mode has no third-party npm runtime dependencies. Browser mode requires Playwright. Human-readable CLI output defaults to English. Add `--lang zh-CN` when you want Chinese terminal, Job Summary, and HTML report output.

## Step 1: Node.js

```bash
node --version
```

Node.js 20 or newer is required.

## Step 2: Clone

```bash
git clone https://github.com/lucaswenbo/ProdDoctor.git
cd ProdDoctor
```

## Step 3: Check a site

```bash
node ./bin/proddoctor.mjs https://example.com
```

You can omit the protocol:

```bash
node ./bin/proddoctor.mjs example.com
```

ProdDoctor will default to HTTPS.

## Step 4: Add a content assertion

```bash
node ./bin/proddoctor.mjs https://example.com \
  --expect "Example Domain"
```

## Step 5: Add retries

```bash
node ./bin/proddoctor.mjs https://example.com \
  --retries 2
```

## Browser mode locally

Install Playwright:

```bash
npm install --no-save playwright
npx playwright install chromium
```

Then:

```bash
node ./bin/proddoctor.mjs https://example.com \
  --browser \
  --browser-expect "Example Domain" \
  --browser-profile mobile \
  --browser-screenshot ./production.png \
  --browser-trace on-failure \
  --browser-trace-path ./trace.zip \
  --html-report ./report.html \
  --json-file ./report.json
```

Fail on any console error:

```bash
node ./bin/proddoctor.mjs https://example.com \
  --browser \
  --browser-fail-console
```

Set a 20-second HTTP timeout:

```bash
node ./bin/proddoctor.mjs https://example.com \
  --timeout 20000
```

---

# JSON output

Print JSON:

```bash
node ./bin/proddoctor.mjs https://example.com --json
```

The result contains:

- Check time
- Target URL
- DNS addresses
- HTTP status
- Final URL
- Request duration
- Cloudflare metadata
- Security headers
- `robots.txt`
- `sitemap.xml`
- Warnings
- Failures
- Final `ok` state

Save to a file:

```bash
node ./bin/proddoctor.mjs https://example.com \
  --json-file proddoctor-report.json
```

Or print and save:

```bash
node ./bin/proddoctor.mjs https://example.com \
  --json \
  --json-file proddoctor-report.json
```

---

# What makes the check fail?

The current version fails when:

1. DNS resolution fails
2. The production page request fails
3. Final HTTP status is invalid
4. `expect` is configured but missing
5. A typical Cloudflare Challenge / WAF block is detected
6. TLS certificate-chain validation fails
7. Same-origin JS/CSS is unavailable or incorrectly returns HTML
8. Browser mode sees an uncaught JavaScript error
9. Critical same-origin document/script/stylesheet requests fail or return 4xx/5xx
10. `browser_expect` is missing from rendered visible text
11. `browser_fail_console` is enabled and a console error occurs

These are currently warnings rather than standalone blocking failures:

- Missing `robots.txt`
- Missing `sitemap.xml`
- Missing common security response headers
- HTTP instead of HTTPS
- Redirect to another origin

This keeps ordinary SEO/security hints from unexpectedly blocking deployment.

---

# Cloudflare sites

ProdDoctor recognizes common Cloudflare Challenge patterns.

If the response status is:

```text
403
429
503
```

and the body contains markers such as:

```text
Just a moment...
/cdn-cgi/challenge-platform
cf-chl-
Enable JavaScript and cookies to continue
```

ProdDoctor reports a likely Cloudflare Challenge / WAF block.

A normal HTTP 200 page does **not** fail only because it contains a `challenge-platform` string. The block classification requires both a typical blocking status and Challenge markers.

This is heuristic detection, not a replacement for Cloudflare WAF logs.

---

# Redirects

ProdDoctor follows HTTP redirects automatically.

Example:

```text
https://example.com
        ↓
https://www.example.com
```

The report shows the final URL.

If the final destination moves to another origin, ProdDoctor also emits a warning.

`robots.txt` and `sitemap.xml` are checked against the final page origin.

---

# Security-header score

ProdDoctor checks for:

- `Strict-Transport-Security`
- `Content-Security-Policy`
- `X-Content-Type-Options`
- `Referrer-Policy`
- `Permissions-Policy`

It may show a simple coverage score such as:

```text
Security headers: 60/100
```

This only measures the presence of those five headers. It is not a complete security score and does not block the workflow by itself.

---

# Exit codes

| Exit code | Meaning |
|---:|---|
| `0` | Main production checks passed |
| `1` | Production validation failed, or no URL was provided |
| `2` | Invalid arguments, URL, or startup configuration |

GitHub Actions uses the exit code to determine whether the step succeeds.

---

# FAQ

## 1. `ENOTFOUND`

```text
getaddrinfo ENOTFOUND example.com
```

Usually means the runner cannot resolve the hostname.

Check:

1. Domain spelling
2. DNS propagation
3. Whether the hostname is private/internal-only
4. Whether GitHub-hosted runners can reach the DNS service

## 2. `EAI_AGAIN`

Usually indicates a temporary DNS lookup failure.

Increasing:

```yaml
retries: 2
```

may help page requests, but the current retry setting mainly applies to HTTP page requests. DNS lookup itself is not repeatedly retried, so persistent DNS errors should be investigated at the DNS layer.

## 3. The site opens, but `expect` fails

Common causes:

- Case mismatch
- Page changed
- Text is only generated after JavaScript runs
- CDN returned another version
- Request reached the wrong route or Worker

Inspect the raw HTML and choose a stable static marker, or use `browser_expect` for rendered text.

## 4. `robots.txt` or `sitemap.xml` returns 404

These are warnings only. A site is not failed simply because one of these files is absent.

## 5. Cloudflare returns 403

If the report also detects Challenge markers, check:

- Custom WAF rules
- Bot protection
- Managed Challenge
- IP / ASN restrictions
- Country/region restrictions
- Rate limits
- Access / Zero Trust rules

ProdDoctor does not modify Cloudflare. It only reports what a public client observes.

## 6. The site requires login

The current version does not provide cookies, Authorization headers, or an automated login flow.

ProdDoctor is currently best suited to public production pages.

Never place passwords, access tokens, signed URLs, or sensitive query strings directly into a public workflow.

---

# Current limitations

ProdDoctor does not yet include:

- Authenticated interaction flows and form scripting
- Multi-browser matrix, currently Chromium only
- Arbitrary viewport matrix, currently desktop/mobile presets
- Playwright Video
- Lighthouse / Core Web Vitals
- Logged-in page support
- Custom request headers
- Multi-URL batch configuration

These can be added in future releases.

---

# Project structure

```text
ProdDoctor/
├── action.yml
├── bin/
│   └── proddoctor.mjs
├── src/
│   ├── checker.mjs
│   ├── assets.mjs
│   ├── tls.mjs
│   ├── browser.mjs
│   ├── report.mjs
│   └── html-report.mjs
├── test/
│   └── checker.test.mjs
├── examples/
│   ├── production-check.yml
│   └── browser-check.yml
└── .github/workflows/
    ├── test.yml
    ├── action-smoke.yml
    └── browser-smoke.yml
```

---

# Development and testing

Run:

```bash
npm run check
```

This performs syntax checks, version-consistency validation, and unit tests.

Run tests only:

```bash
npm test
```

The maintainer release process is automated. Normal development uses Conventional Commit / PR titles. Release Please creates a Draft Release PR, and version synchronization, SemVer policy, unit checks, Action smoke tests, and Chromium smoke tests must pass before it is marked Ready. See [docs/releasing.md](docs/releasing.md).

The repository includes smoke tests for:

- Default lightweight mode
- `expect + status`
- Disabling asset validation
- Real Playwright + Chromium browser mode
- `browser_expect`
- Browser evidence artifacts

---

# Roadmap

- [ ] Login flows and programmable browser steps
- [ ] Custom viewport / multi-device matrix
- [ ] Playwright Video
- [ ] Multi-URL batch checks
- [ ] Lighthouse / Core Web Vitals
- [ ] PR comment reports
- [ ] npm publishing

---

# Privacy and security

ProdDoctor:

- Does not require a Cloudflare API token
- Does not read your Cloudflare account
- Does not modify your site configuration
- Does not modify DNS
- Does not modify WAF
- Makes public HTTP requests from the environment where it runs

Do not place passwords, access tokens, private signatures, or sensitive query parameters in public GitHub workflows.

Screenshots, traces, reports, and logs may also contain page content, query parameters, or network responses. Treat them as potentially sensitive data.

Do not pass arbitrary URLs from untrusted external pull requests to a runner that has access to internal networks or deployment credentials.

For backward compatibility, response-size limiting is disabled by default. You can set:

```yaml
max_body_bytes: 5242880
```

or use:

```bash
--max-body-bytes 5242880
```

A response that exceeds the configured limit fails explicitly instead of being silently truncated and treated as valid.

Uncommon JavaScript/CSS MIME types currently produce warnings. 4xx/5xx responses and HTML fallbacks remain blocking under the existing rules.

Asset extraction is intentionally lightweight rather than a full browser HTML parser. Use `browser: true` for dynamically loaded resources and runtime behavior.

---

# License

MIT License
