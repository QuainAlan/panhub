import { MemoryCache } from "../cache/memoryCache";
import { createLogger } from "../utils/logger";
import { safeExecute, fetchWithRetry } from "../utils/fetch";
import type {
  MergedLinks,
  SearchRequest,
  SearchResponse,
  SearchResult,
} from "../types/models";
import { PluginManager, type AsyncSearchPlugin } from "../plugins/manager";

const logger = createLogger("searchService");

export interface SearchServiceOptions {
  defaultChannels: string[];
  defaultConcurrency: number;
  pluginTimeoutMs: number;
  cacheEnabled: boolean;
  cacheTtlMinutes: number;
}

export class SearchService {
  private options: SearchServiceOptions;
  private pluginManager: PluginManager;
  private tgCache = new MemoryCache<SearchResult[]>();
  private pluginCache = new MemoryCache<SearchResult[]>();

  constructor(options: SearchServiceOptions, pluginManager: PluginManager) {
    this.options = options;
    this.pluginManager = pluginManager;
    logger.info("SearchService initialized", {
      plugins: pluginManager.getPlugins().length,
      cacheEnabled: options.cacheEnabled,
      defaultConcurrency: options.defaultConcurrency,
    });
  }

  getPluginManager() {
    return this.pluginManager;
  }

  async search(
    keyword: string,
    channels: string[] | undefined,
    concurrency: number | undefined,
    forceRefresh: boolean | undefined,
    resultType: string | undefined,
    sourceType: "all" | "tg" | "plugin" | undefined,
    plugins: string[] | undefined,
    cloudTypes: string[] | undefined,
    ext: Record<string, any> | undefined
  ): Promise<SearchResponse> {
    logger.info("Search started", {
      keyword,
      sourceType,
      plugins,
      channels: channels?.length,
      concurrency,
      forceRefresh,
    });
    const effChannels =
      channels && channels.length > 0 ? channels : this.options.defaultChannels;
    const effConcurrency =
      concurrency && concurrency > 0
        ? concurrency
        : this.options.defaultConcurrency;
    const effResultType =
      !resultType || resultType === "merge" ? "merged_by_type" : resultType;
    const effSourceType = sourceType ?? "all";

    let tgResults: SearchResult[] = [];
    let pluginResults: SearchResult[] = [];

    const tasks: Array<() => Promise<void>> = [];

    if (effSourceType === "all" || effSourceType === "tg") {
      tasks.push(async () => {
        const concOverride =
          typeof concurrency === "number" && concurrency > 0
            ? concurrency
            : undefined;
        tgResults = await this.searchTG(
          keyword,
          effChannels,
          !!forceRefresh,
          concOverride,
          ext
        );
      });
    }
    if (effSourceType === "all" || effSourceType === "plugin") {
      tasks.push(async () => {
        pluginResults = await this.searchPlugins(
          keyword,
          plugins,
          !!forceRefresh,
          effConcurrency,
          ext ?? {}
        );
      });
    }

    await Promise.all(tasks.map((t) => t()));

    const allResults = this.mergeSearchResults(tgResults, pluginResults);
    this.sortResultsByTimeDesc(allResults);

    const filteredForResults: SearchResult[] = [];
    for (const r of allResults) {
      const hasTime = !!r.datetime;
      const hasLinks = Array.isArray(r.links) && r.links.length > 0;
      const keywordPriority = this.getKeywordPriority(r.title);
      const pluginLevel = this.getPluginLevelBySource(this.getResultSource(r));
      if (hasTime || hasLinks || keywordPriority > 0 || pluginLevel <= 2)
        filteredForResults.push(r);
    }

    const mergedLinks = this.mergeResultsByType(
      allResults,
      keyword,
      cloudTypes
    );

    let total = 0;
    let response: SearchResponse = { total: 0 };
    if (effResultType === "merged_by_type") {
      total = Object.values(mergedLinks).reduce(
        (sum, arr) => sum + arr.length,
        0
      );
      response = { total, merged_by_type: mergedLinks };
    } else if (effResultType === "results") {
      total = filteredForResults.length;
      response = { total, results: filteredForResults };
    } else {
      // all
      total = filteredForResults.length;
      response = {
        total,
        results: filteredForResults,
        merged_by_type: mergedLinks,
      };
    }

    logger.info("Search completed", {
      keyword,
      total,
      platforms: Object.keys(mergedLinks),
      resultType: effResultType,
    });

    return response;
  }

