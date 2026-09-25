# Changelog

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
