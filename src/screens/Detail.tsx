/**
 * 共享详情页：歌单 / 专辑 / 歌手 三种来源共用同一界面。
 * 由路由参数 source 分发到对应 fetcher，展示封面+标题+全部播放+曲目列表。
 * 歌手额外有 单曲/专辑 两个子标签。
 * 三态：加载 / 错误(重试) / 空。
 */
import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store';
import { useTheme, type Palette } from '../theme';
import { fetchPlaylistAllSongs, fetchAlbumDetail, fetchArtistDetail, fetchArtistAlbums, subscribeAlbum, subscribeArtist, subscribePlaylist, toggleLikeSong, renamePlaylist, deletePlaylist, removeFromPlaylist } from '../library';
import { playSongsAt } from '../player';
import type { NcmSong, NcmAlbum, NcmArtist, NcmPlaylist } from '../ncm';
import { toHttps } from '../ncm';
import CollectButton from '../components/CollectButton';
import Cover from '../components/Cover';
import SongRow from '../components/SongRow';
import TextPromptModal from '../components/TextPromptModal';
import { promptSongActions, playNextToast } from '../queueActions';
import { useBottomSpacer } from '../layout';
import type { RootStackParamList } from '../nav';

type Source = 'playlist' | 'album' | 'artist';
type ArtistTab = 'songs' | 'albums';

const fmtYear = (t?: number) => (t ? new Date(t).getFullYear() : '');

