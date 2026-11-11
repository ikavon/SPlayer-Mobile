/**
 * 我喜欢的音乐：展示红心歌单的歌曲列表，支持整单播放
 * 数据来源：从 userPlaylists 中找 specialType=5 或第一个自建歌单的 ID，
 * 然后通过 playlistTrackAll 获取所有歌曲。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store';
import { useTheme, type Palette } from '../theme';
import { fetchLikedSongs, getLikedPlaylist, toggleLikeSong } from '../library';
import { playSongsAt } from '../player';
import SongRow from '../components/SongRow';
import { promptSongActions, playNextToast } from '../queueActions';
import { useBottomSpacer } from '../layout';
import type { NcmSong } from '../ncm';
import type { RootStackParamList } from '../nav';

export default function LikedSongs() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const musicU = useStore((s) => s.musicU);
  const likedSongIds = useStore((s) => s.likedSongIds);
  const userPlaylists = useStore((s) => s.userPlaylists);
  const likedSongs = useStore((s) => s.likedSongs);
  const setLikedSongs = useStore((s) => s.setLikedSongs);

  const [songs, setSongs] = useState<NcmSong[]>(likedSongs);
  const [loading, setLoading] = useState(!likedSongs.length);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const likedPlaylist = getLikedPlaylist(userPlaylists);

  const loadSongs = useCallback(async (isRefresh = false) => {
    if (!musicU) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(false);

    try {
      const allSongs = await fetchLikedSongs(musicU);
      setSongs(allSongs);
      setLikedSongs(allSongs); // 缓存到 store
      // 喜欢列表非空却取不到曲目 → 判定加载失败，与"真空数据"区分
      if (!allSongs.length && useStore.getState().likedSongIds.length) {
        setError(true);
      }
    } catch (e) {
      console.warn('[LikedSongs] load failed', e);
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [musicU, setLikedSongs]);

  // 缓存与 likedSongIds 不一致（在别处红心/取消过）→ 进页后台刷新
  const cacheStale = useMemo(() => {
    const idSet = new Set(likedSongIds);
    return (
      likedSongs.length !== likedSongIds.length ||
      likedSongs.some((s) => !idSet.has(s.id))
    );
  }, [likedSongs, likedSongIds]);

  useEffect(() => {
    if (!songs.length) loadSongs(false);
    else if (cacheStale) loadSongs(true); // 先显缓存，后台刷新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const t = useTheme();
  const s = useMemo(() => useStyles(t), [t]);
  const bottomSpacer = useBottomSpacer(false);

  // 播放
  const onPlay = async (index: number) => {
    try {
      await playSongsAt(songs, index);
      nav.navigate('Player');
    } catch (e) {
      console.warn('[LikedSongs] onPlay failed', e);
      useStore.getState().showToast('无法播放此歌曲');
    }
  };

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

  if (loading) {
    return (
      <View style={[s.wrap, { paddingTop: insets.top + 12, paddingBottom: bottomSpacer }]}>
        <Pressable style={s.backBtn} onPress={() => nav.goBack()} hitSlop={8}>
          <Text style={s.backText}>← 返回</Text>
        </Pressable>
        <ActivityIndicator style={{ marginTop: 60 }} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[s.wrap, { paddingTop: insets.top + 12, paddingBottom: bottomSpacer }]}>
        <View style={s.header}>
          <Pressable style={s.backBtn} onPress={() => nav.goBack()} hitSlop={8}>
            <Text style={s.backText}>← 返回</Text>
          </Pressable>
          <Text style={s.title}>我喜欢的音乐</Text>
          <View style={{ width: 50 }} />
        </View>
        <View style={s.emptyState}>
          <Text style={s.emptyText}>加载失败</Text>
          <Pressable style={s.retryBtn} onPress={() => loadSongs(false)} hitSlop={8}>
            <Text style={s.retryText}>重试</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.wrap, { paddingTop: insets.top + 12, paddingBottom: bottomSpacer }]}>
      {/* 头部 */}
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => nav.goBack()} hitSlop={8}>
          <Text style={s.backText}>← 返回</Text>
        </Pressable>
        <Text style={s.title}>我喜欢的音乐</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* 歌单信息卡片 */}
      <View style={s.playlistCard}>
        <View style={s.coverPlaceholder}>
          <Text style={{ fontSize: 28 }}>❤️</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.playlistName}>{likedPlaylist?.name ?? '我喜欢的音乐'}</Text>
          {/* 计数只用实际加载的列表长度（单一来源，与下方列表恒等）。
              不拼接 user/playlist 的 trackCount：红心歌单该字段是服务端缓存，
              常滞后于 likelist（曾显示「67首 · 共8首」自相矛盾） */}
          <Text style={s.songCount}>{songs.length} 首</Text>
        </View>
        {/* 全部播放按钮（空列表禁用，避免点了弹错误 toast） */}
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadSongs(true)} />
        }
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Text style={s.emptyText}>暂无喜欢的歌曲</Text>
            <Text style={s.emptySub}>在歌曲列表中点击 ♡ 即可添加</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <SongRow
            song={item}
            index={index}
            meta={null}
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
  title: { fontSize: 18, fontWeight: '800', color: t.accent },
  playlistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: `${t.accent}1a`,
    borderRadius: 12,
    gap: 12,
  },
  coverPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 6,
    backgroundColor: `${t.accent}1a`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistName: { fontSize: 16, fontWeight: '700', color: t.text },
  songCount: { fontSize: 12, color: t.text3, marginTop: 2 },
  playAllBtn: {
    paddingHorizontal: 14,
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
  heartIcon: { fontSize: 14, paddingRight: 4 },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, fontWeight: '600', color: t.text },
  emptySub: { fontSize: 13, color: t.text4, marginTop: 6 },
  retryBtn: { marginTop: 12, paddingHorizontal: 24, paddingVertical: 8, backgroundColor: t.accent, borderRadius: 20 },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});