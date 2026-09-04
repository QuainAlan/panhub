# PanHub · 全网最全的网盘搜索

> 一个搜索框，搜遍全网网盘资源 —— 即搜即得、聚合去重、轻量部署

**在线体验**：<https://panhub.shenzjd.com>

## ✨ 核心特性

- **多源聚合**：Telegram 频道 + 第三方插件，聚合去重、智能排序、插件熔断隔离
- **影视榜单**：豆瓣 12 分类，点击即可一键搜索
- **链接探活**：服务端检测失效 / 需密码链接，自动标记角标
- **零数据库**：不设用户数据库，不记录搜索词与个人身份
- **多端部署**：Docker / Vercel / Cloudflare Workers

## 🚀 快速开始

```bash
# Docker
docker run -d -p 4000:4000 ghcr.io/wu529778790/panhub.shenzjd.com:latest
```

## ⚡ 一键部署

| 平台 | 部署方式 |
|------|---------|
| Vercel | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fwu529778790%2Fpanhub.shenzjd.com&project-name=panhub) |
| Cloudflare Workers | [![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fwu529778790%2Fpanhub.shenzjd.com) |

> Cloudflare Workers 构建命令使用 `npm run build:cf`（Nitro Cloudflare 预设）。
> 部署环境变量参考 `.env.example`（复制为 `.env` 后修改）；默认零必配环境变量。

- 本地开发：`npm install && npm run dev`；测试：`npm test`

## 📦 支持平台

阿里云盘 / 夸克 / 百度网盘 / 115 / 迅雷 / UC / 天翼云盘 / 123 网盘 / 移动云盘 / 磁力链接

## 🔐 登录与配额

- 搜索需登录：登录态由独立的认证服务 wx-auth 校验（关注公众号 + 验证码），默认使用内置服务地址，可通过 `WX_AUTH_API_BASE` 指向自建实例
- 页面端免费搜索次数用完后，看一段激励视频广告即可重新解锁（`WX_AUTH_API_BASE` 同一服务提供验票）

## 🛡️ 免责声明

- 不存储、不传播任何受版权保护的内容；资源链接均来自公开网络
- 请遵守当地法律法规与平台使用条款；侵权问题请联系源站处理

## 📄 开源协议

本项目基于 [PolyForm Noncommercial License 1.0.0](./LICENSE) 授权：

- ✅ 允许个人学习、研究等**非商业用途**的自由使用、修改与分发
- ❌ 任何商业用途（包括但不限于销售、收费服务、商业网站部署、广告变现）需事先获得作者书面授权
- 📮 商务合作请联系：[Telegram](https://t.me/shenzjd_com)
