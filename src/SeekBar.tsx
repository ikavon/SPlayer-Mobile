import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import TrackPlayer from 'react-native-track-player';
import { useTheme, type Palette } from './theme';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

const fmt = (s: number): string => {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

/**
 * 可拖动进度条：点按/拖动跳转，松手 seekTo。
 * 用 pageX(窗口绝对坐标) - 进度条绝对 x 算比例，而非 locationX——
 * locationX 相对手指压中的子视图(fill/thumb)，拖动重绘后 origin 漂移会来回横跳。
 */
export default function SeekBar({
  position,
  duration,
  color = '#1db954',
}: {
  position: number;
  duration: number;
  color?: string;
}) {
  const t = useTheme();
  const s = useMemo(() => useStyles(t), [t]);
  const viewRef = useRef<View>(null);
  const wRef = useRef(0); // 进度条宽度
  const xRef = useRef(0); // 进度条在窗口中的绝对 x
  const durRef = useRef(0);
  durRef.current = duration;
  const [drag, setDrag] = useState<number | null>(null); // 拖动中的比例 0..1

  const ratioAt = (pageX: number) => {
    const w = wRef.current;
    if (w <= 0) return 0;
    return clamp01((pageX - xRef.current) / w);
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          // 按下时重测绝对 x：进度条随模态/键盘位移而无 layout 变化时，onLayout 的旧值会偏
          viewRef.current?.measureInWindow((x) => {
            xRef.current = x;
          });
          setDrag(ratioAt(e.nativeEvent.pageX));
        },
        onPanResponderMove: (e) => setDrag(ratioAt(e.nativeEvent.pageX)),
        onPanResponderRelease: (e) => {
          const ratio = ratioAt(e.nativeEvent.pageX);
          setDrag(null);
          if (durRef.current > 0) TrackPlayer.seekTo(ratio * durRef.current);
        },
        onPanResponderTerminate: () => setDrag(null),
      }),
    // ratioAt 只读 ref，引用稳定，只创建一次
    [],
  );

  const ratio = drag ?? (duration > 0 ? clamp01(position / duration) : 0);
  const pct: `${number}%` = `${ratio * 100}%`;

  return (
    <View
      ref={viewRef}
      style={s.wrap}
      onLayout={(e) => {
        wRef.current = e.nativeEvent.layout.width;
        viewRef.current?.measureInWindow((x) => {
          xRef.current = x;
        });
      }}
      {...pan.panHandlers}
    >
      {drag != null && (
        <View style={[s.bubble, { left: pct }]} pointerEvents="none">
          <Text style={s.bubbleText}>{fmt(drag * duration)}</Text>
        </View>
      )}
      <View style={s.track} pointerEvents="none" />
      <View style={[s.fill, { width: pct, backgroundColor: color }]} pointerEvents="none" />
      <View style={[s.thumb, { left: pct, backgroundColor: color }]} pointerEvents="none" />
    </View>
  );
}

const useStyles = (t: Palette) =>
  StyleSheet.create({
    wrap: { width: '100%', height: 28, justifyContent: 'center' },
    track: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 4,
      borderRadius: 2,
      backgroundColor: t.cardAlt,
    },
    fill: { position: 'absolute', left: 0, height: 4, borderRadius: 2, backgroundColor: t.accent },
    thumb: {
      position: 'absolute',
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: t.accent,
      marginLeft: -7,
    },
    bubble: {
      position: 'absolute',
      top: -30,
      marginLeft: -26,
      minWidth: 52,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 8,
      backgroundColor: 'rgba(0,0,0,0.75)',
      alignItems: 'center',
    },
    bubbleText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  });