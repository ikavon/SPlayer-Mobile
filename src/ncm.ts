// ncm-core 的 app 侧 barrel：集中暴露所需 API，路径只在此处声明一次。
// ncm-core 源码已拷贝进 app/packages/ncm-core（EAS 上传范围 = app/，跨目录引用会让云端 bundle 找不到模块）。
// 相对路径：app/src/ → ../packages/ncm-core/src
export { api, resolveSongUrl, cookieToJson, NeteaseRequestError } from '../packages/ncm-core/src';
export type { ResolveResult, ResolveInput, RequestResponse } from '../packages/ncm-core/src';

/** 模拟大陆 IP，提高 NCM 接口成功率（直连 NCM 时用） */
export const CN_IP = '116.25.53.100';

/** 规范化封面 URL 为 https（NCM 封面多为 http://，Android 默认禁明文流量） */
export const toHttps = (u?: string): string | undefined =>
  u ? u.replace('http://', 'https://') : u;

/** NCM 歌曲的简化结构（来自 playlistDetail.tracks / cloudsearch.result.songs） */
export interface NcmSong {
  id: number;
  name: string;
  artist?: string;
  /** 主歌手 id（用于跳转歌手详情） */
  artistId?: number;
  /** 所在专辑 id（用于跳转专辑详情） */
  albumId?: number;
  /** 所在专辑名（播放页展示） */
  albumName?: string;
  cover?: string;
}

/** NCM 歌单/专辑封面通用结构 */
export interface NcmPlaylist {
  id: number;
  name: string;
  coverImgUrl?: string;
  trackCount?: number;
  playCount?: number;
  userId?: number;
  creator?: { nickname?: string; userId?: number };
  description?: string;
  specialType?: number;  // 5=红心歌单
}

/** NCM 专辑结构 */
export interface NcmAlbum {
  id: number;
  name: string;
  picUrl?: string;
  artist?: { name?: string; id?: number };
  size?: number;
  playCount?: number;
  /** 发行时间戳（ms，来自歌手专辑列表） */
  publishTime?: number;
}

/** NCM 歌手结构 */
export interface NcmArtist {
  id: number;
  name: string;
  img1v1Url?: string;
  albumSize?: number;
  musicSize?: number;
}
