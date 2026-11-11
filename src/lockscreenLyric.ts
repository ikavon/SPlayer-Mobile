/**
 * 锁屏/通知页歌词引擎（命令式，挂 playbackService，纯 JS 无需原生重打）。
 *
 * 原理：track-player 4.1.2 的 `updateNowPlayingMetadata`（KotlinAudio
 * `overrideMetadata`，300ms 节流）可覆写媒体通知/MediaSession 文本；
 * `automaticallyUpdateNotificationMetadata` 默认开启——每次切歌原生自动
 * 清覆写恢复真实元数据。我们把当前歌词行写进"歌手"槽位（通知第二行）。
 *
 * 为什么不用 React hook + useProgress 轮询：**Android 锁屏后 JS 定时器
 * （setTimeout/setInterval）会被挂起**，轮询停摆→歌词冻在锁屏前最后一行。
 * 现改由 updateOptions 的 `progressUpdateEventInterval`（原生协程，锁屏照发）
 * 驱动 `Event.PlaybackProgressUpdated`，引擎注册在 playbackService（无头
 * 上下文），锁屏甚至应用划掉后仍持续更新。
 *
 * 细节：
 * - 覆写必须带全 title/artist/artwork：原生 Track.toAudioItem 对缺省
 *   artwork 会产出字符串 "null"，Coil 加载失败→封面变灰块。
 * - 单曲循环(repeat-one)切歌不发 PlaybackActiveTrackChanged 但原生仍清覆写
 *   → 用"position 回跳 >1s"检测重置推送标记，保证重推。
 * - 前奏/纯音乐(idx=-1)：若此前覆写过，恢复真实歌手。
 */
import TrackPlayer from 'react-native-track-player';
import { activeLyricIndex, fetchLyricLines, type LyricLine } from './lyric';
import { useStore } from './store';

/** position 回跳超过该秒数视为"重新开始"（单曲循环/回拖到前头） */
const BACK_JUMP_S = 1;

let lines: LyricLine[] = [];
let loadedFor = 0; // lines 对应的 songId（0=无/加载中）
let pushedKey = ''; // 上次推送的 `${songId}:${idx}`；''=未推送；`${songId}:-1`=已恢复歌手
let lastPos = 0;
let loadToken = 0; // 防竞态：快速切歌时只认最后一次 fetch

/** 换歌：重置状态并拉新歌词（缓存命中则瞬时）。在 PlaybackActiveTrackChanged 里调。 */
export async function lyricOnTrackChanged(songId: number): Promise<void> {
  const token = ++loadToken;
  lines = [];
  loadedFor = 0;
  pushedKey = '';
  lastPos = 0;
  if (!songId) return;
  let ls: LyricLine[] = [];
  try {
    ls = await fetchLyricLines(songId);
  } catch {
    ls = [];
  }
  if (token !== loadToken) return; // 取词期间又切歌了：作废
  lines = ls;
  loadedFor = songId;
}

/** 原生进度事件驱动：行变化→推歌词行；前奏→恢复歌手。在 PlaybackProgressUpdated 里调。 */
export function lyricOnProgress(position: number): void {
  // 回跳检测：单曲循环原生会清覆写但不发换歌事件 → 重置推送标记以重新推送
  if (position < lastPos - BACK_JUMP_S) pushedKey = '';
  lastPos = position;

  if (!loadedFor) return;
  const idx = activeLyricIndex(lines, position);
  const songId = loadedFor;
  const cur = useStore.getState().current;
  const realArtist = cur?.artist ?? '';

  if (idx < 0) {
    // 前奏/无歌词：此前覆写过才需要恢复真实歌手（-1 键防重复恢复）
    if (pushedKey && pushedKey !== `${songId}:-1`) {
      pushedKey = `${songId}:-1`;
      TrackPlayer.updateNowPlayingMetadata({
        title: cur?.name,
        artist: realArtist,
        artwork: cur?.cover,
      }).catch(() => {
        /* 队列空/未初始化：忽略 */
      });
    }
    return;
  }

  const key = `${songId}:${idx}`;
  if (key === pushedKey) return;
  pushedKey = key;
  TrackPlayer.updateNowPlayingMetadata({
    title: cur?.name,
    artist: lines[idx].text || realArtist,
    artwork: cur?.cover,
  }).catch(() => {
    /* 队列空/未初始化：忽略 */
  });
}
