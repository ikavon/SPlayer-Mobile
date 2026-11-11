/**
 * 收藏数据加载工具函数
 * 封装从 NCM 拉取用户收藏数据的所有逻辑
 */
import { api, CN_IP, toHttps, type NcmSong, type NcmPlaylist, type NcmAlbum, type NcmArtist } from './ncm';
import { authCookie } from './session';
import { useStore } from './store';

/** NCM 原始 song → NcmSong（兼容 ar/al 与 artists/album 两种字段命名） */
function mapNcmSong(s: any): NcmSong {
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
}

/** 获取用户歌单列表（自建 + 收藏） */
export async function fetchUserPlaylists(uid: number, musicU: string): Promise<NcmPlaylist[]> {
  const cookie = authCookie();
  const r = await api.userPlaylist({ uid, limit: 50, offset: 0, cookie, realIP: CN_IP });
  const body = r.body as { playlist?: any[] };
  // 返回原始数据，由调用方按需过滤
  return (body.playlist ?? []).map((pl: any) => ({
    id: pl.id,
    name: pl.name,
    coverImgUrl: pl.coverImgUrl,
    trackCount: pl.trackCount,
    playCount: pl.playCount,
    userId: pl.userId,
    creator: pl.creator ? { nickname: pl.creator.nickname, userId: pl.creator.userId } : undefined,
    description: pl.description,
    specialType: pl.specialType,
  }));
}

/** 获取用户喜欢的音乐 ID 列表 */
export async function fetchLikedSongIds(uid: number, musicU: string): Promise<number[]> {
  const cookie = authCookie();
  const r = await api.userLike({ uid, cookie, realIP: CN_IP });
  const body = r.body as { ids?: number[] };
  return body.ids ?? [];
}

/** 获取收藏专辑列表 */
export async function fetchUserAlbums(musicU: string): Promise<NcmAlbum[]> {
  const cookie = authCookie();
  const r = await api.userAlbum({ limit: 50, offset: 0, cookie, realIP: CN_IP });
  const body = r.body as { data?: any[] };
  return (body.data ?? []).map((al: any) => ({
    id: al.id,
    name: al.name,
    picUrl: al.picUrl,
    artist: al.artist ? { name: al.artist.name, id: al.artist.id } : undefined,
    size: al.size,
    playCount: al.playCount,
  }));
}

/** 获取收藏歌手列表 */
export async function fetchUserArtists(musicU: string): Promise<NcmArtist[]> {
  const cookie = authCookie();
  const r = await api.userArtist({ limit: 50, offset: 0, cookie, realIP: CN_IP });
  const body = r.body as { data?: any[] };
  return (body.data ?? []).map((ar: any) => ({
    id: ar.id,
    name: ar.name,
    img1v1Url: ar.img1v1Url,
    albumSize: ar.albumSize,
    musicSize: ar.musicSize,
  }));
}

/**
 * 获取歌单所有歌曲：playlist/detail 一次返回前 ~1000 首完整 song + 全量 trackIds，
 * trackIds 未覆盖的部分按批走 songDetail 补尾（对齐 SPlayer-Next 取数方式）。
 */
export async function fetchPlaylistAllSongs(
  playlistId: number,
  musicU: string,
): Promise<NcmSong[]> {
  const cookie = authCookie();
  const r = await api.playlistDetail({ id: playlistId, cookie, realIP: CN_IP });
  const raw = (r.body as { playlist?: { tracks?: any[]; trackIds?: any[] } }).playlist;
  if (!raw) return [];
  const firstBatch: NcmSong[] = (raw.tracks ?? []).map(mapNcmSong);
  const have = new Set(firstBatch.map((t) => t.id));
  const missing: number[] = (raw.trackIds ?? [])
    .map((it: any) => it.id)
    .filter((tid: number) => !have.has(tid));
  if (!missing.length) return firstBatch;
  const rest = await fetchSongsByIds(missing, musicU);
  return [...firstBatch, ...rest];
}

/**
 * 批量按 id 取歌曲详情（分块，每块 200）。
 * songDetail 走默认 eapi，响应明文 JSON。某块失败仅跳过，不拖垮整体。
 */
export async function fetchSongsByIds(ids: number[], musicU: string): Promise<NcmSong[]> {
  if (!ids.length) return [];
  const cookie = authCookie();
  const out: NcmSong[] = [];
  const seen = new Set<number>();
  const CHUNK = 200;
  const CONCURRENCY = 3; // 块间 3 路并发（千首歌单补尾从 5 个串行往返降到 2 轮），对接口仍友好
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((chunk) =>
        api
          .songDetail({ ids: chunk.join(','), cookie, realIP: CN_IP })
          .then((r) => (r.body as { songs?: any[] }).songs ?? [])
          .catch((e) => {
            console.warn('[Library] songDetail chunk failed', e);
            return [] as any[];
          }),
      ),
    );
    for (const songs of results) {
      for (const s of songs) {
        const m = mapNcmSong(s);
        if (m.id != null && !seen.has(m.id)) {
          seen.add(m.id);
          out.push(m);
        }
      }
    }
  }
  return out;
}

