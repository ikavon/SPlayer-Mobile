/**
 * 全局持久迷你播放条：浮在所有常规页底部（全屏 Player / Login 时隐藏）。
 * 位置：两标签页浮在标签栏上方，推入子页浮在安全区上方。
 * 渲染在 App 根层（NavigationContainer 同级），故导航用回调注入而非 useNavigation。
 * 出场/退场淡入+上滑，播放/暂停图标交叉淡入。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TrackPlayer, { State, useActiveTrack, usePlaybackState } from 'react-native-track-player';
import { useStore } from './store';
import { useTheme, type Palette } from './theme';
import { PlayPauseIcon, ListIcon } from './components/MediaIcons';
import Cover from './components/Cover';
import { TAB_BAR_HEIGHT, MINI_PLAYER_HEIGHT } from './layout';

export default function MiniPlayer({
  routeName,
  onOpenPlayer,
  onOpenQueue,
}: {
  routeName?: string;
  onOpenPlayer: () => void;
  onOpenQueue: () => void;
}) {
  const track = useActiveTrack();
  const pb = usePlaybackState();
  const resolveSource = useStore((s) => s.resolveSource);
  const insets = useSafeAreaInsets();
  const t = useTheme();
  const s = useMemo(() => useStyles(t), [t]);

  const isPlaying = pb?.state === State.Playing;
  const shouldShow = !!track?.url && routeName !== 'Player' && routeName !== 'Login';
  // 退场动画播完再卸载，避免 return null 生硬跳变
  const [render, setRender] = useState(shouldShow);
  const anim = useRef(new Animated.Value(shouldShow ? 1 : 0)).current;

  useEffect(() => {
    if (shouldShow) {
      setRender(true);
      Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    } else {
      Animated.timing(anim, { toValue: 0, duration: 140, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) setRender(false);
        },
      );
    }
  }, [shouldShow, anim]);

  // 两标签页浮在标签栏上方；推入子页浮在安全区上方
  const onTab = routeName === 'Search' || routeName === 'Library';
  const bottom = (onTab ? TAB_BAR_HEIGHT : 0) + insets.bottom + 6;

  const toggle = async () => {
    try {
      if (isPlaying) {
        await TrackPlayer.pause();
        return;
      }
      const st = pb?.state;
      if (st === State.Ended || st === State.Error) await TrackPlayer.seekTo(0);
      await TrackPlayer.play();
    } catch {
      try {
        await TrackPlayer.setPlayWhenReady(!isPlaying);
      } catch {
        /* ignore */
      }
    }
  };

  if (!render) return null;
  return (
    <Animated.View
      style={[
        s.wrap,
        {
          left: 8,
          right: 8,
          bottom,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        },
      ]}
    >
      <Pressable style={s.inner} onPress={onOpenPlayer}>
        <Cover uri={track?.artwork} size={42} radius={8} />
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>
            {track?.title ?? '未知'}
          </Text>
          <Text style={s.artist} numberOfLines={1}>
            {track?.artist ?? ''}
            {resolveSource ? `  ·  ${resolveSource}` : ''}
          </Text>
        </View>
        <Pressable hitSlop={8} onPress={onOpenQueue} style={s.queueBtn}>
          <ListIcon color={t.text2} width={16} />
        </Pressable>
        <Pressable style={s.playBtn} hitSlop={8} onPress={toggle}>
          <PlayPauseIcon playing={isPlaying} color={t.accent} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const useStyles = (t: Palette) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      height: MINI_PLAYER_HEIGHT,
      borderRadius: 12,
      backgroundColor: t.bg,
      elevation: 6,
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      zIndex: 5,
    },
    inner: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      gap: 10,
    },
    title: { fontSize: 14, fontWeight: '600', color: t.text },
    artist: { fontSize: 12, color: t.text3 },
    queueBtn: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
    playBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  });
