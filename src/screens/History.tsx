/**
 * 最近播放：本地记录的播放历史（置顶去重，上限可调）。
 * 头部可清空、可设置上限（10/50/100/200/500）；点歌曲行播放整列。
 */
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type Palette } from '../theme';
import { useStore } from '../store';
import { playSongsAt } from '../player';
import type { NcmSong } from '../ncm';
import { toggleLikeSong } from '../library';
import SongRow from '../components/SongRow';
import OptionPickerModal from '../components/OptionPickerModal';
import { promptSongActions, playNextToast } from '../queueActions';
import { useBottomSpacer } from '../layout';
import type { RootStackParamList } from '../nav';

const LIMIT_OPTIONS = [10, 50, 100, 200, 500];

export default function History() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const musicU = useStore((s) => s.musicU);
  const history = useStore((s) => s.history);
  const historyLimit = useStore((s) => s.historyLimit);
  const likedSongIds = useStore((s) => s.likedSongIds);
  const clearHistory = useStore((s) => s.clearHistory);
  const setHistoryLimit = useStore((s) => s.setHistoryLimit);

  const t = useTheme();
  const s = useMemo(() => useStyles(t), [t]);
  const bottomSpacer = useBottomSpacer(false);

  const [limitPicker, setLimitPicker] = useState(false);

  const onPlay = async (index: number) => {
    if (!history.length) return;
    try {
      await playSongsAt(history, index);
      nav.navigate('Player');
    } catch (e) {
      console.warn('[History] onPlay failed', e);
      useStore.getState().showToast('无法播放此歌曲');
    }
  };

  const onPlayRow = useCallback(
    async (_song: NcmSong, index: number) => onPlay(index),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, nav],
  );
  const onLongPressRow = useCallback((song: NcmSong) => promptSongActions(song), []);
  const onAddRow = useCallback(
    (song: NcmSong) => nav.navigate('AddToPlaylist', { songId: song.id, songName: song.name }),
    [nav],
  );

  const onClear = () => {
    if (!history.length) return;
    Alert.alert('清空播放历史', `确定清空全部 ${history.length} 条记录？`, [
      { text: '取消', style: 'cancel' },
      { text: '清空', style: 'destructive', onPress: () => clearHistory() },
    ]);
  };

  const openLimitPicker = () => setLimitPicker(true);
  const onPickLimit = (n: number) => {
    setHistoryLimit(n);
    setLimitPicker(false);
  };

  return (
    <View style={[s.wrap, { paddingTop: insets.top + 12, paddingBottom: bottomSpacer }]}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => nav.goBack()} hitSlop={8}>
          <Text style={s.backText}>← 返回</Text>
        </Pressable>
        <Text style={s.title} numberOfLines={1}>最近播放</Text>
        <View style={s.headerRight}>
          <Pressable style={s.headerBtn} onPress={openLimitPicker} hitSlop={6}>
            <Text style={s.headerBtnText}>上限 {historyLimit}</Text>
          </Pressable>
          <Pressable style={s.headerBtn} onPress={onClear} hitSlop={6}>
            <Text style={s.clearBtnText}>清空</Text>
          </Pressable>
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.cardCount}>{history.length} 首 · 上限 {historyLimit}</Text>
        <Pressable
          style={[s.playAllBtn, !history.length && s.playAllBtnDisabled]}
          onPress={() => onPlay(0)}
          disabled={!history.length}
        >
          <Text style={s.playAllText}>▶ 播放全部</Text>
        </Pressable>
      </View>

      <FlatList
        data={history}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 16 }}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Text style={s.emptyText}>暂无播放记录</Text>
            <Text style={s.emptySub}>播放歌曲后这里会显示</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <SongRow
            song={item}
            index={index}
            liked={likedSongIds.includes(item.id)}
            loggedIn={!!musicU}
            onPress={onPlayRow}
            onLongPress={onLongPressRow}
            onToggleLike={toggleLikeSong}
            onNext={playNextToast}
            onAddToPlaylist={onAddRow}
          />
        )}
      />
      <OptionPickerModal
        visible={limitPicker}
        title="播放历史上限"
        options={LIMIT_OPTIONS}
        currentValue={historyLimit}
        onPick={onPickLimit}
        onCancel={() => setLimitPicker(false)}
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBtn: { paddingVertical: 6, paddingHorizontal: 6 },
  headerBtnText: { fontSize: 12, color: t.text2, fontWeight: '600' },
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
  playAllBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: t.accent,
    borderRadius: 20,
  },
  playAllBtnDisabled: { backgroundColor: `${t.accent}40` },
  playAllText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    marginHorizontal: 6,
    gap: 10,
  },
  thumb: { width: 44, height: 44, borderRadius: 6 },
  songName: { fontSize: 14, fontWeight: '500', color: t.text },
  artist: { fontSize: 12, color: t.text3, marginTop: 1 },
  songId: { fontSize: 10, color: t.text4 },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, fontWeight: '600', color: t.text2 },
  emptySub: { fontSize: 13, color: t.text4, marginTop: 6 },
});