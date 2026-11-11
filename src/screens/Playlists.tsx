/**
 * 我的歌单：分为"我创建的"和"我收藏的"两个 tab
 * 参考 SPlayer-Dev Like/playlists.vue 设计
 */
import { useState, useMemo } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store';
import { useTheme, type Palette } from '../theme';
import { getLikedPlaylist, createPlaylist } from '../library';
import TextPromptModal from '../components/TextPromptModal';
import Cover from '../components/Cover';
import { PlusIcon } from '../components/MediaIcons';
import { useBottomSpacer } from '../layout';
import type { NcmPlaylist } from '../ncm';
import type { RootStackParamList } from '../nav';

type TabType = 'created' | 'subscribed';

export default function Playlists() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const userPlaylists = useStore((s) => s.userPlaylists);
  const account = useStore((s) => s.account);

  const [tab, setTab] = useState<TabType>('created');
  const [creating, setCreating] = useState(false);
  const t = useTheme();
  const s = useMemo(() => useStyles(t), [t]);
  const bottomSpacer = useBottomSpacer(false);

  const onCreate = async (name: string) => {
    setCreating(false);
    const pl = await createPlaylist(name);
    useStore.getState().showToast(pl ? `已创建「${name}」` : '创建失败');
  };

  // 过滤歌单
  const likedPlaylist = getLikedPlaylist(userPlaylists);
  const created = userPlaylists.filter((pl) => {
    // 排除"我喜欢的音乐"红心歌单
    if (likedPlaylist && pl.id === likedPlaylist.id) return false;
    return pl.userId === account?.userId;
  });
  const subscribed = userPlaylists.filter((pl) => {
    if (likedPlaylist && pl.id === likedPlaylist.id) return false;
    return pl.userId !== account?.userId;
  });

  const displayList = tab === 'created' ? created : subscribed;

  return (
    <View style={[s.wrap, { paddingTop: insets.top + 12, paddingBottom: bottomSpacer }]}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => nav.goBack()} hitSlop={8}>
          <Text style={s.backText}>← 返回</Text>
        </Pressable>
        <Text style={s.title}>我的歌单</Text>
        {tab === 'created' ? (
          <Pressable style={s.createBtn} onPress={() => setCreating(true)} hitSlop={8}>
            <PlusIcon color={t.accent} size={16} />
          </Pressable>
        ) : (
          <View style={{ width: 50 }} />
        )}
      </View>

      {/* Tab 切换 */}
      <View style={s.tabBar}>
        <Pressable style={[s.tab, tab === 'created' && s.tabActive]} onPress={() => setTab('created')}>
          <Text style={[s.tabText, tab === 'created' && s.tabTextActive]}>
            我创建的 ({created.length})
          </Text>
        </Pressable>
        <Pressable style={[s.tab, tab === 'subscribed' && s.tabActive]} onPress={() => setTab('subscribed')}>
          <Text style={[s.tabText, tab === 'subscribed' && s.tabTextActive]}>
            我收藏的 ({subscribed.length})
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={displayList}
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyText}>
              {tab === 'created' ? '暂无创建的歌单' : '暂未收藏歌单'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <PlaylistRow
            item={item}
            onPress={() =>
              nav.navigate('Detail', {
                source: 'playlist',
                id: item.id,
                name: item.name,
                cover: item.coverImgUrl,
              })
            }
          />
        )}
      />
      <TextPromptModal
        visible={creating}
        title="新建歌单"
        placeholder="输入歌单名称"
        confirmText="创建"
        onConfirm={onCreate}
        onCancel={() => setCreating(false)}
      />
    </View>
  );
}

/** 歌单行 */
function PlaylistRow({ item, onPress }: { item: NcmPlaylist; onPress: () => void }) {
  const t = useTheme();
  const s = useMemo(() => useStyles(t), [t]);
  return (
    <Pressable style={s.row} onPress={onPress}>
      <Cover uri={item.coverImgUrl} size={50} radius={6} />
      <View style={{ flex: 1 }}>
        <Text style={s.plName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={s.plMeta}>
          {item.trackCount ?? 0} 首
          {item.playCount
            ? ` · ${item.playCount >= 10000 ? `${(item.playCount / 10000).toFixed(0)}万` : item.playCount} 播放`
            : ''}
        </Text>
      </View>
      <Text style={s.arrow}>›</Text>
    </Pressable>
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
  createBtn: { paddingVertical: 8, paddingHorizontal: 8, minWidth: 50, alignItems: 'center' },
  createBtnText: { fontSize: 20, color: t.accent },
  title: { fontSize: 18, fontWeight: '800', color: t.accent },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: t.cardAlt,
    borderRadius: 10,
    padding: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: { backgroundColor: t.bg },
  tabText: { fontSize: 13, color: t.text2, fontWeight: '600' },
  tabTextActive: { color: t.accent },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    marginHorizontal: 6,
    gap: 10,
  },
  cover: { width: 50, height: 50, borderRadius: 6, backgroundColor: t.placeholder },
  plName: { fontSize: 14, fontWeight: '500', color: t.text },
  plMeta: { fontSize: 12, color: t.text3, marginTop: 2 },
  arrow: { fontSize: 20, color: t.text4, fontWeight: '300' },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 14, color: t.text3 },
});