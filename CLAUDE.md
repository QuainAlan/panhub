# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PanHub is a Nuxt 4 web application that aggregates search results from Telegram channels and external plugin sites to find cloud storage resources (Aliyun, Quark, Baidu, 115, Xunlei, etc.). It supports priority-based batch processing, unified LRU caching with namespaces, and deploys to Cloudflare Workers (default), Vercel, or Docker.

**开源版定位**：无数据库（无 Turso/SQLite/D1）、无后台管理、无统计/热搜功能、无爬虫黑名单/蜜罐。搜索词与用户身份不落盘。

## Package Manager

`npm` (lockfile: `package-lock.json`). Always use `npm install`.

## Development Commands

```bash
npm run dev             # Start dev server
npm run build           # Production build
npm run preview         # Preview production build
npm test                # Run all unit tests (Vitest)
npm run test:watch      # Tests in watch mode
npm run test:coverage   # Coverage reports (V8)
npm run test:api        # API integration tests
vitest run test/unit/memoryCache.test.ts   # Run a single test file
vitest run -t "test name pattern"          # Run tests matching a name
npm run deploy:cf       # Deploy to Cloudflare Workers
```

## Architecture

### Search Flow (Two-Tier)

1. **Client** (`composables/useSearch.ts`): Manages search state, batching, pause/continue, fast/deep phases. Calls `/api/search` and `/api/search.post`.
2. **Server** (`server/core/services/searchService.ts`): Orchestrates concurrent searches across TG channels and plugins with priority batching, caching, timeout control, and plugin health checking.

**Fast Search**: First batch of priority TG channels + plugins returns immediately.
**Deep Search**: Remaining channels/plugins continue loading in batches.

**主搜索入口是 SSE 流式接口** `server/api/search.stream.get.ts`：1 个 SSE 连接承载整次搜索，后端把频道按批切片受控并发抓取，逐批 push chunk 事件，前端边收边渲染。

### Server Core (`server/core/`)

- **`services/searchService.ts`**: Main orchestrator. Uses `p-limit` for concurrency, `UnifiedCache` for caching, `PluginHealthChecker` to skip unhealthy plugins.
- **`services/tg.ts`**: Telegram channel post fetching with Cheerio HTML parsing.
- **`services/channelConfigService.ts`**: 频道配置服务，加载后缓存在内存。频道知识只存在于后端，前端零落地。
- **`services/searchQuotaService.ts`**: 页面端搜索配额（免费 3 次，按 openid 内存计数；超限 402 → 前端 floating-unlock 看广告解锁，`utils/unlockVerify.ts` 验票核销）。纯内存，不落数据库。
- **`services/doubanHotService.ts`**: Douban hot list fetching（内存缓存，24h TTL）。
- **`cache/unifiedCache.ts`**: Namespaced cache wrapper around `MemoryCache`. Namespaces: `TG_SEARCH`, `PLUGIN_SEARCH`. Cache keys: `tg:${keyword}:${channels}`, `plugin:${keyword}:${plugins}`.
- **`cache/memoryCache.ts`**: LRU cache with TTL expiration and memory monitoring.
- **`plugins/manager.ts`**: Plugin registry (`BaseAsyncPlugin` base class, global registry pattern via `registerGlobalPlugin()`). Each plugin implements `AsyncSearchPlugin` interface with `name()`, `priority()`, `search()` methods.
- **`plugins/*.ts`**: ~20 search plugins (pansearch, qupansou, panta, etc.).
- **`plugins/pluginHealth.ts`**: Circuit breaker pattern — tracks plugin failure rates, auto-skips unhealthy plugins for 5 minutes.
- **`utils/fetch.ts`**: Network wrapper with retry/timeout (via `fetchWithRetry`). **`utils/searchKeyword.ts`**: Builds keyword variants for deep search (CJK-aware splitting, noise filtering). **`utils/errors.ts`**: Error classification and `ErrorCollector`. **`utils/logger.ts`**: Logging.
- **`types/models.ts`**: Core interfaces — `SearchResult`, `MergedLink`, `MergedLinks`, `SearchResponse`, `SearchRequest`.

### Authentication

搜索接口写死强制微信公众号登录（`server/utils/requireAuth.ts` + `server/utils/wxAuthCheck.ts`）：

