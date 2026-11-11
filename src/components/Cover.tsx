/**
 * 共享封面：NCM 缩略图参数 + 占位 + 加载淡入 + 失败兜底。
 * coverUrl 给 NCM CDN 图追加 ?param=NxN（列表缩略图不再下载原图，省带宽与解码内存）；
 * 本地 file:// 与非 NCM 域名原样放行。占位/失败统一显示音符图标，不再出现空白灰块。
 */
import { memo, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { toHttps } from '../ncm';
import { useTheme } from '../theme';
import { NoteIcon } from './MediaIcons';

/** 按显示尺寸取 NCM 缩略图（2x 保证视网膜清晰，上限 400） */
export function coverUrl(uri: string | undefined | null, px: number): string | undefined {
  if (!uri) return undefined;
  const u = toHttps(uri) ?? uri;
  if (!/^https?:\/\//i.test(u)) return u;
  if (/[?&]param=/i.test(u)) return u;
  if (/music\.126\.net|music\.163\.com/i.test(u)) {
    return `${u}${u.includes('?') ? '&' : '?'}param=${px}x${px}`;
  }
  return u;
}

const Cover = memo(function Cover({
  uri,
  size,
  radius = 8,
  round = false,
  dark = false,
  style,
}: {
  uri?: string | null;
  size: number;
  radius?: number;
  round?: boolean;
  /** 强制深色占位（Player 沉浸式暗页用） */
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const src = coverUrl(uri, Math.min(400, Math.round(size * 2)));
  const [failed, setFailed] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setFailed(false);
    opacity.setValue(0);
  }, [src, opacity]);

  const showImg = !!src && !failed;
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: round ? size / 2 : radius,
          backgroundColor: dark ? '#2a2a2a' : t.placeholder,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}>
        <NoteIcon color={dark ? '#5a5a5a' : t.text4} size={Math.max(14, Math.round(size * 0.4))} />
      </View>
      {showImg ? (
        <Animated.Image
          source={{ uri: src }}
          style={[StyleSheet.absoluteFillObject, { opacity }]}
          onLoad={() =>
            Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start()
          }
          onError={() => setFailed(true)}
        />
      ) : null}
    </View>
  );
});

export default Cover;
