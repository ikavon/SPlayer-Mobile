/**
 * 全局状态：当前曲目、队列、解析源、MUSIC_U（登录态）、收藏数据。
 * zustand + persist，持久化层用 AsyncStorage（最通用，无 Codegen/原生兼容问题）。
 */
import { AppState } from 'react-native';
import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NcmSong, NcmPlaylist, NcmAlbum, NcmArtist } from './ncm';

/** 循环/播放模式：四个状态循环切换 */
export type LoopMode = 'order' | 'all' | 'one' | 'shuffle';

/** 登录账号信息（来自 loginStatus） */
export interface NcmAccount {
  userId: number;
  nickname: string;
  avatarUrl?: string;
}

interface State {
  current: NcmSong | null;
  /** 当前曲目经 resolve 命中的回退源 */
  resolveSource?: string;
  queue: NcmSong[];
  /** 网易云 MUSIC_U（登录态） */
  musicU?: string;
  /** 完整 NCM 会话 cookie 集（MUSIC_U/__csrf/NMTID 等，对齐桌面版 sessions 表） */
  ncmCookies: Record<string, string>;
  /** 上一次 login_refresh 时间戳（毫秒，24h 保活判断，对齐桌面版） */
  lastRefreshAt: number;
  /** 登录账号信息（musicU 存在时可能有） */
  account?: NcmAccount;
  realIP: string;
  /** 循环/播放模式（order=播完即止, all=列表循环, one=单曲循环, shuffle=随机） */
  loopMode: LoopMode;
  /** 播放倍速（1=正常，0.5–2，持久化；切歌后重新 apply） */
  playRate: number;
  /** 睡眠定时结束 epoch ms（0=关闭）；持久化供冷启恢复 */
  sleepEndTime: number;
  /** 睡眠定时：是否播完本曲再停 */
  sleepWaitSongEnd: boolean;
  /** 播放音质 level（standard/higher/exhigh/lossless/hires，默认 exhigh） */
  playLevel: string;
  /** 主题色（默认 #1db954） */
  themeColor: string;
  /** 主题模式：system(跟随系统) | light | dark，默认 system */
  themeMode: 'system' | 'light' | 'dark';

  // --- 收藏相关 ---
  /** 我喜欢听的歌曲 ID 列表（红心歌单的 ids） */
  likedSongIds: number[];
  /** 我喜欢的音乐完整歌曲列表（懒加载后缓存） */
  likedSongs: NcmSong[];
  /** 用户歌单列表（自建 + 收藏） */
  userPlaylists: NcmPlaylist[];
  /** 收藏的专辑列表 */
  userAlbums: NcmAlbum[];
  /** 收藏的歌手列表 */
  userArtists: NcmArtist[];
  /** 最近播放（本地记录，置顶去重，上限 historyLimit） */
  history: NcmSong[];
  /** 播放历史上限（用户可调，10–500，默认 100） */
  historyLimit: number;
  /** 搜索历史（本地，置顶去重，上限 20） */
  searchHistory: string[];
  /** 听歌次数统计：id → {歌信息, 次数}，按有效播放（≥10s）累计，独立于 history 上限 */
  playStats: Record<number, { song: NcmSong; count: number }>;
  /** 下载记录：id → {歌信息, 本地路径, 大小, 下载时间, 源}，存应用私有目录，跨重启持久 */
  downloads: Record<number, { song: NcmSong; path: string; size?: number; downloadedAt: number; source?: string }>;

