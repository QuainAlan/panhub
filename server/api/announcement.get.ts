import { defineEventHandler } from "h3";
import { getAnnouncements } from "../core/services/announcementService";

/**
 * 公告下发接口（开源版，2026-09-05）
 *
 * 数据不在本仓库维护：服务端从官方站 /api/announcement 拉取（地址写死），
 * 缓存 10 分钟后原样下发。
 * 公告是公开信息，本接口无鉴权/不限流。
 * 响应：{ code, message, data: { version, items: [{ id, text, link? }] } }
 */
export default defineEventHandler(async () => {
  return {
    code: 0,
    message: "ok",
    data: await getAnnouncements(),
  };
});
