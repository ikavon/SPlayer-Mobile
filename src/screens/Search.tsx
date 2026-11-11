/**
 * 最近搜索：搜索框 + 联想补全 + 搜索历史 + 首页推荐。
 * 提交搜索只取单曲；歌单/歌手/专辑切到对应 tab 才懒加载（带缓存），
 * 不再每次提交并发打 4 类接口。网络错误显示重试而非伪装"无结果"。
 */
import { memo, useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type Palette } from '../theme';
import { api, CN_IP, type NcmSong, type NcmPlaylist, type NcmArtist, type NcmAlbum } from '../ncm';
import { finishLogin } from '../auth';
import { playSongsAt } from '../player';
import { useStore } from '../store';
import {
  fetchAllLibraryData,
  fetchDailyRecommend,
  fetchPersonalized,
  toggleLikeSong,
  subscribeAlbum,
  subscribeArtist,
  subscribePlaylist,
} from '../library';
import { searchSongs, searchAlbums, searchArtists, searchPlaylists } from '../search';
import CollectButton from '../components/CollectButton';
import Cover from '../components/Cover';
import SongRow from '../components/SongRow';
import { promptSongActions, playNextToast } from '../queueActions';
import { useBottomSpacer } from '../layout';
import type { RootStackParamList } from '../nav';

type Tab = 'songs' | 'playlists' | 'artists' | 'albums';

const TABS: { key: Tab; label: string }[] = [
  { key: 'songs', label: '单曲' },
  { key: 'playlists', label: '歌单' },
  { key: 'artists', label: '歌手' },
  { key: 'albums', label: '专辑' },
];

const EMPTY_CAT = { playlists: [] as NcmPlaylist[], artists: [] as NcmArtist[], albums: [] as NcmAlbum[] };

/** 播放量缩写：≥1万 显示「N万」 */
const formatCount = (n: number) => (n >= 10000 ? `${Math.round(n / 10000)}万` : `${n}`);

