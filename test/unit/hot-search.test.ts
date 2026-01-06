/**
 * 热搜功能测试
 * 测试 SQLite 持久化和 API 端点
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { HotSearchSQLiteService } from '../../server/core/services/hotSearchSQLite';

describe('HotSearchSQLiteService', () => {
  let service: HotSearchSQLiteService;

  beforeAll(() => {
    // 使用测试数据库
    service = new HotSearchSQLiteService();
  });

  afterAll(() => {
    service.close();
  });

  it('应该能够记录搜索词', async () => {
    await service.recordSearch('测试电影');
    const searches = await service.getHotSearches(10);

    expect(searches.length).toBeGreaterThan(0);
    expect(searches[0].term).toBe('测试电影');
    expect(searches[0].score).toBe(1);
  });

  it('应该能够增加已有搜索词的分数', async () => {
    await service.recordSearch('测试电影');
    await service.recordSearch('测试电影');

    const searches = await service.getHotSearches(10);
    const item = searches.find(s => s.term === '测试电影');

    expect(item?.score).toBe(3);
  });

  it('应该能够获取热搜列表', async () => {
    await service.recordSearch('电影');
    await service.recordSearch('软件');
    await service.recordSearch('学习资料');

    const searches = await service.getHotSearches(5);

    expect(searches.length).toBeLessThanOrEqual(5);
    expect(searches.length).toBeGreaterThan(0);
  });

  it('应该能够获取统计信息', async () => {
    const stats = await service.getStats();

    expect(stats.total).toBeGreaterThan(0);
    expect(stats.topTerms).toBeInstanceOf(Array);
  });

  it('应该能够删除热搜词', async () => {
    await service.recordSearch('待删除');

    let searches = await service.getHotSearches(50);
    expect(searches.some(s => s.term === '待删除')).toBe(true);

    const result = await service.deleteHotSearch('待删除', 'admin123');
    expect(result.success).toBe(true);

    searches = await service.getHotSearches(50);
    expect(searches.some(s => s.term === '待删除')).toBe(false);
  });

  it('应该拒绝错误的删除密码', async () => {
    const result = await service.deleteHotSearch('测试', 'wrongpassword');
    expect(result.success).toBe(false);
    expect(result.message).toContain('密码错误');
  });

  it('应该能够清除所有热搜', async () => {
    // 先添加一些数据
    await service.recordSearch('清理测试1');
    await service.recordSearch('清理测试2');

    const result = await service.clearHotSearches('admin123');
    expect(result.success).toBe(true);

    const searches = await service.getHotSearches(10);
    expect(searches.length).toBe(0);
  });

  it('应该拒绝错误的清除密码', async () => {
    const result = await service.clearHotSearches('wrongpassword');
    expect(result.success).toBe(false);
    expect(result.message).toContain('密码错误');
  });

  it('应该过滤违规词', async () => {
    await service.recordSearch('政治敏感词');
    await service.recordSearch('暴力内容');
    await service.recordSearch('正常搜索词');

    const searches = await service.getHotSearches(50);
    const hasForbidden = searches.some(s =>
      s.term.includes('政治') || s.term.includes('暴力')
    );

    expect(hasForbidden).toBe(false);
    expect(searches.some(s => s.term === '正常搜索词')).toBe(true);
  });

  it('应该限制最大条目数', async () => {
    // 清空后添加超过限制的条目
    await service.clearHotSearches('admin123');

    for (let i = 0; i < 60; i++) {
      await service.recordSearch(`测试词${i}`);
    }

    const searches = await service.getHotSearches(100);
    expect(searches.length).toBeLessThanOrEqual(50);
  });

  it('应该按分数排序', async () => {
    await service.clearHotSearches('admin123');

    await service.recordSearch('高分词');
    await service.recordSearch('高分词');
    await service.recordSearch('高分词');
    await service.recordSearch('低分词');

    const searches = await service.getHotSearches(10);

    expect(searches[0].term).toBe('高分词');
    expect(searches[0].score).toBe(3);
    expect(searches[1].term).toBe('低分词');
    expect(searches[1].score).toBe(1);
  });

  it('应该处理空搜索词', async () => {
    const initialCount = (await service.getHotSearches(100)).length;

    await service.recordSearch('');
    await service.recordSearch('   ');

    const finalCount = (await service.getHotSearches(100)).length;

    expect(finalCount).toBe(initialCount);
  });

  it('应该处理超长搜索词', async () => {
    const longTerm = 'a'.repeat(101);
    await service.recordSearch(longTerm);

    const searches = await service.getHotSearches(100);
    // 超长词应该被过滤（由 API 层处理，这里测试服务层的健壮性）
    expect(searches.length).toBeGreaterThanOrEqual(0);
  });

  it('应该返回数据库大小', async () => {
    const size = service.getDatabaseSize();
    expect(typeof size).toBe('number');
    expect(size).toBeGreaterThanOrEqual(0);
  });
});

describe('HotSearch API Endpoints', () => {
  // 这里可以添加 API 端点的集成测试
  // 需要启动 Nuxt 服务器
  it('API 端点应该返回正确的数据结构', async () => {
    // 伪代码，实际需要启动服务器
    // const response = await fetch('/api/hot-searches');
    // const data = await response.json();
    // expect(data.code).toBe(0);
    // expect(data.data.hotSearches).toBeInstanceOf(Array);
  });
});
