/**
 * track-player 4.x 接线 + 队列管理。
 * - playSongsAt：批量取整列 NCM url（一次调用），只把有真实 url 的歌入队
 *   （track-player 校验 url 非空，VIP 空链接曲跳过以免 setQueue 报错）；
 *   起始曲若 VIP 则单首 resolve(含 GD) 保证能播。
 * - 切歌：PlaybackActiveTrackChanged 同步 store 当前曲 + 音源。
 */
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  RepeatMode,
  State,
} from 'react-native-track-player';
import { api, resolveSongUrl, CN_IP, toHttps, type NcmSong, type ResolveInput } from './ncm';
import { authCookie } from './session';
import { useStore, type LoopMode } from './store';
import { useLive } from './liveStore';
import { localUriFor } from './download';
import { getCachedResolve, setCachedResolve } from './resolveCache';
import { lyricOnProgress, lyricOnTrackChanged } from './lockscreenLyric';

// 全局守卫：HMR/重载后 native player 仍在，setupPlayer 不能重复调
const _ready = globalThis as unknown as { __rntpReady?: boolean };

export async function ensurePlayer(): Promise<void> {
  if (_ready.__rntpReady) return;
  try {
    await TrackPlayer.setupPlayer();
  } catch {
    // 已初始化（HMR/重载后 native 仍在）——忽略
  }
  await TrackPlayer.updateOptions({
    android: { appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback },
    // 原生协程进度事件（锁屏照发）——驱动锁屏歌词引擎（JS 定时器锁屏会被挂起，不能靠轮询）
    progressUpdateEventInterval: 0.5,
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.SeekTo,
    ],
    compactCapabilities: [Capability.Play, Capability.Pause],
  });
  _ready.__rntpReady = true;
}

/** 批量取 NCM 播放地址（一次调用多 id）→ id → {url,br}。
 *  带登录 MUSIC_U 时官方可解锁登录态/VIP 可播曲（否则 VIP 恒 null，只能靠 GD/QQ 兜底）。
 *  注意：NCM 返回的多为 http:// CDN 链接，统一转 https——Android release 包默认禁明文流量，
 *  http 链接会被系统拦截导致 ExoPlayer 加载失败（无声、时长 0）。 */
async function bulkNcmUrls(
  ids: number[],
  realIP: string,
  musicU?: string,
  level: string = 'exhigh',
): Promise<Record<number, { url?: string; br?: number }>> {
  if (!ids.length) return {};
  try {
    const r = await api.songUrl({
      id: ids.join(','),
      level: level as never,
      realIP,
      ...(musicU ? { cookie: authCookie() } : {}),
    });
    const data = (r.body as { data?: { id: number; url?: string; br?: number }[] }).data ?? [];
    const m: Record<number, { url?: string; br?: number }> = {};
    for (const d of data) m[d.id] = { url: d.url ? toHttps(d.url) : undefined, br: d.br };
    return m;
  } catch {
    return {};
  }
}

/** 分块 bulk：每块 ≤300 id 并行请求（千首歌单不再把上千 id 拼进一个请求，
 *  避免超服务端限制，也缩短整体等待）。单块失败回退空表，占位曲交给前瞻解析。 */
async function bulkNcmUrlsChunked(
  ids: number[],
  realIP: string,
  musicU?: string,
  level: string = 'exhigh',
): Promise<Record<number, { url?: string; br?: number }>> {
  const CHUNK = 300;
  if (ids.length <= CHUNK) return bulkNcmUrls(ids, realIP, musicU, level);
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
  const results = await Promise.all(chunks.map((c) => bulkNcmUrls(c, realIP, musicU, level)));
  return Object.assign({}, ...results);
}

type TrackObj = {
  id: string;
  url: string;
  title: string;
  artist: string;
  artwork?: string;
  album?: string;
  artistId?: number;
  albumId?: number;
};

// 模块级记录当前原生队列：_orig 原始顺序（playSongsAt 建的那份），_current 当前实际顺序（随机时被打乱）
let _orig: TrackObj[] = [];
let _current: TrackObj[] = [];
let _shuffled = false;
// id → 音源（仅记录经 resolve 的回退曲源；bulkNcmUrls 来的恒为 netease，查不到即默认 netease）
const _sourceMap = new Map<string, string>();
/** 占位 url：未解析的 VIP 曲先用它满足 track-player 的 url 非空校验（空 url 会抛
 *  'The URL cannot be empty'）。前瞻解析器在临近播放前会把它换成真链接；全源失败的曲会被前瞻
 *  剪枝移除。占位实际不会被 ExoPlayer 加载，仅极端未及换链时被触发，由 PlaybackError 兜底跳过。 */
