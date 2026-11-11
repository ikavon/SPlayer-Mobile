import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import TrackPlayer, {
  State,
  useActiveTrack,
  usePlaybackState,
  useProgress,
} from 'react-native-track-player';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store';
import { applyLoopMode, nextLoopMode, skipNext, skipPrev, LOOP_LABEL } from '../player';
import { likeSong } from '../library';
import { downloadSong, deleteDownload } from '../download';
import CollectButton from '../components/CollectButton';
import Cover from '../components/Cover';
import {
  PlayIcon,
  PlayPauseIcon,
  PrevIcon,
  NextIcon,
  ListIcon,
  DownloadIcon,
} from '../components/MediaIcons';
import SeekBar from '../SeekBar';
import { toHttps } from '../ncm';
import { activeLyricIndex, fetchLyricLinesResult, type LyricLine, type LyricWord } from '../lyric';
import type { RootStackParamList } from '../nav';

/** 音源显示名（offline=离线，本地下载曲） */
const SOURCE_LABEL: Record<string, string> = {
  netease: '网易云',
  unblock: '解锁源',
  gd: 'GD',
  qqmusic: 'QQ音乐',
  offline: '离线',
};

/** 逐字渐变填充：暗灰→主题色，按 position 在 word 时长内推进（类桌面 mask 扫光，纯 JS 无原生模块） */
const DIM = '#9aa3a0'; // 刻意的暗色歌词灰（沉浸式暗页专用，不随主题）
type RGB = [number, number, number];
const parseHex = (c: string): RGB => [
  parseInt(c.slice(1, 3), 16),
  parseInt(c.slice(3, 5), 16),
  parseInt(c.slice(5, 7), 16),
];
const DIM_RGB = parseHex(DIM);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** 预解析 RGB 元组插值：旧实现每字符每帧 parseInt 两个 hex，30 字行 20fps = 每秒 1200 次解析 */
const lerpRgb = (a: RGB, b: RGB, t: number): string =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;

