// https://nuxt.com/docs/api/configuration/nuxt-config
import channelsConfig from "./config/channels.json";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },
  devServer: {
    port: 4000,
  },
  app: {
    head: {
      htmlAttrs: { lang: "zh-CN" },
      title: "PanHub · 全网最全的网盘搜索",
      titleTemplate: "%s · PanHub",
      meta: [
        {
          name: "viewport",
          content:
            "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
        },
        {
          name: "description",
          content:
            "PanHub：聚合阿里云盘、夸克、百度网盘、115、迅雷等平台的全网最全网盘搜索工具，实时检索分享资源，快速、高效。",
        },
        {
          name: "keywords",
          content:
            "网盘搜索, 阿里云盘, 夸克, 百度网盘, 115, 迅雷, 资源搜索, 盘搜, panhub, 网盘聚合搜索",
        },
        { name: "theme-color", content: "#111111" },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: "PanHub" },
      ],
      link: [
        {
          rel: "icon",
          type: "image/svg+xml",
          href: "https://cdn.jsdmirror.com/gh/wu529778790/img.shenzjd.com@master/blog/imgx-20260828-151509-5bk7.svg",
        },
      ],
    },
  },
  nitro: {
    // 根据环境变量动态选择部署预设
    preset: process.env.VERCEL
      ? "vercel"
      : process.env.NITRO_PRESET || "node-server",
    // Vercel serverless function 最大执行时间（Pro: 60s, Hobby: 10s）
    vercel: {
      functions: {
        maxDuration: 60,
      },
    },
  },
  routeRules: {
    // 豆瓣热搜允许短时缓存（服务端已有 24 小时内存缓存）
    "/api/douban-hot": { swr: false, cache: false },
    // 搜索接口依赖 Cookie 鉴权，禁止缓存避免 401 被缓存
    "/api/search": { swr: false, cache: false },
    // SSE 搜索流：长连接逐批推送，禁止缓存
    // （默认 /** swr:3600 会把流缓存成 204 空响应）
    "/api/search.stream": { swr: false, cache: false },
    // 链接检测接口需要读 POST body，禁止缓存避免 body 被中间件消费
    "/api/check": { swr: false, cache: false },
    // 图片代理依赖豆瓣，禁止 SWR 缓存避免错误响应被缓存
    "/api/img": { swr: false, cache: false },
    "/**": { swr: 3600 },
  },
  runtimeConfig: {
    // 搜索源（频道/插件）知识只存在于后端，不注入 runtimeConfig。
    defaultConcurrency: channelsConfig.defaultConcurrency,
    pluginTimeoutMs: channelsConfig.pluginTimeoutMs,
    cacheEnabled: true,
    cacheTtlMinutes: channelsConfig.cacheTtlMinutes,
    public: {
      apiBase: "/api",
      siteUrl: "https://panhub.shenzjd.com",
      // 微信认证写死强制（无开关）：认证统一收敛到 wx-auth 服务（唯一登录
      // 通道）。小程序 Bearer token 由 wx-auth /api/auth/mp-login 签发，
      // 网页端公众号 cookie 由 wx-auth-sdk 种下，panhub 只做转发校验
      // （server/utils/wxAuthCheck.ts），不持有微信密钥/自建登录。
    },
  },
});