const PLACEHOLDER_URL = 'https://splayer.local/placeholder';
/** 前瞻令牌：每次启动新一轮自增，async 体内失配即 abort（队列重建/换歌后旧轮作废）。 */
let _lookAheadToken = 0;
/** in-flight 去重：前瞻与跳歌守卫可能并发解析同一 id，命中复用既有 promise，避免重复砸公益解锁源。 */
const _inflight = new Map<number, Promise<{ url: string; source: string } | undefined>>();

function shuffleArr<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/** 以新顺序重建队列，保留当前曲目与进度、播放/暂停态 */
async function rebuildQueueKeepCurrent(order: TrackObj[]): Promise<void> {
  if (!order.length || !_current.length) return;
  const curIdx = (await TrackPlayer.getActiveTrackIndex()) ?? 0;
  const cur = _current[curIdx];
  let wasPlaying = false;
  let pos = 0;
  try {
    wasPlaying = (await TrackPlayer.getPlaybackState()).state === State.Playing;
  } catch {}
  try {
    pos = (await TrackPlayer.getProgress()).position;
  } catch {}
  const newIdx = Math.max(0, order.findIndex((t) => cur !== undefined && t.id === cur.id));
  await TrackPlayer.reset();
  // 传深拷贝给 setQueue：RN MessageQueue 会递归 deep-freeze 传给 native 的参数（dev 模式），
  // 若直接传 order（=_current 的同引用）会把 _current 冻死，后续 _current[idx]=/splice 全抛
  // "meant to be immutable and has been frozen"。传拷贝让冻结落在拷贝上，_current 保持可变。
  await TrackPlayer.setQueue(order.map((t) => ({ ...t })));
  await TrackPlayer.skip(newIdx);
  if (wasPlaying) await TrackPlayer.play();
  if (pos > 1) {
    try {
      await TrackPlayer.seekTo(pos);
    } catch {}
  }
  if (!wasPlaying) await TrackPlayer.pause();
  _current = order;
  // 重建队列（随机/退出随机）后按新序推进前瞻
  scheduleLookAhead();
}

/** 随机：当前曲打头，其余洗牌 */
async function enableShuffle(): Promise<void> {
  if (_current.length <= 1) return;
  const curIdx = (await TrackPlayer.getActiveTrackIndex()) ?? 0;
  if (curIdx < 0 || curIdx >= _current.length) return;
  const cur = _current[curIdx];
  const rest = _current.filter((_, i) => i !== curIdx);
  await rebuildQueueKeepCurrent([cur, ...shuffleArr(rest)]);
}

/** 退出随机：恢复原始顺序 */
async function restoreOriginal(): Promise<void> {
  if (!_orig.length) return;
  await rebuildQueueKeepCurrent(_orig);
}

export const LOOP_ORDER: LoopMode[] = ['order', 'all', 'one', 'shuffle'];

/** 循环模式标签：统一用单色文字箭头（Arrows 区，与「→ 顺序」同风格），
 *  不用 emoji（🔁🔂🔀 会被部分机型渲成彩色、宽度不一） */
export const LOOP_LABEL: Record<LoopMode, string> = {
  order: '→ 顺序',
  all: '↻ 循环',
  one: '↺ 单曲',
  shuffle: '⇄ 随机',
};

export function nextLoopMode(m: LoopMode): LoopMode {
  const i = LOOP_ORDER.indexOf(m);
  return LOOP_ORDER[(i + 1) % LOOP_ORDER.length];
}

/** 应用循环/播放模式（含随机洗牌）。order=播完即止, all=列表循环, one=单曲循环, shuffle=随机 */
export async function applyLoopMode(mode: LoopMode): Promise<void> {
  await ensurePlayer();
  if (mode === 'shuffle') {
    await enableShuffle();
    await TrackPlayer.setRepeatMode(RepeatMode.Queue);
  } else {
    if (_shuffled) await restoreOriginal();
    await TrackPlayer.setRepeatMode(
      mode === 'one' ? RepeatMode.Track : mode === 'all' ? RepeatMode.Queue : RepeatMode.Off,
    );
  }
  _shuffled = mode === 'shuffle';
}

