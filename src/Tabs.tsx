/**
 * 底部双标签：搜索 / 我的。
 * 自定义 tabBar 只含两标签按钮 + 安全区。MiniPlayer 已提到 App 根层全局浮层（见 App.tsx）。
 * 各标签内容由 Search / Library 承载；推入式子页（Detail 等）在根栈，会盖住整个 Main。
 */
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type Palette } from './theme';
import Search from './screens/Search';
import Library from './screens/Library';
import type { TabsParamList } from './nav';

const Tab = createBottomTabNavigator<TabsParamList>();

const LABELS: Record<keyof TabsParamList, string> = {
  Search: '搜索',
  Library: '我的',
};

/** 自定义标签栏：标签按钮 + 安全区 */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const t = useTheme();
  const s = useMemo(() => useStyles(t), [t]);
  return (
    <View style={[s.bar, { paddingBottom: insets.bottom }]}>
      <View style={s.tabs}>
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          return (
            <Pressable
              key={route.key}
              style={s.tab}
              hitSlop={4}
              onPress={() => {
                if (!focused) navigation.navigate(route.name as 'Search' | 'Library');
              }}
            >
              <Text style={[s.tabText, focused && s.tabTextActive]}>
                {LABELS[route.name as keyof TabsParamList]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function Tabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // v7 场景过渡：双标签切换淡入淡出，不再瞬切
        animation: 'fade',
        transitionSpec: { animation: 'timing', config: { duration: 180 } },
      }}
    >
      <Tab.Screen name="Search" component={Search} />
      <Tab.Screen name="Library" component={Library} />
    </Tab.Navigator>
  );
}

const useStyles = (t: Palette) =>
  StyleSheet.create({
    bar: {
      backgroundColor: t.bg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.border,
    },
    tabs: { flexDirection: 'row', height: 50 },
    tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    tabText: { fontSize: 12, color: t.text3 },
    tabTextActive: { color: t.accent, fontWeight: '700' },
  });
