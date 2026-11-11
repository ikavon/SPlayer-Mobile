/**
 * 收藏中心：展示"我喜欢的音乐" + 收藏概览（歌单、专辑、歌手）
 * 未登录时提示登录
 */
import { useCallback, useEffect, useState, useMemo } from 'react';
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
import { useTheme, type Palette } from '../theme';
import { useStore } from '../store';
import Cover from '../components/Cover';
import { fetchAllLibraryData, getLikedPlaylist } from '../library';
import { useBottomSpacer } from '../layout';
import type { RootStackParamList } from '../nav';

export default function Library() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const musicU = useStore((s) => s.musicU);
  const account = useStore((s) => s.account);
  const likedSongIds = useStore((s) => s.likedSongIds);
  const likedSongs = useStore((s) => s.likedSongs);
  const userPlaylists = useStore((s) => s.userPlaylists);
  const userAlbums = useStore((s) => s.userAlbums);
  const userArtists = useStore((s) => s.userArtists);
  const history = useStore((s) => s.history);
  const playStats = useStore((s) => s.playStats);
  const downloads = useStore((s) => s.downloads);

  const t = useTheme();
  const s = useMemo(() => useStyles(t), [t]);
  const bottomSpacer = useBottomSpacer(true);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const likedPlaylist = musicU ? getLikedPlaylist(userPlaylists) : null;

  const loadData = useCallback(async (isRefresh = false) => {
    if (!musicU) return;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      await fetchAllLibraryData();
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [musicU]);

  useEffect(() => {
    if (musicU && !userPlaylists.length) {
      loadData(false);
    }
  }, [musicU, userPlaylists.length, loadData]);

  const sections = useMemo(() => [
    {
      key: 'liked',
      title: '我喜欢的音乐',
      // 与 LikedSongs 屏同源：优先实际曲目缓存，未加载时回退 likelist 计数
      count: likedSongs.length || likedSongIds.length,
      cover: likedPlaylist?.coverImgUrl,
      route: 'LikedSongs',
    },
    {
      key: 'history',
      title: '最近播放',
      count: history.length,
      cover: history[0]?.cover,
      route: 'History',
    },
    {
      key: 'ranking',
      title: '听歌排行',
      count: Object.values(playStats).filter((e) => e?.count > 0).length,
      route: 'Ranking',
    },
    {
      key: 'downloads',
      title: '已下载',
      count: Object.keys(downloads).length,
      cover: Object.values(downloads)[0]?.song?.cover,
      route: 'Downloads',
    },
    {
      key: 'playlists',
      title: '我的歌单',
      count: userPlaylists.length,
      route: 'Playlists',
    },
    {
      key: 'albums',
      title: '收藏专辑',
      count: userAlbums.length,
      route: 'Albums',
    },
    {
      key: 'artists',
      title: '收藏歌手',
      count: userArtists.length,
      route: 'Artists',
    },
  ] as const, [likedSongs.length, likedSongIds.length, history, playStats, downloads, userPlaylists, userAlbums, userArtists, likedPlaylist?.coverImgUrl]);

  if (!musicU) {
    return (
      <View style={[s.wrap, { paddingTop: insets.top + 12, paddingBottom: bottomSpacer }]}>
        <View style={s.header}>
          <View style={s.headerRight} />
          <Text style={s.title}>我的</Text>
          <Pressable style={s.gearBtn} onPress={() => nav.navigate('Settings')} hitSlop={8}>
            <Text style={s.gear}>⚙</Text>
          </Pressable>
        </View>
        <Pressable style={s.historyCard} onPress={() => nav.navigate('History')}>
          <View style={s.historyCover}>
            {history[0]?.cover ? (
              <Cover uri={history[0].cover} size={56} radius={6} />
            ) : (
              <Text style={{ fontSize: 24 }}>🕘</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.sectionTitle}>最近播放</Text>
            <Text style={s.sectionCount}>{history.length} 首</Text>
          </View>
          <Text style={s.arrow}>›</Text>
        </Pressable>
        <Pressable
          style={s.sectionRow}
          onPress={() => nav.navigate('Ranking')}
        >
          <Text style={s.sectionTitle}>听歌排行</Text>
          <View style={s.sectionRight}>
            <Text style={s.sectionCount}>{Object.values(playStats).filter((e) => e?.count > 0).length} 首</Text>
            <Text style={s.arrow}>›</Text>
          </View>
        </Pressable>
        <Pressable
          style={s.sectionRow}
          onPress={() => nav.navigate('Downloads')}
        >
          <Text style={s.sectionTitle}>已下载</Text>
          <View style={s.sectionRight}>
            <Text style={s.sectionCount}>{Object.keys(downloads).length} 首</Text>
            <Text style={s.arrow}>›</Text>
          </View>
        </Pressable>
        <View style={s.emptyState}>
          <Text style={s.emptyIcon}>📚</Text>
          <Text style={s.emptyTitle}>登录后查看收藏</Text>
          <Text style={s.emptySub}>登录后即可查看我的歌单、收藏专辑和歌手</Text>
          <Pressable style={s.loginBtn} onPress={() => nav.navigate('Login')}>
            <Text style={s.loginBtnText}>去登录</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.wrap, { paddingTop: insets.top + 12, paddingBottom: bottomSpacer }]}>
      <View style={s.header}>
        <View style={s.headerRight} />
        <Text style={s.title}>我的</Text>
        <Pressable style={s.gearBtn} onPress={() => nav.navigate('Settings')} hitSlop={8}>
          <Text style={s.gear}>⚙</Text>
        </Pressable>
      </View>

      <View style={s.profileCard}>
        {account?.avatarUrl ? (
          <Cover uri={account.avatarUrl} size={44} round />
        ) : (
          <View style={[s.avatar, { backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>
              {(account?.nickname ?? '我').slice(0, 1)}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.nickname}>{account?.nickname ?? '已登录'}</Text>
          <Text style={s.subtitle}>已登录网易云</Text>
        </View>
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(item) => item.key}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />
          }
          contentContainerStyle={{ paddingTop: 8 }}
          renderItem={({ item }) => {
            if (item.key === 'liked' || item.key === 'history') {
              return (
                <Pressable
                  style={item.key === 'liked' ? s.likedCard : s.historyCard}
                  onPress={() => nav.navigate(item.route as any)}
                >
                  <View style={item.key === 'liked' ? s.likedCover : s.historyCover}>
                    {item.cover ? (
                      <Cover uri={item.cover} size={56} radius={6} />
                    ) : (
                      <Text style={{ fontSize: 24 }}>{item.key === 'liked' ? '❤️' : '🕘'}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.sectionTitle}>{item.title}</Text>
                    <Text style={s.sectionCount}>{item.count} 首</Text>
                  </View>
                  <Text style={s.arrow}>›</Text>
                </Pressable>
              );
            }
            return (
              <Pressable
                style={s.sectionRow}
                onPress={() => nav.navigate(item.route as any)}
              >
                <Text style={s.sectionTitle}>{item.title}</Text>
                <View style={s.sectionRight}>
                  <Text style={s.sectionCount}>{item.count}</Text>
                  <Text style={s.arrow}>›</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
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
  headerRight: { width: 50 },
  title: { fontSize: 18, fontWeight: '800', color: t.accent },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: t.card,
    borderRadius: 12,
    gap: 12,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  nickname: { fontSize: 16, fontWeight: '700', color: t.text },
  subtitle: { fontSize: 12, color: t.text3, marginTop: 2 },
  likedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: `${t.accent}1a`,
    borderRadius: 12,
    gap: 12,
  },
  likedCover: {
    width: 56,
    height: 56,
    borderRadius: 6,
    backgroundColor: `${t.accent}1a`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: `${t.accent}1a`,
    borderRadius: 12,
    gap: 12,
  },
  historyCover: {
    width: 56,
    height: 56,
    borderRadius: 6,
    backgroundColor: `${t.accent}1a`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  sectionRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: t.text },
  sectionCount: { fontSize: 13, color: t.text3 },
  arrow: { fontSize: 20, color: t.text4, fontWeight: '300' },
  emptyState: { alignItems: 'center', marginTop: 80, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8, color: t.text },
  emptySub: { fontSize: 13, color: t.text3, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  loginBtn: { backgroundColor: t.accent, borderRadius: 24, paddingHorizontal: 48, paddingVertical: 12 },
  loginBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  gearBtn: { width: 50, alignItems: 'flex-end', justifyContent: 'center' },
  gear: { fontSize: 20, color: t.text2 },
});