// --- 播放倍速 ---
/** 立即 apply 倍速到当前播放（切歌后由 playbackService 自动重 apply；此处供 Settings 改动即时生效） */
export async function applyPlayRate(rate: number) {
  try {
    await TrackPlayer.setRate(rate);
  } catch {
    /* 未在播或引擎不支持：忽略 */
  }
}

// --- 睡眠定时（renderer setInterval；track-player 前台服务期间 JS 持续走，背景播放照常倒计时） ---
let _sleepInterval: ReturnType<typeof setInterval> | null = null;
let _sleepPendingStop = false;

function tickSleep(endTime: number) {
  const waitSongEnd = useStore.getState().sleepWaitSongEnd;
  const remain = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
  useLive.getState().setSleepLive(remain, remain > 0);
  if (remain <= 0) {
    if (_sleepInterval) { clearInterval(_sleepInterval); _sleepInterval = null; }
    if (!waitSongEnd) {
      TrackPlayer.pause().catch(() => {});
      useStore.getState().clearSleep();
      useLive.getState().setSleepLive(0, false);
    } else {
      _sleepPendingStop = true; // 播完本曲再停：下首切来时 pause
    }
  }
}

/** 开启睡眠定时（分钟） */
export function startSleepTimer(minutes: number, waitSongEnd: boolean) {
  cancelSleepTimer();
  const endTime = Date.now() + minutes * 60_000;
  useStore.getState().setSleep(endTime, waitSongEnd);
  tickSleep(endTime);
  _sleepInterval = setInterval(() => tickSleep(endTime), 1000);
}

/** 取消睡眠定时 */
export function cancelSleepTimer() {
  if (_sleepInterval) { clearInterval(_sleepInterval); _sleepInterval = null; }
  _sleepPendingStop = false;
  useStore.getState().clearSleep();
  useLive.getState().setSleepLive(0, false);
}

/** 冷启动恢复：按持久化的 endTime 续跑或标记待停 */
export function restoreSleepTimer() {
  const { sleepEndTime } = useStore.getState();
  if (!sleepEndTime) return;
  if (sleepEndTime > Date.now()) {
    if (_sleepInterval) clearInterval(_sleepInterval);
    _sleepInterval = setInterval(() => tickSleep(sleepEndTime), 1000);
    tickSleep(sleepEndTime);
  } else if (useStore.getState().sleepWaitSongEnd) {
    _sleepPendingStop = true;
  } else {
    useStore.getState().clearSleep();
  }
}

/** 带短缓存的解析：命中复用（2min TTL），否则 resolveSongUrl + 缓存。
 *  另带 in-flight 去重：前瞻与跳歌守卫可能并发解析同一 id，命中复用既有 promise，避免重复砸源。 */
async function cachedResolveSong(input: ResolveInput): Promise<{ url: string; source: string } | undefined> {
  const cached = getCachedResolve(input.id);
  if (cached) return cached;
  const existing = _inflight.get(input.id);
  if (existing) return existing;
  const p = (async () => {
    try {
      const r = await resolveSongUrl(input);
      if (r?.url) {
        setCachedResolve(input.id, r.url, r.source);
        return { url: r.url, source: r.source };
      }
    } catch {
      /* ignore */
    }
    return undefined;
  })().finally(() => {
    _inflight.delete(input.id);
  });
  _inflight.set(input.id, p);
  return p;
}

/**
 * 从列表 startIndex 处开始播放整列队列。
 * 起始曲若 VIP(url 空)则单首 resolve(含回退)保证能播；**只阻塞解析这一首**，长歌单秒开。
 * 其余曲：bulk 命中(非 VIP/登录曲)直接用真链，VIP 曲以 PLACEHOLDER_URL 占位入队（满足
 * track-player 的 url 非空校验），由前瞻解析器在临近播放前换真链、全源失败则剪枝移除。
 */