/**
 * 取"我喜欢的音乐"曲目：优先从红心歌单拉全量；空或失败时回退用
 * likedSongIds + songDetail（likedSongIds 已由 fetchAllLibraryData 验证可用）。
 */
export async function fetchLikedSongs(musicU: string): Promise<NcmSong[]> {
  try {
    if (!useStore.getState().userPlaylists.length) {
      await fetchAllLibraryData();
    }
    const liked = getLikedPlaylist(useStore.getState().userPlaylists);
    if (liked) {
      const tracks = await fetchPlaylistAllSongs(liked.id, musicU);
      if (tracks.length) return tracks;
    }
  } catch (e) {
    console.warn('[Library] fetchLikedSongs playlist path failed', e);
  }
  // 回退：用喜欢 ID 列表批量取详情
  const ids = useStore.getState().likedSongIds;
  if (ids.length) return fetchSongsByIds(ids, musicU);
  return [];
}

/** 专辑详情：元数据 + 曲目 */
export async function fetchAlbumDetail(
  albumId: number,
  musicU: string,
): Promise<{ name?: string; picUrl?: string; artistName?: string; songs: NcmSong[] }> {
  const cookie = authCookie();
  const r = await api.album({ id: albumId, cookie, realIP: CN_IP });
  const body = r.body as { album?: any; songs?: any[] };
  const al = body.album;
  const artistName =
    al?.artists?.map((a: any) => a.name).filter(Boolean).join(' / ') ?? al?.artist?.name;
  return {
    name: al?.name,
    picUrl: al?.picUrl,
    artistName,
    songs: (body.songs ?? []).map(mapNcmSong),
  };
}

/** 歌手详情：信息 + 热门歌曲（hotSongs） */
export async function fetchArtistDetail(
  artistId: number,
  musicU: string,
): Promise<{ name?: string; img1v1Url?: string; songs: NcmSong[] }> {
  const cookie = authCookie();
  const r = await api.artists({ id: artistId, cookie, realIP: CN_IP });
  const body = r.body as { artist?: any; hotSongs?: any[] };
  const ar = body.artist;
  return {
    name: ar?.name,
    img1v1Url: ar?.img1v1Url,
    songs: (body.hotSongs ?? []).map(mapNcmSong),
  };
}

/** 歌手全部专辑（分页，一次取完；/api/artist/albums/${id} 返 hotAlbums） */
export async function fetchArtistAlbums(
  artistId: number,
  musicU: string,
): Promise<NcmAlbum[]> {
  const cookie = authCookie();
  const all: NcmAlbum[] = [];
  const limit = 50;
  let offset = 0;
  // more 为 true 表示还有；上限兜底防止异常死循环
  for (let guard = 0; guard < 40; guard++) {
    const r = await api.artistAlbum({ id: artistId, limit, offset, cookie, realIP: CN_IP });
    const body = r.body as { hotAlbums?: any[]; more?: boolean };
    const batch = (body.hotAlbums ?? []).map((a: any) => {
      const ar = a.artist ?? a.artists?.[0];
      return {
        id: a.id,
        name: a.name,
        picUrl: a.picUrl ? toHttps(a.picUrl) : undefined,
        artist: ar ? { name: ar.name, id: ar.id } : undefined,
        size: a.size,
        publishTime: a.publishTime,
      } as NcmAlbum;
    });
    all.push(...batch);
    if (!body.more || !batch.length) break;
    offset += limit;
  }
  return all;
}

/** in-flight 去重：Search 与 Library 同时挂载会各触发一次，4 个收藏接口只打一遍 */
let libraryInflight: Promise<boolean> | null = null;

/** 一次加载所有收藏数据（歌单、喜欢 ID、专辑、歌手），返回是否成功 */
export function fetchAllLibraryData(): Promise<boolean> {
  if (libraryInflight) return libraryInflight;
  libraryInflight = doFetchAllLibraryData().finally(() => {
    libraryInflight = null;
  });
  return libraryInflight;
}

