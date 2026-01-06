import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';

export interface HotSearchItem {
  term: string;
  score: number;
  lastSearched: number;
  createdAt: number;
}

export interface HotSearchStats {
  total: number;
  topTerms: HotSearchItem[];
}

/**
 * SQLite 热搜服务 - 数据持久化存储
 * 使用 better-sqlite3 实现轻量级数据库
 */
export class HotSearchSQLiteService {
  private db: any = null;
  private readonly DB_DIR = './data';
  private readonly DB_PATH = './data/hot-searches.db';
  private readonly MAX_ENTRIES = 50;

  constructor() {
    this.initDatabase();
  }

  /**
   * 初始化数据库和表结构
   */
  private initDatabase(): void {
    try {
      // 动态导入 better-sqlite3
      const Database = require('better-sqlite3');

      // 确保数据目录存在
      if (!existsSync(this.DB_DIR)) {
        mkdirSync(this.DB_DIR, { recursive: true });
      }

      // 打开数据库（自动创建）
      this.db = new Database(this.DB_PATH);

      // 创建表（如果不存在）
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS hot_searches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          term TEXT UNIQUE NOT NULL,
          score INTEGER DEFAULT 1,
          last_searched INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        )
      `);

      console.log(`✅ [HotSearchSQLite] SQLite 数据库初始化成功: ${this.DB_PATH}`);
      console.log(`   数据将持久化存储，重启不丢失`);
    } catch (error) {
      console.warn('⚠️ [HotSearchSQLite] better-sqlite3 初始化失败');
      console.warn(`   原因: ${error.message}`);
      console.warn('   解决方案: 查看 SQLITE安装指南.md');
      console.warn('');
      console.warn('   自动降级到内存模式（功能正常，重启后数据丢失）');
      // 降级到内存模式（不持久化）
      this.initMemoryFallback();
    }
  }

  /**
   * 内存降级模式（当 better-sqlite3 不可用时）
   */
  private initMemoryFallback(): void {
    console.log('🔄 [HotSearchSQLite] 内存降级模式已激活');

    // 创建内存存储
    const memoryStore = new Map<string, HotSearchItem>();

    // 创建模拟的数据库对象
    this.db = {
      memoryStore,

      // 模拟 prepare 方法
      prepare(sql: string) {
        // 插入/更新操作 (INSERT INTO ... ON CONFLICT)
        if (sql.includes('INSERT INTO')) {
          return {
            run: (term: string, lastSearched: number, createdAt: number, now: number) => {
              const existing = memoryStore.get(term);
              if (existing) {
                // 更新现有记录
                existing.score += 1;
                existing.lastSearched = now;
              } else {
                // 插入新记录
                memoryStore.set(term, {
                  term,
                  score: 1,
                  lastSearched: now,
                  createdAt: now
                });
              }
            }
          };
        }

        // 统计总数 (SELECT COUNT(*) as total FROM hot_searches) - 必须在通用 SELECT 之前
        if (sql.includes('SELECT COUNT(*)') && sql.includes('FROM hot_searches')) {
          return {
            get: () => ({ total: memoryStore.size })
          };
        }

        // 查询操作 (SELECT ... ORDER BY ... LIMIT)
        if (sql.includes('SELECT') && sql.includes('FROM hot_searches')) {
          return {
            all: (limit: number) => {
              return Array.from(memoryStore.values())
                .sort((a, b) => {
                  if (b.score !== a.score) return b.score - a.score;
                  return b.lastSearched - a.lastSearched;
                })
                .slice(0, limit)
                .map(item => ({
                  term: item.term,
                  score: item.score,
                  lastSearched: item.lastSearched,
                  createdAt: item.createdAt
                }));
            }
          };
        }

        // 删除特定项 (DELETE FROM hot_searches WHERE term = ?) - 必须在通用 DELETE 之前
        if (sql.includes('DELETE FROM hot_searches') && sql.includes('WHERE term = ?')) {
          return {
            run: (term: string) => {
              const deleted = memoryStore.delete(term);
              return { changes: deleted ? 1 : 0 };
            }
          };
        }

        // 清空所有 (DELETE FROM hot_searches) - 必须在通用 DELETE 之前
        if (sql === 'DELETE FROM hot_searches') {
          return {
            run: () => {
              const size = memoryStore.size;
              memoryStore.clear();
              return { changes: size };
            }
          };
        }

        // 删除操作 (DELETE FROM hot_searches WHERE id NOT IN) - 通用删除
        if (sql.includes('DELETE FROM hot_searches')) {
          return {
            run: (limit: number) => {
              const entries = Array.from(memoryStore.entries())
                .sort((a, b) => {
                  if (b[1].score !== a[1].score) return b[1].score - a[1].score;
                  return b[1].lastSearched - a[1].lastSearched;
                });

              if (entries.length > limit) {
                entries.slice(limit).forEach(([term]) => {
                  memoryStore.delete(term);
                });
              }
              return { changes: Math.max(0, entries.length - limit) };
            }
          };
        }

        return { run: () => ({ changes: 0 }), all: () => [], get: () => null };
      },

      exec() {},

      // 模拟查询方法
      prepareQuery() {
        return {
          all: () => Array.from(memoryStore.values()),
          run: () => {},
        };
      },
    };

    console.log('✅ [HotSearchSQLite] 内存模式初始化完成 - 功能正常，数据重启后丢失');
  }

  /**
   * 记录搜索词（增加分数）
   */
  async recordSearch(term: string): Promise<void> {
    if (!term || term.trim().length === 0) return;

    // 违规词检查
    if (await this.isForbidden(term)) {
      console.log(`[HotSearchSQLite] 搜索词包含违规内容: ${term}`);
      return;
    }

    const now = Date.now();

    try {
      // 尝试插入新记录，如果已存在则更新
      const stmt = this.db.prepare(`
        INSERT INTO hot_searches (term, score, last_searched, created_at)
        VALUES (?, 1, ?, ?)
        ON CONFLICT(term) DO UPDATE SET
          score = score + 1,
          last_searched = ?
      `);

      stmt.run(term, now, now, now);

      // 清理超出限制的低分记录
      this.cleanupOldEntries();

      console.log(`[HotSearchSQLite] 记录搜索词: "${term}"`);
    } catch (error) {
      console.error('[HotSearchSQLite] 记录失败:', error);
    }
  }

  /**
   * 获取热搜列表
   */
  async getHotSearches(limit: number = 30): Promise<HotSearchItem[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT term, score, last_searched as lastSearched, created_at as createdAt
        FROM hot_searches
        ORDER BY score DESC, last_searched DESC
        LIMIT ?
      `);

