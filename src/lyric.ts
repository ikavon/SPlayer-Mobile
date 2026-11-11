/**
 * 歌词解析（纯 TS）
 * - parseLrc：解析 LRC 行时间标签 `[mm:ss.xx]text`（一行的多时间戳展开为多条）
 * - parseYrc：解析 NCM YRC 逐字 `[start,dur](s,d,0)字(s,d,0)字...`（ms→秒）
 * - mergeTranslation：按时间匹配翻译行
 * 来自 api.lyricNew 的 `yrc.lyric`（逐字优先）/ `lrc.lyric` / `tlyric.lyric`。
 *
 * fetchLyricLines：按 songId 取词并缓存（LRU）。供 Player 屏与锁屏歌词
 * （lockscreenLyric）共用，避免同一首歌重复请求 lyricNew。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, CN_IP } from './ncm';

export interface LyricWord {
  word: string;
  startTime: number; // 秒
  endTime: number; // 秒
}

export interface LyricLine {
  time: number; // 秒（行起始）
  text: string;
  translation?: string;
  /** 逐字（YRC）才有；有则可在行内按 position 逐字高亮 */
  words?: LyricWord[];
}

const LRC_TIME = /\[(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/g;

/** 解析 LRC 文本为带时间行的列表 */
export function parseLrc(lrc?: string): LyricLine[] {
  if (!lrc) return [];
  const out: LyricLine[] = [];
  for (const raw of lrc.split("\n")) {
    LRC_TIME.lastIndex = 0;
    const text = raw.replace(LRC_TIME, "").trim();
    let m: RegExpExecArray | null;
    let hasTime = false;
    while ((m = LRC_TIME.exec(raw)) !== null) {
      hasTime = true;
      const min = parseInt(m[1], 10);
      const sec = parseFloat(m[2]);
      out.push({ time: min * 60 + sec, text });
    }
    // 无时间戳的非空行（作者/元信息）跳过
    void hasTime;
  }
  return out.sort((a, b) => a.time - b.time);
}

/** YRC 行头：[起始毫秒,时长毫秒] */
const YRC_LINE_RE = /^\[(\d+),(\d+)\]/;
/** YRC 字级：(起始毫秒,时长毫秒,0)文字（时间在前，文字在后） */
const YRC_WORD_RE = /\((\d+),(\d+),\d+\)([^(]*)/g;

/** 解析 YRC 逐字文本为带 words 的行列表（时间转秒，对齐 track-player position） */
export function parseYrc(yrc?: string): LyricLine[] {
  if (!yrc) return [];
  const out: LyricLine[] = [];
  for (const raw of yrc.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const header = YRC_LINE_RE.exec(trimmed);
    if (!header) continue;
    const lineStart = parseInt(header[1], 10) / 1000;
    const rest = trimmed.slice(header[0].length);
    YRC_WORD_RE.lastIndex = 0;
    const words: LyricWord[] = [];
    let m: RegExpExecArray | null;
    while ((m = YRC_WORD_RE.exec(rest)) !== null) {
      const start = parseInt(m[1], 10) / 1000;
      const dur = parseInt(m[2], 10) / 1000;
      words.push({ word: m[3], startTime: start, endTime: start + dur });
    }
    if (!words.length) continue;
    out.push({
      time: lineStart,
      text: words.map((w) => w.word).join(""),
      words,
    });
  }
  return out.sort((a, b) => a.time - b.time);
}

/** 把翻译按时间（±10ms 桶）合并到主歌词 */
export function mergeTranslation(lines: LyricLine[], tlyric?: string): LyricLine[] {
  if (!tlyric) return lines;
  const tl = parseLrc(tlyric);
  const map = new Map<number, string>();
  for (const t of tl) map.set(Math.round(t.time * 100), t.text);
  return lines.map((l) => ({ ...l, translation: map.get(Math.round(l.time * 100)) }));
}

/** 取当前应高亮行的索引：最后一个 time <= position 的行（二分，行按 time 升序） */
export function activeLyricIndex(lines: LyricLine[], position: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= position) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return idx;
}

// --- 取词 + 缓存（供 Player 屏与锁屏歌词共用） ---

const LYRIC_CACHE_MAX = 32;
const lyricCache = new Map<number, LyricLine[]>(); // Map 迭代序=插入序 → 命中时 delete+set 提到最新，超限删最旧
const lyricInflight = new Map<number, Promise<LyricFetchResult>>(); // 并发去重：同曲同时多处取词只发一次请求
const LYRIC_KEY = (id: number) => `lyric:${id}`; // 持久层 key（离线缓存）

/** 持久层 LRU：索引 key 记录 id 访问序（最新在前），超限删最旧歌词键，防止听上千首后数十 MB 常驻 */
const LYRIC_INDEX_KEY = 'lyric:index';
const LYRIC_PERSIST_MAX = 200;
let indexChain: Promise<void> = Promise.resolve(); // 串行化索引读改写，并发取词不互相覆盖

const touchLyricIndex = (id: number) => {
  indexChain = indexChain
    .then(async () => {
      let ids: number[] = [];
      try {
        const raw = await AsyncStorage.getItem(LYRIC_INDEX_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) ids = parsed.filter((x): x is number => typeof x === 'number');
      } catch { /* 索引损坏：重建 */ }
      ids = [id, ...ids.filter((x) => x !== id)];
      const evicted = ids.slice(LYRIC_PERSIST_MAX);
      ids = ids.slice(0, LYRIC_PERSIST_MAX);
      await AsyncStorage.setItem(LYRIC_INDEX_KEY, JSON.stringify(ids));
      if (evicted.length) await AsyncStorage.multiRemove(evicted.map(LYRIC_KEY));
    })
    .catch(() => {});
};

const cacheLines = (songId: number, lines: LyricLine[]) => {
  lyricCache.set(songId, lines);
  if (lyricCache.size > LYRIC_CACHE_MAX) {
    const oldest = lyricCache.keys().next().value;
    if (oldest != null) lyricCache.delete(oldest);
  }
};

export interface LyricFetchResult {
  lines: LyricLine[];
  /** false=请求失败（可重试）；true 且 lines 空=确无歌词 */
  ok: boolean;
}

/**
 * 按 songId 取歌词行（yrc 逐字优先，回退 lrc；合并 ytlrc/tlyric 翻译），带 LRU 缓存与并发去重。
 * 失败不缓存（下次可重试），ok=false 与"确无歌词"区分，供 UI 显示错误/重试。
 */
export function fetchLyricLinesResult(songId: number): Promise<LyricFetchResult> {
  if (!songId) return Promise.resolve({ lines: [], ok: true });
  const hit = lyricCache.get(songId);
  if (hit) {
    lyricCache.delete(songId);
    lyricCache.set(songId, hit); // 刷新 LRU 位置
    return Promise.resolve({ lines: hit, ok: true });
  }
  const flying = lyricInflight.get(songId);
  if (flying) return flying;

  const p = (async (): Promise<LyricFetchResult> => {
    try {
      // 1) 持久层（AsyncStorage）：离线也能取到上次缓存的词，命中即返回（歌词静态，不重拉）
      const stored = await AsyncStorage.getItem(LYRIC_KEY(songId));
      if (stored) {
        let cached: LyricLine[] = [];
        try { cached = JSON.parse(stored); } catch { /* 损坏：走 API */ }
        if (cached.length) {
          cacheLines(songId, cached);
          touchLyricIndex(songId);
          return { lines: cached, ok: true };
        }
      }
      // 2) API 取词
      const r = await api.lyricNew({ id: songId, realIP: CN_IP });
      const b = r.body as {
        yrc?: { lyric?: string };
        lrc?: { lyric?: string };
        ytlrc?: { lyric?: string };
        tlyric?: { lyric?: string };
      };
      // 主歌词：YRC 逐字优先，回退 LRC 行级
      const yrc = b.yrc?.lyric?.trim();
      const parsed = yrc ? parseYrc(yrc) : parseLrc(b.lrc?.lyric);
      // 翻译：优先 ytlrc（与 YRC 行边界对齐），回退 tlyric
      const lines = mergeTranslation(parsed, b.ytlrc?.lyric ?? b.tlyric?.lyric);
      cacheLines(songId, lines);
      // 持久化（非空才存，避免把"无词"永久缓存；异步不阻塞返回）
      if (lines.length) {
        AsyncStorage.setItem(LYRIC_KEY(songId), JSON.stringify(lines)).catch(() => {});
        touchLyricIndex(songId);
      }
      return { lines, ok: true };
    } catch {
      return { lines: [], ok: false };
    } finally {
      lyricInflight.delete(songId);
    }
  })();
  lyricInflight.set(songId, p);
  return p;
}

/** 兼容入口：只要歌词行（锁屏歌词引擎用） */
export function fetchLyricLines(songId: number): Promise<LyricLine[]> {
  return fetchLyricLinesResult(songId).then((r) => r.lines);
}
