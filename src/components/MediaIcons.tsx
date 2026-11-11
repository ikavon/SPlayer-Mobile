import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';

/**
 * 媒体图标（View 绘制，单色）——跨机型渲染一致，避免 emoji 色差/宽差。
 * Player 屏用白色（绿底圆按钮），MiniPlayer 用主题色（白底条）。
 */
export const PlayIcon = ({ color = '#fff' }: { color?: string }) => (
  <View
    style={{
      width: 0,
      height: 0,
      borderTopWidth: 11,
      borderTopColor: 'transparent',
      borderBottomWidth: 11,
      borderBottomColor: 'transparent',
      borderLeftWidth: 18,
      borderLeftColor: color,
      marginLeft: 3, // 视觉居中：三角形几何中心偏左
    }}
  />
);

export const PauseIcon = ({ color = '#fff' }: { color?: string }) => (
  <View style={{ flexDirection: 'row', gap: 5 }}>
    <View style={{ width: 5, height: 20, backgroundColor: color, borderRadius: 1 }} />
    <View style={{ width: 5, height: 20, backgroundColor: color, borderRadius: 1 }} />
  </View>
);

/** 上一首：竖条 + 左向三角 */
export const PrevIcon = ({ color = '#fff' }: { color?: string }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
    <View style={{ width: 3, height: 18, backgroundColor: color, borderRadius: 1 }} />
    <View
      style={{
        width: 0,
        height: 0,
        borderTopWidth: 9,
        borderTopColor: 'transparent',
        borderBottomWidth: 9,
        borderBottomColor: 'transparent',
        borderRightWidth: 14,
        borderRightColor: color,
      }}
    />
  </View>
);

/** 下一首：右向三角 + 竖条 */
export const NextIcon = ({ color = '#fff' }: { color?: string }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
    <View
      style={{
        width: 0,
        height: 0,
        borderTopWidth: 9,
        borderTopColor: 'transparent',
        borderBottomWidth: 9,
        borderBottomColor: 'transparent',
        borderLeftWidth: 14,
        borderLeftColor: color,
      }}
    />
    <View style={{ width: 3, height: 18, backgroundColor: color, borderRadius: 1 }} />
  </View>
);

/** 队列/列表：三横线 */
export const ListIcon = ({ color = '#fff', width = 18 }: { color?: string; width?: number }) => (
  <View style={{ gap: 3.5 }}>
    <View style={{ width, height: 2, backgroundColor: color, borderRadius: 1 }} />
    <View style={{ width, height: 2, backgroundColor: color, borderRadius: 1 }} />
    <View style={{ width, height: 2, backgroundColor: color, borderRadius: 1 }} />
  </View>
);

/** 下载：竖杆 + 下向箭头 + 托盘 */
export const DownloadIcon = ({ color = '#fff' }: { color?: string }) => (
  <View style={{ alignItems: 'center' }}>
    <View style={{ width: 3, height: 8, backgroundColor: color }} />
    <View
      style={{
        width: 0,
        height: 0,
        borderLeftWidth: 7,
        borderLeftColor: 'transparent',
        borderRightWidth: 7,
        borderRightColor: 'transparent',
        borderTopWidth: 9,
        borderTopColor: color,
        marginTop: -1,
      }}
    />
    <View style={{ width: 16, height: 2.5, backgroundColor: color, borderRadius: 1, marginTop: 3 }} />
  </View>
);

/** 加号：两横竖交叉 */
export const PlusIcon = ({ color = '#fff', size = 14 }: { color?: string; size?: number }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ position: 'absolute', width: size, height: 2, backgroundColor: color, borderRadius: 1 }} />
    <View style={{ position: 'absolute', width: 2, height: size, backgroundColor: color, borderRadius: 1 }} />
  </View>
);

/** 音符：符头 + 符干（封面占位用） */
export const NoteIcon = ({ color = '#bbb', size = 20 }: { color?: string; size?: number }) => {
  const stem = Math.max(2, Math.round(size * 0.1));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: size }}>
      <View
        style={{
          width: size * 0.45,
          height: size * 0.34,
          borderRadius: size * 0.17,
          backgroundColor: color,
        }}
      />
      <View style={{ width: stem, height: size * 0.85, backgroundColor: color, marginLeft: -stem }} />
    </View>
  );
};

/** 播放/暂停交叉淡入切换（替代瞬时替换） */
export function PlayPauseIcon({ playing, color = '#fff' }: { playing: boolean; color?: string }) {
  const anim = useRef(new Animated.Value(playing ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: playing ? 1 : 0, duration: 150, useNativeDriver: true }).start();
  }, [playing, anim]);
  return (
    <View style={{ width: 26, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        }}
      >
        <PlayIcon color={color} />
      </Animated.View>
      <Animated.View style={{ position: 'absolute', opacity: anim }}>
        <PauseIcon color={color} />
      </Animated.View>
    </View>
  );
}