export async function playSongsAt(songs: NcmSong[], startIndex: number): Promise<string> {
  await ensurePlayer();
  const realIP = useStore.getState().realIP || CN_IP;
  const musicU = useStore.getState().musicU; // 登录态 → 解锁 VIP/登录曲官方链接
  const playLevel = useStore.getState().playLevel;

  const start = songs[startIndex];
  // 其余曲的 bulk 与起始曲解析并行：长歌单不再等整列 bulk 返回才开口播第一首
  const restIds = songs.filter((_, i) => i !== startIndex).map((s) => s.id);
  const bulkPromise = bulkNcmUrlsChunked(restIds, realIP, musicU, playLevel);

  // 起始曲：离线优先（本地 file://），其次单 id 快速取链，VIP 则 resolve(含回退)
  let startUrl = localUriFor(start.id);
  let startSource = startUrl ? 'offline' : 'netease';
  if (!startUrl) {
    const single = await bulkNcmUrls([start.id], realIP, musicU, playLevel);
    startUrl = single[start.id]?.url;
    if (!startUrl) {
      const r = await cachedResolveSong({
        id: start.id,
        name: start.name,
        artist: start.artist,
        realIP,
        level: playLevel,
        ...(musicU ? { cookie: authCookie() } : {}),
      });
      if (r?.url) {
        startUrl = r.url;
        startSource = r.source;
      }
    }
  }
  if (!startUrl) throw new Error('无法解析播放链接');
  const bulk = await bulkPromise;

  // 新队列替换旧队列：清旧源映射，再记回退曲源（bulk 来的恒 netease 不必记，查不到默认 netease）
  _sourceMap.clear();
  if (startSource !== 'netease') _sourceMap.set(String(start.id), startSource);

  // 构建队列：每首均入队（顺序完整、Queue 屏正常显示）。bulk 命中的用真链(netEase)，
  // VIP 曲用 PLACEHOLDER_URL 占位——满足 track-player url 非空校验，前瞻会在临近播放前换真链。
  // 因此 startQueueIndex === startIndex（不再因跳过不可解析曲而错位）。
  const tracks: TrackObj[] = songs.map((s, i) => {
    const local = localUriFor(s.id);
    let u: string;
    let src: string;
    if (local) {
      u = local;
      src = 'offline';
    } else if (i === startIndex) {
      u = startUrl;
      src = startSource;
    } else {
      const bu = bulk[s.id]?.url;
      u = bu ?? PLACEHOLDER_URL;
      src = bu ? 'netease' : 'placeholder';
    }
    if (src !== 'netease' && src !== 'placeholder') _sourceMap.set(String(s.id), src);
    return {
      id: String(s.id),
      url: u,
      title: s.name,
      artist: s.artist ?? '',
      artwork: s.cover,
      album: s.albumName,
      artistId: s.artistId,
      albumId: s.albumId,
    };
  });

  // 记录原始队列顺序（随机退出时用），并重置随机态
  _orig = tracks;
  _current = tracks;
  _shuffled = false;

  // 先同步 store：PlaybackActiveTrackChanged 事件触发时 queue/current 已含完整 NcmSong
  // （track-player 事件里的 track 可能丢自定义字段，store.current 才是 ArtistId/albumId 的可靠来源）
  useStore.getState().setQueue(songs);
  useStore.getState().setCurrent(start);
  useStore.getState().setResolveSource(startSource);

  await TrackPlayer.reset();
  // 传深拷贝给 setQueue：RN MessageQueue 会递归 deep-freeze 传给 native 的参数（dev），
  // 直接传 tracks（=_current/_orig 同引用）会把它们冻死，后续 patch 的 _current[idx]= 抛错。
  await TrackPlayer.setQueue(tracks.map((t) => ({ ...t })));
  await TrackPlayer.skip(startIndex);
  await TrackPlayer.play();

  // 应用持久化的循环/随机模式（随机时对刚建的队列洗牌）；失败不阻断播放（歌已播）
  try {
    await applyLoopMode(useStore.getState().loopMode);
  } catch (e) {
    console.warn('[player] applyLoopMode after play failed', e);
  }

  // 前瞻解析起始曲之后的占位曲（fire-and-forget，不阻塞已开始的播放）
  scheduleLookAhead();
  return startSource;
}

/** 单首播放（兼容旧调用） */
export const playSong = (song: NcmSong): Promise<string> => playSongsAt([song], 0);

// --- 队列管理：add/move/remove/skip 都同步 _orig/_current，保持与 track-player 一致 ---

