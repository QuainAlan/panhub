/**
 * 公告服务单元测试（开源版，2026-09-05）
 *
 * 覆盖 announcementService：
 *   - normalizeAnnouncementPayload：过滤停用/空文本、link 规整、缺字段兜底；
 *   - getAnnouncements：成功拉取并缓存、上游失败回退过期缓存、
 *     从未成功过返回空公告。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

async function freshModule() {
  vi.resetModules();
  return import("../../server/core/services/announcementService");
}

describe("announcementService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("normalizeAnnouncementPayload", () => {
    it("过滤停用与空文本条目，保留有效条目并规整字段", async () => {
      const { normalizeAnnouncementPayload } = await freshModule();
      const payload = normalizeAnnouncementPayload({
        code: 0,
        data: {
          version: 6,
          items: [
            { id: "a", enabled: true, text: "  有效公告  ", link: " https://example.com " },
            { id: "b", enabled: false, text: "已停用" },
            { id: "c", enabled: true, text: "   " },
            { id: "d", text: "未标 enabled 视为启用" },
            { id: "e", enabled: true, link: "" },
          ],
        },
      });
      // b 停用 / c 空文本 / e 缺 text，均被过滤
      expect(payload).toEqual({
        version: 6,
        items: [
          { id: "a", text: "有效公告", link: "https://example.com" },
          { id: "d", text: "未标 enabled 视为启用" },
        ],
      });
    });

    it("结构缺失/非法时返回空公告", async () => {
      const { normalizeAnnouncementPayload } = await freshModule();
      expect(normalizeAnnouncementPayload(null)).toEqual({ version: 0, items: [] });
      expect(normalizeAnnouncementPayload({ code: 0 })).toEqual({ version: 0, items: [] });
      expect(normalizeAnnouncementPayload({ data: { version: "abc" } })).toEqual({
        version: 0,
        items: [],
      });
    });
  });

  describe("getAnnouncements", () => {
    it("成功拉取后走缓存，fetcher 只调用一次", async () => {
      const mod = await freshModule();
      const fetcher = vi.fn().mockResolvedValue({
        code: 0,
        data: { version: 6, items: [{ id: "a", text: "公告" }] },
      });
      const first = await mod.getAnnouncements(fetcher);
      const second = await mod.getAnnouncements(fetcher);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
      expect(first.items[0].text).toBe("公告");
    });

    it("上游失败时回退最近一次成功数据", async () => {
      const mod = await freshModule();
      const ok = vi.fn().mockResolvedValue({
        code: 0,
        data: { version: 6, items: [{ id: "a", text: "旧公告" }] },
      });
      await mod.getAnnouncements(ok);
      const bad = vi.fn().mockRejectedValue(new Error("network down"));
      const fallback = await mod.getAnnouncements(bad);
      expect(fallback.items[0].text).toBe("旧公告");
    });

    it("从未成功过时返回空公告，前端据此隐藏公告条", async () => {
      const mod = await freshModule();
      const bad = vi.fn().mockRejectedValue(new Error("network down"));
      const payload = await mod.getAnnouncements(bad);
      expect(payload).toEqual({ version: 0, items: [] });
    });
  });
});
