/**
 * 歌曲播放地址解析编排
 *
 * 回退链：NCM 官方（带登录 cookie 可解锁登录曲）→ 公益解锁源池并行竞速
 * （byfuns/msls/GD/bikonoo/qijieya…，移植自本地 NCM 源部署包 matchID）
 * → QQ 音乐（跨平台换源）
 * 返回首个拿到的可播链接；全部失败返回 null（调用方决定是否播试听/提示）。
 */
import { api } from "./modules";
import { matchUnblock } from "./sources/unblock";
import { getUrl as qqGetUrl, search as qqSearch } from "./sources/qqmusic";

export type ResolveSource = "netease" | "unblock" | "gd" | "qqmusic";

export interface ResolveResult {
  url: string;
  source: ResolveSource;
  /** netease 为 br，qqmusic 为音质档 */
  quality?: number | string;
  isTrial?: boolean;
}

export interface ResolveInput {
  /** NCM 歌曲 id */
  id: number;
  name?: string;
  artist?: string;
  /** NCM 音质 level，默认 exhigh */
  level?: string;
  realIP?: string;
  /** 登录 cookie（传 MUSIC_U 可解锁登录态/VIP 可播曲的官方链接） */
  cookie?: string | Record<string, string>;
  /** 是否接受 NCM 30s 试听片段（默认不接受，直接回退换源） */
  acceptTrial?: boolean;
}

interface NcmUrlData {
  url: string | null;
  br?: number;
  freeTrialInfo?: unknown;
}

/** 标题归一化：小写、去括号后缀与标点空格，用于 QQ 跨平台匹配择优（避免同名异歌）。 */
const normalizeTitle = (t: string): string =>
  t
    .toLowerCase()
    .replace(/\(.*?\)|（.*?）/g, "")
    .replace(/[\s\-_·.,，。、!！?？'"`]+/g, "");

/** http → https：NCM song/url 返回的多为 http:// CDN 链接，
 *  Android release 包默认禁明文流量会直接拦截（无声、时长 0）；NCM CDN 支持 https。 */
const toHttps = (u: string): string => u.replace(/^http:\/\//, "https://");

/** 解析一首歌的可播链接 */
export const resolveSongUrl = async (song: ResolveInput): Promise<ResolveResult | null> => {
  // 1) NCM 官方
  try {
    const r = await api.songUrl({
      id: song.id,
      level: (song.level ?? "exhigh") as never,
      realIP: song.realIP,
      cookie: song.cookie,
    });
    const d = (r.body as { data?: NcmUrlData[] }).data?.[0];
    if (d?.url) {
      const isTrial = !!d.freeTrialInfo;
      if (!isTrial || song.acceptTrial) {
        return { url: toHttps(d.url), source: "netease", quality: d.br, isTrial };
      }
    }
  } catch {
    // NCM 失败/无链接 → 继续
  }

  // 2) 公益解锁源池（byfuns/msls/GD/bikonoo/qijieya 并行竞速，任一命中即返回）
  try {
    const url = await matchUnblock(song.id);
    if (url) return { url, source: "unblock" };
  } catch {
    // 解锁源池失败 → 继续
  }

  // 3) QQ 音乐（跨平台换源：搜索匹配 → GetVkey）
  if (song.name) {
    try {
      const kw = song.artist ? `${song.name} ${song.artist}` : song.name;
      const list = await qqSearch(kw, 1, 5);
      // 标题归一化择优：避免搜到的第一首是同名异歌导致 media_mid 错而触发 500003
      const want = normalizeTitle(song.name);
      const c =
        list.find((x) => x.mid && x.mediaMid && normalizeTitle(x.name).includes(want)) ?? list[0];
      if (c?.mid && c?.mediaMid) {
        const u = await qqGetUrl(c.mid, c.mediaMid, "hq");
        if (u?.url) return { url: u.url, source: "qqmusic", quality: u.quality };
      }
    } catch (e) {
      console.warn("[resolve] qq search/match failed", e);
    }
  }

  return null;
};