/** 单首解析 url + 源：bulk 优先(netEase)，VIP 走 resolve(GD 兜底)；带 MUSIC_U 解锁登录曲 */
async function resolveOne(
  song: NcmSong,
  realIP: string,
  musicU?: string,
): Promise<{ url: string; source: string } | undefined> {
  const local = localUriFor(song.id);
  if (local) return { url: local, source: 'offline' };
  const level = useStore.getState().playLevel;
  const bulk = await bulkNcmUrls([song.id], realIP, musicU, level);
  if (bulk[song.id]?.url) return { url: bulk[song.id].url!, source: 'netease' };
  return cachedResolveSong({
    id: song.id,
    name: song.name,
    artist: song.artist,
    realIP,
    level,
    ...(musicU ? { cookie: authCookie() } : {}),
  });
}

/** TrackObj → NcmSong（队列 UI 展示用） */
function trackToSong(t: any): NcmSong {
  return {
    id: Number(t.id),
    name: t.title ?? '',
    artist: t.artist,
    artistId: t.artistId != null ? Number(t.artistId) : undefined,
    albumName: t.album,
    albumId: t.albumId != null ? Number(t.albumId) : undefined,
    cover: t.artwork,
  };
}

// --- 懒加载：原地换 url + 剪枝 + 前瞻解析 ---
// 未解析 VIP 曲以 PLACEHOLDER_URL 入队；前瞻在临近播放前换真链接，全源失败则剪枝移除。

/** 原地把队列 idx 处的占位 url 换成真链接（remove+add 让 ExoPlayer 重新预准备该队列项）。
 *  仅对 active 之后的 idx 调用（不动当前在播曲）。同步 _current[idx] 与 _orig 中同 id 项。 */
async function patchTrackUrl(idx: number, track: TrackObj, source: string): Promise<void> {
  try {
    await TrackPlayer.remove([idx]);
    await TrackPlayer.add([track], idx);
  } catch (e) {
    console.warn('[player] patchTrackUrl remove+add failed', e);
    return;
  }
  if (idx >= 0 && idx < _current.length) _current[idx] = track;
  const o = _orig.findIndex((t) => t.id === track.id);
  if (o >= 0) _orig[o] = track;
  if (source !== 'netease') _sourceMap.set(track.id, source);
}

/** 解析 idx 处占位曲：命中→patchTrackUrl 换真链接返回 true；全源失败→剪枝移除返回 false。
 *  仅对 active 之后的 idx 调用（移除 active 之后的项不改变 active 的 index）。 */
async function resolveAndPatch(track: TrackObj, idx: number): Promise<boolean> {
  const realIP = useStore.getState().realIP || CN_IP;
  const musicU = useStore.getState().musicU;
  const playLevel = useStore.getState().playLevel;
  const song = trackToSong(track);
  const r = await cachedResolveSong({
    id: song.id,
    name: song.name,
    artist: song.artist,
    realIP,
    level: playLevel,
    ...(musicU ? { cookie: authCookie() } : {}),
  });
  if (r?.url) {
    await patchTrackUrl(idx, { ...track, url: r.url }, r.source);
    return true;
  }
  // 全源失败：从原生队列与镜像移除（延后剪枝，等价旧"丢弃不可解析曲"，无 error toast）
  try {
    await TrackPlayer.remove([idx]);
  } catch {
    /* ignore */
  }
  if (idx >= 0 && idx < _current.length) _current.splice(idx, 1);
  const o = _orig.findIndex((t) => t.id === track.id);
  if (o >= 0) _orig.splice(o, 1);
  return false;
}

/** 前瞻解析 activeIdx 之后的占位曲：循环解析"紧邻的下一首"直到它变成真链接或队列结束。
 *  patch 后下一首已真→return；prune 后新元素移到 idx→继续解析。保证自然连播进下一首时已是真链。
 *  顺序执行（非并发），对公益解锁源友好。token 失配（换歌/重建队列）即 abort。
 *  读 _current 镜像（与原生队列同序，移除项不改变 active 的 index）。 */
async function ensureLookAhead(activeIdx: number, token: number): Promise<void> {
  for (;;) {
    if (_lookAheadToken !== token) return;
    const idx = activeIdx + 1;
    if (idx >= _current.length) return;
    const t = _current[idx];
    if (!t || t.url !== PLACEHOLDER_URL) return; // 紧邻下一首已真链 → 无事可做
    if (_lookAheadToken !== token) return;
    await resolveAndPatch(t, idx);
  }
}