const fmt = (s: number): string => {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

/** 固定行高：配合 getItemLayout 让 scrollToOffset 稳定、瞬时、免运行时测量 */
const ROW_H = 70;
/** 裁剪线在歌词区的纵向位置（视口 40%） */
const CROP_FRAC = 0.4;
/** 用户停止滚动多久后恢复自动跟随 */
const RESUME_MS = 3000;

export default function Player() {
  const track = useActiveTrack();
  const pb = usePlaybackState();
  // 顶层只订阅低频进度（换行判断用）；100ms 高频订阅下沉到 ProgressSection，
  // 避免封面/按钮/meta 等整页元素以 10fps 重渲染
  const progress = useProgress(300);
  const { height: winH } = useWindowDimensions();
  // 小屏自适应封面：≤640dp 高的机型上给歌词区留足行数
  const coverSize = Math.round(Math.min(240, Math.max(180, winH * 0.28)));
  const resolveSource = useStore((s) => s.resolveSource);
  const loopMode = useStore((s) => s.loopMode);
  const current = useStore((s) => s.current);
  const likedSongIds = useStore((s) => s.likedSongIds);
  const toggleLiked = useStore((s) => s.toggleLiked);
  const downloads = useStore((s) => s.downloads);
  const themeColor = useStore((s) => s.themeColor);
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const isPlaying = pb?.state === State.Playing;

  const [lines, setLines] = useState<LyricLine[]>([]);
  const [lyricState, setLyricState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [lyricRetry, setLyricRetry] = useState(0);
  const listRef = useRef<FlatList<LyricLine>>(null);
  const songId = track ? Number(track.id) : 0;

  // 手动滚动尊重 + 从滚动位置播放
  const [userScrolling, setUserScrolling] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(-1);
  const [wrapH, setWrapH] = useState(0);
  const userScrollingRef = useRef(false);
  const previewIdxRef = useRef(-1);
  const activeIdxRef = useRef(-1);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!songId) {
      setLines([]);
      setLyricState('ready');
      return;
    }
    let dead = false;
    setLyricState('loading');
    // 共享缓存取词（锁屏歌词 lockscreenLyric 同源，避免重复请求）；
    // ok=false 是请求失败（显示重试），ok=true 空数组才是确无歌词
    fetchLyricLinesResult(songId).then((r) => {
      if (dead) return;
      setLines(r.lines);
      setLyricState(r.ok ? 'ready' : 'error');
    });
    return () => {
      dead = true;
    };
  }, [songId, lyricRetry]);

  // 卸载清恢复计时：关页后 3s 内回调不再触发 setState/scroll
  useEffect(
    () => () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    },
    [],
  );

  const activeIdx = useMemo(
    () => activeLyricIndex(lines, progress.position),
    [lines, progress.position],
  );

  useEffect(() => {
    activeIdxRef.current = activeIdx;
  }, [activeIdx]);

  // 裁剪线纵向位置 + 上下内距：上下各多留一行作前奏/尾奏区，
  // 首行可下滚进前奏区(→0s)、尾行可上滚进尾奏区(→duration)，从而覆盖歌曲首尾。
  const cropY = wrapH * CROP_FRAC;
  const topPad = cropY + ROW_H / 2;
  const botPad = wrapH - cropY + ROW_H / 2;
  // 第 i 行中心对齐裁剪线所需 scrollOffset；i=-1→前奏(0s)、i=lines.length→尾奏(duration)
  const offsetForLine = (i: number) => topPad + i * ROW_H + ROW_H / 2 - cropY;
  // 裁剪线所指的目标时间：-1→0、越界→duration、否则该行起点
  const previewTime =
    previewIdx < 0 ? 0 : previewIdx >= lines.length ? progress.duration : lines[previewIdx]?.time ?? 0;

  // 自动跟随：用户手动滚动时不打断，停滚 RESUME_MS 后恢复。
  // 用 scrollToOffset + 显式偏移（含动态内距），不依赖 RN 对 contentContainer 内距的处理。
  useEffect(() => {
    if (activeIdx < 0 || userScrollingRef.current || wrapH <= 0) return;
    listRef.current?.scrollToOffset({ offset: offsetForLine(activeIdx), animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, wrapH]);

  // 换歌：取消手动滚动模式，清预览
  useEffect(() => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    userScrollingRef.current = false;
    setUserScrolling(false);
    setPreviewIdx(-1);
    previewIdxRef.current = -1;
  }, [songId]);

  // 启动/续期"停滚后恢复"计时
  const pokeIdle = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      userScrollingRef.current = false;
      setUserScrolling(false);
      if (activeIdxRef.current >= 0 && wrapH > 0) {
        try {
          listRef.current?.scrollToOffset({
            offset: offsetForLine(activeIdxRef.current),
            animated: true,
          });
        } catch {
          /* ignore */
        }
      }
    }, RESUME_MS);
  };

  const onDragStart = () => {
    userScrollingRef.current = true;
    setUserScrolling(true);
    pokeIdle();
  };

  // 滚动中：续期恢复计时，更新裁剪线所指行（-1=前奏→0s、lines.length=尾奏→duration）
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!userScrollingRef.current || !lines.length) return;
    pokeIdle();
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.max(
      -1,
      Math.min(
        Math.round((y + cropY - topPad - ROW_H / 2) / ROW_H),
        lines.length,
      ),
    );
    if (idx !== previewIdxRef.current) {
      previewIdxRef.current = idx;
      setPreviewIdx(idx);
    }
  };

  // 点击裁剪线 ▶：跳到所指时间（前奏→0s / 尾奏→duration / 行→该行起点）播放，恢复自动跟随
  const seekToPreview = async () => {
    const idx = previewIdxRef.current;
    if (wrapH <= 0) return;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    userScrollingRef.current = false;
    setUserScrolling(false);
    try {
      const t = idx < 0 ? 0 : idx >= lines.length ? progress.duration : lines[idx].time;
      listRef.current?.scrollToOffset({ offset: offsetForLine(idx), animated: false });
      await TrackPlayer.seekTo(t);
      if (!isPlaying) await TrackPlayer.play();
    } catch (e) {
      console.warn('[Player] seekToPreview failed', e);
    }
  };

  // 行渲染回调：依赖 activeIdx，仅在跨行时变身份 → memo 行只在该行变 active 时重渲染，
  // 其余 10fps 的 position tick 不会触发任何行重渲染（逐字由 KaraokeWords 自订阅）。
  const renderItem = useCallback(
    ({ item, index }: { item: LyricLine; index: number }) => (
      <LyricRow item={item} active={index === activeIdx} />
    ),
    [activeIdx],
  );

  // 健壮的播放/暂停：Ended/Error 时回到开头再播，失败用 setPlayWhenReady 兜底
  const toggle = async () => {
    try {
      if (isPlaying) {
        await TrackPlayer.pause();
        return;
      }
      const st = pb?.state;
      if (st === State.Ended || st === State.Error) {
        await TrackPlayer.seekTo(0);
      }
      await TrackPlayer.play();
    } catch {
      try {
        await TrackPlayer.setPlayWhenReady(!isPlaying);
      } catch {
        /* ignore */
      }
    }
  };

  const skipToPrev = async () => {
    try {
      await skipPrev();
    } catch {
      /* ignore */
    }
  };

  const skipToNext = async () => {
    try {
      await skipNext();
    } catch {
      /* ignore */
    }
  };

  // 循环模式：顺序 → 列表循环 → 单曲循环 → 随机
  const cycleLoop = async () => {
    const next = nextLoopMode(loopMode);
    useStore.getState().setLoopMode(next);
    try {
      await applyLoopMode(next);
    } catch {
      /* ignore */
    }
  };

  // 跳转歌手详情（id 取自 store.current，track-player 的 track 可能丢自定义字段）
  const onArtist = () => {
    if (current?.artistId == null) return;
    nav.navigate('Detail', {
      source: 'artist',
      id: current.artistId,
      name: current.artist ?? '',
      cover: undefined,
      subtitle: '热门歌曲',
    });
  };

  // 跳转所在专辑详情
  const onAlbum = () => {
    if (current?.albumId == null) return;
    nav.navigate('Detail', {
      source: 'album',
      id: current.albumId,
      name: current.albumName ?? '',
      cover: current.cover ?? track?.artwork,
      subtitle: current.artist ?? '',
    });
  };

  // 红心/取消红心当前歌曲
  const curSongId = current?.id ?? (track?.id ? Number(track.id) : 0);
  const liked = curSongId ? likedSongIds.includes(curSongId) : false;
  const onLike = async () => {
    if (!curSongId) return;
    const next = !liked;
    toggleLiked(curSongId, next);
    const ok = await likeSong(curSongId, next);
    if (!ok) toggleLiked(curSongId, liked); // 回滚
  };

  // 分享：弹出系统分享面板，含 NCM 歌曲链接
  const onShare = async () => {
    if (!curSongId) return;
    const title = current?.name ?? track?.title ?? '歌曲';
    const artist = current?.artist ?? track?.artist ?? '';
    const url = `https://music.163.com/song/?id=${curSongId}`;
    try {
      await Share.share({ message: `${title}${artist ? ` - ${artist}` : ''}\n${url}` });
    } catch {
      /* 用户取消分享：忽略 */
    }
  };

  // 下载/删除下载当前歌曲（离线播放）
  const downloaded = curSongId ? !!downloads[curSongId] : false;
  const onDownload = async () => {
    if (!curSongId) return;
    if (downloads[curSongId]) {
      await deleteDownload(curSongId);
      useStore.getState().showToast('已删除下载');
    } else {
      if (!current) return;
      useStore.getState().showToast('下载中…');
      const ok = await downloadSong(current, useStore.getState().musicU);
      useStore.getState().showToast(ok ? '已下载' : '下载失败（无可用音源）');
    }
  };

  // 模糊背景图：封面缩略图放大（NCM ?param=30x30，bilinear 上采样≈模糊），无封面用纯色
  const artwork = track?.artwork;
  const blurUrl = artwork
    ? toHttps(artwork) + (artwork.includes('?') ? '&' : '?') + 'param=30x30'
    : null;
  return (
    <View style={[s.wrap, { paddingTop: Math.max(36, insets.top), paddingBottom: insets.bottom + 16 }]}>
      {/* 模糊背景 + 暗化遮罩（pointerEvents none 不挡触摸） */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {blurUrl ? (
          <Image source={{ uri: blurUrl }} style={{ flex: 1, width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <View style={{ flex: 1, backgroundColor: '#1a1a1a' }} />
        )}
        <View style={s.scrim} />
      </View>
      <Pressable
        style={[s.shareBtn, { top: insets.top + 8 }]}
        onPress={onShare}
        hitSlop={10}
      >
        <Text style={s.shareBtnText}>↗</Text>
      </Pressable>
      <Pressable
        style={[s.downloadBtn, { top: insets.top + 48 }]}
        onPress={onDownload}
        hitSlop={10}
        disabled={!curSongId}
      >
        {downloaded ? (
          <Text style={[s.downloadBtnText, { color: themeColor }]}>✓</Text>
        ) : (
          <DownloadIcon color="rgba(255,255,255,0.7)" />
        )}
      </Pressable>
      <Pressable
        style={[s.queueBtn, { top: insets.top + 8 }]}
        onPress={() => nav.navigate('Queue')}
        hitSlop={10}
      >
        <ListIcon color="rgba(255,255,255,0.85)" />
      </Pressable>
      <View style={s.coverWrap}>
        <Cover uri={track?.artwork} size={coverSize} radius={16} dark />
      </View>

      <Text style={s.title} numberOfLines={2}>
        {track?.title ?? '未在播放'}
      </Text>
      <View style={s.metaRow}>
        {current?.artistId != null ? (
          <Pressable onPress={() => onArtist()} hitSlop={6}>
            <Text style={[s.metaLink, { color: themeColor }]} numberOfLines={1}>
              {current?.artist ?? '未知歌手'}
            </Text>
          </Pressable>
        ) : (
          <Text style={s.metaText} numberOfLines={1}>{current?.artist ?? track?.artist ?? ''}</Text>
        )}
        {current?.albumId != null ? (
          <>
            <Text style={s.metaDot}>·</Text>
            <Pressable onPress={() => onAlbum()} hitSlop={6}>
              <Text style={[s.metaLink, { color: themeColor }]} numberOfLines={1}>
                {current?.albumName || '所在专辑'}
              </Text>
            </Pressable>
          </>
        ) : null}
        {resolveSource ? (
          <Text style={s.metaText}>  ·  音源 {SOURCE_LABEL[resolveSource] ?? resolveSource}</Text>
        ) : null}
        {curSongId ? <Text style={s.metaId}>  ·  #{curSongId}</Text> : null}
      </View>

      <View
        style={s.lyricWrap}
        onLayout={(e) => setWrapH(e.nativeEvent.layout.height)}
      >
        {lyricState === 'loading' ? (
          <View style={s.lyricStateBox}>
            <ActivityIndicator color="rgba(255,255,255,0.6)" />
            <Text style={s.lyricStateText}>歌词加载中…</Text>
          </View>
        ) : lyricState === 'error' ? (
          <View style={s.lyricStateBox}>
            <Text style={s.lyricStateText}>歌词加载失败</Text>
            <Pressable
              style={[s.lyricRetryBtn, { backgroundColor: themeColor }]}
              onPress={() => setLyricRetry((c) => c + 1)}
              hitSlop={8}
            >
              <Text style={s.lyricRetryText}>重试</Text>
            </Pressable>
          </View>
        ) : !lines.length ? (
          <View style={s.lyricStateBox}>
            <Text style={s.lyricStateText}>暂无歌词</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            style={{ flex: 1, width: '100%' }}
            contentContainerStyle={{ paddingTop: topPad, paddingBottom: botPad, flexGrow: 1 }}
            data={lines}
            keyExtractor={(_, i) => String(i)}
            getItemLayout={(_, i) => ({ length: ROW_H, offset: ROW_H * i, index: i })}
            onScrollBeginDrag={onDragStart}
            onScroll={onScroll}
            scrollEventThrottle={16}
            renderItem={renderItem}
          />
        )}
        {userScrolling && wrapH > 0 && lines.length > 1 ? (
          <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
            <View style={[s.cropLine, { top: cropY, borderColor: themeColor }]} />
            <View style={[s.cropControl, { top: cropY }]}>
              <Text style={[s.cropTime, { color: themeColor }]}>{fmt(previewTime)}</Text>
              <Pressable style={[s.cropBtn, { backgroundColor: themeColor }]} onPress={seekToPreview} hitSlop={10}>
                <PlayIcon />
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      <ProgressSection color={themeColor} />

      <View style={s.controls}>
        <Pressable style={s.loopBtn} onPress={cycleLoop} hitSlop={8}>
          <Text style={s.loopText}>{LOOP_LABEL[loopMode]}</Text>
        </Pressable>
        <Pressable style={s.skipBtn} onPress={skipToPrev} hitSlop={8}>
          <PrevIcon />
        </Pressable>
        <Pressable style={[s.btn, { backgroundColor: themeColor }]} onPress={toggle} hitSlop={8}>
          <PlayPauseIcon playing={isPlaying} />
        </Pressable>
        <Pressable style={s.skipBtn} onPress={skipToNext} hitSlop={8}>
          <NextIcon />
        </Pressable>
        {curSongId ? (
          <CollectButton kind="song" active={liked} onToggle={onLike} size={24} />
        ) : null}
      </View>
    </View>
  );
}

/** 单字符：memo 化——已唱完/未唱到的字颜色是常量，跳过重渲染；只有渐变带内 1-2 个字每帧更新 */
const KaraokeChar = memo(function KaraokeChar({ ch, color }: { ch: string; color: string }) {
  return <Text style={{ color }}>{ch}</Text>;
});

/**
 * 逐字高亮：仅在 active 行挂载，自订阅 useProgress(50)→20fps，
 * 因此 position tick 只驱动这一行，不影响其它行，也不走 FlatList 的 extraData 全列重渲染。
 * 逐字渐变填充：按 position 在 word 的 [startTime,endTime] 内推进（类桌面 mask 扫光）。
 */
function KaraokeWords({ words }: { words: LyricWord[] }) {
  const { position } = useProgress(50);
  const themeColor = useStore((s) => s.themeColor);
  const accentRgb = useMemo(() => parseHex(themeColor), [themeColor]);
  return (
    <Text style={[s.lyricTextActive, { color: themeColor }]}>
      {words.map((w, i) => {
        const dur = w.endTime - w.startTime || 1;
        const ratio = clamp01((position - w.startTime) / dur);
        const chars = [...w.word];
        const n = chars.length;
        return (
          <Text key={i}>
            {chars.map((ch, ci) => {
              const x = clamp01(ratio * n - ci);
              const color = x <= 0 ? DIM : x >= 1 ? themeColor : lerpRgb(DIM_RGB, accentRgb, x);
              return <KaraokeChar key={ci} ch={ch} color={color} />;
            })}
          </Text>
        );
      })}
    </Text>
  );
}

/** 歌词行：memo 化，仅在变 active / 离开 active（或歌词整列更换）时重渲染；active 切换淡入淡出 */
const LyricRow = memo(function LyricRow({ item, active }: { item: LyricLine; active: boolean }) {
  const showWords = active && !!item.words && item.words.length > 0;
  const themeColor = useStore((s) => s.themeColor);
  const fade = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: active ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [active, fade]);
  return (
    <Animated.View
      style={[
        s.lyricLine,
        { opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
      ]}
    >
      {showWords ? (
        <KaraokeWords words={item.words!} />
      ) : (
        <Text style={[s.lyricText, active && s.lyricTextActive, active && { color: themeColor }]}>
          {item.text || '♪'}
        </Text>
      )}
      {item.translation ? <Text style={s.lyricTrans}>{item.translation}</Text> : null}
    </Animated.View>
  );
});

/** 进度条+时间：独立订阅 100ms 进度，高频 tick 只重渲染这一小块 */
function ProgressSection({ color }: { color: string }) {
  const { position, duration } = useProgress(100);
  return (
    <>
      <SeekBar position={position} duration={duration} color={color} />
      <Text style={s.time}>
        {fmt(position)} / {fmt(duration)}
      </Text>
    </>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 36, paddingBottom: 24, backgroundColor: '#1a1a1a' },
  scrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)' },
  queueBtn: { position: 'absolute', right: 16, padding: 8, zIndex: 2 },
  queueBtnText: { fontSize: 22, color: 'rgba(255,255,255,0.85)' },
  shareBtn: { position: 'absolute', left: 16, padding: 8, zIndex: 2 },
  shareBtnText: { fontSize: 20, color: 'rgba(255,255,255,0.85)' },
  downloadBtn: { position: 'absolute', left: 16, padding: 8, zIndex: 2 },
  downloadBtnText: { fontSize: 18, color: 'rgba(255,255,255,0.7)' },
  metaId: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  coverWrap: { marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '600', textAlign: 'center', color: '#fff' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', marginTop: 6, marginBottom: 12, paddingHorizontal: 8 },
  metaLink: { fontSize: 13, fontWeight: '600' },
  metaText: { fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  metaDot: { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginHorizontal: 6 },
  lyricWrap: { flex: 1, width: '100%' },
  lyricStateBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  lyricStateText: { fontSize: 14, color: 'rgba(255,255,255,0.55)' },
  lyricRetryBtn: { paddingHorizontal: 24, paddingVertical: 8, borderRadius: 20 },
  lyricRetryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  lyricLine: { height: ROW_H, alignItems: 'center', justifyContent: 'center' },
  lyricText: { fontSize: 16, color: 'rgba(255,255,255,0.6)', textAlign: 'center' },
  lyricTextActive: { fontSize: 18, fontWeight: '700' },
  wordOff: { color: '#9aa3a0' },
  lyricTrans: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4, textAlign: 'center' },
  cropLine: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: 0,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    opacity: 0.7,
  },
  cropControl: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    transform: [{ translateY: -18 }],
  },
  cropTime: {
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  cropBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  cropBtnText: { color: '#fff', fontSize: 16, marginLeft: 2 },
  time: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginVertical: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  loopBtn: { paddingVertical: 12, paddingHorizontal: 2, minWidth: 52, alignItems: 'center' },
  loopText: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  skipBtn: { paddingVertical: 12, paddingHorizontal: 4 },
  skipText: { fontSize: 28, color: '#fff' },
  btn: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
