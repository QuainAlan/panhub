import type { H3Event } from "h3";
import { createError, getHeader, getRequestHeader } from "h3";
import { isBotUA } from "../../utils/botUA";
import { loggers } from "../core/utils/logger";
import { getClientIp } from "../middleware/rateLimiter";
import { verifyWxAuthOnceCached } from "./wxAuthCheck";

/**
 * 搜索入口的爬虫/脚本 UA 拦截
 *
 * 放行规则：
 * - 正常浏览器 UA → 放行（真人搜索不受影响）
 * - bot/脚本 UA 且无凭证 → 403（curl/python-requests 等刷词工具）
 * - bot/脚本 UA 但带 Authorization: Bearer → 放行
 *   （小程序/已授权 API 客户端，UA 常被识别为脚本但属真实渠道）
 *
 * 注意：Bearer 在本层只判断"有没有"，不校验有效性。
 * 有效性校验在 requireWxAuth 里统一走 wx-auth /api/auth/check（Bearer 头转发）。
 * 无效 Bearer → requireHumanOrCredential 放行 → requireWxAuth 校验失败 → 401。
 */
export function requireHumanOrCredential(event: H3Event): void {
  const ua = getHeader(event, "user-agent");
  if (!isBotUA(ua)) return;
  // 已授权客户端（小程序/API）凭据放行，避免误伤真实渠道
  const auth = getRequestHeader(event, "authorization");
  if (auth && auth.startsWith("Bearer ")) return;
  loggers.search.warn(`拦截 bot UA 搜索请求`, {
    ua: ua?.slice(0, 200),
    path: event.path,
    method: event.method,
  });
  throw createError({ statusCode: 403, statusMessage: "bot forbidden" });
}

/**
 * 微信登录态校验（写死强制，统一走 wx-auth）
 *
 * 思路：前端已强制"关注公众号 + 验证码"才能搜索，但脚本直调 API 可绕过
 * 前端弹窗。本层在服务端校验凭证（Bearer 头或 wxauth cookie），转发
 * wx-auth /api/auth/check 权威校验，未认证请求 401 挡住。
 *
 * 规则：
 * - **恒强制**：所有环境（生产 + 本地 dev）搜索请求必经此校验，不依赖任何环境变量
 * - Bearer（小程序 wx-auth token）或 cookie（网页端公众号）→ 统一转发
 *   wx-auth check 校验，有效放行，无效 401
 * - 取消关注 = 退出登录，下次搜索 401（check 结果有 10min 跨请求缓存，
 *   见 wxAuthCheck.verifyWxAuthOnceCached）
 * - wx-auth 服务故障 → 拒绝（fail-closed，宁可误伤，不裸奔）
 *
 * 返回值二态：
 * - "ok"           → 放行（有效凭证）
 * - "unauthorized" → 无凭证或凭证失效 → 调用方返回 401 引导重新认证
 */
export type WxAuthResult = "ok" | "unauthorized";

export async function requireWxAuth(event: H3Event): Promise<WxAuthResult> {
  // 统一校验：Bearer（小程序）优先，其次 cookie（网页端公众号），
  // 均由 wxAuthCheck 转发 wx-auth /api/auth/check 权威校验（含 10min 缓存）
  const ok = await verifyWxAuthOnceCached(event);
  if (ok) return "ok";

  const ip = getClientIp(event);
  loggers.search.warn(`拦截未认证的搜索请求`, {
    ip,
    path: event.path,
    method: event.method,
  });
  return "unauthorized";
}
