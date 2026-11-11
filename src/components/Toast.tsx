/**
 * 全局轻量 toast：读 store.toast，2 秒自动消失，淡入上滑出场/淡出收场。
 * pointerEvents="none" 不挡点击。渲染在根层覆盖整个导航。
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store';

export default function Toast() {
  const toast = useStore((s) => s.toast);
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<{ msg: string; key: number } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const latestKey = useRef(0);

  useEffect(() => {
    if (!toast) return;
    latestKey.current = toast.key;
    setCurrent(toast);
    anim.stopAnimation();
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    const hide = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
        // 收场动画期间来了新 toast 则不作废新内容
        if (latestKey.current === toast.key) {
          setCurrent(null);
          useStore.getState().clearToast();
        }
      });
    }, 2000);
    return () => clearTimeout(hide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast?.key, anim]);

  if (!current) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        s.wrap,
        {
          bottom: 70 + insets.bottom,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        },
      ]}
    >
      <View style={s.box}>
        <Text style={s.text}>{current.msg}</Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  box: {
    maxWidth: '80%',
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  text: { color: '#fff', fontSize: 13, textAlign: 'center' },
});