  setCurrent: (s: NcmSong | null) => void;
  setResolveSource: (s?: string) => void;
  setQueue: (q: NcmSong[]) => void;
  setMusicU: (u?: string) => void;
  /** 整体替换 NCM 会话 cookie 集（session.ts 负责合并语义） */
  setNcmCookies: (c: Record<string, string>) => void;
  setLastRefreshAt: (t: number) => void;
  setAccount: (a?: NcmAccount) => void;
  /** 退出登录：清 MUSIC_U + 账号 + 所有收藏数据 */
  logout: () => void;
  setRealIP: (ip: string) => void;
  setLoopMode: (m: LoopMode) => void;
  setPlayRate: (r: number) => void;
  /** 开启睡眠定时（endTime=epoch ms，0=取消）；waitSongEnd=播完本曲再停 */
  setSleep: (endTime: number, waitSongEnd: boolean) => void;
  /** 切换"播完本曲再停"（运行中也即时生效，tickSleep 每秒从 store 读） */
  setSleepWaitSongEnd: (v: boolean) => void;
  clearSleep: () => void;
  setPlayLevel: (l: string) => void;
  setThemeColor: (c: string) => void;
  setThemeMode: (m: 'system' | 'light' | 'dark') => void;

  // --- 收藏 actions ---
  setLikedSongIds: (ids: number[]) => void;
  setLikedSongs: (songs: NcmSong[]) => void;
  setUserPlaylists: (list: NcmPlaylist[]) => void;
  setUserAlbums: (list: NcmAlbum[]) => void;
  setUserArtists: (list: NcmArtist[]) => void;
  /** 收藏数据是否已加载过（避免重复全量拉取） */
  libraryLoaded: boolean;
  setLibraryLoaded: (v: boolean) => void;
  /** 全局轻量 toast（自动消失，无原生依赖） */
  toast: { msg: string; key: number } | null;
  showToast: (msg: string) => void;
  clearToast: () => void;
  /** 红心/取消红心歌曲（乐观更新 likedSongIds） */
  toggleLiked: (id: number, liked: boolean) => void;
  /** 收藏/取消收藏专辑（乐观增删 userAlbums） */
  toggleAlbumSubscribed: (album: NcmAlbum, sub: boolean) => void;
  /** 收藏/取消收藏歌手（乐观增删 userArtists） */
  toggleArtistSubscribed: (artist: NcmArtist, sub: boolean) => void;
  /** 收藏/取消收藏歌单（乐观增删 userPlaylists） */
  togglePlaylistSubscribed: (playlist: NcmPlaylist, sub: boolean) => void;
  /** 新建歌单后前置加入 userPlaylists */
  addUserPlaylist: (playlist: NcmPlaylist) => void;
  /** 删除歌单后移出 userPlaylists */
  removeUserPlaylist: (id: number) => void;
  /** 更新歌单元数据（如改名） */
  updateUserPlaylist: (id: number, patch: Partial<NcmPlaylist>) => void;
  /** 增删曲后调整 trackCount（clamp ≥0） */
  bumpPlaylistTrackCount: (id: number, delta: number) => void;
  /** 记一首到播放历史（置顶去重，截断到 historyLimit） */
  pushHistory: (song: NcmSong) => void;
  /** 设播放历史上限并截断现有历史（clamp 10–500） */
  setHistoryLimit: (n: number) => void;
  /** 清空播放历史 */
  clearHistory: () => void;
  /** 记一条搜索历史（置顶去重，截断 20） */
  pushSearch: (q: string) => void;
  /** 清空搜索历史 */
  clearSearchHistory: () => void;
  /** 累计一首的有效播放次数（+1，并更新歌信息） */
  incPlayCount: (song: NcmSong) => void;
  /** 清空听歌次数统计 */
  clearPlayStats: () => void;
  /** 下载完成：记/覆盖本地路径（文件由 download.ts 写） */
  addDownload: (song: NcmSong, path: string, size?: number, source?: string) => void;
  /** 删除一条下载记录（不删文件，文件由 download.ts 删） */
  removeDownload: (id: number) => void;
  /** 清空下载记录（文件由 download.ts 删） */
  clearDownloads: () => void;
}

/** playStats 条目上限：超限淘汰次数最少者，防止无界增长随整店持久化 */
const PLAY_STATS_MAX = 1000;

/**
 * 写盘防抖：一次切歌连续 4 次 set 合并为一次序列化+写盘（旧实现每次 set 都全量
 * JSON.stringify 整店并写 AsyncStorage）。退后台立即 flush，避免进程被杀丢最后一批状态。
 */
