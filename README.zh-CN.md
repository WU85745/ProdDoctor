# ProdDoctor

<p align="center">
  <a href="./README.md">English</a> · <strong>简体中文</strong>
</p>

[![Test ProdDoctor](https://github.com/lucaswenbo/ProdDoctor/actions/workflows/test.yml/badge.svg)](https://github.com/lucaswenbo/ProdDoctor/actions/workflows/test.yml)
[![Smoke test GitHub Action](https://github.com/lucaswenbo/ProdDoctor/actions/workflows/action-smoke.yml/badge.svg)](https://github.com/lucaswenbo/ProdDoctor/actions/workflows/action-smoke.yml)
[![Browser smoke test](https://github.com/lucaswenbo/ProdDoctor/actions/workflows/browser-smoke.yml/badge.svg)](https://github.com/lucaswenbo/ProdDoctor/actions/workflows/browser-smoke.yml)
![Version](https://img.shields.io/badge/version-v1.4.1-2563eb)
![License](https://img.shields.io/badge/license-MIT-16a34a)

<p align="center">
  <img src=".github/assets/proddoctor-hero.svg" alt="ProdDoctor - post-deploy production validation" width="100%">
</p>

## 部署成功了，但生产环境真的能用吗？

```text
CI / 构建          ✅
部署命令           ✅
平台默认地址       ✅
真实生产域名       ❌
```

ProdDoctor 就是专门检查这段“最后一公里”的。

它会验证**用户部署后真正访问到的生产站点**，并帮助把故障范围缩小到 DNS、HTTP、TLS、同源静态资源、Cloudflare/WAF，或可选的 Chromium 运行时层。

开启浏览器模式后，还可以保留故障现场证据：截图、Playwright Trace、失败请求以及 HTML/JSON 报告。

> **CI 变绿只能说明流水线跑完了。ProdDoctor 检查的是生产环境到底能不能真的工作。**

## 30 秒接入

```yaml
- uses: lucaswenbo/ProdDoctor@v1.4.1
  with:
    url: https://example.com
    expect: My Website
    language: zh-CN
```

不需要 Cloudflare API Token，也不需要修改部署平台配置。人类可读输出默认是英文；中文用户可设置 `language: zh-CN`，CLI 则使用 `--lang zh-CN`。

### 一个典型的生产事故

<p align="center">
  <img src=".github/assets/proddoctor-demo.svg" alt="ProdDoctor 检测 CI 通过但真实生产域名失败" width="100%">
</p>

```text
构建             ✅
部署             ✅
平台默认地址     ✅
生产域名         ❌ HTTP 403
                  ↳ DNS 正常
                  ↳ TLS 正常
                  ↳ 疑似 Cloudflare Challenge / WAF
                  ↳ 自动保留截图 + Trace
```

ProdDoctor 不只是做一次存活探测。它更想回答一个真正有用的问题：**生产链路到底坏在哪一层？**


