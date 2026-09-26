# Changelog

所有值得记录的变更都集中在这里。格式遵循 Keep a Changelog 的组织方式，版本号遵循 SemVer。

## [2.1.0](https://github.com/lucaswenbo/ProdDoctor/compare/v2.0.1...v2.1.0) (2026-09-26)


### Features

* add likely cause summary ([1e9ff8e](https://github.com/lucaswenbo/ProdDoctor/commit/1e9ff8ed043de3bc80484b5225de5157b59635ef))

## [2.0.1](https://github.com/lucaswenbo/ProdDoctor/compare/v2.0.0...v2.0.1) (2026-09-26)


### Bug Fixes

* localize JSON diagnostics ([0628567](https://github.com/lucaswenbo/ProdDoctor/commit/06285672b2d301a774227f6758d8b82c4b380555))

## [2.0.0](https://github.com/lucaswenbo/ProdDoctor/compare/v1.5.0...v2.0.0) (2026-09-26)


### ⚠ BREAKING CHANGES

* default human-readable output language is now English.

### Features

* make English the default output language ([5709c0e](https://github.com/lucaswenbo/ProdDoctor/commit/5709c0e9cb84276d95fdbe04dbd81c8fc36e5b2a))

## [1.5.0](https://github.com/lucaswenbo/ProdDoctor/compare/v1.4.1...v1.5.0) (2026-09-26)


### Features

* add bilingual output and improve onboarding ([64fcf1a](https://github.com/lucaswenbo/ProdDoctor/commit/64fcf1acfa707e04f8807f5f609ecf6497869731))

## [1.4.1](https://github.com/lucaswenbo/ProdDoctor/compare/v1.4.0...v1.4.1) (2026-09-25)


### Bug Fixes

* correct validation edge cases and guard release automation ([d9f2774](https://github.com/lucaswenbo/ProdDoctor/commit/d9f277456ccaa77f5ff2af820a88980e66d9ca6b))
* synchronize releases without workflow write permission ([2efcc54](https://github.com/lucaswenbo/ProdDoctor/commit/2efcc541088a0991990f6af75739f472b208713a))

## [Unreleased]

## [1.4.0]

> 当前建议用户引用的具体版本为 `v1.4.0`。只有在对应 Git tag 已发布后，`lucaswenbo/ProdDoctor@v1.4.0` 才会成为可解析的 Action 引用。

### Added

- Add desktop and mobile browser profiles.
- Add Playwright Trace recording with `off`, `on-failure`, and `always` modes.
- Add standalone HTML Production Reports.
- Bundle browser screenshot, JSON report, HTML report, and Trace into one evidence artifact.
- Add regression tests for HTML escaping and report evidence links.
- Expand browser smoke tests to verify mobile mode and all generated evidence files.

### Changed

- Keep Trace retention failure-oriented by default to reduce artifact noise.
- User-facing documentation and examples now pin the concrete release tag `v1.4.0` instead of `main`.
- Document version pinning, commit-SHA production guidance, and compatibility expectations.

## [0.3.0]

### Added

- Add optional Playwright + Chromium browser validation.
- Detect uncaught JavaScript page errors.
- Track same-origin critical document, script and stylesheet failures in the browser.
- Track same-origin critical 4xx/5xx browser responses.
- Add rendered-text assertions with `browser_expect`.
- Record Console errors and optionally fail on them.
- Capture full-page screenshots and upload them as GitHub Actions artifacts.
- Install Playwright in an isolated runner temp directory instead of modifying the user's project dependencies.
- Add a real Chromium smoke-test workflow.

### Changed

- Keep browser mode opt-in so the default HTTP checks remain lightweight.

## [0.2.0]

### Added

- Add TLS certificate-chain and expiry checks.
- Check same-origin JavaScript and stylesheet assets after the main page loads.
- Detect JS/CSS URLs that incorrectly return HTML.
- Add optional exact final HTTP status validation.
- Add GitHub Action inputs for asset checks and TLS warning thresholds.
- Extend JSON and GitHub Actions summaries with TLS and asset results.
- Expand regression and Action smoke tests.

## [0.1.0]

### Added

- Initial public release.
- DNS, HTTP, redirects, expected-content checks and Cloudflare Challenge/WAF detection.
- GitHub Action, CLI, JSON output and Job Summary support.