  private async searchTG(
    keyword: string,
    channels: string[] | undefined,
    forceRefresh: boolean,
    concurrencyOverride?: number,
    ext?: Record<string, any>
  ): Promise<SearchResult[]> {
    const chList = Array.isArray(channels) ? channels : [];
    const cacheKey = `tg:${keyword}:${[...chList].sort().join(",")}`;
    const { cacheEnabled, cacheTtlMinutes } = this.options;

    if (!forceRefresh && cacheEnabled) {
      const cached = this.tgCache.get(cacheKey);
      if (cached.hit && cached.value) {
        logger.debug("TG cache hit", { keyword, channels: chList.length });
        return cached.value;
      }
    }

    logger.debug("TG search started", { keyword, channels: chList.length });

    // 控制并发抓取频道公开页并解析（避免一次性打满连接被限流）
    const { fetchTgChannelPosts } = await import("./tg");
    const perChannelLimit = 30;
    const requestedTimeout = Number((ext as any)?.__plugin_timeout_ms) || 0;
    const timeoutMs = Math.max(
      3000,
      requestedTimeout > 0
        ? requestedTimeout
        : this.options.pluginTimeoutMs || 0
    );

    // 使用 safeExecute 包装每个频道的搜索，确保单个频道失败不影响整体
    const runnerTasks = chList.map(
      (ch) => async () =>
        safeExecute(
          () =>
            this.withTimeout<SearchResult[]>(
              fetchTgChannelPosts(ch, keyword, {
                limitPerChannel: perChannelLimit,
              }),
              timeoutMs,
              []
            ),
          [],
          logger.child(`tg:${ch}`)
        )
    );
    const concurrency = Math.max(
      2,
      Math.min(concurrencyOverride ?? this.options.defaultConcurrency, 12)
    );

    // 并行执行频道搜索
    const resultsByChannel = await this.runWithConcurrency(
      runnerTasks,
      concurrency
    );
    const results: SearchResult[] = [];
    for (const arr of resultsByChannel) {
      if (Array.isArray(arr)) results.push(...(arr as SearchResult[]));
    }

    if (cacheEnabled && results.length > 0) {
      this.tgCache.set(cacheKey, results, cacheTtlMinutes * 60_000);
      logger.debug("TG cache stored", { keyword, results: results.length });
    }

    logger.debug("TG search completed", { keyword, results: results.length });
    return results;
  }

  private async searchPlugins(
    keyword: string,
    plugins: string[] | undefined,
    forceRefresh: boolean,
    concurrency: number,
    ext: Record<string, any>
  ): Promise<SearchResult[]> {
    const cacheKey = `plugin:${keyword}:${(plugins ?? [])
      .map((p) => p?.toLowerCase())
      .filter(Boolean)
      .sort()
      .join(",")}`;
    const { cacheEnabled, cacheTtlMinutes } = this.options;

    if (!forceRefresh && cacheEnabled) {
      const cached = this.pluginCache.get(cacheKey);
      if (cached.hit && cached.value) {
        logger.debug("Plugin cache hit", { keyword, plugins });
        return cached.value;
      }
    }

    logger.debug("Plugin search started", { keyword, plugins });

    const allPlugins = this.pluginManager.getPlugins();
    let available: AsyncSearchPlugin[] = [];
    if (plugins && plugins.length > 0 && plugins.some((p) => !!p)) {
      const wanted = new Set(plugins.map((p) => p.toLowerCase()));
      available = allPlugins.filter((p) => wanted.has(p.name().toLowerCase()));
    } else {
      available = allPlugins;
    }

    const requestedTimeout = Number((ext as any)?.__plugin_timeout_ms) || 0;
    const timeoutMs = Math.max(
      3000,
      requestedTimeout > 0
        ? requestedTimeout
        : this.options.pluginTimeoutMs || 0
    );

    // 使用 safeExecuteAll 统一处理错误，避免单个插件失败影响整体
    const pluginPromises = available.map((p) => async () => {
      p.setMainCacheKey(cacheKey);
      p.setCurrentKeyword(keyword);

      // 主搜索
      let results = await this.withTimeout<SearchResult[]>(
        p.search(keyword, ext),
        timeoutMs,
        []
      );

      // 短关键词兜底逻辑
      if (
        (!results || results.length === 0) &&
        (keyword || "").trim().length <= 1
      ) {
        const fallbacks = ["电影", "movie", "1080p"];
        for (const fb of fallbacks) {
          const fallbackResults = await this.withTimeout<SearchResult[]>(
            p.search(fb, ext),
            timeoutMs,
            []
          );
          if (fallbackResults && fallbackResults.length > 0) {
            results = fallbackResults;
            break;
          }
        }
      }

      return results || [];
    });

    // 使用并发控制执行，同时利用 safeExecuteAll 提供统一错误处理
    const resultsByPlugin = await this.runWithConcurrency(
      pluginPromises.map((promiseFactory) => async () => {
        return await safeExecute(
          promiseFactory,
          [],
          logger.child(`plugin:${promiseFactory.name || "unknown"}`)
        );
      }),
      concurrency
    );

    const merged: SearchResult[] = [];
    for (const arr of resultsByPlugin) {
      if (Array.isArray(arr)) {
        merged.push(...arr);
      }
    }

    if (cacheEnabled && merged.length > 0) {
      this.pluginCache.set(cacheKey, merged, cacheTtlMinutes * 60_000);
      logger.debug("Plugin cache stored", { keyword, results: merged.length });
    }

    logger.debug("Plugin search completed", { keyword, results: merged.length });
    return merged;
  }

