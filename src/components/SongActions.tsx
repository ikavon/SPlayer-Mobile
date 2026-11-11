/**
 * 歌曲行右侧操作：➕ 添加到歌单 + ⏭ 下一首播放 + ♡ 红心。
 * ♡ 仅 showLike（已登录）时显示；⏭ 始终显示；➕ 仅 showAdd（已登录）时显示。
 * 顺序 ➕ ⏭ ♡，保持 ⏭♡ 相邻。按钮嵌在行 Pressable 内，内层 Pressable 捕获按压不触发行点击。
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import CollectButton from './CollectButton';
import { PlusIcon, NextIcon } from './MediaIcons';
import { useTheme, type Palette } from '../theme';

export default function SongActions({
  liked,
  onToggleLike,
  onNext,
  showLike,
  showAdd,
  onAddToPlaylist,
}: {
  liked: boolean;
  onToggleLike: () => void;
  onNext: () => void;
  showLike: boolean;
  showAdd?: boolean;
  onAddToPlaylist?: () => void;
}) {
  const t = useTheme();
  const s = useMemo(() => useStyles(t), [t]);
  return (
    <View style={s.wrap}>
      {showAdd && onAddToPlaylist ? (
        <Pressable onPress={onAddToPlaylist} hitSlop={6} style={s.btn}>
          <PlusIcon color={t.text3} size={14} />
        </Pressable>
      ) : null}
      <Pressable onPress={onNext} hitSlop={6} style={s.btn}>
        <NextIcon color={t.accent} />
      </Pressable>
      {showLike ? (
        <CollectButton kind="song" active={liked} onToggle={onToggleLike} />
      ) : null}
    </View>
  );
}

const useStyles = (t: Palette) =>
  StyleSheet.create({
    wrap: { flexDirection: 'row', alignItems: 'center' },
    btn: { padding: 8, alignItems: 'center', justifyContent: 'center' },
  });
