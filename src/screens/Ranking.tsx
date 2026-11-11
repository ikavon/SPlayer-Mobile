/**
 * 听歌排行：按本地累计的有效播放次数（≥10s 计一次）降序列出。
 * 数据来自 store.playStats（id→{song,count}），独立于播放历史上限。
 */
import { useCallback, useMemo } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type Palette } from '../theme';
import { useStore } from '../store';
import { playSongsAt } from '../player';
import { toggleLikeSong } from '../library';
import SongRow from '../components/SongRow';
import { promptSongActions, playNextToast } from '../queueActions';
import { useBottomSpacer } from '../layout';
import type { NcmSong } from '../ncm';
import type { RootStackParamList } from '../nav';

type Entry = { song: NcmSong; count: number };

export default function Ranking() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const musicU = useStore((s) => s.musicU);
  const likedSongIds = useStore((s) => s.likedSongIds);
  const playStats = useStore((s) => s.playStats);
  const clearPlayStats = useStore((s) => s.clearPlayStats);

  const t = useTheme();
  const s = useMemo(() => useStyles(t), [t]);
  const bottomSpacer = useBottomSpacer(false);

  const entries: Entry[] = useMemo(
    () =>
      Object.values(playStats)
        .filter((e) => e?.song?.id && e.count > 0)
        .sort((a, b) => b.count - a.count),
    [playStats],
  );

  const onPlay = async (index: number) => {
    if (!entries.length) return;
    try {
      await playSongsAt(
        entries.map((e) => e.song),
        index,
      );
      nav.navigate('Player');
    } catch (e) {
      console.warn('[Ranking] onPlay failed', e);
      useStore.getState().showToast('无法播放此歌曲');
    }
  };

  const onPlayRow = useCallback(
    async (_song: NcmSong, index: number) => onPlay(index),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, nav],
  );
  const onLongPressRow = useCallback((song: NcmSong) => promptSongActions(song), []);
  const onAddRow = useCallback(
    (song: NcmSong) => nav.navigate('AddToPlaylist', { songId: song.id, songName: song.name }),
    [nav],
  );

  const onClear = () => {
    if (!entries.length) return;
    Alert.alert('清空听歌排行', `确定清空全部 ${entries.length} 条记录？`, [
      { text: '取消', style: 'cancel' },
      { text: '清空', style: 'destructive', onPress: () => clearPlayStats() },
    ]);
  };

  return (
    <View style={[s.wrap, { paddingTop: insets.top + 12, paddingBottom: bottomSpacer }]}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => nav.goBack()} hitSlop={8}>
          <Text style={s.backText}>← 返回</Text>
        </Pressable>
        <Text style={s.title} numberOfLines={1}>听歌排行</Text>
        <Pressable style={s.clearBtn} onPress={onClear} hitSlop={6}>
          <Text style={s.clearBtnText}>清空</Text>
        </Pressable>
      </View>

      <View style={s.card}>
        <Text style={s.cardCount}>{entries.length} 首 · 累计 {entries.reduce((a, e) => a + e.count, 0)} 次</Text>
        <Pressable
          style={[s.playAllBtn, !entries.length && s.playAllBtnDisabled]}
          onPress={() => onPlay(0)}
          disabled={!entries.length}
        >
          <Text style={s.playAllText}>▶ 播放全部</Text>
        </Pressable>
      </View>

      <FlatList
        data={entries}
        keyExtractor={(item) => String(item.song.id)}
        contentContainerStyle={{ paddingBottom: 16 }}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Text style={s.emptyText}>暂无听歌记录</Text>
            <Text style={s.emptySub}>完整播放歌曲（≥10秒）后会累计次数</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <SongRow
            song={item.song}
            index={index}
            rank={index + 1}
            meta={`♪ ${item.count}`}
            metaAccent
            liked={likedSongIds.includes(item.song.id)}
            loggedIn={!!musicU}
            onPress={onPlayRow}
            onLongPress={onLongPressRow}
            onToggleLike={toggleLikeSong}
            onNext={playNextToast}
            onAddToPlaylist={onAddRow}
          />
        )}
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
  clearBtn: { paddingVertical: 6, paddingHorizontal: 6 },
  clearBtnText: { fontSize: 12, color: t.danger, fontWeight: '700' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 4,
  },
  cardCount: { fontSize: 13, color: t.text3 },
  playAllBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: t.accent, borderRadius: 20 },
  playAllBtnDisabled: { backgroundColor: `${t.accent}40` },
  playAllText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 10, marginHorizontal: 6, gap: 10 },
  rank: { fontSize: 14, fontWeight: '700', color: t.accent, width: 22, textAlign: 'center' },
  thumb: { width: 44, height: 44, borderRadius: 6 },
  songName: { fontSize: 14, fontWeight: '500', color: t.text },
  artist: { fontSize: 12, color: t.text3, marginTop: 1 },
  songId: { fontSize: 11, color: t.accent, fontWeight: '600' },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, fontWeight: '600', color: t.text2 },
  emptySub: { fontSize: 13, color: t.text4, marginTop: 6 },
});