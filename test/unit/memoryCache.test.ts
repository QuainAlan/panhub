/**
 * 内存缓存系统单元测试
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { MemoryCache } from "../../server/core/cache/memoryCache";

describe("MemoryCache", () => {
  let cache: MemoryCache<string>;

  beforeEach(() => {
    cache = new MemoryCache<string>();
    // 使用 vi.useFakeTimers() 来控制时间
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("应该正确存储和获取值", () => {
    cache.set("key1", "value1", 1000);
    const result = cache.get("key1");
    expect(result.hit).toBe(true);
    expect(result.value).toBe("value1");
  });

  it("应该返回未命中当键不存在时", () => {
    const result = cache.get("nonexistent");
    expect(result.hit).toBe(false);
    expect(result.value).toBeUndefined();
  });

  it("应该在过期后返回未命中", () => {
    cache.set("key1", "value1", 1000);
    vi.advanceTimersByTime(1001);
    const result = cache.get("key1");
    expect(result.hit).toBe(false);
  });

  it("应该正确清理过期条目（通过触发自动清理）", () => {
    // 创建一个短自动清理间隔的缓存
    const testCache = new MemoryCache<string>({ cleanupInterval: 500 });

    testCache.set("key1", "value1", 100);   // 100ms 过期
    testCache.set("key2", "value2", 2000);  // 2000ms 过期

    // 等待过期
    vi.advanceTimersByTime(101);

    // 触发自动清理（需要等待清理间隔）
    vi.advanceTimersByTime(500);

    // 访问触发清理
    testCache.get("key1");
    testCache.get("key2");

    const stats = testCache.getStats();
    expect(stats.active).toBe(1);  // 只有 key2 还有效
    expect(stats.expired).toBe(0); // 过期的已被清理
  });

  it("应该遵守 LRU 限制", () => {
    // 设置最大容量为 3
    const smallCache = new MemoryCache<string>({ maxSize: 3 });

    smallCache.set("key1", "value1", 10000);
    smallCache.set("key2", "value2", 10000);
    smallCache.set("key3", "value3", 10000);
    smallCache.set("key4", "value4", 10000); // 应该移除 key1（最旧）

    expect(smallCache.get("key1").hit).toBe(false);
    expect(smallCache.get("key2").hit).toBe(true);
    expect(smallCache.get("key3").hit).toBe(true);
    expect(smallCache.get("key4").hit).toBe(true);
  });

  it("应该正确统计缓存信息", () => {
    cache.set("key1", "value1", 10000);
    cache.set("key2", "value2", 100); // 很快过期

    vi.advanceTimersByTime(101); // key2 过期

    const stats = cache.getStats();
    expect(stats.total).toBe(2); // 总条目数
    expect(stats.active).toBe(1); // 有效条目
    expect(stats.expired).toBe(1); // 过期条目
  });

  it("应该正确清除所有缓存", () => {
    cache.set("key1", "value1", 10000);
    cache.set("key2", "value2", 10000);

    cache.clear();

    expect(cache.get("key1").hit).toBe(false);
    expect(cache.get("key2").hit).toBe(false);
    expect(cache.size).toBe(0);
  });

  it("应该自动定期清理过期条目", () => {
    const smallCache = new MemoryCache<string>({
      maxSize: 100,
      cleanupInterval: 100
    });

    smallCache.set("key1", "value1", 50); // 50ms 过期
    smallCache.set("key2", "value2", 200); // 200ms 过期

    // 等待 60ms，key1 应该过期
    vi.advanceTimersByTime(60);

    // 触发访问，这会触发自动清理
    smallCache.get("key1");
    smallCache.get("key2");

    // key1 应该已过期并被删除
    const result1 = smallCache.get("key1");
    const result2 = smallCache.get("key2");

    expect(result1.hit).toBe(false);
    expect(result2.hit).toBe(true);
  });

  it("应该更新 LRU 顺序", () => {
    const smallCache = new MemoryCache<string>({ maxSize: 2 });

    smallCache.set("key1", "value1", 10000);
    smallCache.set("key2", "value2", 10000);

    // 访问 key1，使其变为最新
    smallCache.get("key1");

    // 添加新条目，应该删除 key2（最旧）
    smallCache.set("key3", "value3", 10000);

    expect(smallCache.get("key1").hit).toBe(true);
    expect(smallCache.get("key2").hit).toBe(false);
    expect(smallCache.get("key3").hit).toBe(true);
  });
});