async function doFetchAllLibraryData(): Promise<boolean> {
  const { musicU, account } = useStore.getState();
  if (!musicU || !account?.userId) return false;

  try {
    const [playlists, likedIds, albums, artists] = await Promise.allSettled([
      fetchUserPlaylists(account.userId, musicU),
      fetchLikedSongIds(account.userId, musicU),
      fetchUserAlbums(musicU),
      fetchUserArtists(musicU),
    ]);

    const store = useStore.getState();

    if (playlists.status === 'fulfilled') {
      store.setUserPlaylists(playlists.value);
    } else {
      console.warn('[Library] fetchUserPlaylists failed', playlists.reason);
    }

    if (likedIds.status === 'fulfilled') {
      store.setLikedSongIds(likedIds.value);
    } else {
      console.warn('[Library] fetchLikedSongIds failed', likedIds.reason);
    }

    if (albums.status === 'fulfilled') {
      store.setUserAlbums(albums.value);
    } else {
      console.warn('[Library] fetchUserAlbums failed', albums.reason);
    }

    if (artists.status === 'fulfilled') {
      store.setUserArtists(artists.value);
    } else {
      console.warn('[Library] fetchUserArtists failed', artists.reason);
    }

    return playlists.status === 'fulfilled' || likedIds.status === 'fulfilled' || albums.status === 'fulfilled' || artists.status === 'fulfilled';
  } catch (e) {
    console.warn('[Library] fetchAllLibraryData failed', e);
    return false;
  } finally {
    useStore.getState().setLibraryLoaded(true);
  }
}

/**
 * 获取"我喜欢的音乐"歌单对象
 * 红心歌单：user_playlist 中 specialType=5 的，或按惯例第一个自建歌单
 */
export function getLikedPlaylist(playlists: NcmPlaylist[]): NcmPlaylist | null {
  // 优先 specialType=5 的（红心歌单）
  const liked = playlists.find((pl) => pl.specialType === 5);
  if (liked) return liked;
  // 回退：取第一个自建歌单
  const store = useStore.getState();
  const self = playlists.find((pl) => pl.userId === store.account?.userId);
  return self ?? playlists[0] ?? null;
}

/** 判断某首歌是否已喜欢 */
export function isSongLiked(songId: number): boolean {
  return useStore.getState().likedSongIds.includes(songId);
}

// --- 收藏/取消收藏（写入网易云账号，成功后乐观更新 store ---

/** 红心/取消红心歌曲（加入/移出"我喜欢的音乐"） */
export async function likeSong(songId: number, like: boolean): Promise<boolean> {
  const { musicU } = useStore.getState();
  if (!musicU) return false;
  try {
    const r = await api.like({ id: songId, like, cookie: authCookie(), realIP: CN_IP });
    return (r.body as { code?: number }).code === 200;
  } catch (e) {
    console.warn('[Library] likeSong failed', e);
    return false;
  }
}

/** 切换红心（乐观更新 likedSongIds，失败回滚）—— 供歌曲行 ♡ 调用 */
export async function toggleLikeSong(songId: number): Promise<void> {
  const store = useStore.getState();
  const liked = store.likedSongIds.includes(songId);
  const next = !liked;
  store.toggleLiked(songId, next);
  const ok = await likeSong(songId, next);
  if (!ok) store.toggleLiked(songId, liked);
}

/** 收藏/取消收藏专辑 */
export async function subscribeAlbum(albumId: number, sub: boolean): Promise<boolean> {
  const { musicU } = useStore.getState();
  if (!musicU) return false;
  try {
    const r = await api.albumSub({ id: albumId, t: sub ? 1 : 2, cookie: authCookie(), realIP: CN_IP });
    return (r.body as { code?: number }).code === 200;
  } catch (e) {
    console.warn('[Library] subscribeAlbum failed', e);
    return false;
  }
}

/** 收藏/取消收藏歌手 */
export async function subscribeArtist(artistId: number, sub: boolean): Promise<boolean> {
  const { musicU } = useStore.getState();
  if (!musicU) return false;
  try {
    const r = await api.artistSub({ id: artistId, t: sub ? 1 : 2, cookie: authCookie(), realIP: CN_IP });
    return (r.body as { code?: number }).code === 200;
  } catch (e) {
    console.warn('[Library] subscribeArtist failed', e);
    return false;
  }
}

/** 订阅/取消订阅歌单 */
export async function subscribePlaylist(playlistId: number, sub: boolean): Promise<boolean> {
  const { musicU } = useStore.getState();
  if (!musicU) return false;
  try {
    const r = await api.playlistSubscribe({ id: playlistId, t: sub ? 1 : 2, cookie: authCookie(), realIP: CN_IP });
    return (r.body as { code?: number }).code === 200;
  } catch (e) {
    console.warn('[Library] subscribePlaylist failed', e);
    return false;
  }
}

// --- 自建歌单：创建 / 增删曲 / 改名 / 删除（写入网易云账号，成功后乐观更新 store） ---

