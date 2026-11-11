/**
 * 收藏专辑列表
 */
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store';
import { useTheme, type Palette } from '../theme';
import Cover from '../components/Cover';
import { useBottomSpacer } from '../layout';
import type { NcmAlbum } from '../ncm';
import type { RootStackParamList } from '../nav';

export default function Albums() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const bottomSpacer = useBottomSpacer(false);
  const userAlbums = useStore((s) => s.userAlbums);
  const { width: winW } = useWindowDimensions();
  // 两列网格单卡宽（columnWrapper 左右 10 + 列间距 10）
  const cardW = Math.floor((winW - 30) / 2);
  const t = useTheme();
  const s = useMemo(() => useStyles(t), [t]);

  return (
    <View style={[s.wrap, { paddingTop: insets.top + 12, paddingBottom: bottomSpacer }]}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => nav.goBack()} hitSlop={8}>
          <Text style={s.backText}>← 返回</Text>
        </Pressable>
        <Text style={s.title}>收藏专辑</Text>
        <View style={{ width: 50 }} />
      </View>

      <FlatList
        data={userAlbums}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        columnWrapperStyle={{ paddingHorizontal: 10, gap: 10 }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyText}>暂无收藏专辑</Text>
          </View>
        }
        renderItem={({ item }) => (
          <AlbumCard
            item={item}
            coverSize={cardW}
            onPress={() =>
              nav.navigate('Detail', {
                source: 'album',
                id: item.id,
                name: item.name,
                cover: item.picUrl,
                subtitle: item.artist?.name,
              })
            }
          />
        )}
      />
    </View>
  );
}

function AlbumCard({ item, coverSize, onPress }: { item: NcmAlbum; coverSize: number; onPress: () => void }) {
  const t = useTheme();
  const s = useMemo(() => useStyles(t), [t]);
  return (
    <Pressable style={s.card} onPress={onPress}>
      <Cover uri={item.picUrl} size={coverSize} radius={8} />
      <Text style={s.albumName} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={s.artistName} numberOfLines={1}>
        {item.artist?.name ?? ''}
      </Text>
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
  title: { fontSize: 18, fontWeight: '800', color: t.accent },
  card: { flex: 1, marginBottom: 16, maxWidth: '50%' },
  cover: { width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: t.placeholder },
  albumName: { fontSize: 13, fontWeight: '600', color: t.text, marginTop: 6, paddingHorizontal: 2 },
  artistName: { fontSize: 11, color: t.text3, marginTop: 2, paddingHorizontal: 2 },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 14, color: t.text3 },
});