const WRITE_DELAY = 400;
/** partialize 后的持久化形状（toast 瞬态不落盘） */
type Persisted = Omit<State, 'toast'>;
let pendingWrite: { name: string; value: StorageValue<Persisted> } | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

const flushPendingWrite = () => {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (!pendingWrite) return;
  const { name, value } = pendingWrite;
  pendingWrite = null;
  AsyncStorage.setItem(name, JSON.stringify(value)).catch(() => {});
};

AppState.addEventListener('change', (st) => {
  if (st !== 'active') flushPendingWrite();
});

const debouncedStorage: PersistStorage<Persisted> = {
  getItem: async (name) => {
    const str = await AsyncStorage.getItem(name);
    return str ? (JSON.parse(str) as StorageValue<Persisted>) : null;
  },
  setItem: (name, value) => {
    pendingWrite = { name, value };
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(flushPendingWrite, WRITE_DELAY);
  },
  removeItem: (name) => {
    pendingWrite = null;
    if (writeTimer) clearTimeout(writeTimer);
    return AsyncStorage.removeItem(name);
  },
};

export const useStore = create<State>()(
  persist(
    (set) => ({
      current: null,
      resolveSource: undefined,
      queue: [],
      musicU: undefined,
      ncmCookies: {},
      lastRefreshAt: 0,
      account: undefined,
      realIP: '116.25.53.100',
      loopMode: 'order',
      playRate: 1,
      sleepEndTime: 0,
      sleepWaitSongEnd: true,
      playLevel: 'exhigh',
      themeColor: '#1db954',
      themeMode: 'system',

      likedSongIds: [],
      likedSongs: [],
      userPlaylists: [],
      userAlbums: [],
      userArtists: [],
      history: [],
      historyLimit: 100,
      searchHistory: [],
      playStats: {},
      downloads: {},
      libraryLoaded: false,

      toast: null,
      showToast: (msg) => set({ toast: { msg, key: Date.now() } }),
      clearToast: () => set({ toast: null }),

      setCurrent: (s) => set({ current: s }),
      setResolveSource: (s) => set({ resolveSource: s }),
      setQueue: (q) => set({ queue: q }),
      setMusicU: (u) => set({ musicU: u }),
      setNcmCookies: (c) => set({ ncmCookies: c }),
      setLastRefreshAt: (t) => set({ lastRefreshAt: t }),
      setAccount: (a) => set({ account: a }),
      logout: () => set({
        musicU: undefined,
        ncmCookies: {},
        lastRefreshAt: 0,
        account: undefined,
        likedSongIds: [],
        likedSongs: [],
        userPlaylists: [],
        userAlbums: [],
        userArtists: [],
        libraryLoaded: false,
      }),
      setRealIP: (ip) => set({ realIP: ip }),
      setLoopMode: (m) => set({ loopMode: m }),
      setPlayRate: (r) => set({ playRate: r }),
      setSleep: (endTime, waitSongEnd) => set({ sleepEndTime: endTime, sleepWaitSongEnd: waitSongEnd }),
      setSleepWaitSongEnd: (v) => set({ sleepWaitSongEnd: v }),
      clearSleep: () => set({ sleepEndTime: 0 }),
      setPlayLevel: (l) => set({ playLevel: l }),
      setThemeColor: (c) => set({ themeColor: c }),
      setThemeMode: (m) => set({ themeMode: m }),

      setLikedSongIds: (ids) => set({ likedSongIds: ids }),
      setLikedSongs: (songs) => set({ likedSongs: songs }),
      setUserPlaylists: (list) => set({ userPlaylists: list }),
      setUserAlbums: (list) => set({ userAlbums: list }),
      setUserArtists: (list) => set({ userArtists: list }),
      setLibraryLoaded: (v) => set({ libraryLoaded: v }),
      toggleLiked: (id, liked) =>
        set((s) => ({
          likedSongIds: liked
            ? (s.likedSongIds.includes(id) ? s.likedSongIds : [...s.likedSongIds, id])
            : s.likedSongIds.filter((i) => i !== id),
        })),
      toggleAlbumSubscribed: (album, sub) =>
        set((s) => ({
          userAlbums: sub
            ? (s.userAlbums.some((a) => a.id === album.id) ? s.userAlbums : [...s.userAlbums, album])
            : s.userAlbums.filter((a) => a.id !== album.id),
        })),
      toggleArtistSubscribed: (artist, sub) =>
        set((s) => ({
          userArtists: sub
            ? (s.userArtists.some((a) => a.id === artist.id) ? s.userArtists : [...s.userArtists, artist])
            : s.userArtists.filter((a) => a.id !== artist.id),
        })),
      togglePlaylistSubscribed: (playlist, sub) =>
        set((s) => ({
          userPlaylists: sub
            ? (s.userPlaylists.some((p) => p.id === playlist.id) ? s.userPlaylists : [...s.userPlaylists, playlist])
            : s.userPlaylists.filter((p) => p.id !== playlist.id),
        })),
      addUserPlaylist: (playlist) =>
        set((s) => ({
          userPlaylists: s.userPlaylists.some((p) => p.id === playlist.id)
            ? s.userPlaylists
            : [playlist, ...s.userPlaylists],
        })),
      removeUserPlaylist: (id) =>
        set((s) => ({ userPlaylists: s.userPlaylists.filter((p) => p.id !== id) })),
      updateUserPlaylist: (id, patch) =>
        set((s) => ({
          userPlaylists: s.userPlaylists.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      bumpPlaylistTrackCount: (id, delta) =>
        set((s) => ({
          userPlaylists: s.userPlaylists.map((p) =>
            p.id === id
              ? { ...p, trackCount: Math.max(0, (p.trackCount ?? 0) + delta) }
              : p,
          ),
        })),
      pushHistory: (song) =>
        set((s) => {
          if (!song?.id) return s;
          const rest = s.history.filter((h) => h.id !== song.id);
          return { history: [song, ...rest].slice(0, s.historyLimit) };
        }),
      setHistoryLimit: (n) =>
        set((s) => {
          const limit = Math.max(10, Math.min(500, Math.floor(n) || 100));
          return { historyLimit: limit, history: s.history.slice(0, limit) };
        }),
      clearHistory: () => set({ history: [] }),
      pushSearch: (q) =>
        set((s) => {
          const kw = q.trim();
          if (!kw) return s;
          const rest = s.searchHistory.filter((h) => h !== kw);
          return { searchHistory: [kw, ...rest].slice(0, 20) };
        }),
      clearSearchHistory: () => set({ searchHistory: [] }),
      incPlayCount: (song) =>
        set((s) => {
          if (!song?.id) return s;
          const prev = s.playStats[song.id];
          let next = {
            ...s.playStats,
            [song.id]: { song, count: (prev?.count ?? 0) + 1 },
          };
          const keys = Object.keys(next);
          if (keys.length > PLAY_STATS_MAX) {
            keys.sort((a, b) => next[Number(b)].count - next[Number(a)].count);
            next = Object.fromEntries(
              keys.slice(0, PLAY_STATS_MAX).map((k) => [k, next[Number(k)]]),
            );
          }
          return { playStats: next };
        }),
      clearPlayStats: () => set({ playStats: {} }),
      addDownload: (song, path, size, source) =>
        set((s) => ({
          downloads: {
            ...s.downloads,
            [song.id]: { song, path, size, downloadedAt: Date.now(), source },
          },
        })),
      removeDownload: (id) =>
        set((s) => {
          const rest = { ...s.downloads };
          delete rest[id];
          return { downloads: rest };
        }),
      clearDownloads: () => set({ downloads: {} }),
    }),
    {
      name: 'splayer-mobile',
      storage: debouncedStorage,
      // toast 是瞬态：showToast/clearToast 不再触发整店序列化写盘
      partialize: (s) => {
        const { toast, ...rest } = s;
        return rest;
      },
      // 旧版本把 toast 一起持久化了，升级恢复时丢弃
      merge: (persisted, current) => {
        const p = { ...(persisted as Partial<State>) };
        delete p.toast;
        return { ...current, ...p };
      },
    },
  ),
);