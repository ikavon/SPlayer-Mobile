/**
 * resolve 短缓存：同会话内刚解析过的 id 在短 TTL 内复用 url，避免重复跑多源 resolve
 * （CDN 链接分钟级有效，2min 内复用安全）。下载/取消下载后音源变 file://，需 invalidateResolve。
 */
const TTL = 2 * 60 * 1000;
const MAX_ENTRIES = 200;
const cache = new Map<number, { url: string; source: string; expiresAt: number }>();

export const getCachedResolve = (id: number): { url: string; source: string } | null => {
  const e = cache.get(id);
  if (!e) return null;
  if (e.expiresAt > Date.now()) return { url: e.url, source: e.source };
  cache.delete(id);
  return null;
};

export const setCachedResolve = (id: number, url: string, source: string) => {
  const now = Date.now();
  // 长播放会话只增不减会无限膨胀：set 时顺手清扫过期项，仍超限则淘汰最旧
  if (cache.size >= MAX_ENTRIES) {
    for (const [k, v] of cache) {
      if (v.expiresAt <= now) cache.delete(k);
    }
    if (cache.size >= MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest != null) cache.delete(oldest);
    }
  }
  cache.set(id, { url, source, expiresAt: now + TTL });
};

/** 失效单首（下载/取消下载后音源变 file://，需清 resolve 缓存以免还用旧 CDN url） */
export const invalidateResolve = (id: number) => {
  cache.delete(id);
};
