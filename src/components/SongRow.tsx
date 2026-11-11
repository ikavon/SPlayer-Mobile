/**
 * 共享歌曲行：封面 + 标题 + 歌手/元信息 + 操作（➕⏭♡），memo 化。
 * Search/Detail/History/Ranking/Downloads/LikedSongs 共用。
 * 回调传稳定引用、liked 传布尔（而非整个 likedSongIds 数组）——
 * 一次红心变更不再让当前屏所有可见行重渲染。
 */
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Cover from './Cover';
import SongActions from './SongActions';
import { useTheme, type Palette } from '../theme';
import type { NcmSong } from '../ncm';

export interface SongRowProps {
  song: NcmSong;
  index: number;
  liked: boolean;
  loggedIn: boolean;
  onPress: (song: NcmSong, index: number) => void;
  onLongPress?: (song: NcmSong) => void;
  onToggleLike: (id: number) => void;
  onNext: (song: NcmSong) => void;
  onAddToPlaylist?: (song: NcmSong) => void;
  /** 提供时行内显示删除按钮（Downloads 屏） */
  onDelete?: (song: NcmSong) => void;
  /** 序号（Ranking 屏） */
  rank?: number;
  /** 歌手行后缀：缺省 #id；null 隐藏；自定义如 "♪ 12" */
  meta?: string | null;
  /** 后缀用强调色（Ranking 播放次数） */
  metaAccent?: boolean;
}

const SongRow = memo(function SongRow({
  song,
  index,
  liked,
  loggedIn,
  onPress,
  onLongPress,
  onToggleLike,
  onNext,
  onAddToPlaylist,
  onDelete,
  rank,
  meta,
  metaAccent,
}: SongRowProps) {
  const t = useTheme();
  const s = useMemo(() => useStyles(t), [t]);
  const metaText = meta === undefined ? `#${song.id}` : meta;
  return (
    <Pressable
      style={s.row}
      onPress={() => onPress(song, index)}
      onLongPress={onLongPress ? () => onLongPress(song) : undefined}
    >
      {rank != null ? <Text style={s.rank}>{rank}</Text> : null}
      <Cover uri={song.cover} size={44} radius={6} />
      <View style={{ flex: 1 }}>
        <Text style={s.songName} numberOfLines={1}>
          {song.name}
        </Text>
        <Text style={s.artist} numberOfLines={1}>
          {song.artist ?? ''}
          {metaText ? (
            <Text style={metaAccent ? s.metaAccent : s.meta}>  ·  {metaText}</Text>
          ) : null}
        </Text>
      </View>
      {onDelete ? (
        <Pressable style={s.delBtn} onPress={() => onDelete(song)} hitSlop={6}>
          <Text style={s.del}>🗑</Text>
        </Pressable>
      ) : null}
      <SongActions
        showLike={loggedIn}
        showAdd={loggedIn}
        liked={liked}
        onToggleLike={() => onToggleLike(song.id)}
        onNext={() => onNext(song)}
        onAddToPlaylist={onAddToPlaylist ? () => onAddToPlaylist(song) : undefined}
      />
    </Pressable>
  );
});

export default SongRow;

const useStyles = (t: Palette) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 10,
      marginHorizontal: 6,
      gap: 10,
    },
    rank: { fontSize: 14, fontWeight: '700', color: t.accent, width: 22, textAlign: 'center' },
    songName: { fontSize: 14, fontWeight: '500', color: t.text },
    artist: { fontSize: 12, color: t.text3, marginTop: 1 },
    meta: { fontSize: 10, color: t.text4 },
    metaAccent: { fontSize: 11, color: t.accent, fontWeight: '600' },
    delBtn: { padding: 6 },
    del: { fontSize: 16, color: t.danger },
  });
