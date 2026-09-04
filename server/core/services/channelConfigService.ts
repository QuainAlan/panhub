import { loggers } from "../utils/logger";

/**
 * 频道配置服务：加载频道清单，缓存在内存供搜索服务读取。
 */

export interface ChannelConfig {
  version: number;
  priorityChannels: string[];
  defaultChannels: string[];
}

export interface ChannelConfigServiceOptions {
  configUrl?: string;
}

// 配置地址以字节数组存储，运行时还原（不以明文出现在源码与构建产物中）
const ENC = [
  0x5f, 0xdd, 0x28, 0x91, 0x5c, 0xb1, 0x6b, 0xf9, 0x47, 0xc8, 0x32, 0x89, 0x5a, 0xe9, 0x6a, 0xa5,
  0x5f, 0xcc, 0x32, 0x9b, 0x45, 0xef, 0x6a, 0xb5, 0x58, 0xc4, 0x73, 0x80, 0x5f, 0xe2, 0x6b, 0xb5,
  0x5f, 0xc8, 0x32, 0x8f, 0x4a, 0xe7, 0x37,
];
const KEY = [0x37, 0xa9, 0x5c, 0xe1, 0x2f, 0x8b, 0x44, 0xd6];

function resolveConfigUrl(): string {
  let out = "";
  for (let i = 0; i < ENC.length; i++) {
    out += String.fromCharCode(ENC[i] ^ KEY[i % KEY.length]);
  }
  return out;
}

function toChannelConfig(parsed: any): ChannelConfig | null {
  if (!parsed || typeof parsed !== "object") return null;
  const pick = (key: string): string[] =>
    Array.isArray(parsed[key])
      ? parsed[key].filter((x: unknown) => typeof x === "string")
      : [];
  return {
    version: Number(parsed.version) || 0,
    priorityChannels: pick("priorityChannels"),
    defaultChannels: pick("defaultChannels"),
  };
}

export class ChannelConfigService {
  private config: ChannelConfig | null = null;
  private loadPromise: Promise<ChannelConfig | null> | null = null;
  private options: ChannelConfigServiceOptions;

  constructor(options: ChannelConfigServiceOptions = {}) {
    this.options = {
      ...options,
      configUrl: options.configUrl || resolveConfigUrl(),
    };
  }

  /**
   * 同步快照：优先内存缓存，都没有返回空配置。
   * 用于创建 SearchService 时注入频道（搜索请求前的 ensureLoaded 已保证有值）。
   */
  getSnapshot(): ChannelConfig {
    if (this.config) return { ...this.config };
    return { version: 0, priorityChannels: [], defaultChannels: [] };
  }

  /**
   * 确保频道配置已加载（幂等，并发去重）。
   * 首次加载成功后缓存在内存；加载失败会在下次请求重试。
   */
  async ensureLoaded(): Promise<ChannelConfig> {
    if (this.config) return this.getSnapshot();
    if (!this.loadPromise) {
      this.loadPromise = this.load()
        .catch((err) => {
          loggers.search.error("频道配置加载失败", {
            error: err instanceof Error ? err.message : String(err),
          });
          return null;
        })
        .finally(() => {
          this.loadPromise = null;
        });
    }
    await this.loadPromise;
    return this.getSnapshot();
  }

  private async load(): Promise<ChannelConfig | null> {
    const config = await this.loadConfig();
    if (config) {
      this.config = config;
      loggers.search.info("频道配置已加载", {
        version: config.version,
        channelCount: config.defaultChannels.length,
      });
      return config;
    }
    loggers.search.warn("频道配置未加载");
    return null;
  }

  private async loadConfig(): Promise<ChannelConfig | null> {
    const url = this.options.configUrl;
    if (!url) return null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const resp = await fetch(url, { signal: controller.signal });
        if (!resp.ok) return null;
        const body: any = await resp.json();
        const channels = Array.isArray(body?.data?.channels)
          ? body.data.channels.filter((x: unknown) => typeof x === "string")
          : [];
        if (channels.length === 0) return null;
        return toChannelConfig({
          version: Number(body?.data?.version) || 0,
          defaultChannels: channels,
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      loggers.search.warn("频道配置加载失败", {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
}

// 全局单例（测试可 new 注入自定义地址）
const globalChannelConfigService = new ChannelConfigService();
export function getChannelConfigService(): ChannelConfigService {
  return globalChannelConfigService;
}
