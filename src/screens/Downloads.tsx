/**
 * 已下载：本地下载的歌曲（应用私有目录 file://，离线可播）。
 * 头部"全部删除"；行内 🗑 删除单首；点行播放整列（离线自动用本地文件）。
 */
import { useCallback, useEffect, useMemo } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store';
import { useTheme, type Palette } from '../theme';
import { playSongsAt } from '../player';
import type { NcmSong } from '../ncm';
import { toggleLikeSong } from '../library';
import SongRow from '../components/SongRow';
import { promptSongActions, playNextToast } from '../queueActions';
import { clearAllDownloads, deleteDownload } from '../download';
import { useBottomSpacer } from '../layout';
import type { RootStackParamList } from '../nav';

export default function Downloads() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const t = useTheme();
  const s = useMemo(() => useStyles(t), [t]);
  const bottomSpacer = useBottomSpacer(false);
  const musicU = useStore((s) => s.musicU);
  const downloads = useStore((s) => s.downloads);
  const likedSongIds = useStore((s) => s.likedSongIds);

  // 按下载时间倒序
  const songs: NcmSong[] = useMemo(
    () =>
      Object.values(downloads)
        .sort((a, b) => b.downloadedAt - a.downloadedAt)
        .map((d) => d.song),
    [downloads],
  );

  // 完整性校验：删除是"先删文件后删记录"，中途被杀进程会留下文件已失的僵尸记录，
  // 计数虚高且"离线可播"名不副实——进屏时核对文件存在性，清掉失效记录
  useEffect(() => {
    let dead = false;
    void (async () => {
      const entries = Object.entries(useStore.getState().downloads);
      const missing: number[] = [];
      await Promise.all(
        entries.map(async ([id, d]) => {
          try {
            const info = await FileSystem.getInfoAsync(d.path);
            if (!info.exists) missing.push(Number(id));
          } catch {
            missing.push(Number(id));
          }
        }),
      );
      if (dead || !missing.length) return;
      for (const id of missing) useStore.getState().removeDownload(id);
      useStore.getState().showToast(`已清理 ${missing.length} 条失效下载记录`);
    })();
    return () => {
      dead = true;
    };
  }, []);

  const onPlay = async (index: number) => {
    if (!songs.length) return;
    try {
      await playSongsAt(songs, index);
      nav.navigate('Player');
    } catch (e) {
      console.warn('[Downloads] onPlay failed', e);
      useStore.getState().showToast('无法播放此歌曲');
    }
  };

  const onClear = () => {
    if (!songs.length) return;
    Alert.alert('清空下载', `确定删除全部 ${songs.length} 首下载（本地文件将被删除）？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '清空',
        style: 'destructive',
        onPress: () => {
          void clearAllDownloads();
          useStore.getState().showToast('已清空下载');
        },
      },
    ]);
  };

  const onDelete = useCallback(async (song: NcmSong) => {
    await deleteDownload(song.id);
    useStore.getState().showToast('已删除下载');
  }, []);

  const onPlayRow = useCallback(
    async (_song: NcmSong, index: number) => onPlay(index),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [songs, nav],
  );
  const onLongPressRow = useCallback((song: NcmSong) => promptSongActions(song), []);
  const onAddRow = useCallback(
    (song: NcmSong) => nav.navigate('AddToPlaylist', { songId: song.id, songName: song.name }),
    [nav],
  );

  return (
    <View style={[s.wrap, { paddingTop: insets.top + 12, paddingBottom: bottomSpacer }]}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => nav.goBack()} hitSlop={8}>
          <Text style={s.backText}>← 返回</Text>
        </Pressable>
        <Text style={s.title} numberOfLines={1}>已下载</Text>
        <View style={s.headerRight}>
          <Pressable style={s.headerBtn} onPress={onClear} hitSlop={6} disabled={!songs.length}>
            <Text style={[s.clearBtnText, !songs.length && { color: t.placeholder }]}>全部删除</Text>
          </Pressable>
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.cardCount}>{songs.length} 首 · 离线可播</Text>
        <Pressable
          style={[s.playAllBtn, !songs.length && s.playAllBtnDisabled]}
          onPress={() => onPlay(0)}
          disabled={!songs.length}
        >
          <Text style={s.playAllText}>▶ 播放全部</Text>
        </Pressable>
      </View>

      <FlatList
        data={songs}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 16 }}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Text style={s.emptyText}>暂无下载</Text>
            <Text style={s.emptySub}>在歌曲长按菜单或播放页点 ⬇ 下载</Text>
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
            onDelete={onDelete}
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBtn: { paddingVertical: 6, paddingHorizontal: 6 },
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
  delBtn: { padding: 6 },
  del: { fontSize: 16, color: t.danger },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, fontWeight: '600', color: t.text2 },
  emptySub: { fontSize: 13, color: t.text4, marginTop: 6 },
});