- 网页端：关注公众号 + 验证码后由 wx-auth-sdk 种下 `wxauth-token` cookie
- 小程序端：`Authorization: Bearer <wx-auth token>`
- 两类凭证统一转发 wx-auth 服务 `/api/auth/check` 权威校验（默认 `https://wx-auth.shenzjd.com`，可用 `WX_AUTH_API_BASE` 覆盖），校验结果有 10min 跨请求缓存；服务故障 fail-closed 拒绝
- 另有 bot UA 入口 403（`utils/botUA.ts`）与全局限流中间件（`server/middleware/rateLimiter.ts`，纯内存固定窗口）

### Client-Side

- **`pages/index/index.vue`**: Home page with hero, search box, results, Douban section.
- **`composables/useSearch.ts`**: Search state machine (loading → deepLoading → done), with pause/resume, SSE 流式接入与 402 配额回调。
- **`composables/useSettings.ts`**: User settings (concurrency, timeout).
- **`composables/useWxAuth.ts`**: 登录态管理（checkSearchAuth / forceVerify）。
- **`utils/extractMergedFromResponse.ts`** + **`utils/mergeMergedByType.ts`**: Client-side result merging helpers.
- **Components**: `SearchBox`, `ResultGroup`, `ResultHeader`, `DoubanHotSection`, `SettingsDrawer`。认证弹窗由 wx-auth-sdk 提供（`WxAuth.showAuthModal()`）。

### Configuration (`config/`)

- **`channels.json`**: 运行参数模板（concurrency, timeouts, cache TTL）。
- **`plugins.ts`**: Platform info (`PLATFORM_INFO` with colors/icons) used by the frontend to render source icons; `DEFAULT_USER_SETTINGS` (concurrency/timeout defaults). Plugin names are owned by the backend `PluginManager` (frontend holds no plugin list).
- **`doubanHot.ts`**: Douban API configuration.

## API Routes (`server/api/`)

All routes use the `name.method.ts` convention (e.g., `search.get.ts`).

Key routes: `search.get.ts`/`search.post.ts`（传统批量）、`search.stream.get.ts`（SSE 流式，前端主用）、`douban-hot.get.ts`, `img.get.ts` (image proxy), `health.get.ts`, `plugin-health.get.ts`, `check.post.ts`（链接探活）。

Route rules in `nuxt.config.ts` disable caching for auth/search API routes (SWR 3600 only on `/**` catch-all).

## Deployment

- **Cloudflare Workers** (default): `wrangler.toml` with `nodejs_compat` flag. `npm run deploy:cf` or `wrangler deploy`.
- **Vercel**: Auto-detected via `VERCEL` env var. Sets `nitro.preset: "vercel"`.
- **Docker**: `Dockerfile` uses `node:20-alpine`, builds with `NITRO_PRESET=node-server`. 无数据卷需求。
- **Nitro preset**: Auto-detected via `NITRO_PRESET` env var or platform detection.

## CI/CD (`.github/workflows/`)

- **`docker-image.yml`**: Builds and pushes Docker image to GHCR (`ghcr.io/<owner>/<repo>`, derived from the repository name) on push to `main`. Uses only `GITHUB_TOKEN` — no extra secrets needed.
- **`sync-upstream.yml`**: Daily cron (03:00 UTC) merges from upstream `main` into fork's default branch — keeps downstream forks in sync with the open-source repo.

## Testing

- Framework: Vitest with Node environment, globals enabled.
- Config: `vitest.config.ts` — includes `test/unit/**/*.test.ts`, alias `#internal` → `.nuxt`.
- Coverage: V8 provider, excludes `node_modules/`, `test/`, `*.d.ts`, config/index files.
- Run `npm test` before committing changes to `server/core/`.

## Conventions

- Vue composables: `use` prefix (`useSearch`, `useSettings`).
- Server routes: `name.get.ts` / `name.post.ts` under `server/api/`.
- Unit tests: `test/unit/*.test.ts`.
- Integration tests: `test/*.mjs`.
- Code style: 2-space indent, semicolons, double quotes.
- Commit messages: Conventional Commits (`feat:`, `fix:`, `refactor:`, `delete:`). Keep subjects short and imperative, one logical change per commit.

## Environment Variables

- `LOG_LEVEL`: Logging level (default: `info`).
- `WX_AUTH_API_BASE`: wx-auth 认证服务地址（默认 `https://wx-auth.shenzjd.com`）。
- `TRUST_PROXY`: 设为 `1` 时信任 CF-Connecting-IP / X-Forwarded-For 解析客户端 IP（限流用；默认不信任）。
- `NITRO_PRESET`: Deployment preset (auto-detect if unset).
- `PORT`: Server port (default: `4000`).
- `VERCEL`: Auto-detected for Vercel deployment.