/** 触发一轮前瞻解析（fire-and-forget）。在 playSongsAt 末尾、rebuildQueueKeepCurrent 末尾、
 *  PlaybackActiveTrackChanged 中调用——任一换歌/重建后按新 active 推进前瞻。 */
function scheduleLookAhead(): void {
  const token = ++_lookAheadToken;
  void (async () => {
    try {
      const idx = await TrackPlayer.getActiveTrackIndex();
      if (idx == null) return;
      await ensureLookAhead(idx, token);
    } catch {
      /* ignore */
    }
  })();
}

/** 取实际播放队列（含 shuffle 顺序）的 NcmSong 视图 */
export async function getQueueSongs(): Promise<NcmSong[]> {
  try {
    const q = await TrackPlayer.getQueue();
    return q.map(trackToSong);
  } catch {
    return [];
  }
}

/** 队列 JS 镜像（_current 与原生队列同步维护）：切歌事件刷新 UI 用，
 *  免 getQueue 全量过桥（千首队列每次切歌序列化上千 track 对象） */
export function getQueueMirrorSongs(): NcmSong[] {
  return _current.map(trackToSong);
}

/** 当前播放曲在队列中的 index */
export async function getQueueActiveIndex(): Promise<number> {
  try {
    return (await TrackPlayer.getActiveTrackIndex()) ?? 0;
  } catch {
    return 0;
  }
}

/** 跳到队列某首并播放。目标是占位曲则先现场解析（守卫），解析失败已剪枝则跳到的就是下一首。 */
export async function skipToIndex(index: number): Promise<void> {
  await ensurePlayer();
  try {
    const target = _current[index];
    if (target && target.url === PLACEHOLDER_URL) {
      await resolveAndPatch(target, index);
    }
    await TrackPlayer.skip(index);
    await TrackPlayer.play();
  } catch (e) {
    console.warn('[player] skipToIndex failed', index, _current.length, e);
  }
}

/** 下一首：active+1 若为占位曲先现场解析（前瞻通常已换好，此处兜底快速连跳/刚换歌时）。 */
export async function skipNext(): Promise<void> {
  await ensurePlayer();
  try {
    const cur = await TrackPlayer.getActiveTrackIndex();
    if (cur == null) return;
    const target = _current[cur + 1];
    if (target && target.url === PLACEHOLDER_URL) {
      await resolveAndPatch(target, cur + 1);
    }
    await TrackPlayer.skipToNext();
    await TrackPlayer.play();
  } catch (e) {
    console.warn('[player] skipNext failed', e);
  }
}

/** 上一首：active-1 若为占位曲先现场解析（prev 方向前瞻未覆盖，更常需现场解析）。 */
export async function skipPrev(): Promise<void> {
  await ensurePlayer();
  try {
    const cur = await TrackPlayer.getActiveTrackIndex();
    if (cur == null || cur <= 0) return;
    const target = _current[cur - 1];
    if (target && target.url === PLACEHOLDER_URL) {
      await resolveAndPatch(target, cur - 1);
    }
    await TrackPlayer.skipToPrevious();
    await TrackPlayer.play();
  } catch (e) {
    console.warn('[player] skipPrev failed', e);
  }
}

/** 移除队列 index（同步 _orig/_current） */
export async function removeFromQueue(index: number): Promise<void> {
  try {
    await TrackPlayer.remove([index]);
    if (index >= 0 && index < _orig.length) _orig.splice(index, 1);
    if (index >= 0 && index < _current.length) _current.splice(index, 1);
  } catch {
    /* ignore */
  }
}

/** 把队列内某首设为"下一首播放"：删原位、插到当前曲后。
 *  用 remove+add 而非 move——move 在 4.x 不可靠地跟踪 active index（会导致显示与播放错位）。 */
export async function playQueueItemNext(index: number): Promise<void> {
  await ensurePlayer();
  try {
    const q = await TrackPlayer.getQueue();
    const track = q[index];
    if (!track) return;
    const cur = await TrackPlayer.getActiveTrackIndex();
    if (cur == null || index === cur) return; // 无在播 / 已在播
    await TrackPlayer.remove([index]);
    const curAfter = await TrackPlayer.getActiveTrackIndex();
    const insertAt = (curAfter ?? 0) + 1;
    await TrackPlayer.add([track], insertAt);
    const pickFromArr = <T>(a: T[], from: number, to: number) => {
      if (from < 0 || from >= a.length) return;
      const x = a[from];
      a.splice(from, 1);
      a.splice(to, 0, x);
    };
    pickFromArr(_orig, index, insertAt);
    pickFromArr(_current, index, insertAt);
  } catch {
    /* ignore */
  }
}