  private withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    fallback: T
  ): Promise<T> {
    if (!ms || ms <= 0) return promise;
    let timeoutHandle: any;
    const timeoutPromise = new Promise<T>((resolve) => {
      timeoutHandle = setTimeout(() => resolve(fallback), ms);
    });
    return Promise.race([
      promise.finally(() => clearTimeout(timeoutHandle)),
      timeoutPromise,
    ]) as Promise<T>;
  }

  private mergeSearchResults(
    a: SearchResult[],
    b: SearchResult[]
  ): SearchResult[] {
    const seen = new Set<string>();
    const out: SearchResult[] = [];
    const pushUnique = (r: SearchResult) => {
      const key = r.unique_id || r.message_id || `${r.title}|${r.channel}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(r);
    };
    for (const r of a) pushUnique(r);
    for (const r of b) pushUnique(r);
    return out;
  }

  private sortResultsByTimeDesc(arr: SearchResult[]) {
    arr.sort(
      (x, y) => new Date(y.datetime).getTime() - new Date(x.datetime).getTime()
    );
  }

  private getResultSource(_r: SearchResult): string {
    // 可根据 SearchResult 增补来源字段，这里返回空表示未知
    return "";
  }

  private getPluginLevelBySource(_source: string): number {
    return 3;
  }
  private getKeywordPriority(_title: string): number {
    return 0;
  }

  private mergeResultsByType(
    results: SearchResult[],
    _keyword: string,
    cloudTypes?: string[]
  ): MergedLinks {
    const allow =
      cloudTypes && cloudTypes.length > 0
        ? new Set(cloudTypes.map((s) => s.toLowerCase()))
        : undefined;
    const out: MergedLinks = {};
    for (const r of results) {
      for (const link of r.links || []) {
        const t = (link.type || "").toLowerCase();
        if (allow && !allow.has(t)) continue;
        if (!out[t]) out[t] = [];
        out[t].push({
          url: link.url,
          password: link.password,
          note: r.title,
          datetime: r.datetime,
          images: r.images,
        });
      }
    }
    return out;
  }

  private async runWithConcurrency<T>(
    tasks: Array<() => Promise<T>>,
    limit: number
  ): Promise<T[]> {
    const queue = tasks.slice();
    const results: T[] = [];
    let running: Promise<void>[] = [];

    const runNext = async () => {
      const task = queue.shift();
      if (!task) return;
      const p = task()
        .then((res) => {
          results.push(res);
        })
        .catch(() => {
          /* swallow */
        });
      const wrapped = p.then(() => {
        /* slot freed */
      });
      running.push(wrapped);
      if (running.length >= limit) {
        await Promise.race(running);
        running = running.filter((r) => r !== wrapped);
      }
      await runNext();
    };

    const starters = Math.min(limit, queue.length);
    await Promise.all(Array.from({ length: starters }, () => runNext()));
    await Promise.all(running);
    return results;
  }
}
