/**
 * 公告服务（开源版，2026-09-05）
 *
 * 本仓库不维护公告内容：官方站 /api/announcement 是唯一数据源
 * （地址写死，不提供环境变量覆盖），本服务在服务端拉取后，
 * 由本站的 /api/announcement 原样下发给前端。
 *
 * 可靠性：10 分钟内存缓存；上游失败时回退最近一次成功数据，
 * 从未成功过则返回空公告（前端公告条隐藏，不影响页面）。
 * 本项目无数据库，状态只在内存（见 AGENTS.md）。
 */

export interface AnnouncementItem {
  id: string;
  text: string;
  link?: string;
}

export interface AnnouncementPayload {
  version: number;
  items: AnnouncementItem[];
}

/** 官方站公告接口（唯一数据源，写死） */
export const ANNOUNCEMENT_UPSTREAM_URL = "https://panhub.shenzjd.com/api/announcement";

const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

type FetchLike = (url: string, opts?: Record<string, unknown>) => Promise<unknown>;

/** 宽松解析上游响应：过滤停用/空文本，link 空串不输出，version 非法兜底 0 */
export function normalizeAnnouncementPayload(raw: unknown): AnnouncementPayload {
  const data = (raw as { data?: { version?: unknown; items?: unknown } })?.data;
  const rawItems = Array.isArray(data?.items) ? data.items : [];
  const items: AnnouncementItem[] = [];
  for (const rawItem of rawItems) {
    const item = rawItem as { id?: unknown; text?: unknown; link?: unknown; enabled?: unknown };
    if (typeof item?.text !== "string") continue;
    const text = item.text.trim();
    if (!text) continue;
    if (item.enabled === false) continue;
    const normalized: AnnouncementItem = { id: String(item.id ?? ""), text };
    if (typeof item.link === "string" && item.link.trim()) {
      normalized.link = item.link.trim();
    }
    items.push(normalized);
  }
  return {
    version: Number(data?.version) || 0,
    items,
  };
}

let cache: { payload: AnnouncementPayload; fetchedAt: number } | null = null;

const defaultFetch: FetchLike = (url, opts) =>
  (globalThis as unknown as { $fetch: FetchLike }).$fetch(url, opts);

export async function getAnnouncements(fetchImpl: FetchLike = defaultFetch): Promise<AnnouncementPayload> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.payload;
  }
  try {
    const res = await fetchImpl(ANNOUNCEMENT_UPSTREAM_URL, { timeout: FETCH_TIMEOUT_MS });
    const payload = normalizeAnnouncementPayload(res);
    cache = { payload, fetchedAt: Date.now() };
    return payload;
  } catch {
    // 上游抖动：回退过期缓存，从未成功过则给空公告（前端隐藏公告条）
    return cache ? cache.payload : { version: 0, items: [] };
  }
}