export default function Detail() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Detail'>>();
  const insets = useSafeAreaInsets();
  const bottomSpacer = useBottomSpacer(false);
  const { width: winW } = useWindowDimensions();
  // 专辑网格单卡宽（两列，columnWrapper 左右 10 + 列间距 10）
  const albumCardW = Math.floor((winW - 30) / 2);
  const t = useTheme();
  const s = useMemo(() => useStyles(t), [t]);
  const musicU = useStore((s) => s.musicU);
  const account = useStore((s) => s.account);
  const userAlbums = useStore((s) => s.userAlbums);
  const userArtists = useStore((s) => s.userArtists);
  const userPlaylists = useStore((s) => s.userPlaylists);
  const likedSongIds = useStore((s) => s.likedSongIds);
  const toggleAlbumSubscribed = useStore((s) => s.toggleAlbumSubscribed);
  const toggleArtistSubscribed = useStore((s) => s.toggleArtistSubscribed);
  const togglePlaylistSubscribed = useStore((s) => s.togglePlaylistSubscribed);

  const { source, id, name, cover, subtitle } = route.params;
  const isArtist = source === 'artist';
  // 当前歌单是否为自建（可改名 / 删除 / 移除单曲）
  const isPlaylistMine =
    source === 'playlist' &&
    account?.userId != null &&
    userPlaylists.some((p) => p.id === id && p.userId === account.userId);

  const [songs, setSongs] = useState<NcmSong[]>([]);
  const [albums, setAlbums] = useState<NcmAlbum[] | null>(null);
  const [albumsLoading, setAlbumsLoading] = useState(false);
  const [artistTab, setArtistTab] = useState<ArtistTab>('songs');
  const [meta, setMeta] = useState({
    name: name ?? '',
    cover: cover ?? '',
    subtitle: subtitle ?? '',
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [renaming, setRenaming] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      // 公开歌单/专辑/歌手匿名可取：authCookie() 无 cookie 返回 {}，接口本就兼容，
      // 不再用登录态拦死未登录用户（私有内容服务端会报错，走错误态）
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(false);
      try {
        let next: NcmSong[] = [];
        if (source === 'playlist') {
          next = await fetchPlaylistAllSongs(id, musicU ?? '');
        } else if (source === 'album') {
          const d = await fetchAlbumDetail(id, musicU ?? '');
          next = d.songs;
          setMeta({
            name: d.name ?? name ?? '',
            cover: toHttps(d.picUrl) ?? cover ?? '',
            subtitle: d.artistName ?? subtitle ?? '',
          });
        } else {
          const d = await fetchArtistDetail(id, musicU ?? '');
          next = d.songs;
          setMeta({
            name: d.name ?? name ?? '',
            cover: toHttps(d.img1v1Url) ?? cover ?? '',
            subtitle: subtitle ?? '热门歌曲',
          });
        }
        setSongs(next);
      } catch (e) {
        console.warn('[Detail] load failed', e);
        setError(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [musicU, source, id, name, cover, subtitle],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  // 歌手专辑子标签：首次切到时懒加载
  const ensureAlbums = useCallback(async () => {
    if (albums !== null) return;
    setAlbumsLoading(true);
    try {
      const list = await fetchArtistAlbums(id, musicU ?? '');
      setAlbums(list);
    } catch (e) {
      console.warn('[Detail] fetchArtistAlbums failed', e);
      setAlbums([]);
    } finally {
      setAlbumsLoading(false);
    }
  }, [albums, id, musicU]);

  useEffect(() => {
    if (isArtist && artistTab === 'albums') ensureAlbums();
  }, [isArtist, artistTab, ensureAlbums]);

  const onPlay = async (index: number) => {
    try {
      await playSongsAt(songs, index);
      nav.navigate('Player');
    } catch (e) {
      console.warn('[Detail] onPlay failed', e);
      useStore.getState().showToast('无法播放此歌曲');
    }
  };

  // SongRow 稳定回调：行 memo 不被父屏重渲染击穿
  const onPlayRow = useCallback(
    async (_song: NcmSong, index: number) => onPlay(index),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [songs, nav],
  );
  const onAddRow = useCallback(
    (song: NcmSong) => nav.navigate('AddToPlaylist', { songId: song.id, songName: song.name }),
    [nav],
  );

  const goAlbum = (item: NcmAlbum) =>
    nav.navigate('Detail', {
      source: 'album',
      id: item.id,
      name: item.name,
      cover: item.picUrl,
      subtitle: item.artist?.name,
    });

  // 头部收藏/取消收藏（按 source 分发；乐观更新，失败回滚）
  const collected =
    source === 'album'
      ? userAlbums.some((a) => a.id === id)
      : source === 'artist'
        ? userArtists.some((a) => a.id === id)
        : userPlaylists.some((p) => p.id === id);

  const onCollect = async () => {
    const sub = !collected;
    if (source === 'album') {
      const item: NcmAlbum = { id, name: meta.name, picUrl: meta.cover || undefined, artist: { name: meta.subtitle } };
      toggleAlbumSubscribed(item, sub);
      const ok = await subscribeAlbum(id, sub);
      if (!ok) toggleAlbumSubscribed(item, !sub);
    } else if (source === 'artist') {
      const item: NcmArtist = { id, name: meta.name, img1v1Url: meta.cover || undefined };
      toggleArtistSubscribed(item, sub);
      const ok = await subscribeArtist(id, sub);
      if (!ok) toggleArtistSubscribed(item, !sub);
    } else {
      const item: NcmPlaylist = { id, name: meta.name, coverImgUrl: meta.cover || undefined };
      togglePlaylistSubscribed(item, sub);
      const ok = await subscribePlaylist(id, sub);
      if (!ok) togglePlaylistSubscribed(item, !sub);
    }
  };

  // 自建歌单管理：改名 / 删除 / 从歌单移除单曲
  const onRename = async (nextName: string) => {
    setRenaming(false);
    const ok = await renamePlaylist(id, nextName);
    if (ok) {
      setMeta((m) => ({ ...m, name: nextName }));
      useStore.getState().showToast('已重命名');
    } else {
      useStore.getState().showToast('重命名失败');
    }
  };
  const onDelete = () => {
    Alert.alert('删除歌单', '确定删除该歌单？该操作不可撤销。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          const ok = await deletePlaylist(id);
          if (ok) {
            useStore.getState().showToast('已删除歌单');
            nav.goBack();
          } else {
            useStore.getState().showToast('删除失败');
          }
        },
      },
    ]);
  };
  const openPlaylistMenu = () => {
    Alert.alert(meta.name || '歌单', undefined, [
      { text: '重命名', onPress: () => setRenaming(true) },
      { text: '删除歌单', style: 'destructive', onPress: onDelete },
      { text: '取消', style: 'cancel' },
    ]);
  };
  const onRemoveSong = useCallback(
    async (songId: number) => {
      const ok = await removeFromPlaylist(id, songId);
      if (ok) {
        setSongs((prev) => prev.filter((s) => s.id !== songId));
        useStore.getState().showToast('已从歌单移除');
      } else {
        useStore.getState().showToast('移除失败');
      }
    },
    [id],
  );
  const onLongPressRow = useCallback(
    (song: NcmSong) =>
      promptSongActions(
        song,
        isPlaylistMine ? { onRemoveFromPlaylist: () => onRemoveSong(song.id) } : undefined,
      ),
    [isPlaylistMine, onRemoveSong],
  );

  const countText = `${songs.length} 首${meta.subtitle ? ' · ' + meta.subtitle : ''}`;

  const renderHeader = () => (
    <View style={s.playlistCard}>
      <Cover uri={meta.cover} size={96} radius={10} />
      <View style={{ flex: 1 }}>
        <Text style={s.playlistName} numberOfLines={2}>
          {meta.name || '加载中…'}
        </Text>
        <Text style={s.songCount}>{countText}</Text>
        {source === 'playlist' ? <Text style={s.playlistId}>歌单 #{id}</Text> : null}
        <View style={s.headerActions}>
          {musicU ? (
            <CollectButton
              kind={source === 'album' ? 'album' : source === 'artist' ? 'artist' : 'playlist'}
              active={collected}
              onToggle={onCollect}
              size={22}
            />
          ) : null}
          <Pressable style={[s.playAllBtn, !songs.length && s.playAllBtnDisabled]} onPress={() => onPlay(0)} disabled={!songs.length}>
            <Text style={s.playAllText}>▶ 播放全部</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  const renderArtistTabs = () => (
    <View style={s.subTabBar}>
      <Pressable style={[s.subTab, artistTab === 'songs' && s.subTabActive]} onPress={() => setArtistTab('songs')}>
        <Text style={[s.subTabText, artistTab === 'songs' && s.subTabTextActive]}>热门单曲</Text>
      </Pressable>
      <Pressable style={[s.subTab, artistTab === 'albums' && s.subTabActive]} onPress={() => setArtistTab('albums')}>
        <Text style={[s.subTabText, artistTab === 'albums' && s.subTabTextActive]}>全部专辑</Text>
      </Pressable>
    </View>
  );

  const headerBar = (
    <View style={s.header}>
      <Pressable style={s.backBtn} onPress={() => nav.goBack()} hitSlop={8}>
        <Text style={s.backText}>← 返回</Text>
      </Pressable>
      <Text style={s.title} numberOfLines={1}>
        {meta.name || name || ''}
      </Text>
      {isPlaylistMine && !loading && !error ? (
        <Pressable style={s.moreBtn} onPress={openPlaylistMenu} hitSlop={8}>
          <Text style={s.moreText}>⋯</Text>
        </Pressable>
      ) : (
        <View style={{ width: 50 }} />
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={[s.wrap, { paddingTop: insets.top + 12, paddingBottom: bottomSpacer }]}>
        {headerBar}
        <ActivityIndicator style={{ marginTop: 60 }} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[s.wrap, { paddingTop: insets.top + 12, paddingBottom: bottomSpacer }]}>
        {headerBar}
        {renderHeader()}
        <View style={s.emptyState}>
          <Text style={s.emptyText}>加载失败</Text>
          <Pressable style={s.retryBtn} onPress={() => load(false)} hitSlop={8}>
            <Text style={s.retryText}>重试</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // 歌手专辑子页：2 列网格
  if (isArtist && artistTab === 'albums') {
    return (
      <View style={[s.wrap, { paddingTop: insets.top + 12, paddingBottom: bottomSpacer }]}>
        {headerBar}
        <FlatList
          key="albums"
          data={albums ?? []}
          numColumns={2}
          keyExtractor={(item) => String(item.id)}
          columnWrapperStyle={{ paddingHorizontal: 10, gap: 10 }}
          contentContainerStyle={{ paddingTop: 8 }}
          ListHeaderComponent={
            <>
              {renderHeader()}
              {renderArtistTabs()}
            </>
          }
          ListEmptyComponent={
            albumsLoading ? (
              <ActivityIndicator style={{ marginTop: 30 }} />
            ) : (
              <View style={s.emptyState}>
                <Text style={s.emptyText}>暂无专辑</Text>
              </View>
            )
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          renderItem={({ item }) => (
            <Pressable style={s.albumCard} onPress={() => goAlbum(item)}>
              <Cover uri={item.picUrl} size={albumCardW} radius={8} />
              <Text style={s.albumName} numberOfLines={2}>{item.name}</Text>
              <Text style={s.albumMeta} numberOfLines={1}>
                {fmtYear(item.publishTime) || (item.size ? `${item.size} 首` : '')}
              </Text>
            </Pressable>
          )}
        />
      </View>
    );
  }

  return (
    <View style={[s.wrap, { paddingTop: insets.top + 12, paddingBottom: bottomSpacer }]}>
      {headerBar}
      <FlatList
        key="songs"
        data={songs}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={
          <>
            {renderHeader()}
            {isArtist ? renderArtistTabs() : null}
          </>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />
        }
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Text style={s.emptyText}>暂无歌曲</Text>
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
      <TextPromptModal
        visible={renaming}
        title="重命名歌单"
        placeholder="输入新名称"
        initialValue={meta.name}
        confirmText="保存"
        onConfirm={onRename}
        onCancel={() => setRenaming(false)}
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
  moreBtn: { paddingVertical: 8, paddingHorizontal: 4, minWidth: 50, alignItems: 'center' },
  moreText: { fontSize: 22, color: t.text2, fontWeight: '700' },
  title: { fontSize: 18, fontWeight: '800', color: t.accent, flex: 1, textAlign: 'center', marginHorizontal: 8 },
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  playlistName: { fontSize: 16, fontWeight: '700', color: t.text },
  songCount: { fontSize: 12, color: t.text3, marginTop: 2 },
  playlistId: { fontSize: 10, color: t.text4, marginTop: 2 },
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
  songId: { fontSize: 10, color: t.text4 },
  emptyState: { alignItems: 'center', marginTop: 40 },
  emptyText: { fontSize: 16, fontWeight: '600', color: t.text2 },
  retryBtn: { marginTop: 12, paddingHorizontal: 24, paddingVertical: 8, backgroundColor: t.accent, borderRadius: 20 },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  subTabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: t.cardAlt,
    borderRadius: 10,
    padding: 2,
  },
  subTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  subTabActive: { backgroundColor: t.bg },
  subTabText: { fontSize: 13, color: t.text3, fontWeight: '600' },
  subTabTextActive: { color: t.accent },
  albumCard: { flex: 1, marginBottom: 16, maxWidth: '50%' },
  albumCover: { width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: t.cardAlt },
  albumName: { fontSize: 13, fontWeight: '600', marginTop: 6, paddingHorizontal: 2, color: t.text },
  albumMeta: { fontSize: 11, color: t.text3, marginTop: 2, paddingHorizontal: 2 },
});
