/**
 * 播放队列：查看实际播放顺序、点按切歌、下一首/删除。
 * 队列取自 track-player 实际队列（含 shuffle 顺序），操作后即时刷新；
 * 监听切歌事件，外部 next/prev 也同步高亮并滚到当前曲。
 * 切歌刷新走 JS 镜像（_current 与原生队列同步维护），免千首队列每次切歌全量过桥。
 */
import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type Palette } from '../theme';
import { Event, useTrackPlayerEvents } from 'react-native-track-player';
import { useStore } from '../store';
import {
  getQueueSongs,
  getQueueMirrorSongs,
  getQueueActiveIndex,
  skipToIndex,
  removeFromQueue,
  playQueueItemNext,
  applyLoopMode,
  nextLoopMode,
  LOOP_LABEL,
} from '../player';
import Cover from '../components/Cover';
import { useBottomSpacer } from '../layout';
import type { NcmSong } from '../ncm';
import type { RootStackParamList } from '../nav';

/** 行高固定（paddingVertical 8×2 + 封面 42）：getItemLayout 让 scrollToIndex 免测量 */
const ROW_H = 58;

export default function Queue() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const bottomSpacer = useBottomSpacer(false);
  const t = useTheme();
  const s = useMemo(() => useStyles(t), [t]);
  const loopMode = useStore((s) => s.loopMode);

  const listRef = useRef<FlatList<NcmSong>>(null);
  const [songs, setSongs] = useState<NcmSong[]>([]);
  const [active, setActive] = useState(0);

  // 挂载时全量过一次桥：HMR/重载后 JS 镜像可能落后于原生队列
  const refreshFull = useCallback(async () => {
    const [q, a] = await Promise.all([getQueueSongs(), getQueueActiveIndex()]);
    setSongs(q);
    setActive(a);
    return a;
  }, []);

  // 轻量刷新：镜像同步取 + 只把 active index 过桥
  const refreshLite = useCallback(async () => {
    setSongs(getQueueMirrorSongs());
    const a = await getQueueActiveIndex();
    setActive(a);
    return a;
  }, []);

  const scrollToActive = (idx: number) => {
    if (idx >= 0) {
      listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.3, animated: false });
    }
  };

  useEffect(() => {
    refreshFull().then(scrollToActive);
  }, [refreshFull]);

  // 外部切歌（Player/锁屏 next/prev）→ 刷新高亮并定位
  useTrackPlayerEvents([Event.PlaybackActiveTrackChanged], () => {
    refreshLite().then(scrollToActive);
  });

  const onSkip = async (index: number) => {
    await skipToIndex(index);
    refreshLite().then(scrollToActive);
  };
  const onRemove = async (index: number) => {
    await removeFromQueue(index);
    refreshLite();
  };
  const onPlayNext = async (index: number) => {
    await playQueueItemNext(index);
    refreshLite();
  };

  const cycleLoop = async () => {
    const next = nextLoopMode(loopMode);
    useStore.getState().setLoopMode(next);
    try {
      await applyLoopMode(next);
    } catch {
      /* ignore */
    }
    refreshLite();
  };

  // 稳定 key：id + 出现序号（同曲多次入队仍唯一；删/移其它行不改变剩余行的 key）
  const keys = useMemo(() => {
    const seen = new Map<number, number>();
    return songs.map((song) => {
      const n = seen.get(song.id) ?? 0;
      seen.set(song.id, n + 1);
      return `${song.id}:${n}`;
    });
  }, [songs]);

  return (
    <View style={[s.wrap, { paddingTop: insets.top + 12, paddingBottom: bottomSpacer }]}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => nav.goBack()} hitSlop={8}>
          <Text style={s.backText}>← 返回</Text>
        </Pressable>
        <Text style={s.title} numberOfLines={1}>播放队列 · {songs.length}</Text>
        <Pressable style={s.loopBtn} onPress={cycleLoop} hitSlop={8}>
          <Text style={s.loopText}>{LOOP_LABEL[loopMode]}</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={songs}
        keyExtractor={(_, i) => keys[i] ?? String(i)}
        getItemLayout={(_, i) => ({ length: ROW_H, offset: ROW_H * i, index: i })}
        contentContainerStyle={{ paddingBottom: 16 }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyText}>队列为空</Text>
            <Text style={s.emptySub}>搜索或进歌单点歌后这里会显示</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const isActive = index === active;
          return (
            <View style={[s.row, isActive && s.rowActive]}>
              <Pressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }} onPress={() => onSkip(index)}>
                <Cover uri={item.cover} size={42} radius={6} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.songName, isActive && s.songNameActive]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={s.artist} numberOfLines={1}>{item.artist ?? ''}</Text>
                </View>
              </Pressable>
              <View style={s.ops}>
                <Pressable
                  style={s.opBtn}
                  onPress={() => onPlayNext(index)}
                  disabled={index === active}
                  hitSlop={8}
                >
                  <Text style={[s.nextText, index === active && s.opDisabled]}>下一首</Text>
                </Pressable>
                <Pressable style={s.opBtn} onPress={() => onRemove(index)} hitSlop={8}>
                  <Text style={s.removeText}>✕</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const useStyles = (t: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: t.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backBtn: { paddingVertical: 8, alignSelf: 'flex-start' },
  backText: { fontSize: 15, color: t.text2 },
  title: { fontSize: 18, fontWeight: '800', color: t.accent, flex: 1, textAlign: 'center', marginHorizontal: 8 },
  loopBtn: { paddingVertical: 8, paddingHorizontal: 4, minWidth: 64, alignItems: 'center' },
  loopText: { fontSize: 12, color: t.text2, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', height: ROW_H, paddingHorizontal: 12 },
  rowActive: { backgroundColor: `${t.accent}1a`, borderRadius: 8 },
  songName: { fontSize: 14, fontWeight: '500', color: t.text },
  songNameActive: { color: t.accent, fontWeight: '700' },
  artist: { fontSize: 12, color: t.text3, marginTop: 1 },
  ops: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  opBtn: { padding: 10 },
  nextText: { fontSize: 12, color: t.accent, fontWeight: '700' },
  opDisabled: { color: t.placeholder },
  removeText: { fontSize: 14, color: t.danger },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, fontWeight: '600', color: t.text2 },
  emptySub: { fontSize: 13, color: t.text4, marginTop: 6 },
});
