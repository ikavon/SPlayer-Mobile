import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { NavigationContainer, type NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useIsDark } from './src/theme';
import { useStore } from './src/store';
import './src/player'; // 触发 registerPlaybackService（含锁屏歌词引擎注册）
import { restoreSleepTimer } from './src/player';
import { bootDeviceId } from './src/device';
import { bootAuthCheck } from './src/auth';
import Tabs from './src/Tabs';
import MiniPlayer from './src/MiniPlayer';
import Player from './src/screens/Player';
import Queue from './src/screens/Queue';
import Login from './src/screens/Login';
import WebLogin from './src/screens/WebLogin';
import LikedSongs from './src/screens/LikedSongs';
import History from './src/screens/History';
import Ranking from './src/screens/Ranking';
import Downloads from './src/screens/Downloads';
import Settings from './src/screens/Settings';
import Playlists from './src/screens/Playlists';
import Albums from './src/screens/Albums';
import Artists from './src/screens/Artists';
import Detail from './src/screens/Detail';
import AddToPlaylist from './src/screens/AddToPlaylist';
import Toast from './src/components/Toast';
import type { RootStackParamList } from './src/nav';

const Root = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const navRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const [routeName, setRouteName] = useState<string | undefined>();
  const syncRoute = () => setRouteName(navRef.current?.getCurrentRoute()?.name);
  const isDark = useIsDark();

  useEffect(() => {
    // persist 异步 rehydration 完成后再读持久化状态：
    // 否则 restoreSleepTimer 大概率读到默认 0（睡眠定时跨重启恢复失效），
    // bootAuthCheck 也可能读到空 musicU 而跳过校验
    const start = () => {
      restoreSleepTimer();
      // deviceId 恢复就绪后再校验登录态（loginStatus/refresh 需要稳定设备指纹）
      bootDeviceId().then(() => bootAuthCheck());
    };
    if (useStore.persist.hasHydrated()) {
      start();
      return;
    }
    return useStore.persist.onFinishHydration(start);
  }, []);
  const openPlayer = () => navRef.current?.navigate('Player');
  const openQueue = () => navRef.current?.navigate('Queue');
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1 }}>
        <StatusBar style={isDark || routeName === 'Player' ? 'light' : 'dark'} translucent />
        <NavigationContainer
          ref={navRef}
          onReady={syncRoute}
          onStateChange={syncRoute}
        >
          <Root.Navigator>
          <Root.Screen
            name="Main"
            component={Tabs}
            options={{ title: 'SPlayer Mobile', headerShown: false }}
          />
          <Root.Screen
            name="Player"
            component={Player}
            options={{ presentation: 'fullScreenModal', headerShown: false }}
          />
          <Root.Screen
            name="Queue"
            component={Queue}
            options={{ presentation: 'modal', title: '播放队列', headerShown: false }}
          />
          <Root.Screen
            name="Login"
            component={Login}
            options={{ presentation: 'modal', title: '登录', headerShown: false }}
          />
          <Root.Screen
            name="WebLogin"
            component={WebLogin}
            options={{ presentation: 'modal', title: '网页登录', headerShown: false }}
          />
          <Root.Screen
            name="LikedSongs"
            component={LikedSongs}
            options={{ title: '我喜欢的音乐', headerShown: false }}
          />
          <Root.Screen
            name="History"
            component={History}
            options={{ title: '最近播放', headerShown: false }}
          />
          <Root.Screen
            name="Ranking"
            component={Ranking}
            options={{ title: '听歌排行', headerShown: false }}
          />
          <Root.Screen
            name="Downloads"
            component={Downloads}
            options={{ title: '已下载', headerShown: false }}
          />
          <Root.Screen
            name="Settings"
            component={Settings}
            options={{ title: '设置', headerShown: false }}
          />
          <Root.Screen
            name="Playlists"
            component={Playlists}
            options={{ title: '我的歌单', headerShown: false }}
          />
          <Root.Screen
            name="Albums"
            component={Albums}
            options={{ title: '收藏专辑', headerShown: false }}
          />
          <Root.Screen
            name="Artists"
            component={Artists}
            options={{ title: '收藏歌手', headerShown: false }}
          />
          <Root.Screen
            name="Detail"
            component={Detail}
            options={{ title: '详情', headerShown: false }}
          />
          <Root.Screen
            name="AddToPlaylist"
            component={AddToPlaylist}
            options={{ presentation: 'modal', title: '添加到歌单', headerShown: false }}
          />
        </Root.Navigator>
      </NavigationContainer>
        <MiniPlayer routeName={routeName} onOpenPlayer={openPlayer} onOpenQueue={openQueue} />
        <Toast />
      </View>
    </SafeAreaProvider>
  );
}