/** 追加一首到队列末尾（解析 url，VIP 走 GD 兜底） */
export async function addToQueue(song: NcmSong): Promise<boolean> {
  await ensurePlayer();
  const realIP = useStore.getState().realIP || CN_IP;
  const resolved = await resolveOne(song, realIP, useStore.getState().musicU);
  if (!resolved) return false;
  if (resolved.source !== 'netease') _sourceMap.set(String(song.id), resolved.source);
  const t: TrackObj = {
    id: String(song.id),
    url: resolved.url,
    title: song.name,
    artist: song.artist ?? '',
    artwork: song.cover,
    album: song.albumName,
    artistId: song.artistId,
    albumId: song.albumId,
  };
  try {
    const hadNoActive = (await TrackPlayer.getActiveTrackIndex()) == null;
    await TrackPlayer.add([t]);
    _orig.push(t);
    _current.push(t);
    if (hadNoActive) {
      try { await TrackPlayer.skip(_current.length - 1); await TrackPlayer.play(); } catch {}
    }
    return true;
  } catch {
    return false;
  }
}

/** 下一首播放：插到当前曲后 */
export async function playNext(song: NcmSong): Promise<boolean> {
  await ensurePlayer();
  // 用 track-player 实际 active index 判定（store.current 持久化、重启后会过期，
  // 会误以为"在播"而对空队列 add([t], 1) 越界报错→误报"无可用音源"）
  let activeIdx: number | undefined;
  try {
    activeIdx = await TrackPlayer.getActiveTrackIndex();
  } catch {
    activeIdx = undefined;
  }
  if (activeIdx == null) {
    // 无在播曲（队列空 / 重启未恢复）→ 直接播这首
    try {
      await playSongsAt([song], 0);
      return true;
    } catch {
      return false;
    }
  }
  const realIP = useStore.getState().realIP || CN_IP;
  const resolved = await resolveOne(song, realIP, useStore.getState().musicU);
  if (!resolved) return false;
  if (resolved.source !== 'netease') _sourceMap.set(String(song.id), resolved.source);
  const t: TrackObj = {
    id: String(song.id),
    url: resolved.url,
    title: song.name,
    artist: song.artist ?? '',
    artwork: song.cover,
    album: song.albumName,
    artistId: song.artistId,
    albumId: song.albumId,
  };
  // 插到当前曲后；at 夹到队列长度内（当前曲为末首时追加，避免 insertBeforeIndex 越界）
  let queueLen = 0;
  try {
    queueLen = (await TrackPlayer.getQueue()).length;
  } catch {
    queueLen = 0;
  }
  const at = Math.min(activeIdx + 1, queueLen);
  let added = false;
  try {
    if (at >= queueLen) await TrackPlayer.add([t]);
    else await TrackPlayer.add([t], at);
    added = true;
  } catch (e) {
    // add 偶发拒接（边界/重复等），但歌曲可能已入队 → 核查再判，避免误报"无可用音源"
    console.warn('[player] playNext add rejected, verifying', e);
    try {
      added = (await TrackPlayer.getQueue()).some((tr) => tr.id === t.id);
    } catch {
      added = false;
    }
  }
  if (!added) return false;
  _orig.splice(at, 0, t);
  _current.splice(at, 0, t);
  return true;
}

