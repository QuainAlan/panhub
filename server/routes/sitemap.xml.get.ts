import { defineEventHandler } from "h3";

/**
 * 静态 sitemap.xml：只收录固定页面。
 * URL 采用首页 query 形式 /?q=xxx 的动态选词已随热搜统计功能下线，
 * 开源版不再记录搜索词，故仅保留固定入口。
 */
export default defineEventHandler((event) => {
  const config = useRuntimeConfig();
  const siteUrl = ((config.public?.siteUrl as string) || "").replace(/\/$/, "");

  const paths = ["/", "/privacy"];
  const urls = paths
    .map((p) => {
      const loc = `${siteUrl}${p === "/" ? "/" : p}`;
      return `  <url>\n    <loc>${loc}</loc>\n    <changefreq>weekly</changefreq>\n  </url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  event.node.res.setHeader("Content-Type", "application/xml; charset=utf-8");
  event.node.res.setHeader("Cache-Control", "public, max-age=3600");
  return xml;
});
