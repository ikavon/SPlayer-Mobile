/**
 * QQ 音乐单曲搜索（移植自 SPlayer-Next apis/qqmusic/modules/search.ts 的 searchSongs）
 * 走公开 CGI c.y.qq.com/soso/fcgi-bin/client_search_cp，返回含 songmid/media_mid 的候选。
 */
import { QM_HEADERS, formatSingerName } from "./config";
import { fetchWithTimeout } from "../../utils";

const SEARCH_URL = "https://c.y.qq.com/soso/fcgi-bin/client_search_cp";

export interface QmSong {
  id: string;
  mid: string;
  name: string;
  artist: string;
  album: string;
  duration: number;
  mediaMid: string;
  size128: number;
  size320: number;
  sizeFlac: number;
}

/** 按关键词搜单曲，返回候选列表（含 mediaMid，供 GetVkey 用） */
export const search = async (keywords: string, page = 1, limit = 10): Promise<QmSong[]> => {
  const url = new URL(SEARCH_URL);
  url.search = new URLSearchParams({
    format: "json",
    n: String(limit),
    p: String(page),
    w: keywords,
    cr: "1",
    g_tk: "5381",
    t: "0",
  }).toString();
  const res = await fetchWithTimeout(url.toString(), { method: "GET", headers: QM_HEADERS });
  if (!res.ok) throw new Error(`QM 搜索失败: HTTP ${res.status}`);
  const body = (await res.json()) as {
    code?: number;
    message?: string;
    data?: { song?: { list?: any[]; totalnum?: number } };
  };
  if (body.code !== 0) throw new Error(body.message || `QM 搜索失败: ${body.code}`);
  const list = body.data?.song?.list ?? [];
  return list.map((s: any) => ({
    id: String(s.songid ?? ""),
    mid: s.songmid ?? "",
    name: s.songname ?? "",
    artist: formatSingerName(s.singer),
    album: s.albumname ?? "",
    duration: (s.interval ?? 0) * 1000,
    mediaMid: s.media_mid ?? "",
    size128: s.size128 ?? 0,
    size320: s.size320 ?? 0,
    sizeFlac: s.sizeflac ?? 0,
  }));
};