export async function playbackService(): Promise<void> {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  // order 模式末首按 next 可能抛错，加 catch 防 unhandled rejection
  // 锁屏/通知媒体控制也走守卫：跳到占位曲前先解析
  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    skipNext();
  });
  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    skipPrev();
  });
  TrackPlayer.addEventListener(Event.RemoteSeek, (e) => TrackPlayer.seekTo(e.position));

  // 切歌：同步当前曲到 store（MiniPlayer/Player 显示跟上）
  // 优先用 store.queue 中的完整 NcmSong（含 artistId/albumId/albumName），
  // 因为 track-player 事件里的 track 可能丢自定义字段。
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, ({ track, lastTrack, lastPosition }) => {
    // 锁屏歌词：换歌重置引擎并拉新词（原生此刻已自动清掉通知覆写）
    void lyricOnTrackChanged(track?.id ? Number(track.id) : 0);
    // 上一首有效播放（≥10s）才计次数
    if (lastTrack?.id && lastPosition >= 10) {
      const lastId = Number(lastTrack.id);
      const lastFromQueue = useStore.getState().queue.find((q) => q.id === lastId);
      const lastSong =
        lastFromQueue ?? {
          id: lastId,
          name: lastTrack.title ?? '',
          artist: lastTrack.artist,
          artistId: lastTrack.artistId != null ? Number(lastTrack.artistId) : undefined,
          albumName: lastTrack.album,
          albumId: lastTrack.albumId != null ? Number(lastTrack.albumId) : undefined,
          cover: lastTrack.artwork,
        };
      useStore.getState().incPlayCount(lastSong);
    }
    if (!track?.id) return;
    const id = Number(track.id);
    const fromQueue = useStore.getState().queue.find((q) => q.id === id);
    const cur =
      fromQueue ?? {
        id,
        name: track.title ?? '',
        artist: track.artist,
        artistId: track.artistId != null ? Number(track.artistId) : undefined,
        albumName: track.album,
        albumId: track.albumId != null ? Number(track.albumId) : undefined,
        cover: track.artwork,
      };
    useStore.getState().setCurrent(cur);
    // 音源：查 _sourceMap（回退曲源），查不到默认 netease（bulkNcmUrls 来的恒 netease）
    useStore.getState().setResolveSource(_sourceMap.get(String(track.id)) ?? 'netease');
    // 记入播放历史（置顶去重）
    useStore.getState().pushHistory(cur);
    // 睡眠定时"播完本曲再停"：本曲已结束、新曲切来 → 停
    if (_sleepPendingStop) {
      _sleepPendingStop = false;
      TrackPlayer.pause().catch(() => {});
      useStore.getState().clearSleep();
      useLive.getState().setSleepLive(0, false);
    }
    // 切歌后重新 apply 倍速
    TrackPlayer.setRate(useStore.getState().playRate ?? 1).catch(() => {});
    // 换歌后推进前瞻：解析新 active 之后的占位曲
    scheduleLookAhead();
  });

  // 播放加载失败（url 失效/被系统拦截等）：toast 提示而非静默——
  // 此前 http 链接被 release 包 cleartext 拦截就是"无声+时长 0"且无任何提示，排查困难。
  // 占位曲被触达（前瞻/守卫未及换真链的极端情况）→ 静默跳过，不弹"播放出错"。
  TrackPlayer.addEventListener(Event.PlaybackError, async (e) => {
    console.warn('[player] PlaybackError', e);
    try {
      const t = await TrackPlayer.getActiveTrack();
      if (t?.url === PLACEHOLDER_URL) {
        // 占位曲被触达（前瞻/守卫未及换真链的极端情况）：静默解析或剪枝后跳过，不报"播放出错"
        skipNext();
        return;
      }
    } catch {
      /* ignore */
    }
    useStore.getState().showToast(`播放出错：${e.message || e.code || '音频加载失败'}`);
  });

  // 队列播完：若睡眠定时待停，清理状态（音乐已自然停）
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
    if (_sleepPendingStop) {
      _sleepPendingStop = false;
      useStore.getState().clearSleep();
      useLive.getState().setSleepLive(0, false);
    }
  });

  // 锁屏歌词：原生进度事件驱动（需 updateOptions 设 progressUpdateEventInterval；
  // 原生协程锁屏照发，播放中才发，暂停自然停更）
  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, ({ position }) => {
    lyricOnProgress(position);
  });

  // 启动/重载时已在播：补一次歌词加载（换歌事件不会为已在播的曲重发）
  TrackPlayer.getActiveTrack()
    .then((t) => {
      if (t?.id) void lyricOnTrackChanged(Number(t.id));
    })
    .catch(() => {
      /* 未初始化：忽略 */
    });
}

// 全局守卫：HMR 重新求值本模块时避免重复注册 playback service
const _g = globalThis as unknown as { __rntpServiceRegistered?: boolean };
if (!_g.__rntpServiceRegistered) {
  try {
    TrackPlayer.registerPlaybackService(() => playbackService);
    _g.__rntpServiceRegistered = true;
  } catch {
    /* 已注册过则忽略 */
  }
}