      const rows = stmt.all(Math.min(limit, this.MAX_ENTRIES));
      return rows.map(row => ({
        term: row.term,
        score: row.score,
        lastSearched: row.lastSearched,
        createdAt: row.createdAt,
      }));
    } catch (error) {
      console.error('[HotSearchSQLite] 查询失败:', error);
      return [];
    }
  }

  /**
   * 清理超出限制的旧记录
   */
  private cleanupOldEntries(): void {
    try {
      // 删除超出最大数量的低分记录
      const stmt = this.db.prepare(`
        DELETE FROM hot_searches
        WHERE id NOT IN (
          SELECT id FROM hot_searches
          ORDER BY score DESC, last_searched DESC
          LIMIT ?
        )
      `);

      const result = stmt.run(this.MAX_ENTRIES);
      if (result && result.changes > 0) {
        console.log(`[HotSearchSQLite] 清理了 ${result.changes} 条旧记录`);
      }
    } catch (error) {
      // 内存模式可能不支持这个操作，忽略错误
      console.debug('[HotSearchSQLite] 清理跳过（内存模式）');
    }
  }

  /**
   * 清除所有热搜记录（需要密码验证）
   */
  async clearHotSearches(password: string): Promise<{ success: boolean; message: string }> {
    const correctPassword = process.env.HOT_SEARCH_PASSWORD || 'admin123';

    if (password !== correctPassword) {
      return { success: false, message: '密码错误' };
    }

    try {
      const stmt = this.db.prepare('DELETE FROM hot_searches');
      stmt.run();

      console.log('[HotSearchSQLite] 所有热搜记录已清除');
      return { success: true, message: '热搜记录已清除' };
    } catch (error) {
      console.error('[HotSearchSQLite] 清除失败:', error);
      return { success: false, message: '清除失败' };
    }
  }

  /**
   * 删除指定热搜词
   */
  async deleteHotSearch(term: string, password: string): Promise<{ success: boolean; message: string }> {
    const correctPassword = process.env.HOT_SEARCH_PASSWORD || 'admin123';

    if (password !== correctPassword) {
      return { success: false, message: '密码错误' };
    }

    try {
      const stmt = this.db.prepare('DELETE FROM hot_searches WHERE term = ?');
      const result = stmt.run(term);

      if (result.changes > 0) {
        console.log(`[HotSearchSQLite] 删除热搜词: "${term}"`);
        return { success: true, message: `热搜词 "${term}" 已删除` };
      } else {
        return { success: false, message: '热搜词不存在' };
      }
    } catch (error) {
      console.error('[HotSearchSQLite] 删除失败:', error);
      return { success: false, message: '删除失败' };
    }
  }

  /**
   * 获取热搜统计信息
   */
  async getStats(): Promise<HotSearchStats> {
    try {
      // 获取总数
      const countStmt = this.db.prepare('SELECT COUNT(*) as total FROM hot_searches');
      const countResult = countStmt.get();
      const total = countResult?.total || 0;

      // 获取 Top 10
      const topStmt = this.db.prepare(`
        SELECT term, score, last_searched as lastSearched, created_at as createdAt
        FROM hot_searches
        ORDER BY score DESC, last_searched DESC
        LIMIT 10
      `);
      const rows = topStmt.all();
      const topTerms = rows.map(row => ({
        term: row.term,
        score: row.score,
        lastSearched: row.lastSearched,
        createdAt: row.createdAt,
      }));

      return { total, topTerms };
    } catch (error) {
      console.error('[HotSearchSQLite] 统计查询失败:', error);
      return { total: 0, topTerms: [] };
    }
  }

  /**
   * 获取数据库大小（MB）
   */
  getDatabaseSize(): number {
    try {
      const { statSync } = require('fs');
      if (existsSync(this.DB_PATH)) {
        const stats = statSync(this.DB_PATH);
        return Math.round((stats.size / (1024 * 1024)) * 100) / 100;
      }
    } catch (error) {
      // 忽略错误
    }
    return 0;
  }

  /**
   * 违规词检查（简化版）
   */
  private async isForbidden(term: string): Promise<boolean> {
    const forbiddenPatterns = [
      /政治|暴力|色情|赌博|毒品/i,
      /fuck|shit|bitch/i,
    ];

    return forbiddenPatterns.some(pattern => pattern.test(term));
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db && this.db.close) {
      this.db.close();
      console.log('[HotSearchSQLite] 数据库已关闭');
    }
  }
}

// 单例模式
let singleton: HotSearchSQLiteService | undefined;

export function getOrCreateHotSearchSQLiteService(): HotSearchSQLiteService {
  if (!singleton) {
    singleton = new HotSearchSQLiteService();
  }
  return singleton;
}
