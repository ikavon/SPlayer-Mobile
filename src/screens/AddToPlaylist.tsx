/**
 * 添加到歌单：列出自建歌单（排除红心，红心走 like 接口），点按加入；
 * 顶部"新建歌单"创建后直接加入该歌曲。
 */
import { useState, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store';
import { useTheme, type Palette } from '../theme';
import { addToPlaylist, createPlaylist } from '../library';
import Cover from '../components/Cover';
import { PlusIcon } from '../components/MediaIcons';
import TextPromptModal from '../components/TextPromptModal';
import { useBottomSpacer } from '../layout';
import type { RootStackParamList } from '../nav';

export default function AddToPlaylist() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'AddToPlaylist'>>();
  const insets = useSafeAreaInsets();
  const userPlaylists = useStore((s) => s.userPlaylists);
  const account = useStore((s) => s.account);

  const { songId } = route.params;
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const t = useTheme();
  const s = useMemo(() => useStyles(t), [t]);
  const bottomSpacer = useBottomSpacer(false);

  // 自建歌单，排除红心（specialType===5 走 like 接口，不在此加）
  const mine = userPlaylists.filter(
    (p) => p.userId === account?.userId && p.specialType !== 5,
  );

  const onPick = async (pid: number, name: string) => {
    if (busy) return;
    setBusy(true);
    const count = await addToPlaylist(pid, [songId]);
    setBusy(false);
    if (count > 0) {
      useStore.getState().showToast(`已加入「${name}」`);
      nav.goBack();
    } else if (count === 0) {
      useStore.getState().showToast(`该歌曲已在「${name}」中`);
    } else {
      useStore.getState().showToast('加入失败');
    }
  };

  const onCreate = async (name: string) => {
    setCreating(false);
    if (busy) return;
    setBusy(true);
    const pl = await createPlaylist(name);
    if (!pl) {
      setBusy(false);
      useStore.getState().showToast('创建失败');
      return;
    }
    const count = await addToPlaylist(pl.id, [songId]);
    setBusy(false);
    if (count > 0) useStore.getState().showToast(`已加入「${name}」`);
    else if (count === 0) useStore.getState().showToast(`已创建「${name}」，歌曲已在歌单中`);
    else useStore.getState().showToast(`已创建「${name}」但加入失败`);
    nav.goBack();
  };

  return (
    <View style={[s.wrap, { paddingTop: insets.top + 12, paddingBottom: bottomSpacer }]}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => nav.goBack()} hitSlop={8}>
          <Text style={s.backText}>← 返回</Text>
        </Pressable>
        <Text style={s.title}>添加到歌单</Text>
        <View style={{ width: 50 }} />
      </View>

      <Pressable style={s.createRow} onPress={() => setCreating(true)}>
        <PlusIcon color={t.accent} size={16} />
        <Text style={s.createText}>新建歌单</Text>
      </Pressable>

      <FlatList
        data={mine}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 16 }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyText}>还没有自建歌单</Text>
            <Text style={s.emptySub}>点上方"新建歌单"创建</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={s.row}
            onPress={() => onPick(item.id, item.name)}
            disabled={busy}
          >
            <Cover uri={item.coverImgUrl} size={50} radius={6} />
            <View style={{ flex: 1 }}>
              <Text style={s.plName} numberOfLines={1}>{item.name}</Text>
              <Text style={s.plMeta}>{item.trackCount ?? 0} 首</Text>
            </View>
          </Pressable>
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
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: `${t.accent}1a`,
    gap: 10,
  },
  createIcon: { fontSize: 18, color: t.accent },
  createText: { fontSize: 15, fontWeight: '600', color: t.accent },
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
  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, fontWeight: '600', color: t.text },
  emptySub: { fontSize: 13, color: t.text4, marginTop: 6 },
});