export default function Search() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const musicU = useStore((s) => s.musicU);
  const account = useStore((s) => s.account);
  const insets = useSafeAreaInsets();
  const bottomSpacer = useBottomSpacer(true);
  const { width: winW } = useWindowDimensions();
  // 双列网格单卡宽（左右 padding 12×2 + 列间距 12）
  const cardW = Math.floor((winW - 36) / 2);
  const likedSongIds = useStore((s) => s.likedSongIds);
  const userAlbums = useStore((s) => s.userAlbums);
  const userArtists = useStore((s) => s.userArtists);
  const userPlaylists = useStore((s) => s.userPlaylists);
  const libraryLoaded = useStore((s) => s.libraryLoaded);
  const searchHistory = useStore((s) => s.searchHistory);
  const clearSearchHistory = useStore((s) => s.clearSearchHistory);
  const toggleAlbumSubscribed = useStore((s) => s.toggleAlbumSubscribed);
  const toggleArtistSubscribed = useStore((s) => s.toggleArtistSubscribed);
  const togglePlaylistSubscribed = useStore((s) => s.togglePlaylistSubscribed);

  const t = useTheme();
  const s = useMemo(() => useStyles(t), [t]);

  const [q, setQ] = useState('');
  const [committed, setCommitted] = useState('');
  const [songs, setSongs] = useState<NcmSong[]>([]);
  const [catData, setCatData] = useState(EMPTY_CAT);
  const [catLoading, setCatLoading] = useState<Tab | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>('songs');
  const reqId = useRef(0);
  const suggestReqId = useRef(0);
  // 分类懒加载缓存：同一关键词每类只请求一次，切回不重打
  const catCache = useRef<{ kw: string; loaded: Set<Tab> }>({ kw: '', loaded: new Set() });
  const [suggestions, setSuggestions] = useState<{ keyword: string }[]>([]);
  const [daily, setDaily] = useState<NcmSong[]>([]);
  const [personalized, setPersonalized] = useState<NcmPlaylist[]>([]);
  const [personalizedLoading, setPersonalizedLoading] = useState(true);
  const [refreshingRec, setRefreshingRec] = useState(false);

  // 个性推荐：NCM personalized 每次返回不同批次，「换一批」重新拉取即可
  const loadPersonalized = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshingRec(true);
    else setPersonalizedLoading(true);
    try {
      const list = await fetchPersonalized(useStore.getState().musicU);
      setPersonalized(list);
    } catch {
      /* 保留旧批次 */
    } finally {
      setPersonalizedLoading(false);
      setRefreshingRec(false);
    }
  }, []);

  useEffect(() => {
    const kw = q.trim();
    if (!kw || committed) {
      setSuggestions([]);
      return;
    }
    const id = ++suggestReqId.current;
    const timer = setTimeout(async () => {
      try {
        const r = await api.searchSuggest({ keywords: kw, type: 'mobile', realIP: CN_IP });
        if (id !== suggestReqId.current) return;
        const allMatch =
          (r.body as { result?: { allMatch?: { keyword?: string }[] } }).result?.allMatch ?? [];
        setSuggestions(
          allMatch.filter((m) => m.keyword).map((m) => ({ keyword: m.keyword! })),
        );
      } catch {
        if (id === suggestReqId.current) setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, committed]);

  useEffect(() => {
    if (musicU) fetchDailyRecommend(musicU).then(setDaily).catch(() => {});
    loadPersonalized(false);
  }, [musicU, loadPersonalized]);

  const playDaily = async () => {
    if (!daily.length) return;
    try {
      await playSongsAt(daily, 0);
      nav.navigate('Player');
    } catch (e) {
      console.warn('[Search] playDaily failed', e);
      useStore.getState().showToast('无法播放每日推荐');
    }
  };

  useEffect(() => {
    if (musicU && !libraryLoaded) fetchAllLibraryData().catch(() => {});
  }, [musicU, libraryLoaded]);

  const onAlbum = async (item: NcmAlbum) => {
    const sub = userAlbums.some((a) => a.id === item.id);
    toggleAlbumSubscribed(item, !sub);
    const ok = await subscribeAlbum(item.id, !sub);
    if (!ok) toggleAlbumSubscribed(item, sub);
  };
  const onArtist = async (item: NcmArtist) => {
    const sub = userArtists.some((a) => a.id === item.id);
    toggleArtistSubscribed(item, !sub);
    const ok = await subscribeArtist(item.id, !sub);
    if (!ok) toggleArtistSubscribed(item, sub);
  };
  const onPlaylist = async (item: NcmPlaylist) => {
    const sub = userPlaylists.some((p) => p.id === item.id);
    togglePlaylistSubscribed(item, !sub);
    const ok = await subscribePlaylist(item.id, !sub);
    if (!ok) togglePlaylistSubscribed(item, sub);
  };

  useEffect(() => {
    // 有 MUSIC_U 但缺账号信息时走统一收口（loginStatus 校验 + 写 account）
    if (musicU && !account) void finishLogin();
  }, [musicU, account]);

  const doSearch = async (kw: string) => {
    if (!kw.trim()) return;
    useStore.getState().pushSearch(kw);
    const id = ++reqId.current;
    setCommitted(kw);
    setQ(kw);
    setTab('songs');
    setLoading(true);
    setError(false);
    catCache.current = { kw, loaded: new Set() };
    setCatData(EMPTY_CAT);
    try {
      const r = await searchSongs(kw);
      if (id !== reqId.current) return;
      setSongs(r);
    } catch {
      if (id === reqId.current) {
        setSongs([]);
        setError(true);
      }
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  };

  /** 切 tab：非单曲类首次切到时才请求（失败可重试） */
  const onTab = async (target: Tab) => {
    setTab(target);
    if (target === 'songs' || !committed) return;
    const cache = catCache.current;
    if (cache.kw !== committed) {
      cache.kw = committed;
      cache.loaded = new Set();
    }
    if (cache.loaded.has(target)) return;
    cache.loaded.add(target);
    setCatLoading(target);
    const id = reqId.current;
    try {
      if (target === 'playlists') {
        const r = await searchPlaylists(committed);
        if (id === reqId.current) setCatData((d) => ({ ...d, playlists: r }));
      } else if (target === 'artists') {
        const r = await searchArtists(committed);
        if (id === reqId.current) setCatData((d) => ({ ...d, artists: r }));
      } else {
        const r = await searchAlbums(committed);
        if (id === reqId.current) setCatData((d) => ({ ...d, albums: r }));
      }
    } catch {
      cache.loaded.delete(target);
      if (id === reqId.current) useStore.getState().showToast('搜索失败，切回该标签可重试');
    } finally {
      if (id === reqId.current) setCatLoading(null);
    }
  };

  const clear = () => {
    reqId.current++;
    setQ('');
    setCommitted('');
    setSongs([]);
    setCatData(EMPTY_CAT);
    setError(false);
  };

  const onPlayRow = useCallback(
    async (_song: NcmSong, index: number) => {
      try {
        await playSongsAt(songs, index);
        nav.navigate('Player');
      } catch (e) {
        console.warn('[Search] onPlay failed', e);
        useStore.getState().showToast('无法播放此歌曲');
      }
    },
    [songs, nav],
  );
  const onLongPressRow = useCallback((song: NcmSong) => promptSongActions(song), []);
  const onAddRow = useCallback(
    (song: NcmSong) => nav.navigate('AddToPlaylist', { songId: song.id, songName: song.name }),
    [nav],
  );

  const goPlaylist = (item: NcmPlaylist) =>
    nav.navigate('Detail', { source: 'playlist', id: item.id, name: item.name, cover: item.coverImgUrl });
  const goArtist = (item: NcmArtist) =>
    nav.navigate('Detail', { source: 'artist', id: item.id, name: item.name, cover: item.img1v1Url, subtitle: '热门歌曲' });
  const goAlbum = (item: NcmAlbum) =>
    nav.navigate('Detail', { source: 'album', id: item.id, name: item.name, cover: item.picUrl, subtitle: item.artist?.name });

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingBottom: bottomSpacer }}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <Text style={s.brand}>SPlayer</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Pressable style={s.loginEntry} onPress={() => nav.navigate('Login')} hitSlop={6}>
            {account?.avatarUrl ? (
              <Cover uri={account.avatarUrl} size={30} round />
            ) : musicU ? (
              <View style={[s.avatar, { backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                  {(account?.nickname ?? '我').slice(0, 1)}
                </Text>
              </View>
            ) : (
              <Text style={s.loginText}>登录</Text>
            )}
          </Pressable>
        </View>
      </View>

      <View style={s.searchBar}>
        <TextInput
          style={s.input}
          placeholder="搜索歌曲、歌单、歌手、专辑"
          placeholderTextColor={t.text4}
          value={q}
          onChangeText={setQ}
          onSubmitEditing={() => doSearch(q)}
          returnKeyType="search"
        />
        {committed ? (
          <Pressable style={s.clearBtn} onPress={clear} hitSlop={8}>
            <Text style={s.clearText}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : error ? (
        <View style={s.errorState}>
          <Text style={s.errorText}>搜索失败，请检查网络</Text>
          <Pressable style={[s.retryBtn, { backgroundColor: t.accent }]} onPress={() => doSearch(committed)} hitSlop={8}>
            <Text style={s.retryText}>重试</Text>
          </Pressable>
        </View>
      ) : committed ? (
        <>
          <View style={s.tabBar}>
            {TABS.map((t) => (
              <Pressable key={t.key} style={s.tab} onPress={() => onTab(t.key)}>
                <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
                {tab === t.key ? <View style={s.tabUnderline} /> : null}
              </Pressable>
            ))}
          </View>

          {tab === 'songs' && (
            <FlatList
              data={songs}
              keyExtractor={(i) => String(i.id)}
              ListEmptyComponent={<Empty />}
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
          )}

          {tab !== 'songs' && catLoading === tab ? (
            <ActivityIndicator style={{ marginTop: 20 }} />
          ) : tab === 'playlists' ? (
            <FlatList
              data={catData.playlists}
              keyExtractor={(i) => String(i.id)}
              ListEmptyComponent={<Empty />}
              renderItem={({ item }) => (
                <Pressable style={s.row} onPress={() => goPlaylist(item)}>
                  <Cover uri={item.coverImgUrl} size={44} radius={6} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.title} numberOfLines={1}>{item.name}</Text>
                    <Text style={s.artist} numberOfLines={1}>
                      {item.trackCount ?? 0} 首{item.creator?.nickname ? ' · ' + item.creator.nickname : ''}
                    </Text>
                  </View>
                  {musicU ? (
                    <CollectButton kind="playlist" active={userPlaylists.some((p) => p.id === item.id)} onToggle={() => onPlaylist(item)} />
                  ) : null}
                </Pressable>
              )}
            />
          ) : tab === 'artists' ? (
            <FlatList
              data={catData.artists}
              keyExtractor={(i) => String(i.id)}
              ListEmptyComponent={<Empty />}
              renderItem={({ item }) => (
                <Pressable style={s.row} onPress={() => goArtist(item)}>
                  <Cover uri={item.img1v1Url} size={44} round />
                  <View style={{ flex: 1 }}>
                    <Text style={s.title} numberOfLines={1}>{item.name}</Text>
                    <Text style={s.artist} numberOfLines={1}>
                      单曲{item.musicSize ?? 0} · 专辑{item.albumSize ?? 0}
                    </Text>
                  </View>
                  {musicU ? (
                    <CollectButton kind="artist" active={userArtists.some((a) => a.id === item.id)} onToggle={() => onArtist(item)} />
                  ) : null}
                </Pressable>
              )}
            />
          ) : tab === 'albums' ? (
            <FlatList
              data={catData.albums}
              keyExtractor={(i) => String(i.id)}
              ListEmptyComponent={<Empty />}
              renderItem={({ item }) => (
                <Pressable style={s.row} onPress={() => goAlbum(item)}>
                  <Cover uri={item.picUrl} size={44} radius={6} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.title} numberOfLines={1}>{item.name}</Text>
                    <Text style={s.artist} numberOfLines={1}>{item.artist?.name ?? ''}</Text>
                  </View>
                  {musicU ? (
                    <CollectButton kind="album" active={userAlbums.some((a) => a.id === item.id)} onToggle={() => onAlbum(item)} />
                  ) : null}
                </Pressable>
              )}
            />
          ) : null}
        </>
      ) : q.trim() ? (
        <FlatList
          data={suggestions}
          keyExtractor={(_, i) => String(i)}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 30 }}>
              <Text style={{ fontSize: 13, color: t.text3 }}>无匹配建议</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={s.suggRow} onPress={() => doSearch(item.keyword)}>
              <Text style={s.suggIcon}>🔍</Text>
              <Text style={s.suggText} numberOfLines={1}>{item.keyword}</Text>
            </Pressable>
          )}
        />
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
          {searchHistory.length ? (
            <View style={s.histWrap}>
              <View style={s.histHead}>
                <Text style={s.histTitle}>最近搜索</Text>
                <Pressable onPress={clearSearchHistory} hitSlop={6}>
                  <Text style={s.histClear}>清空</Text>
                </Pressable>
              </View>
              <View style={s.histChips}>
                {searchHistory.map((h) => (
                  <Pressable key={h} style={s.histChip} onPress={() => doSearch(h)}>
                    <Text style={s.histChipText} numberOfLines={1}>{h}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {musicU && daily.length ? (
            <Pressable style={s.dailyCard} onPress={playDaily}>
              <View style={s.dailyIcon}>
                <Text style={s.dailyEmoji}>📅</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.dailyTitle}>每日推荐</Text>
                <Text style={s.dailySub}>{daily.length} 首 · 根据你的口味</Text>
              </View>
              <Text style={s.dailyPlay}>▶</Text>
            </Pressable>
          ) : null}

          <View style={s.sectionWrap}>
            <View style={s.sectionHead}>
              <View style={s.sectionTitleRow}>
                <View style={[s.accentBar, { backgroundColor: t.accent }]} />
                <Text style={s.sectionTitle}>个性推荐</Text>
                {personalized.length ? (
                  <Text style={s.sectionCount}>{personalized.length}</Text>
                ) : null}
              </View>
              <Pressable
                style={s.refreshBtn}
                onPress={() => loadPersonalized(true)}
                hitSlop={8}
                disabled={refreshingRec}
              >
                {refreshingRec ? (
                  <ActivityIndicator size="small" color={t.accent} />
                ) : (
                  <Text style={[s.refreshText, { color: t.accent }]}>换一批</Text>
                )}
              </Pressable>
            </View>

            {personalizedLoading && !personalized.length ? (
              <ActivityIndicator style={{ marginTop: 24 }} color={t.accent} />
            ) : !personalized.length ? (
              <Text style={s.recEmpty}>暂无推荐，下拉或点「换一批」重试</Text>
            ) : (
              <View style={s.pGrid}>
                {personalized.map((p, i) => (
                  <PlaylistCard
                    key={String(p.id)}
                    item={p}
                    index={i}
                    width={cardW}
                    onPress={() => goPlaylist(p)}
                  />
                ))}
              </View>
            )}
          </View>

          {!musicU && !personalized.length ? (
            <View style={{ alignItems: 'center', marginTop: 40 }}>
              <Text style={{ fontSize: 14, color: t.text3 }}>登录后查看每日推荐</Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function Empty() {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', marginTop: 40 }}>
      <Text style={{ fontSize: 14, color: t.text3 }}>无结果</Text>
    </View>
  );
}

/** 个性推荐网格卡：封面 + 播放量角标 + 名称/曲数，挂载时错峰淡入上滑 */
const PlaylistCard = memo(function PlaylistCard({
  item,
  index,
  width,
  onPress,
}: {
  item: NcmPlaylist;
  index: number;
  width: number;
  onPress: () => void;
}) {
  const t = useTheme();
  const cs = useMemo(() => cardStyles(t), [t]);
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 320,
      delay: Math.min(index, 10) * 45,
      useNativeDriver: true,
    }).start();
  }, [anim, index]);
  return (
    <Animated.View
      style={{
        width,
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
      }}
    >
      <Pressable style={({ pressed }) => (pressed ? { opacity: 0.8 } : null)} onPress={onPress}>
        <View>
          <Cover uri={item.coverImgUrl} size={width} radius={12} />
          {item.playCount ? (
            <View style={cs.badge}>
              <Text style={cs.badgeText}>▶ {formatCount(item.playCount)}</Text>
            </View>
          ) : null}
        </View>
        <Text style={cs.name} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={cs.meta} numberOfLines={1}>
          {item.trackCount ?? 0} 首
        </Text>
      </Pressable>
    </Animated.View>
  );
});

const cardStyles = (t: Palette) =>
  StyleSheet.create({
    badge: {
      position: 'absolute',
      right: 6,
      bottom: 6,
      backgroundColor: 'rgba(0,0,0,0.55)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 10,
    },
    badgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
    name: { fontSize: 13, fontWeight: '600', color: t.text, marginTop: 8, lineHeight: 18 },
    meta: { fontSize: 11, color: t.text3, marginTop: 2 },
  });

const useStyles = (t: Palette) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  brand: { fontSize: 18, fontWeight: '800', color: t.accent },
  loginEntry: { padding: 4 },
  loginText: { fontSize: 14, color: t.text2, fontWeight: '600' },
  avatar: { width: 30, height: 30, borderRadius: 15 },
  searchBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 6, gap: 4 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: t.text,
  },
  clearBtn: { padding: 8 },
  clearText: { fontSize: 16, color: t.text3 },
  errorState: { alignItems: 'center', marginTop: 40 },
  errorText: { fontSize: 14, color: t.text2 },
  retryBtn: { marginTop: 12, paddingHorizontal: 24, paddingVertical: 8, borderRadius: 20 },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  suggRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
    gap: 10,
  },
  suggIcon: { fontSize: 13 },
  suggText: { fontSize: 14, color: t.text, flex: 1 },
  dailyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginVertical: 8,
    padding: 14,
    borderRadius: 14,
    backgroundColor: t.accent,
    gap: 12,
  },
  dailyIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dailyEmoji: { fontSize: 24, color: t.text },
  dailyTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  dailySub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  dailyPlay: { color: '#fff', fontSize: 20, fontWeight: '700', paddingHorizontal: 8 },
  sectionWrap: { marginTop: 18 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accentBar: { width: 4, height: 16, borderRadius: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: t.text },
  sectionCount: {
    fontSize: 12,
    fontWeight: '700',
    color: t.text3,
    backgroundColor: t.cardAlt,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 9,
    overflow: 'hidden',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: `${t.accent}1a`,
    minWidth: 64,
  },
  refreshText: { fontSize: 12, fontWeight: '700' },
  recEmpty: { fontSize: 13, color: t.text3, textAlign: 'center', marginTop: 24 },
  pGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 12 },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
    paddingHorizontal: 6,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  tabText: { fontSize: 14, color: t.text3 },
  tabTextActive: { color: t.accent, fontWeight: '700' },
  tabUnderline: { width: 24, height: 2, backgroundColor: t.accent, marginTop: 6, borderRadius: 1 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10 },
  title: { fontSize: 14, color: t.text },
  artist: { fontSize: 12, color: t.text3, marginTop: 1 },
  histWrap: { marginHorizontal: 12, marginTop: 12, marginBottom: 4 },
  histHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  histTitle: { fontSize: 14, fontWeight: '700', color: t.text },
  histClear: { fontSize: 12, color: t.danger, fontWeight: '600' },
  histChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  histChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: t.cardAlt },
  histChipText: { fontSize: 13, color: t.text2 },
});
