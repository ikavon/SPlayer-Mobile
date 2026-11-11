/**
 * 搜索数据层：cloudsearch 多类型查询与映射。
 * type：1=单曲 10=专辑 100=歌手 1000=歌单
 * 单类失败不影响其它（Promise.allSettled）。
 */
import { api, CN_IP, toHttps, type NcmSong, type NcmPlaylist, type NcmArtist, type NcmAlbum } from './ncm';

export interface SearchResult {
  songs: NcmSong[];
  playlists: NcmPlaylist[];
  artists: NcmArtist[];
  albums: NcmAlbum[];
}

const LIMIT = 30;

const mapSong = (s: any): NcmSong => {
  const ar = s.ar?.[0] ?? s.artists?.[0];
  const al = s.al ?? s.album;
  return {
    id: s.id,
    name: s.name,
    artist: ar?.name,
    artistId: ar?.id,
    albumId: al?.id,
    albumName: al?.name,
    cover: toHttps(al?.picUrl),
  };
};

const mapPlaylist = (p: any): NcmPlaylist => ({
  id: p.id,
  name: p.name,
  coverImgUrl: p.coverImgUrl,
  trackCount: p.trackCount,
  playCount: p.playCount,
  userId: p.userId,
  creator: p.creator
    ? { nickname: p.creator.nickname, userId: p.creator.userId }
    : undefined,
  description: p.description,
});

const mapArtist = (a: any): NcmArtist => ({
  id: a.id,
  name: a.name,
  img1v1Url: a.img1v1Url,
  albumSize: a.albumSize,
  musicSize: a.musicSize,
});

const mapAlbum = (a: any): NcmAlbum => {
  const ar = a.artist ?? a.artists?.[0];
  return {
    id: a.id,
    name: a.name,
    picUrl: a.picUrl,
    artist: ar ? { name: ar.name, id: ar.id } : undefined,
    size: a.size,
    playCount: a.playCount,
  };
};

/** 单类型搜索：返回该类型 result 数组（原始对象） */
async function searchType(keywords: string, type: number): Promise<any[]> {
  const r = await api.cloudsearch({ keywords, type, limit: LIMIT, realIP: CN_IP });
  const result = (r.body as { result?: Record<string, any[]> }).result ?? {};
  const key =
    type === 1 ? 'songs' : type === 10 ? 'albums' : type === 100 ? 'artists' : 'playlists';
  return result[key] ?? [];
}

/** 单类型搜索（懒加载用）：提交搜索只取单曲，其余三类切到对应 tab 才请求 */
export const searchSongs = async (keywords: string): Promise<NcmSong[]> =>
  (await searchType(keywords, 1)).map(mapSong);
export const searchAlbums = async (keywords: string): Promise<NcmAlbum[]> =>
  (await searchType(keywords, 10)).map(mapAlbum);
export const searchArtists = async (keywords: string): Promise<NcmArtist[]> =>
  (await searchType(keywords, 100)).map(mapArtist);
export const searchPlaylists = async (keywords: string): Promise<NcmPlaylist[]> =>
  (await searchType(keywords, 1000)).map(mapPlaylist);

/** 一次搜索四类结果（并行，单类失败回退为空数组） */
export async function searchAll(keywords: string): Promise<SearchResult> {
  const [songsR, albumsR, artistsR, playlistsR] = await Promise.allSettled([
    searchType(keywords, 1),
    searchType(keywords, 10),
    searchType(keywords, 100),
    searchType(keywords, 1000),
  ]);
  return {
    songs: songsR.status === 'fulfilled' ? songsR.value.map(mapSong) : [],
    albums: albumsR.status === 'fulfilled' ? albumsR.value.map(mapAlbum) : [],
    artists: artistsR.status === 'fulfilled' ? artistsR.value.map(mapArtist) : [],
    playlists: playlistsR.status === 'fulfilled' ? playlistsR.value.map(mapPlaylist) : [],
  };
}