/** 新建歌单：成功后前置加入 userPlaylists，返回新歌单或 null */
export async function createPlaylist(name: string): Promise<NcmPlaylist | null> {
  const { musicU, account } = useStore.getState();
  if (!musicU) return null;
  try {
    const r = await api.playlistCreate({ name, cookie: authCookie(), realIP: CN_IP });
    const body = r.body as { code?: number; id?: number; playlist?: any };
    if (body.code !== 200 || body.id == null) return null;
    const pl: NcmPlaylist = {
      id: body.id,
      name,
      coverImgUrl: toHttps(body.playlist?.coverImgUrl),
      trackCount: 0,
      userId: account?.userId,
      creator: account ? { nickname: account.nickname, userId: account.userId } : undefined,
      specialType: 0,
    };
    useStore.getState().addUserPlaylist(pl);
    return pl;
  } catch (e) {
    console.warn('[Library] createPlaylist failed', e);
    return null;
  }
}

/**
 * 增曲到歌单：返回实际加入数（>0=已加，0=已在歌单中，-1=失败）。
 * 成功后乐观 trackCount+=count。
 */
export async function addToPlaylist(playlistId: number, songIds: number[]): Promise<number> {
  const { musicU } = useStore.getState();
  if (!musicU || !songIds.length) return 0;
  try {
    const r = await api.playlistTracks({
      op: 'add',
      pid: playlistId,
      tracks: songIds.join(','),
      cookie: authCookie(),
      realIP: CN_IP,
    });
    const body = r.body as { code?: number; count?: number };
    if (body.code !== 200) return 0;
    const count = typeof body.count === 'number' ? body.count : songIds.length;
    if (count > 0) useStore.getState().bumpPlaylistTrackCount(playlistId, count);
    return count;
  } catch (e) {
    console.warn('[Library] addToPlaylist failed', e);
    return -1;
  }
}

/** 从歌单删曲：成功后乐观 trackCount-1 */
export async function removeFromPlaylist(playlistId: number, songId: number): Promise<boolean> {
  const { musicU } = useStore.getState();
  if (!musicU) return false;
  try {
    const r = await api.playlistTracks({
      op: 'del',
      pid: playlistId,
      tracks: String(songId),
      cookie: authCookie(),
      realIP: CN_IP,
    });
    const ok = (r.body as { code?: number }).code === 200;
    if (ok) useStore.getState().bumpPlaylistTrackCount(playlistId, -1);
    return ok;
  } catch (e) {
    console.warn('[Library] removeFromPlaylist failed', e);
    return false;
  }
}

/** 删除歌单：成功后移出 userPlaylists */
export async function deletePlaylist(playlistId: number): Promise<boolean> {
  const { musicU } = useStore.getState();
  if (!musicU) return false;
  try {
    const r = await api.playlistDelete({ id: playlistId, cookie: authCookie(), realIP: CN_IP });
    const ok = (r.body as { code?: number }).code === 200;
    if (ok) useStore.getState().removeUserPlaylist(playlistId);
    return ok;
  } catch (e) {
    console.warn('[Library] deletePlaylist failed', e);
    return false;
  }
}

/** 改歌单名：成功后乐观更新 userPlaylists 的 name */
export async function renamePlaylist(playlistId: number, name: string): Promise<boolean> {
  const { musicU } = useStore.getState();
  if (!musicU) return false;
  try {
    const r = await api.playlistNameUpdate({ id: playlistId, name, cookie: authCookie(), realIP: CN_IP });
    const ok = (r.body as { code?: number }).code === 200;
    if (ok) useStore.getState().updateUserPlaylist(playlistId, { name });
    return ok;
  } catch (e) {
    console.warn('[Library] renamePlaylist failed', e);
    return false;
  }
}

// --- 首页推荐（复用 ncm-core recommendSongs / personalized 模块） ---

/** 每日推荐歌曲（每日 30 首，需登录） */
export async function fetchDailyRecommend(musicU: string): Promise<NcmSong[]> {
  try {
    const r = await api.recommendSongs({ cookie: authCookie(), realIP: CN_IP });
    const body = r.body as { data?: { dailySongs?: any[] } };
    return (body.data?.dailySongs ?? []).map(mapNcmSong);
  } catch (e) {
    console.warn('[Library] fetchDailyRecommend failed', e);
    return [];
  }
}

/** 个性推荐歌单（个性化推荐，带 cookie 更准） */
export async function fetchPersonalized(musicU?: string): Promise<NcmPlaylist[]> {
  try {
    const cookie = musicU ? authCookie() : undefined;
    const r = await api.personalized({ limit: 20, cookie, realIP: CN_IP });
    const body = r.body as { result?: any[] };
    return (body.result ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      coverImgUrl: toHttps(p.picUrl),
      trackCount: p.trackCount,
      playCount: p.playCount,
      description: p.copywriter,
    }));
  } catch (e) {
    console.warn('[Library] fetchPersonalized failed', e);
    return [];
  }
}