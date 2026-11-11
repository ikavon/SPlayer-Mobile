/**
 * 收藏按钮：单曲用 ♥/♡（红心），专辑/歌手/歌单用 ✓/+。
 * active=已收藏。点击触发 onToggle（调用方负责请求 + 乐观更新 store）。
 */
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme';

type Kind = 'song' | 'album' | 'artist' | 'playlist';

export default function CollectButton({
  kind,
  active,
  onToggle,
  size = 20,
  disabled = false,
}: {
  kind: Kind;
  active: boolean;
  onToggle: () => void;
  size?: number;
  disabled?: boolean;
}) {
  const t = useTheme();
  const isSong = kind === 'song';
  const icon = isSong ? (active ? '♥' : '♡') : active ? '✓' : '+';
  const color = active ? (isSong ? t.danger : t.accent) : t.text4;
  return (
    <Pressable onPress={onToggle} hitSlop={8} style={s.btn} disabled={disabled}>
      <Text style={{ fontSize: size, color, fontWeight: isSong ? '400' : '700' }}>{icon}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: { padding: 6, justifyContent: 'center' },
});
