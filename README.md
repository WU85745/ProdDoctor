# 🩺 ProdDoctor

[![Test ProdDoctor](https://github.com/WU85745/ProdDoctor/actions/workflows/test.yml/badge.svg)](https://github.com/WU85745/ProdDoctor/actions/workflows/test.yml)


> **你的 CI 是绿的，但你的网站可能已经挂了。**
>
> ProdDoctor 检查真实生产域名，而不是只检查构建、部署命令或 `workers.dev` 之类的内部地址。

ProdDoctor 是一个轻量、零第三方依赖的生产环境健康检查工具。它源自真实的 Cloudflare 部署事故：CI 和部署记录全部成功，但自定义域名仍可能出现 403、挑战页、错误路由或旧内容。

第一版以中文为主，既可以在本地命令行直接运行，也可以放进 GitHub Actions，在每次部署后自动检查真正给用户访问的域名。

## ✨ 能检查什么

- ✅ DNS 是否能够解析
- ✅ 真实生产 URL 是否能够访问
- ✅ HTTP 状态码是否正常
- ✅ 实际最终 URL，避免错误重定向
- ✅ 页面是否包含你指定的关键内容
- ✅ Cloudflare Challenge / WAF 403、429、503 阻断识别
- ✅ `CF-Ray`、缓存状态和 Server 信息
- ✅ `robots.txt`
- ✅ `sitemap.xml`
- ✅ 常见安全响应头
- ✅ 请求耗时和失败重试
- ✅ 中文终端报告
- ✅ JSON 报告
- ✅ GitHub Actions Job Summary

## 🚀 30 秒开始使用

需要 Node.js 20 或更高版本。

```bash
node ./bin/proddoctor.mjs https://example.com
```

要求页面必须包含指定文本：

```bash
node ./bin/proddoctor.mjs https://example.com --expect "Example Domain"
```

失败后多检查两次：

```bash
node ./bin/proddoctor.mjs https://example.com --retries 2
```

输出机器可读 JSON：

```bash
node ./bin/proddoctor.mjs https://example.com --json
```

保存报告：

```bash
node ./bin/proddoctor.mjs https://example.com --json-file proddoctor-report.json
```

## 🤖 在 GitHub Actions 里直接用

```yaml
name: Verify real production

on:
  workflow_dispatch:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: WU85745/ProdDoctor@main
        with:
          url: https://example.com
          expect: Example Domain
          retries: 2
```

部署步骤成功以后再运行 ProdDoctor，就可以让“绿灯”的含义从：

```text
代码编译成功
```

升级成：

```text
真实用户访问的生产域名也真的成功
```

## 🧪 示例输出

```text
🩺 ProdDoctor 生产环境体检
目标：https://example.com/
结果：✅ 通过

✅ DNS：93.184.216.34
✅ 页面：200，143ms，尝试 1 次
✅ 关键字：已找到 “Example Domain”
✅ robots.txt：HTTP 200
⚠️ sitemap.xml：HTTP 404
🛡️ 安全响应头：60/100

生产环境真的活着。CI 这次没有骗你。
```

## 🧠 为什么做这个项目

很多 CI/CD 流水线只证明以下事情：

1. 代码可以构建；
2. 测试通过；
3. 部署命令返回成功。

但它们不一定证明：

> **真实用户现在能从你的正式域名打开正确的网站。**

CDN、DNS、WAF、Bot 防护、自定义域名绑定、缓存和路由都可能发生在部署之后。

ProdDoctor 专门负责最后这一公里。

## ☁️ Cloudflare 场景

ProdDoctor 对 Cloudflare 做了额外识别。

如果响应是 `403 / 429 / 503`，同时页面包含典型 Challenge 标记，例如：

```text
Just a moment...
/cdn-cgi/challenge-platform
cf-chl-
```

工具会把它识别成疑似 Cloudflare/WAF 阻断，而不是只显示一句模糊的 `HTTP 403`。

同时，一个正常的 HTTP 200 页面即使包含 `/cdn-cgi/challenge-platform` 字样，也不会被误判成失败。

## 📦 项目结构

```text
ProdDoctor/
├── action.yml
├── bin/
│   └── proddoctor.mjs
├── src/
│   ├── checker.mjs
│   └── report.mjs
├── test/
│   └── checker.test.mjs
├── examples/
│   └── production-check.yml
└── .github/workflows/test.yml
```

## 🗺️ Roadmap

计划中的后续能力：

- [ ] Playwright 真浏览器渲染检查
- [ ] 自动截图并作为 Actions Artifact 上传
- [ ] JS Console Error 检测
- [ ] 静态资源 404 检测
- [ ] TLS 证书到期时间
- [ ] 多 URL 批量检查
- [ ] Lighthouse / Core Web Vitals
- [ ] PR 评论报告
- [ ] 英文 README 和英文终端输出
- [ ] npm 发布

## 🔐 隐私与安全

ProdDoctor 不需要 Cloudflare API Token，也不会读取你的 Cloudflare 账户。

它只从公网访问你提供的 URL，模拟部署完成后真实用户所面对的生产环境。

不要把需要登录、包含隐私 Token 或内部管理参数的 URL 写进公开 workflow。

## 📜 License

MIT

---

如果你的 CI 是绿的，而生产站是红的，ProdDoctor 就是来抓这个幽灵的。 👻
