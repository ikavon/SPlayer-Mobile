/**
 * 收藏歌手列表
 */
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store';
import { useTheme, type Palette } from '../theme';
import Cover from '../components/Cover';
import { useBottomSpacer } from '../layout';
import type { NcmArtist } from '../ncm';
import type { RootStackParamList } from '../nav';

export default function Artists() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const bottomSpacer = useBottomSpacer(false);
  const userArtists = useStore((s) => s.userArtists);
  const t = useTheme();
  const s = useMemo(() => useStyles(t), [t]);

  return (
    <View style={[s.wrap, { paddingTop: insets.top + 12, paddingBottom: bottomSpacer }]}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => nav.goBack()} hitSlop={8}>
          <Text style={s.backText}>← 返回</Text>
        </Pressable>
        <Text style={s.title}>收藏歌手</Text>
        <View style={{ width: 50 }} />
      </View>

      <FlatList
        data={userArtists}
        keyExtractor={(item) => String(item.id)}
        numColumns={3}
        columnWrapperStyle={{ paddingHorizontal: 10, gap: 10 }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyText}>暂无收藏歌手</Text>
          </View>
        }
        renderItem={({ item }) => (
          <ArtistCard
            item={item}
            onPress={() =>
              nav.navigate('Detail', {
                source: 'artist',
                id: item.id,
                name: item.name,
                cover: item.img1v1Url,
                subtitle: '热门歌曲',
              })
            }
          />
        )}
      />
    </View>
  );
}

function ArtistCard({ item, onPress }: { item: NcmArtist; onPress: () => void }) {
  const t = useTheme();
  const s = useMemo(() => useStyles(t), [t]);
  return (
    <Pressable style={s.card} onPress={onPress}>
      <Cover uri={item.img1v1Url} size={72} round />
      <Text style={s.name} numberOfLines={1}>
        {item.name}
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
  card: { flex: 1, alignItems: 'center', marginBottom: 20, maxWidth: '33%' },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: t.placeholder },
  name: { fontSize: 12, fontWeight: '600', color: t.text, marginTop: 6, textAlign: 'center' },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 14, color: t.text3 },
});