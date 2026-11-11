import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useStore } from './store';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface Palette {
  bg: string; // 屏背景
  card: string; // 卡片/行交替
  cardAlt: string; // chip/输入框/次要填充
  border: string; // 分割线
  text: string; // 主文本
  text2: string; // 次要 (#555)
  text3: string; // 三级 (#888)
  text4: string; // 最弱 (#bbb)
  accent: string; // 强调色（= themeColor）
  danger: string; // 危险红
  placeholder: string; // 占位灰
}

export const buildPalette = (dark: boolean, accent: string): Palette =>
  dark
    ? {
        bg: '#0e0e0e',
        card: '#1b1b1b',
        cardAlt: '#262626',
        border: '#2a2a2a',
        text: '#ffffff',
        text2: '#c4c4c4',
        text3: '#8a8a8a',
        text4: '#5a5a5a',
        accent,
        danger: '#ff6b5e',
        placeholder: '#333333',
      }
    : {
        bg: '#ffffff',
        card: '#f9f9f9',
        cardAlt: '#f0f0f0',
        border: '#eeeeee',
        text: '#1a1a1a',
        text2: '#555555',
        text3: '#888888',
        text4: '#bbbbbb',
        accent,
        danger: '#e74c3c',
        placeholder: '#dddddd',
      };

/** 当前调色板：themeMode(system/light/dark) + 系统色 + themeColor(强调)。系统切换时跟随。 */
export const useTheme = (): Palette => {
  const mode = useStore((s) => s.themeMode);
  const accent = useStore((s) => s.themeColor);
  const sys = useColorScheme();
  const dark = mode === 'dark' || (mode === 'system' && sys === 'dark');
  return useMemo(() => buildPalette(dark, accent), [dark, accent]);
};

/** App 顶层用：当前是否深色（供 StatusBar 图标色）。 */
export const useIsDark = (): boolean => {
  const mode = useStore((s) => s.themeMode);
  const sys = useColorScheme();
  return mode === 'dark' || (mode === 'system' && sys === 'dark');
};
